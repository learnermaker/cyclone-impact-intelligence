"use client";

import { useState } from "react";
import { ScenarioWarning } from "../shared/SourceTierBadge";
import { SCENARIO_BOUNDS } from "@/config/index";

export type ScenarioParams = {
  windMult: number;
  rainMult: number;
  surgeHeight: number;
  surgeMethod: "flood_fill" | "proximity_threshold";
};

type Props = {
  onChange: (params: ScenarioParams) => void;
  disabled?: boolean;
};

export function ScenarioControls({ onChange, disabled = false }: Props) {
  const [params, setParams] = useState<ScenarioParams>({
    windMult: 1.0,
    rainMult: 1.0,
    surgeHeight: 1.5,
    surgeMethod: "flood_fill",
  });

  const isModified =
    params.windMult !== 1.0 ||
    params.rainMult !== 1.0 ||
    params.surgeHeight !== 1.5;

  function update(partial: Partial<ScenarioParams>) {
    const next = { ...params, ...partial };
    setParams(next);
    onChange(next);
  }

  return (
    <div className="rounded border border-slate-700 bg-slate-900/50 p-3 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-300">Scenario Controls</span>
        {isModified && (
          <button
            onClick={() => update({ windMult: 1.0, rainMult: 1.0, surgeHeight: 1.5, surgeMethod: "flood_fill" })}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {isModified && <ScenarioWarning />}

      {/* Wind */}
      <SliderField
        label="Wind"
        value={params.windMult}
        min={SCENARIO_BOUNDS.windMultiplier.min}
        max={SCENARIO_BOUNDS.windMultiplier.max}
        step={SCENARIO_BOUNDS.windMultiplier.step}
        unit="×"
        disabled={disabled}
        onChange={(v) => update({ windMult: v })}
      />

      {/* Rainfall */}
      <SliderField
        label="Rainfall"
        value={params.rainMult}
        min={SCENARIO_BOUNDS.rainfallMultiplier.min}
        max={SCENARIO_BOUNDS.rainfallMultiplier.max}
        step={SCENARIO_BOUNDS.rainfallMultiplier.step}
        unit="×"
        disabled={disabled}
        onChange={(v) => update({ rainMult: v })}
      />

      {/* Surge height */}
      <SliderField
        label="Surge"
        value={params.surgeHeight}
        min={SCENARIO_BOUNDS.surgeHeightM.min}
        max={SCENARIO_BOUNDS.surgeHeightM.max}
        step={SCENARIO_BOUNDS.surgeHeightM.step}
        unit="m"
        disabled={disabled}
        onChange={(v) => update({ surgeHeight: v })}
      />

      {/* Surge method */}
      <div className="space-y-1">
        <label className="block text-[11px] text-slate-400">Surge model</label>
        <select
          value={params.surgeMethod}
          onChange={(e) => update({ surgeMethod: e.target.value as "flood_fill" | "proximity_threshold" })}
          disabled={disabled}
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
        >
          <option value="flood_fill">Flood-fill (preferred)</option>
          <option value="proximity_threshold">Proximity threshold (screening)</option>
        </select>
        {params.surgeMethod === "proximity_threshold" && (
          <p className="text-[10px] text-yellow-600">
            SCREENING APPROXIMATION — not a validated surge model
          </p>
        )}
      </div>
    </div>
  );
}

function SliderField({
  label, value, min, max, step, unit, disabled, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <label className="text-[11px] text-slate-400">{label}</label>
        <span className="text-[11px] font-mono text-slate-200">
          {value.toFixed(1)}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-blue-500 disabled:opacity-50 cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}
