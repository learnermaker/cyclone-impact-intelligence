/**
 * Gemini Tool Definitions and Executors
 *
 * All 9 required tools from the specification.
 * Tools call the deterministic engine directly (no HTTP round-trip).
 * Tool results are the ONLY source of numerical facts for Gemini.
 */

import { runFaniDemoEngine } from "../../engine/runner";
import { evaluateInsuranceTrigger } from "../../engine/insurance/index";
import { FANI_KNOWN_PARAMETERS } from "../../config/index";

// ─────────────────────────────────────────────────────────────
// TOOL DECLARATIONS (for @google/genai function calling)
// ─────────────────────────────────────────────────────────────

export const TOOL_DECLARATIONS = [
  {
    name: "get_event_status",
    description:
      "Get the current cyclone event status, hazard scenario parameters, and data source information. Use this to answer questions about the current event.",
    parameters: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "get_cell_risk",
    description:
      "Get detailed risk, hazard, exposure, susceptibility, and impact data for a specific H3 cell. Use this to answer 'Why is this area at risk?' questions.",
    parameters: {
      type: "object" as const,
      properties: {
        cell_id: {
          type: "string",
          description: "H3 cell ID (resolution 8)",
        },
      },
      required: ["cell_id"],
    },
  },
  {
    name: "get_asset_risk",
    description:
      "Get risk data for a specific infrastructure asset including criticality, vulnerability, dependency, and computed risk score.",
    parameters: {
      type: "object" as const,
      properties: {
        asset_id: {
          type: "string",
          description: "Infrastructure asset ID",
        },
      },
      required: ["asset_id"],
    },
  },
  {
    name: "get_priority_list",
    description:
      "Get the current top-K priority recommendations with evidence, drivers, and recommended actions.",
    parameters: {
      type: "object" as const,
      properties: {
        k: {
          type: "integer",
          description: "Number of priority recommendations to return (1-50)",
        },
        objective: {
          type: "string",
          description: "Priority objective: balanced, population, infrastructure, service_continuity",
        },
      },
      required: ["k"],
    },
  },
  {
    name: "get_dependency_graph",
    description:
      "Get the spatial dependency relationships for an infrastructure asset — which assets/population depend on it and its centrality score.",
    parameters: {
      type: "object" as const,
      properties: {
        asset_id: {
          type: "string",
          description: "Infrastructure asset ID",
        },
      },
      required: ["asset_id"],
    },
  },
  {
    name: "run_scenario",
    description:
      "Run the deterministic engine with modified scenario parameters to show what-if results. Always labels output as SIMULATED SCENARIO.",
    parameters: {
      type: "object" as const,
      properties: {
        wind_multiplier: { type: "number", description: "Wind multiplier (0.5–2.0)" },
        rainfall_multiplier: { type: "number", description: "Rainfall multiplier (0.5–2.0)" },
        surge_height_m: { type: "number", description: "Surge height in metres (0.5–4.0)" },
        k: { type: "integer", description: "Response capacity" },
      },
      required: [],
    },
  },
  {
    name: "get_historical_replay",
    description:
      "Get the Fani 2019 T-24h historical replay state including pre-event predictions, priorities, and manifest.",
    parameters: {
      type: "object" as const,
      properties: {
        event_id: {
          type: "string",
          description: "Event ID (use 'fani-2019-t24h')",
        },
      },
      required: ["event_id"],
    },
  },
  {
    name: "generate_advisory",
    description:
      "Generate a structured advisory for a specific zone/cell based on engine evidence.",
    parameters: {
      type: "object" as const,
      properties: {
        zone_id: {
          type: "string",
          description: "H3 cell ID for the zone to generate an advisory for",
        },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "evaluate_insurance_trigger",
    description:
      "Evaluate the illustrative parametric insurance trigger for the current scenario. Returns ILLUSTRATIVE POLICY status only — not a real contract.",
    parameters: {
      type: "object" as const,
      properties: {
        policy_id: {
          type: "string",
          description: "Policy ID (use 'demo-policy-odisha-cyclone-2019')",
        },
      },
      required: ["policy_id"],
    },
  },
];

// ─────────────────────────────────────────────────────────────
// TOOL EXECUTORS
// ─────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "get_event_status": {
      const result = await runFaniDemoEngine({ responseCapacity: 1 });
      return {
        eventId: result.scenario.eventId,
        displayLabel: result.scenario.displayLabel,
        tier: result.scenario.tier,
        windKph: result.scenario.windKph,
        rainfall24hMm: result.scenario.rainfall24hMm,
        surgeM: result.scenario.surgeM,
        surgeMethod: result.scenario.surgeMethod,
        fixtureStatus: result.fixtureStatus,
        predictionCutoff: FANI_KNOWN_PARAMETERS.predictionCutoffAt,
        engineVersion: result.manifest.engineVersion,
        stats: result.stats,
      };
    }

    case "get_cell_risk": {
      const cellId = String(args.cell_id ?? "");
      if (!cellId) return { error: "cell_id is required" };
      const result = await runFaniDemoEngine({ responseCapacity: 10 });
      const cell = result.cells.get(cellId);
      if (!cell) return { error: `Cell ${cellId} not found` };
      const rec = result.recommendations.find((r) => r.cellId === cellId);
      return {
        cellId,
        hazard: cell.hazard,
        exposure: cell.exposure,
        susceptibility: cell.susceptibility,
        impactExposure: cell.impactExposure,
        infrastructure: cell.infrastructure,
        priority: cell.priority,
        priorityRecommendation: rec ?? null,
        dataStatus: result.fixtureStatus,
      };
    }

    case "get_asset_risk": {
      const assetId = String(args.asset_id ?? "");
      const result = await runFaniDemoEngine({ responseCapacity: 10 });
      const asset = result.assets.find((a) => a.assetId === assetId);
      if (!asset) return { error: `Asset ${assetId} not found` };
      return {
        assetId: asset.assetId,
        name: asset.name,
        type: asset.type,
        criticality: asset.criticality,
        vulnerability: asset.vulnerability,
        exposure: asset.exposure,
        dependencyCentrality: asset.dependencyCentrality,
        risk: asset.risk,
        confidence: asset.confidence,
        dataStatus: result.fixtureStatus,
      };
    }

    case "get_priority_list": {
      const k = Math.min(50, Math.max(1, Number(args.k ?? 10)));
      const objective = String(args.objective ?? "balanced") as "balanced";
      const result = await runFaniDemoEngine({ responseCapacity: k, objective });
      return {
        recommendations: result.recommendations,
        responseCapacity: k,
        objective,
        stats: result.stats,
        dataStatus: result.fixtureStatus,
      };
    }

    case "get_dependency_graph": {
      const assetId = String(args.asset_id ?? "");
      const result = await runFaniDemoEngine({ responseCapacity: 10 });
      const asset = result.assets.find((a) => a.assetId === assetId);
      if (!asset) return { error: `Asset ${assetId} not found` };
      const cell = asset.containingCellId
        ? result.cells.get(asset.containingCellId)
        : null;
      return {
        assetId,
        name: asset.name,
        type: asset.type,
        dependencyCentrality: asset.dependencyCentrality,
        containingCellId: asset.containingCellId,
        servicePopulation: asset.exposure.population,
        cellInfrastructureStats: cell
          ? {
              assetCount: cell.infrastructure.assetCount,
              combinedCriticality: cell.infrastructure.combinedCriticality,
              dependencyCentrality: cell.infrastructure.dependencyCentrality,
            }
          : null,
        note: "Dependency centrality is a spatial/network proxy — not from OSRM routing.",
      };
    }

    case "run_scenario": {
      const result = await runFaniDemoEngine({
        windMultiplier: Number(args.wind_multiplier ?? 1.0),
        rainfallMultiplier: Number(args.rainfall_multiplier ?? 1.0),
        surgeHeightM: Number(args.surge_height_m ?? 1.5),
        responseCapacity: Number(args.k ?? 10),
      });
      return {
        scenario: result.scenario,
        recommendations: result.recommendations.slice(0, 5),
        stats: result.stats,
        label: "SIMULATED SCENARIO — NOT AN OFFICIAL FORECAST",
      };
    }

    case "get_historical_replay": {
      const result = await runFaniDemoEngine({ responseCapacity: 10 });
      return {
        eventId: "fani-2019-t24h",
        predictionCutoff: FANI_KNOWN_PARAMETERS.predictionCutoffAt,
        recommendations: result.recommendations,
        stats: result.stats,
        manifest: result.manifest,
        fixtureStatus: result.fixtureStatus,
        phase: "PREDICTION",
      };
    }

    case "generate_advisory": {
      const zoneId = String(args.zone_id ?? "");
      const result = await runFaniDemoEngine({ responseCapacity: 10 });
      const cell = result.cells.get(zoneId);
      if (!cell)
        return { error: `Zone/cell ${zoneId} not found. Check cell ID.` };
      const rec =
        result.recommendations.find((r) => r.cellId === zoneId) ??
        result.recommendations[0];
      if (!rec) return { error: "No recommendations available" };
      const { generateStructuredAdvisory } = await import(
        "../../engine/advisory/index"
      );
      const advisory = generateStructuredAdvisory(
        rec,
        cell,
        zoneId,
        "gemini-assisted"
      );
      return {
        advisory,
        note: "Advisory requires human approval before dispatch.",
      };
    }

    case "evaluate_insurance_trigger": {
      const result = await runFaniDemoEngine({ responseCapacity: 1 });
      const trigger = evaluateInsuranceTrigger({
        windKph: result.scenario.windKph,
        rainfall24hMm: result.scenario.rainfall24hMm,
        surgeM: result.scenario.surgeM,
      });
      return {
        trigger,
        label: "ILLUSTRATIVE POLICY — Not a real contract. No real payout.",
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
