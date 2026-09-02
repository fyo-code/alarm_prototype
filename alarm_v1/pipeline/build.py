"""Build the alarm panel: one row per SKU, everything the platform needs.

Run:  alarm_v1/.venv/bin/python -m pipeline.build      (from the alarm_v1 folder)
Out:  data/panel.parquet, data/store_stock.parquet, data/meta.json
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from . import engine, paths, sources

DIM_RE = re.compile(r"^(\d{2,3})\s*x\s*(\d{2,3})", re.I)


# ------------------------------------------------------------------ helpers --

def _factory(subclasa) -> str | None:
    """Producer name out of `SUBCLASA` — values look like '784   GIZA CARPET'.

    The project data dictionary defines `SUBCLASA` generically as "finer
    hierarchy below CLASA". In the rug slice it is empirically the producer, and
    that reading is validated against our own data, not assumed:

      * `CLASA` has exactly ONE value across all rugs
        ('006   MOBILIER DE CASA - ACCESORII'), so `SUBCLASA` is not functioning
        as a product sub-hierarchy here — there is nothing for it to subdivide.
      * Every `SUBCLASA` value with >=20 SKUs maps onto a single 2-letter SKU
        code prefix (median share 1.00): MERINOS -> ME*, MILAT -> MI*,
        AGNELLA -> AG*, LOOMX -> LO*, JAIPUR -> JA*. Code prefixes are assigned
        per producer, so the grouping is a producer grouping.
      * `FURNIZOR` is 'INDOMEX SRL' for 8,001 of 9,875 rug SKUs — that is the
        importing entity, one level above, and it carries no producer detail.

    Caveat kept in docs/ASSUMPTIONS.md: supplier is not always the same entity
    as factory (one supplier can aggregate producers in several countries), and
    this field cannot tell the two apart.
    """
    # pd.isna covers None, float nan AND pd.NA — str(pd.NA) is the literal
    # "<NA>", which used to leak through and appear as a producer name
    if subclasa is None or pd.isna(subclasa):
        return None
    s = re.sub(r"^\s*\d+\s+", "", str(subclasa)).strip()
    return s or None


def _factory_code(subclasa) -> str | None:
    if subclasa is None or pd.isna(subclasa):
        return None
    m = re.match(r"^\s*(\d+)\s+", str(subclasa))
    return m.group(1) if m else None


def _width(dimensiuni, sku: str):
    """Rug width in cm. Primary source is DIMENSIUNI, fallback the code suffix.

    Rugs are the atypical category: one model = ~5 widths, and the width drives
    the loom constraint. Every other PM here is 1 SKU : 1 product.
    """
    if isinstance(dimensiuni, str):
        m = DIM_RE.match(dimensiuni.strip())
        if m:
            return int(m.group(1))
    m = re.search(r"(\d{3})$", str(sku))
    if m:
        v = int(m.group(1))
        if 20 <= v <= 400:
            return v
    return None


NAME_DIM_RE = re.compile(r"(\d{2,3})\s*[xX]\s*(\d{2,3})\s*cm", re.I)


def _width_from_name(name) -> float | None:
    """Width out of the product name, e.g. 'COVOR BAHIA 080x300cm BLUE' -> 80.

    The importer export carries real dimensions in the article name. Relying on
    the SKU code suffix instead mis-read codes whose suffix is not a width at all
    (MHSOFTFLOWER362 is named 45x75cm, so 362 is a model number, not centimetres).
    """
    if name is None or pd.isna(name):
        return None
    m = NAME_DIM_RE.search(str(name))
    return float(m.group(1)) if m else None


def _load_manual_lead_times(default_days: int, default_source: str) -> pd.DataFrame:
    p = paths.MANUAL_DIR / "lead_times.csv"
    if not p.exists():
        return pd.DataFrame(columns=["factory", "lead_time_days", "lead_time_source"])
    lt = pd.read_csv(p)
    lt["factory"] = lt["factory"].astype(str).str.strip()
    lt["lead_time_days"] = pd.to_numeric(lt["lead_time_days"], errors="coerce")
    lt = lt.dropna(subset=["lead_time_days"])
    if "lead_time_source" not in lt.columns:
        lt["lead_time_source"] = default_source
    lt["lead_time_source"] = lt["lead_time_source"].fillna(default_source)
    return lt[["factory", "lead_time_days", "lead_time_source"]]


def _load_manual_state() -> pd.DataFrame:
    p = paths.MANUAL_DIR / "product_state.csv"
    if not p.exists():
        return pd.DataFrame(columns=["sku", "product_state", "state_source"])
    st = pd.read_csv(p)
    st["sku"] = st["sku"].astype(str)
    if "state_source" not in st.columns:
        st["state_source"] = "manual_file"
    return st[["sku", "product_state", "state_source"]]


# -------------------------------------------------------------------- build --

def build() -> dict:
    paths.ensure_dirs()
    cfg = paths.load_config()
    as_of = pd.Timestamp(cfg["as_of"])
    w = cfg["windows"]
    rep = cfg["replenishment"]

    raw = sources.load_all(as_of)

    # --- product spine -------------------------------------------------------
    a = raw.attrs.copy()
    a["factory"] = a["subclasa"].map(_factory)
    a["factory_code"] = a["subclasa"].map(_factory_code)
    a["width_cm"] = [_width(d, s) for d, s in zip(a["dimensiuni"], a["sku"])]
    fam = raw.families.rename(columns={"sku_id": "sku"})[
        ["sku", "family", "family_level", "code_family", "name_family"]]
    p = a[["sku", "factory", "factory_code", "width_cm", "dimensiuni",
           "denumire_articol", "stil", "substil"]].merge(fam, on="sku", how="left")
    p["family"] = p["family"].fillna(p["code_family"]).fillna("NEATRIBUIT")

    # --- producer: two real levels, not one -----------------------------------
    # SUBCLASA  = brand / supplier level ("GIZA CARPET") — the language the
    #             company speaks, but it lives ONLY in the old `sales_data_prep1p2`
    #             export, so it will not refresh with new data.
    # FURNIZOR EXT = the external exporting entity ("SAHAN IC VE DIS TIC LTD STI")
    #             — present in the ACTIVE export, 82 distinct values.
    # They are not duplicates: 15 of 45 SUBCLASA values map to more than one
    # FURNIZOR EXT (GIZA CARPET -> SAHAN + CAYIRLI), which is the supplier-is-not-
    # always-the-factory nuance showing up in the data. So we keep both, use
    # SUBCLASA as the label, and fall back to FURNIZOR EXT where it is absent.
    extra = raw.extra if len(raw.extra) else pd.DataFrame(columns=["sku"])
    keep = [c for c in ("sku", "furnizor_ext", "id_furnizor", "activ",
                        "activ_online", "vechime", "subclasa_raw",
                        "denumire_raw", "dimensiuni_raw") if c in extra.columns]
    p = p.merge(extra[keep], on="sku", how="left") if keep else p
    for c in ("furnizor_ext", "activ", "vechime", "subclasa_raw",
              "denumire_raw", "dimensiuni_raw"):
        if c not in p.columns:
            p[c] = pd.NA
    # the direct scan reaches 99.8% of codes on the product name, against 50%
    # in the pre-built attribute table
    p["denumire_articol"] = p["denumire_raw"].fillna(p["denumire_articol"])
    p["dimensiuni"] = p["dimensiuni_raw"].fillna(p["dimensiuni"])
    p["width_cm"] = [_width(d, s) for d, s in zip(p["dimensiuni"], p["sku"])]

    # The direct scan of the raw exports reaches 99.7% of rug codes on SUBCLASA,
    # against 73% in the pre-built V4 attribute table, so it takes precedence.
    scanned = p["subclasa_raw"].map(_factory)
    p["factory"] = scanned.fillna(p["factory"])
    p["producer_entity"] = p["furnizor_ext"]
    p["factory_source"] = np.select(
        [scanned.notna().to_numpy(dtype=bool),
         p["factory"].notna().to_numpy(dtype=bool),
         p["furnizor_ext"].notna().to_numpy(dtype=bool)],
        ["SUBCLASA_scan", "SUBCLASA_v4_attrs", "FURNIZOR_EXT_fallback"],
        default="none",
    )
    p["factory"] = p["factory"].fillna(p["furnizor_ext"]).fillna("NEATRIBUIT")

    # --- stock ---------------------------------------------------------------
    # Store snapshots do not all arrive on the same cadence: four stores report to
    # June 2026, three stop at December 2025. Taking only the exact as-of month
    # would silently drop those three (4,058 units). Instead each store
    # contributes its LATEST snapshot at or before as_of — standard last-known-
    # position behaviour — and the actual date used per store is recorded in
    # meta.coverage.store_as_of_by_store so the staleness is auditable rather
    # than hidden.
    stock_month = as_of.to_period("M").to_timestamp()
    ss = raw.store_stock
    upto = ss[ss["month_start"] <= stock_month]
    latest_per_store = upto.groupby("store_code")["month_start"].transform("max")
    at_month = upto[upto["month_start"] == latest_per_store]
    store_as_of = (at_month.groupby("store_code")["month_start"].max()
                   .dt.strftime("%Y-%m").to_dict())
    store_units = (at_month.groupby("sku_id", as_index=False)["stock_qty"].sum()
                   .rename(columns={"sku_id": "sku", "stock_qty": "store_units"}))
    # Build the SKU universe as the UNION of all three layers first, then left-join
    # each layer onto it. Chaining `left` on the sales spine and only then `outer`
    # on the warehouse — which is what this used to do — silently discarded store
    # stock for any code missing from sales history: 2,531.68 units, 17.2% of the
    # whole store layer, including 913 units on 339 codes that DID get a row via
    # the warehouse and so showed store_units = 0 while the per-store drill-down
    # said otherwise. Order of joins is not cosmetic here.
    spine = p[["sku"]].assign(_in_sales=True)
    universe = (pd.concat([spine[["sku"]],
                           store_units[["sku"]],
                           raw.warehouse[["sku"]] if len(raw.warehouse) else pd.DataFrame(columns=["sku"])],
                          ignore_index=True)
                .drop_duplicates("sku"))
    p = (universe.merge(p, on="sku", how="left")
                 .merge(store_units, on="sku", how="left")
                 .merge(raw.warehouse, on="sku", how="left")
                 .merge(spine, on="sku", how="left"))
    for c in ("store_units", "wh_units", "wh_value"):
        p[c] = p[c].fillna(0.0)
    p["sku_origin"] = np.where(p["_in_sales"].fillna(False), "sales_history",
                               np.where(p["wh_units"] > 0, "warehouse_only", "store_only"))
    p = p.drop(columns=["_in_sales"])
    p["stock_units"] = p["wh_units"] + p["store_units"]

    nonsales = ~p["sku_origin"].eq("sales_history")
    if nonsales.any():
        if "wh_name" in p.columns:
            p.loc[nonsales, "denumire_articol"] = (p.loc[nonsales, "denumire_articol"]
                                                   .fillna(p.loc[nonsales, "wh_name"]))
        # Width: pass the NAME through too. The importer name carries the real
        # dimensions ("COVOR BAHIA 080x300cm BLUE"), and ignoring it forced the
        # code-suffix heuristic, which mis-read 80 rows / 1,890 units — e.g.
        # MHSOFTFLOWER362 (named 45x75cm) came out as 362 cm.
        p.loc[nonsales, "width_cm"] = pd.Series(
            [_width_from_name(n) or _width(None, s)
             for n, s in zip(p.loc[nonsales, "denumire_articol"], p.loc[nonsales, "sku"])],
            index=p.index[nonsales], dtype="float64")

    # --- producer inference, applied ONCE and CONSISTENTLY -------------------
    # Real data always wins: SUBCLASA, then FURNIZOR EXT. Only rows with neither
    # are candidates. The prefix is used solely where it maps to exactly one
    # producer among codes that DO carry a real SUBCLASA, and every inferred row
    # is stamped so it can never be mistaken for source data. An earlier version
    # applied this to warehouse-only rows but not to sales-history rows, which was
    # arbitrary — same missing field, different treatment.
    prod_cfg = cfg.get("producer", {})
    if prod_cfg.get("infer_from_code_prefix", False):
        n = int(prod_cfg.get("infer_prefix_len", 3))
        real = p[p["factory_source"].isin(["SUBCLASA_scan", "SUBCLASA_v4_attrs"])].copy()
        real["_pf"] = real["sku"].astype(str).str[:n]
        amb = real.groupby("_pf")["factory"].nunique()
        mapping = (real[real["_pf"].isin(amb[amb == 1].index)]
                   .groupby("_pf")["factory"].first())
        need = p["factory"].isna() | p["factory"].eq("NEATRIBUIT")
        inferred = p.loc[need, "sku"].astype(str).str[:n].map(mapping)
        hit = inferred.notna()
        p.loc[inferred.index[hit], "factory"] = inferred[hit]
        p.loc[inferred.index[hit], "factory_source"] = "INFERRED_from_code_prefix"

    p["factory"] = p["factory"].fillna("NEATRIBUIT")
    p["family"] = p["family"].fillna("NEATRIBUIT")
    p["factory_source"] = p["factory_source"].fillna("none")

    # --- demand windows ------------------------------------------------------
    wf = raw.weekly[raw.weekly["demand_week_start"] <= as_of]

    def _win(days: int, suffix: str) -> pd.DataFrame:
        sel = wf[wf["demand_week_start"] > as_of - pd.Timedelta(days=days)]
        return (sel.groupby("sku_id")
                .agg(**{f"units_{suffix}": ("gross_units", "sum"),
                        f"value_{suffix}": ("gross_value", "sum")})
                .reset_index().rename(columns={"sku_id": "sku"}))

    for days, suf in ((w["dead_days"], "90d"), (w["inactive_days"], "180d"),
                      (w["velocity_long_days"], "365d")):
        p = p.merge(_win(days, suf), on="sku", how="left")
    for c in [c for c in p.columns if c.startswith(("units_", "value_"))]:
        p[c] = p[c].fillna(0.0)

    last_sale = (wf[wf["gross_units"] > 0].groupby("sku_id")["demand_week_start"].max()
                 .rename("last_sale").reset_index().rename(columns={"sku_id": "sku"}))
    p = p.merge(last_sale, on="sku", how="left")
    p["months_since_sale"] = ((as_of - p["last_sale"]).dt.days / 30.4375)

    # monthly matrix for the variability term
    m12 = wf[wf["demand_week_start"] > as_of - pd.Timedelta(days=30 * w["variability_months"])].copy()
    m12["m"] = m12["demand_week_start"].dt.to_period("M")
    matrix = (m12.pivot_table(index="sku_id", columns="m", values="gross_units",
                              aggfunc="sum", fill_value=0.0))
    matrix = matrix.reindex(p["sku"].values, fill_value=0.0)
    matrix.index = p.index

    # --- money ---------------------------------------------------------------
    price = p["value_365d"] / p["units_365d"].replace(0, np.nan)
    p["avg_price"] = price
    ratio = cfg["money"]["cost_fallback_ratio_on_price"]
    p["cost_source"] = np.where(p["unit_cost"].notna(), "warehouse_export",
                                np.where(price.notna(), "assumed_pct_of_price", "unknown"))
    p["unit_cost"] = p["unit_cost"].fillna(price * ratio)
    p["stock_value"] = p["stock_units"] * p["unit_cost"].fillna(0.0)

    # --- lead time (factory level, never per SKU) ----------------------------
    lt = _load_manual_lead_times(rep["default_lead_time_days"], rep["default_lead_time_source"])
    p = p.merge(lt, on="factory", how="left")
    p["lead_time_source"] = p["lead_time_source"].fillna(rep["default_lead_time_source"])
    p["lead_time_days"] = p["lead_time_days"].fillna(rep["default_lead_time_days"]).astype(float)

    # --- product state -------------------------------------------------------
    # Priority: real ACTIV from the export > an optional manual/override file >
    # unknown. `ACTIV` is D (da/active) / N (nu/not active), 21.8% coverage on
    # rugs — thin, but real, and it beats a guess.
    #
    # An earlier build derived state from stock-drain behaviour instead. That
    # heuristic was measured against real ACTIV on the overlap and agreed only
    # 5% of the time (53 of 56 codes it called `phase_out` are actually ACTIV=D),
    # so it is no longer applied by default. `pipeline/state_proxy.py` still
    # exists but only writes to manual/product_state_HEURISTIC.csv, which the
    # build ignores unless you rename it. See docs/ASSUMPTIONS.md A6.
    activ = p["activ"].astype("string").str.upper().str.strip()
    # nullable-boolean -> plain bool, otherwise np.select rejects the condlist
    is_d = activ.eq("D").fillna(False).to_numpy(dtype=bool)
    is_n = activ.eq("N").fillna(False).to_numpy(dtype=bool)
    p["product_state"] = np.select([is_d, is_n], ["active", "not_active"], default="unknown")
    p["state_source"] = np.where(is_d | is_n, "ACTIV_export", "not_available")

    st = _load_manual_state()
    if len(st):
        p = p.merge(st.rename(columns={"product_state": "_ms", "state_source": "_ss"}),
                    on="sku", how="left")
        take = p["_ms"].notna() & p["product_state"].eq("unknown")
        p.loc[take, "product_state"] = p.loc[take, "_ms"]
        p.loc[take, "state_source"] = p.loc[take, "_ss"].fillna("manual_file")
        p = p.drop(columns=["_ms", "_ss"])

    # --- engine --------------------------------------------------------------
    p["rate_mo"] = engine.monthly_rate(p["units_90d"], w["dead_days"],
                                       p["units_365d"], w["velocity_long_days"],
                                       cfg["velocity"]["short_weight"])
    p["sigma_mo"] = engine.monthly_sigma(matrix, p["rate_mo"])
    p["review_period_months"] = rep["review_period_months"]
    p["service_z"] = rep["service_level_z"]
    p["service_level_pct"] = rep["service_level_pct"]
    p = engine.reorder_numbers(p, rep["review_period_months"], rep["service_level_z"])
    p["months_of_supply"] = engine.months_of_supply(p["stock_units"], p["rate_mo"])
    p = engine.classify(p, cfg)
    p = engine.priority(p)

    # --- universe of the photograph -----------------------------------------
    # A SKU is in the picture if it holds stock or has sold in the last year.
    # Without this the frame fills with five years of retired codes.
    p["in_photo"] = (p["stock_units"] > 0) | (p["units_365d"] > 0)

    # --- plain rotation heuristic, kept alongside the engine rate ------------
    # total stock ÷ sales over three months. Computed on our data, same as
    # everything else here; it exists so the engine's blended rate can be
    # sanity-checked against the simplest possible arithmetic.
    # stock / (90-day sales / 3) = MONTHS of cover on the plain heuristic.
    # Dividing by units_90d directly would give 90-day PERIODS, which is what an
    # earlier version did while the UI labelled it "luni" — a silent 3x error,
    # and it disagreed with /api/sanity which had it right. The unit is in the
    # column name now so it cannot be mislabelled again.
    p["simple_rotation_months"] = np.where(
        p["units_90d"] > 0, p["stock_units"] / (p["units_90d"] / 3.0), np.inf)

    # stored as JSON text: parquet would otherwise flatten the per-part payloads
    # into one union schema full of nulls
    p["why"] = [json.dumps(engine.build_why(r), ensure_ascii=False) for _, r in p.iterrows()]

    panel = p[p["in_photo"]].copy().reset_index(drop=True)
    panel.to_parquet(paths.PANEL_PARQUET, index=False)

    # per-store stock for the SKU drilldown
    store_detail = at_month.rename(columns={"sku_id": "sku", "stock_qty": "units"})
    store_detail = store_detail[store_detail["sku"].isin(set(panel["sku"]))]
    store_detail[["sku", "store_code", "units"]].to_parquet(
        paths.OUT_DIR / "store_stock.parquet", index=False)

    _write_cost_audit(panel)

    raw.coverage["store_as_of_by_store"] = store_as_of
    raw.coverage["stores_stale_vs_as_of"] = sorted(
        st for st, mth in store_as_of.items() if mth != stock_month.strftime("%Y-%m"))
    raw.coverage["store_units_by_as_of"] = {
        mth: float(at_month.loc[at_month["month_start"].dt.strftime("%Y-%m") == mth,
                               "stock_qty"].sum())
        for mth in sorted(set(store_as_of.values()))
    }

    _write_stock_history(raw, panel_skus=set(p["sku"].astype(str)))

    meta = _meta(cfg, as_of, raw, panel)
    with open(paths.META_JSON, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2, ensure_ascii=False)
    return meta


def _write_stock_history(raw, panel_skus: set) -> None:
    """Monthly importer stock for rug codes — the trend layer.

    Until the coded export arrived the photograph was a single frozen month, so
    "is the stock position actually improving?" was unanswerable in either
    direction. 56 months of importer stock by code makes it answerable, which is
    the measurement the whole engagement is judged on.
    """
    _ri = paths.load_config().get("rug_inclusion", {})
    hist = sources.warehouse_history(
        panel_skus,
        tuple(_ri.get("include_name_buckets", ["rugs_no_code_match"])),
        tuple(_ri.get("exclude_name_buckets", [])))
    if not len(hist):
        return
    by_month = (hist.groupby("month", as_index=False)
                .agg(units=("units", "sum"), value=("value", "sum"),
                     codes=("sku", "nunique")))
    by_month.to_parquet(paths.OUT_DIR / "stock_history.parquet", index=False)
    hist.to_parquet(paths.OUT_DIR / "stock_history_sku.parquet", index=False)


def _write_cost_audit(panel: pd.DataFrame) -> None:
    """Name every SKU whose stock value rests on an assumed cost.

    Requested explicitly: if a real acquisition cost is missing and we fall back
    to a selling price, it must be recorded which codes that happened on. This
    file is the record. `cost_basis_note` says, per row, what the number is.
    """
    cols = ["sku", "denumire_articol", "factory", "family", "stock_units",
            "wh_units", "store_units", "unit_cost", "stock_value", "avg_price",
            "cost_source", "colour"]
    out = panel[cols].copy()
    out["cost_basis_note"] = out["cost_source"].map({
        "warehouse_export":
            "REAL acquisition cost — VALOARE STOC / STOC from the importer export",
        "assumed_pct_of_price":
            "ASSUMED — no acquisition cost on file; using a fixed % of the realised "
            "average selling price over the last 12 months",
        "unknown":
            "NO VALUE — neither an importer cost nor any sale in the window; this SKU "
            "contributes 0 lei, so the capital total is understated by its true value",
    })
    out = out.sort_values(["cost_source", "stock_value"], ascending=[True, False])
    out.to_csv(paths.OUT_DIR / "cost_source_audit.csv", index=False)

    summary = (out.groupby("cost_source")
               .agg(skus=("sku", "count"), units=("stock_units", "sum"),
                    lei=("stock_value", "sum")).reset_index())
    summary.to_csv(paths.OUT_DIR / "cost_source_summary.csv", index=False)


def _meta(cfg: dict, as_of: pd.Timestamp, raw: sources.RawLayers,
          panel: pd.DataFrame) -> dict:
    by_colour = (panel.groupby("colour")
                 .agg(units=("stock_units", "sum"), value=("stock_value", "sum"),
                      skus=("sku", "count")).to_dict("index"))
    return {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "as_of": str(as_of.date()),
        "category": cfg["category"],
        "rows": int(len(panel)),
        "total_units": float(panel["stock_units"].sum()),
        "total_value": float(panel["stock_value"].sum()),
        "skus_with_stock": int((panel["stock_units"] > 0).sum()),
        "factories": int(panel.loc[panel["stock_units"] > 0, "factory"].nunique()),
        "families": int(panel.loc[panel["stock_units"] > 0, "family"].nunique()),
        "by_colour": by_colour,
        "coverage": raw.coverage,
        "cost_source_mix": panel["cost_source"].value_counts().to_dict(),
        "state_source_mix": panel["state_source"].value_counts().to_dict(),
        "lead_time_sources": panel["lead_time_source"].value_counts().to_dict(),
        "factory_source_mix": panel["factory_source"].value_counts().to_dict(),
        "product_state_mix": panel["product_state"].value_counts().to_dict(),
        "config": cfg,
    }


def main() -> None:
    m = build()
    print("ALARM V1 — panel built")
    print(f"  as of {m['as_of']} | {m['rows']:,} SKUs in the photograph")
    print(f"  {m['total_units']:,.0f} units | {m['total_value']:,.0f} lei | "
          f"{m['factories']} factories | {m['families']} families")
    tot_u = m["total_units"] or 1
    for c, v in sorted(m["by_colour"].items(), key=lambda kv: -kv[1]["units"]):
        print(f"    {c:7s} {v['units']:9,.0f} u ({v['units']/tot_u*100:5.1f}%)  "
              f"{v['value']:12,.0f} lei  {v['skus']:5d} SKU")
    wh = m["coverage"]["warehouse"]
    if wh.get("available"):
        print(f"  warehouse join: {wh['unit_match_pct']}% of units, "
              f"{wh['value_match_pct']}% of lei mapped to a SKU code")


if __name__ == "__main__":
    main()
