"""Load the raw layers and reconcile them into one SKU-grain frame.

Four layers:
  1. product attributes  (factory, family/gamă, dimension)   — forecast_engine_v4
  2. demand              (weekly, de-duplicated, 2022→2026)  — forecast_engine_v4
  3. store stock         (monthly, 7 stores)                 — forecast_engine_v4
  4. warehouse stock     (monthly, units + lei)              — legacy importer export

Layer 4 is keyed on the article NAME, not the code — see the project's own
`active_docs/ITER5M_V2_PHASE8D_SUPPLIER_STOCK.md`, which documents the same file
family and the same problem, and requires an `exact_unique` name→SKU mapping
before the rows may be used. We rebuild that map from the sales exports and drop
any name resolving to more than one code. This layer is what puts money (lei)
into the picture at all: `VALOARE STOC / STOC` is the only per-unit cost we have.
"""
from __future__ import annotations

import glob
import re
from dataclasses import dataclass, field

import duckdb
import numpy as np
import pandas as pd

from . import paths

# The importing entity that carries rugs. Everything in the warehouse export
# under a different importer belongs to another product group.
RUG_IMPORTER = "INDOMEX SRL"

RO_MONTHS = {
    1: "IANUARIE", 2: "FEBRUARIE", 3: "MARTIE", 4: "APRILIE", 5: "MAI", 6: "IUNIE",
    7: "IULIE", 8: "AUGUST", 9: "SEPTEMBRIE", 10: "OCTOMBRIE", 11: "NOIEMBRIE",
    12: "DECEMBRIE",
}


def _norm_name(s) -> str:
    return re.sub(r"\s+", " ", str(s)).strip().upper()


def _bucket_unmapped(name: str) -> str:
    """Coarse, name-based grouping of warehouse stock we cannot map to a code.

    Not an attribution — nothing here is assigned to a factory or a SKU. Its
    only job is to answer "what is in the gap?" precisely enough to turn the
    gap into a concrete data request.
    """
    n = _norm_name(name)
    if "COVOR DE BAIE" in n or "BADETEPPICH" in n or "COVOR BAIE" in n or "COVORAS BAIE" in n:
        return "bath_mats"
    if any(t in n for t in ("MOCHETA", " MP", "IARBA ARTIFICIALA", "ZENN ")):
        return "broadloom_and_grass"
    if any(t in n for t in ("ADEZIV", "CLIPS", "ETICHETA", "BANDA", "SPRAY",
                            "PERIE", "SUPORT", "ANTIDERAPANT PLASA",
                            "SOLUTIE", "CURATAT", "PERNA", "PUF ", "TABURET")):
        return "accessories"
    if "TREAPTA" in n:
        return "stair_treads"
    if n.startswith("COVOR") or "COVOR" in n:
        return "rugs_no_code_match"
    return "other"


@dataclass
class RawLayers:
    attrs: pd.DataFrame
    families: pd.DataFrame
    weekly: pd.DataFrame
    store_stock: pd.DataFrame
    warehouse: pd.DataFrame
    extra: pd.DataFrame = field(default_factory=pd.DataFrame)
    coverage: dict = field(default_factory=dict)


def _name_map() -> pd.DataFrame:
    """SKU code → article name, from every source that carries both."""
    attrs = pd.read_parquet(paths.SKU_ATTRIBUTES)
    frames = [
        attrs.loc[attrs["denumire_articol"].notna(), ["sku", "denumire_articol"]]
        .rename(columns={"denumire_articol": "name"})
    ]
    files = sorted(glob.glob(str(paths.SALES_2026_DIR / "*.csv")))
    if files:
        con = duckdb.connect()
        try:
            extra = con.execute(
                """
                SELECT DISTINCT "COD ARTICOL" AS sku, "DENUMIRE ARTICOL" AS name
                FROM read_csv_auto(?, header=true, union_by_name=true,
                                   all_varchar=true, ignore_errors=true)
                WHERE lower("GRUPA_PRODUSE") LIKE '%covoare%'
                  AND "DENUMIRE ARTICOL" IS NOT NULL
                """,
                [files],
            ).df()
            frames.append(extra)
        finally:
            con.close()
    nm = pd.concat(frames, ignore_index=True)
    nm["key"] = nm["name"].map(_norm_name)
    # A name that maps to two different codes cannot be used to attribute stock.
    counts = nm.groupby("key")["sku"].nunique()
    nm = nm[nm["key"].map(counts).eq(1)].drop_duplicates("key")
    return nm[["key", "sku", "name"]]


