/**
 * Gemini Client
 *
 * Wraps @google/genai with:
 *  - Automatic fallback when API key is absent or on timeout/error
 *  - Function calling loop (max 4 iterations)
 *  - Input/output validation
 *  - Explicit fallback text from deterministic engine
 *
 * ARCHITECTURE:
 *   Gemini is an EXPLANATION layer — it calls tools to get facts.
 *   It NEVER invents numerical values. All numbers must come from tool results.
 *   The deterministic engine remains authoritative for all scores/rankings.
 */

import type { GeminiResponse } from "../lib/types/index";
import { GEMINI_CONFIG } from "../config/index";
import { SYSTEM_PROMPT } from "./prompts/index";
import { TOOL_DECLARATIONS, executeTool } from "./tools/index";

type ContentPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: unknown } };

type ContentMessage = {
  role: "user" | "model";
  parts: ContentPart[];
};

// ─────────────────────────────────────────────────────────────
// FALLBACK BUILDER
// ─────────────────────────────────────────────────────────────

async function buildFallbackResponse(question: string, context?: unknown): Promise<GeminiResponse> {
  const ctxStr = context
    ? `\n\nContext provided:\n${JSON.stringify(context, null, 2)}`
    : "";

  return {
    text:
      `[Gemini unavailable — deterministic fallback]\n\n` +
      `Question: "${question}"\n\n` +
      `The deterministic engine is available. Use the /api/explain/[cellId] endpoint ` +
      `to retrieve full evidence-backed explanations for any cell or recommendation.\n\n` +
      `To access priorities: GET /api/priorities\n` +
      `To access event status: GET /api/events\n` +
      `To access insurance: GET /api/insurance\n` +
      ctxStr,
    isFallback: true,
    fallbackText: "Gemini API unavailable. Using deterministic fallback.",
  };
}

// ─────────────────────────────────────────────────────────────
// MAIN GEMINI CLIENT
// ─────────────────────────────────────────────────────────────

/**
 * Query Gemini with function calling.
 * Falls back to deterministic response if:
 *  - No API key configured
 *  - API unavailable
 *  - Timeout exceeded
 *  - Any error occurs
 *
 * @param question - The operator's question
 * @param context - Optional structured context (e.g., current cell data)
 */
export async function queryGemini(
  question: string,
  context?: unknown
): Promise<GeminiResponse> {
  const apiKey = process.env.GEMINI_API_KEY;

  // No API key → deterministic fallback immediately
  if (!apiKey || apiKey.trim() === "") {
    return buildFallbackResponse(question, context);
  }

  try {
    // Dynamic import — only loads when API key exists
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const model = process.env.GEMINI_MODEL ?? GEMINI_CONFIG.defaultModel;

    const contextPreamble = context
      ? `\n\nCurrent context:\n${JSON.stringify(context, null, 2)}\n\n`
      : "";

    const contents: ContentMessage[] = [
      {
        role: "user",
        parts: [{ text: contextPreamble + question }],
      },
    ];

    const toolCalls: Array<{ tool: string; params: Record<string, unknown>; result: unknown }> = [];

    // Function calling loop — max 4 iterations
    for (let iteration = 0; iteration < 4; iteration++) {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          contents: contents as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          config: {
            systemInstruction: SYSTEM_PROMPT,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tools: [{ functionDeclarations: TOOL_DECLARATIONS as any }],
            maxOutputTokens: GEMINI_CONFIG.maxOutputTokens,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        }),
        // Timeout
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), GEMINI_CONFIG.timeoutMs)
        ),
      ]);

      const candidate = (response as { candidates?: Array<{ content?: { parts?: ContentPart[] } }> }).candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      // Check for function calls
      const funcCallPart = parts.find(
        (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
          "functionCall" in p && p.functionCall !== undefined
      );

      if (funcCallPart) {
        const { name, args } = funcCallPart.functionCall;
        const toolResult = await executeTool(name, args);
        toolCalls.push({ tool: name, params: args, result: toolResult });

        // Add ALL model parts back (must include any thought/thoughtSignature parts
        // that Gemini 3.8 may have generated alongside the function call).
        // Dropping them causes a 400 "Function call is missing a thought_signature".
        contents.push({
          role: "model",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          parts: parts as any,
        });
        contents.push({
          role: "user",
          parts: [{ functionResponse: { name, response: toolResult } }],
        });
        continue;
      }

      // Text response — we're done
      const textPart = parts.find(
        (p): p is { text: string } => "text" in p && typeof p.text === "string"
      );

      if (textPart?.text) {
        return {
          text: textPart.text,
          isFallback: false,
          toolCalls: toolCalls.map((tc) => ({
            tool: tc.tool as import("../lib/types/index").GeminiToolName,
            parameters: tc.params,
          })),
        };
      }

      // Unexpected response structure
      break;
    }

    return buildFallbackResponse(question, context);
  } catch (err) {
    const errMsg = String(err);
    const isTimeout = errMsg.includes("TIMEOUT");
    const isThoughtSignature = errMsg.includes("thought_signature") || errMsg.includes("function_call");

    // For thought_signature / function-call constraint errors, retry without tools
    if (isThoughtSignature) {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey });
        const model = process.env.GEMINI_MODEL ?? GEMINI_CONFIG.defaultModel;
        // Text-only fallback — no function calling
        const simpleResponse = await Promise.race([
          ai.models.generateContent({
            model,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            contents: [{ role: "user", parts: [{ text: question }] }] as any,
            config: {
              systemInstruction:
                SYSTEM_PROMPT +
                "\n\nNOTE: Tool/function calling is unavailable for this request. " +
                "Answer using only the information in the question context.",
              maxOutputTokens: GEMINI_CONFIG.maxOutputTokens,
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("TIMEOUT")), GEMINI_CONFIG.timeoutMs)
          ),
        ]);
        const textPart = (simpleResponse as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts?.find((p) => p.text);
        if (textPart?.text) {
          return { text: textPart.text, isFallback: false, toolCalls: [] };
        }
      } catch {
        // Falls through to deterministic fallback below
      }
    }

    return {
      text: isTimeout
        ? `[Gemini timed out (${GEMINI_CONFIG.timeoutMs}ms)] Deterministic fallback: Use /api/explain/[cellId] for evidence-backed explanations.`
        : `[Gemini unavailable] Deterministic fallback active. Check /api/explain/[cellId] for evidence-backed explanation.\n\nError: ${errMsg.slice(0, 80)}`,
      isFallback: true,
      fallbackText: isTimeout ? "Gemini timed out." : `Gemini error: ${errMsg.slice(0, 80)}`,
    };
  }
}
