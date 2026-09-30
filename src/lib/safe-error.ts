/**
 * Safe error message helper.
 *
 * Strips file-system paths, module names, and provider details from error
 * messages before including them in client-facing API responses.
 *
 * Rules:
 *  - Strips anything that looks like an absolute or relative file path
 *  - Strips Node module names (e.g. "at Object.<anonymous>")
 *  - Keeps the error TYPE and a short message
 *  - Never includes stack trace lines
 *  - Truncates to 120 characters max
 *
 * Full error details should be logged server-side via console.error or a
 * structured logger — never in the client response.
 */

const PATH_PATTERN = /([A-Z]:\\|\/[\w.-]+){2,}[\w./-]*/g;
const MODULE_PATTERN = /\bnode_modules\/[\w@/-]+/g;
const STACK_LINE_PATTERN = /\s+at\s+[\w.<>]+\s*\(/g;
const PROVIDER_JSON_PATTERN = /\{.*"(code|message|status)"\s*:/g;

export function safeErrorMessage(err: unknown): string {
  const raw = String(err)
    .replace(STACK_LINE_PATTERN, " ")
    .replace(PATH_PATTERN, "<path>")
    .replace(MODULE_PATTERN, "<module>")
    .replace(PROVIDER_JSON_PATTERN, "{...}");

  // Truncate and normalize whitespace
  return raw.replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Log the full error server-side and return a safe client-facing message.
 * Use this in all API catch blocks instead of String(err) directly.
 */
export function logAndSanitize(err: unknown, context?: string): string {
  if (process.env.NODE_ENV !== "production") {
    // Dev: full error visible in server console
    console.error(`[API Error]${context ? ` [${context}]` : ""}`, err);
  }
  return safeErrorMessage(err);
}