RO_MONTH_NUM = {v: k for k, v in RO_MONTHS.items()}


def load_warehouse_coded(as_of: pd.Timestamp, rug_skus: set[str],
                         include_buckets: tuple[str, ...] = ("rugs_no_code_match",),
                         exclude_buckets: tuple[str, ...] = (),
                         ) -> tuple[pd.DataFrame, dict] | tuple[None, dict]:
    """Importer stock keyed on `ARTICOL COD` — the preferred source.

    Supersedes the name-keyed join entirely. That join topped out at 66.5% of
    units because the export identified articles by `ARTICOL DENUMIRE`; with a
    code column there is nothing to guess.

    Two things this function is careful about:

    1. **De-duplication.** The three files have overlapping period ranges (one is
       wholly redundant with the others), so rows are de-duplicated on
       (period, code) before anything is summed.
    2. **Non-rug product.** `INDOMEX SRL` also imports bath mats, floor adhesive,
       fixing clips, price labels and broadloom/mocheta. Those are real stock but
       they are not rugs and must not enter a rug alarm. We keep only codes that
       exist in the rug SKU universe and report the excluded volume explicitly,
       rather than carrying it as a mysterious "unmapped" block.
    """
    d = paths.WAREHOUSE_CODED_DIR
    files = sorted(glob.glob(str(d / paths.WAREHOUSE_CODED_GLOB))) if d.exists() else []
    if not files:
        return None, {"available": False, "reason": "coded importer export not found"}

    raw = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
    need = {"PERIOADA PERIOADA", "ARTICOL COD", "STOC", "VALOARE STOC"}
    if not need <= set(raw.columns):
        return None, {"available": False,
                      "reason": f"coded export missing columns: {sorted(need - set(raw.columns))}"}

    raw = raw.drop_duplicates(["PERIOADA PERIOADA", "ARTICOL COD"]).copy()
    raw["sku"] = raw["ARTICOL COD"].astype(str).str.strip()
    parts = raw["PERIOADA PERIOADA"].astype(str).str.strip().str.split()
    raw["_month"] = parts.str[0].str.upper().map(RO_MONTH_NUM)
    raw["_year"] = pd.to_numeric(parts.str[1], errors="coerce")
    raw = raw.dropna(subset=["_month", "_year"])

    period = f"{RO_MONTHS[as_of.month]} {as_of.year}"
    at = raw[(raw["_year"] == as_of.year) & (raw["_month"] == as_of.month)]
    if not len(at):
        avail = (raw[["_year", "_month"]].drop_duplicates()
                 .sort_values(["_year", "_month"]))
        latest = avail.iloc[-1]
        return None, {"available": False,
                      "reason": f"coded export has no rows for {period}; latest is "
                                f"{RO_MONTHS[int(latest['_month'])]} {int(latest['_year'])}"}

    # A code counts as a rug if it is already in the sales-derived rug universe,
    # OR its name puts it in an included bucket. The second half matters: the rug
    # universe comes from SALES history, so warehouse stock that has NEVER sold is
    # absent from it — and that is exactly the dead stock the alarm exists to
    # surface. Filtering on the sales universe alone hid 1,054 codes / 11,320
    # units / 2.29M lei of never-sold rugs.
    at = at.copy()
    at["_bucket"] = at["ARTICOL DENUMIRE"].map(_bucket_unmapped)
    # An explicit exclusion must WIN, even for a code that appears in the sales
    # universe. Previously the rule was "in sales universe OR included bucket",
    # which meant config.rug_inclusion.exclude_name_buckets was dead config and
    # 3,685 units the config called non-rugs (broadloom, stair treads, cleaner,
    # cushions) were counted as rugs anyway.
    excluded_mask = at["_bucket"].isin(exclude_buckets)
    is_rug = (at["sku"].isin(rug_skus) | at["_bucket"].isin(include_buckets)) & ~excluded_mask
    rugs, other = at[is_rug], at[~is_rug]

    out = (rugs.groupby("sku", as_index=False)
           .agg(wh_units=("STOC", "sum"), wh_value=("VALOARE STOC", "sum"),
                wh_name=("ARTICOL DENUMIRE", "first")))
    out["unit_cost"] = out["wh_value"] / out["wh_units"].replace(0, np.nan)

    cov_extra = {
        "rug_codes_from_sales_universe": int(rugs["sku"].isin(rug_skus).sum()),
        "rug_codes_warehouse_only": int((~rugs["sku"].isin(rug_skus)).sum()),
        "warehouse_only_units": float(rugs.loc[~rugs["sku"].isin(rug_skus), "STOC"].sum()),
        "warehouse_only_value": float(rugs.loc[~rugs["sku"].isin(rug_skus), "VALOARE STOC"].sum()),
        "include_buckets": list(include_buckets),
    }

    excluded = (other.assign(bucket=other["ARTICOL DENUMIRE"].map(_bucket_unmapped))
                .groupby("bucket", as_index=False)
                .agg(units=("STOC", "sum"), value=("VALOARE STOC", "sum"),
                     lines=("STOC", "size"))
                .sort_values("units", ascending=False)) if len(other) else pd.DataFrame()

    months = (raw[["_year", "_month"]].drop_duplicates().sort_values(["_year", "_month"]))
    cov = {
        "available": True,
        "source": "coded_importer_export",
        "period": period,
        "importer": "INDOMEX SRL",
        "keyed_on": "ARTICOL COD",
        "rows_total": int(len(at)),
        "rows_rug": int(len(rugs)),
        "units_total": float(at["STOC"].sum()),
        "units_matched": float(rugs["STOC"].sum()),
        "value_total": float(at["VALOARE STOC"].sum()),
        "value_matched": float(rugs["VALOARE STOC"].sum()),
        "unit_match_pct": round(float(rugs["STOC"].sum()) / float(at["STOC"].sum()) * 100, 1) if at["STOC"].sum() else 0.0,
        "value_match_pct": round(float(rugs["VALOARE STOC"].sum()) / float(at["VALOARE STOC"].sum()) * 100, 1) if at["VALOARE STOC"].sum() else 0.0,
        "excluded_non_rug": excluded.to_dict("records") if len(excluded) else [],
        "history_months": int(len(months)),
        "history_first": f"{RO_MONTHS[int(months.iloc[0]['_month'])]} {int(months.iloc[0]['_year'])}",
        "history_last": f"{RO_MONTHS[int(months.iloc[-1]['_month'])]} {int(months.iloc[-1]['_year'])}",
        **cov_extra,
    }
    return out, cov


