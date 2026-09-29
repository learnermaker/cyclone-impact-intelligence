"""
GEE Pipeline Master Runner

Executes all GEE preprocessing pipelines in priority order:
  1. WorldPop 2019    → data/processed/worldpop_2019_h3r8_odisha.json
  2. NASADEM          → data/processed/nasadem_h3r8_odisha.json
  3. GPM IMERG Fani   → data/processed/gpm_imerg_fani_96h.json
  4. Sentinel-1 actual→ data/historical/fani/actual/sentinel1_flood_extent.json

Usage:
  python pipelines/gee/run_all.py

Prerequisites:
  - EARTHENGINE_PROJECT=hack-506718 set in environment
  - earthengine authenticated (earthengine authenticate)
  - Python earthengine-api installed

The primary demo still works if this runner fails — it uses DEMO_FIXTURE.
Real data replaces synthetic data for cells where GEE values are available.
"""

import sys
import os

# Set project from .env if not already set
if "EARTHENGINE_PROJECT" not in os.environ:
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    try:
        with open(env_path) as f:
            for line in f:
                if line.startswith("EARTHENGINE_PROJECT="):
                    os.environ["EARTHENGINE_PROJECT"] = line.strip().split("=", 1)[1]
                    break
    except Exception:
        pass

project = os.environ.get("EARTHENGINE_PROJECT", "hack-506718")
print(f"GEE Project: {project}", file=sys.stderr)

results = {}

# ── WorldPop ─────────────────────────────────────────────────────────────────
print("\n[1/4] WorldPop 2019", file=sys.stderr)
try:
    import importlib.util
    spec = importlib.util.spec_from_file_location("wp", os.path.join(os.path.dirname(__file__), "01_worldpop_h3_sample.py"))
    wp = importlib.util.module_from_spec(spec); spec.loader.exec_module(wp)
    wp.main()
    results["WorldPop"] = "OK"
except Exception as e:
    print(f"  WorldPop FAILED: {e}", file=sys.stderr)
    results["WorldPop"] = f"FAILED: {e}"

# ── NASADEM ──────────────────────────────────────────────────────────────────
print("\n[2/4] NASADEM", file=sys.stderr)
try:
    spec = importlib.util.spec_from_file_location("nd", os.path.join(os.path.dirname(__file__), "02_nasadem_h3_sample.py"))
    nd = importlib.util.module_from_spec(spec); spec.loader.exec_module(nd)
    nd.main()
    results["NASADEM"] = "OK"
except Exception as e:
    print(f"  NASADEM FAILED: {e}", file=sys.stderr)
    results["NASADEM"] = f"FAILED: {e}"

# ── GPM IMERG ─────────────────────────────────────────────────────────────────
print("\n[3/4] GPM IMERG Fani", file=sys.stderr)
try:
    spec = importlib.util.spec_from_file_location("gpm", os.path.join(os.path.dirname(__file__), "03_gpm_imerg_fani.py"))
    gpm = importlib.util.module_from_spec(spec); spec.loader.exec_module(gpm)
    gpm.main()
    results["GPM_IMERG"] = "OK"
except Exception as e:
    print(f"  GPM FAILED: {e}", file=sys.stderr)
    results["GPM_IMERG"] = f"FAILED: {e}"

# ── Sentinel-1 ────────────────────────────────────────────────────────────────
print("\n[4/4] Sentinel-1 Actual", file=sys.stderr)
try:
    spec = importlib.util.spec_from_file_location("s1", os.path.join(os.path.dirname(__file__), "04_sentinel1_flood_actual.py"))
    s1 = importlib.util.module_from_spec(spec); spec.loader.exec_module(s1)
    s1.main()
    results["Sentinel1"] = "OK"
except Exception as e:
    print(f"  Sentinel-1 FAILED: {e}", file=sys.stderr)
    results["Sentinel1"] = f"FAILED: {e}"

# ── Summary ───────────────────────────────────────────────────────────────────
print("\n=== GEE Pipeline Summary ===", file=sys.stderr)
for name, status in results.items():
    icon = "✓" if status == "OK" else "✗"
    print(f"  {icon} {name}: {status}", file=sys.stderr)

ok_count = sum(1 for v in results.values() if v == "OK")
print(f"\n  {ok_count}/{len(results)} pipelines completed", file=sys.stderr)
if ok_count < len(results):
    print("  Remaining pipelines failed — demo still works with DEMO_FIXTURE", file=sys.stderr)
