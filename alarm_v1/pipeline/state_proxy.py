"""RETIRED heuristic product state — kept for the record, OFF by default.

MEASURED AGAINST REAL DATA AND FOUND WRONG. `ACTIV` from the sales export covers
294 of the 1,433 grey codes; on that overlap this heuristic agreed 5% of the
time (it called 53 codes `phase_out` that are actually ACTIV=D, still active).
The build now uses `ACTIV` directly and leaves the rest `unknown`.

This script writes to `manual/product_state_HEURISTIC.csv`, which the build does
NOT read. Rename it to `product_state.csv` only if you deliberately want the
guess back as a gap-filler.

Original rationale, for the record:

The brief needs product state to tell two grey items apart:
  grey + phase-out  = job done, the stock is draining on purpose, wait.
  grey + active     = the actual alarm.

The internal state codes are not in any export we have ("noi avem niște
clasificări interne cu stare produs — aia trebuie să mai lucrăm puțin"). Until
they arrive, we infer a proxy from stock behaviour alone:

  phase_out : stock only ever went DOWN over the observed year, was never
              restocked, and has drained to less than half of where it started.
              That is the fingerprint of a run-down by design.
  active    : stock was replenished at least once in the observed year.
  unknown   : neither pattern is clear.

Every row is stamped `HEURISTIC_PROXY`. The UI labels it, and the whole feature
switches off with one toggle. Replace this file with the real export and nothing
else in the pipeline changes.

Run: alarm_v1/.venv/bin/python -m pipeline.state_proxy
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import paths

RESTOCK_TOLERANCE = 2.0   # units; anything above this is a genuine replenishment
DRAIN_RATIO = 0.5         # ended the year at half of where it started, or less


def build() -> pd.DataFrame:
    cfg = paths.load_config()
    as_of = pd.Timestamp(cfg["as_of"])
    ss = pd.read_parquet(paths.STORE_STOCK)
    ss["month_start"] = pd.to_datetime(ss["month_start"])
    window = ss[(ss["month_start"] > as_of - pd.Timedelta(days=400))
                & (ss["month_start"] <= as_of)]

    per_sku = (window.groupby(["sku_id", "month_start"], as_index=False)["stock_qty"].sum()
               .pivot(index="sku_id", columns="month_start", values="stock_qty")
               .sort_index(axis=1).fillna(0.0))
    if per_sku.empty:
        return pd.DataFrame(columns=["sku", "product_state", "state_source"])

    diffs = per_sku.diff(axis=1)
    max_increase = diffs.max(axis=1)
    first = per_sku.iloc[:, 0]
    last = per_sku.iloc[:, -1]
    ever_held = per_sku.max(axis=1) > 0

    phase_out = ever_held & (max_increase <= RESTOCK_TOLERANCE) & (last <= first * DRAIN_RATIO) & (first > 0)
    active = ever_held & (max_increase > RESTOCK_TOLERANCE)

    state = pd.Series("unknown", index=per_sku.index, dtype=object)
    state[active] = "active"
    state[phase_out] = "phase_out"

    out = pd.DataFrame({
        "sku": per_sku.index.astype(str),
        "product_state": state.values,
        "state_source": "HEURISTIC_PROXY",
        "evidence_first_month_units": np.round(first.values, 1),
        "evidence_last_month_units": np.round(last.values, 1),
        "evidence_max_monthly_increase": np.round(max_increase.values, 1),
    })
    return out[out["product_state"] != "unknown"].reset_index(drop=True)


def main() -> None:
    paths.ensure_dirs()
    df = build()
    target = paths.MANUAL_DIR / "product_state_HEURISTIC.csv"
    df.to_csv(target, index=False)
    print(f"PLACEHOLDER product state written -> {target}")
    print(df["product_state"].value_counts().to_string())
    print("\nNOT read by the build. Measured 5% agreement with real ACTIV — see the module docstring.")


if __name__ == "__main__":
    main()