def warehouse_history(rug_skus: set[str],
                      include_buckets: tuple[str, ...] = ("rugs_no_code_match",),
                      exclude_buckets: tuple[str, ...] = ()) -> pd.DataFrame:
    """Monthly importer stock for rug codes, 2022-01 onward — the trend layer.

    Nothing before now could answer "is the stock position improving?", because
    the photograph was a single frozen month. 56 months of coded importer stock
    makes that answerable.
    """
    d = paths.WAREHOUSE_CODED_DIR
    files = sorted(glob.glob(str(d / paths.WAREHOUSE_CODED_GLOB))) if d.exists() else []
    if not files:
        return pd.DataFrame(columns=["month", "sku", "units", "value"])
    raw = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
    raw = raw.drop_duplicates(["PERIOADA PERIOADA", "ARTICOL COD"]).copy()
    raw["sku"] = raw["ARTICOL COD"].astype(str).str.strip()
    parts = raw["PERIOADA PERIOADA"].astype(str).str.strip().str.split()
    raw["_m"] = parts.str[0].str.upper().map(RO_MONTH_NUM)
    raw["_y"] = pd.to_numeric(parts.str[1], errors="coerce")
    raw = raw.dropna(subset=["_m", "_y"])
    raw["_bucket"] = raw["ARTICOL DENUMIRE"].map(_bucket_unmapped)
    raw = raw[(raw["sku"].isin(rug_skus) | raw["_bucket"].isin(include_buckets))
              & ~raw["_bucket"].isin(exclude_buckets)]
    raw["month"] = pd.to_datetime(dict(year=raw["_y"].astype(int),
                                       month=raw["_m"].astype(int), day=1))
    return (raw.groupby(["month", "sku"], as_index=False)
            .agg(units=("STOC", "sum"), value=("VALOARE STOC", "sum")))


def load_warehouse(as_of: pd.Timestamp) -> tuple[pd.DataFrame, dict]:
    """Warehouse (importer) stock in units and lei, at the month of `as_of`."""
    period = f"{RO_MONTHS[as_of.month]} {as_of.year}"
    wanted = [p for p in paths.WAREHOUSE_STOCK_FILES if p.exists()]
    if not wanted:
        return (pd.DataFrame(columns=["sku", "wh_units", "wh_value", "unit_cost"]),
                {"available": False, "reason": "warehouse export not found"})

    rows = []
    for p in wanted:
        df = pd.read_csv(p)
        df = df[(df["IMPORTATOR_PRODUCATOR"] == RUG_IMPORTER)
                & (df["PERIOADA PERIOADA"] == period)]
        if len(df):
            rows.append(df)
    if not rows:
        return (pd.DataFrame(columns=["sku", "wh_units", "wh_value", "unit_cost"]),
                {"available": False, "reason": f"no warehouse rows for {period}"})

    wh = pd.concat(rows, ignore_index=True)
    wh["key"] = wh["ARTICOL DENUMIRE"].map(_norm_name)
    total_units = float(wh["STOC"].sum())
    total_value = float(wh["VALOARE STOC"].sum())

    nm = _name_map()
    joined = wh.merge(nm[["key", "sku"]], on="key", how="left")
    matched = joined[joined["sku"].notna()]

    out = (matched.groupby("sku", as_index=False)
           .agg(wh_units=("STOC", "sum"), wh_value=("VALOARE STOC", "sum")))
    out["unit_cost"] = out["wh_value"] / out["wh_units"].replace(0, np.nan)

    unmatched = joined[joined["sku"].isna()].copy()
    top_unmatched = (unmatched.groupby("ARTICOL DENUMIRE", as_index=False)
                     .agg(units=("STOC", "sum"), value=("VALOARE STOC", "sum"))
                     .sort_values("units", ascending=False).head(25))
    unmatched["bucket"] = unmatched["ARTICOL DENUMIRE"].map(_bucket_unmapped)
    buckets = (unmatched.groupby("bucket", as_index=False)
               .agg(units=("STOC", "sum"), value=("VALOARE STOC", "sum"),
                    lines=("STOC", "size"))
               .sort_values("units", ascending=False))

    cov = {
        "available": True,
        "period": period,
        "importer": RUG_IMPORTER,
        "rows_total": int(len(wh)),
        "rows_matched": int(len(matched)),
        "units_total": total_units,
        "units_matched": float(matched["STOC"].sum()),
        "value_total": total_value,
        "value_matched": float(matched["VALOARE STOC"].sum()),
        "unit_match_pct": round(float(matched["STOC"].sum()) / total_units * 100, 1) if total_units else 0.0,
        "value_match_pct": round(float(matched["VALOARE STOC"].sum()) / total_value * 100, 1) if total_value else 0.0,
        "top_unmatched": top_unmatched.to_dict("records"),
        "unmapped_buckets": buckets.to_dict("records"),
    }
    return out, cov


def sku_extra(refresh: bool = False) -> pd.DataFrame:
    """Per-SKU catalogue attributes scanned out of the raw sales exports.

    Coverage on the 9,235 rug codes (verified, and far better than the pre-built
    V4 attribute table):

      SUBCLASA        producer / brand — 99.7%, 67 distinct
      DENUMIRE ARTICOL  product name — 99.8% (V4 table had 50%)
      DIMENSIUNI      size string — 100%
      ACTIV / ACTIV ONLINE  product-state gate, D (da) / N (nu) — 100%
      FURNIZOR EXT    external exporting entity — 98%, 89 distinct
      ID FURNIZOR     internal supplier id — 99.9%
      VECHIME IN COLECTIE   age in collection — 39.6%, 3 bands

    `ACTIV` and `SUBCLASA` are perfectly consistent per SKU across all export
    files (zero codes disagree), so `max()` is a safe aggregation.

    `ACTIV` and `VECHIME` are **current-snapshot** fields. The project data spec
    is explicit that they must never be used as historical features (leakage).
    Here they are used only as a live gate on today's status, which is what they
    are for.

    Scanning ~127 CSVs takes a while, so the result is cached to
    `data/sku_extra.parquet`. Pass refresh=True to rebuild.
    """
    if paths.SKU_EXTRA_PARQUET.exists() and not refresh:
        return pd.read_parquet(paths.SKU_EXTRA_PARQUET)

    files: list[str] = []
    for d in paths.SALES_ATTR_DIRS:
        if d.exists():
            files.extend(sorted(glob.glob(str(d / "*.csv"))))
    if paths.SALES_2026_DIR.exists():
        files.extend(sorted(glob.glob(str(paths.SALES_2026_DIR / "*.csv"))))
    if not files:
        return pd.DataFrame(columns=["sku", "furnizor_ext", "id_furnizor", "activ",
                                     "activ_online", "vechime", "subclasa_raw",
                                     "denumire_raw", "dimensiuni_raw"])

    # Restrict by SKU membership, NOT by GRUPA_PRODUSE.
    #
    # This is load-bearing. The P1/P2 export is split: `GRUPA_PRODUSE` lives in
    # the P1 half, while `ACTIV`, `ACTIV ONLINE` and `SUBCLASA` live in the P2
    # half — which has no `GRUPA_PRODUSE` column at all. Filtering on the product
    # group therefore drops every P2 file and silently loses those fields. An
    # earlier version of this function did exactly that and under-reported ACTIV
    # coverage as 2,012 codes when the true figure is ~8,000.
    rug_skus = pd.read_parquet(paths.SKU_ATTRIBUTES)["sku"].astype(str).unique().tolist()

    con = duckdb.connect()
    try:
        df = con.execute(
            """
            SELECT "COD ARTICOL"                AS sku,
                   max("FURNIZOR EXT")          AS furnizor_ext,
                   max("ID FURNIZOR")           AS id_furnizor,
                   max("ACTIV")                 AS activ,
                   max("ACTIV ONLINE")          AS activ_online,
                   max("VECHIME IN COLECTIE")   AS vechime,
                   max("SUBCLASA")              AS subclasa_raw,
                   max("DENUMIRE ARTICOL")      AS denumire_raw,
                   max("DIMENSIUNI")            AS dimensiuni_raw
            FROM read_csv_auto(?, header=true, union_by_name=true,
                               all_varchar=true, ignore_errors=true)
            WHERE "COD ARTICOL" IN (SELECT UNNEST(?))
            GROUP BY 1
            """,
            [files, rug_skus],
        ).df()
    finally:
        con.close()

    # max() over varchar skips NULLs but not the placeholder strings the export uses
    for c in ("furnizor_ext", "id_furnizor", "activ", "activ_online", "vechime",
              "subclasa_raw", "denumire_raw", "dimensiuni_raw"):
        s = df[c].astype("string").str.strip()
        df[c] = s.where(~s.isin(["", "-", "#null", "nan", "NULL"]), pd.NA)

    paths.OUT_DIR.mkdir(parents=True, exist_ok=True)
    df.to_parquet(paths.SKU_EXTRA_PARQUET, index=False)
    return df


def load_all(as_of: pd.Timestamp) -> RawLayers:
    attrs = pd.read_parquet(paths.SKU_ATTRIBUTES)
    families = pd.read_parquet(paths.SKU_FAMILIES)
    weekly = pd.read_parquet(paths.WEEKLY_FACTS)
    weekly["demand_week_start"] = pd.to_datetime(weekly["demand_week_start"])
    store_stock = pd.read_parquet(paths.STORE_STOCK)
    store_stock["month_start"] = pd.to_datetime(store_stock["month_start"])
    # Prefer the code-keyed importer export. Fall back to the old name-keyed join
    # only if it is missing, so the pipeline still runs on the original data.
    rug_skus = set(attrs["sku"].astype(str))
    _ri = paths.load_config().get("rug_inclusion", {})
    inc = tuple(_ri.get("include_name_buckets", ["rugs_no_code_match"]))
    exc = tuple(_ri.get("exclude_name_buckets", []))
    warehouse, wh_cov = load_warehouse_coded(as_of, rug_skus, inc, exc)
    if warehouse is None:
        fallback_reason = wh_cov.get("reason")
        warehouse, wh_cov = load_warehouse(as_of)
        wh_cov["source"] = "name_keyed_fallback"
        wh_cov["fell_back_because"] = fallback_reason
    extra = sku_extra()

    stock_month = as_of.to_period("M").to_timestamp()
    have = (store_stock.loc[store_stock["month_start"] == stock_month, "store_code"]
            .unique().tolist())
    all_stores = store_stock["store_code"].unique().tolist()
    latest_per_store = (store_stock.groupby("store_code")["month_start"].max()
                        .dt.strftime("%Y-%m").to_dict())

    coverage = {
        "warehouse": wh_cov,
        "store_latest_by_store": {},   # filled below
        "store_units_at_as_of": float(
            store_stock.loc[store_stock["month_start"] == stock_month, "stock_qty"].sum()),
        "stores_at_as_of": sorted(have),
        "stores_missing_at_as_of": sorted(set(all_stores) - set(have)),
        "store_latest_snapshot": latest_per_store,
        "sales_week_max": str(weekly["demand_week_start"].max().date()),
        "sales_week_min": str(weekly["demand_week_start"].min().date()),
    }
    return RawLayers(attrs, families, weekly, store_stock, warehouse, extra, coverage)
