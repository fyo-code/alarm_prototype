"""Where the raw data lives. Everything here is READ-ONLY.

Alarm V1 never writes outside its own folder. The two upstream repos
(the legacy Supply-Inventory export dump and forecast_engine_v4) are
sources, not build targets.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

ALARM_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ALARM_ROOT / "data"
EXPORT_DIR = ALARM_ROOT / "exports"
MANUAL_DIR = ALARM_ROOT / "manual"

# --- upstream sources (read-only) -------------------------------------------
HOME = Path(os.path.expanduser("~"))

# forecast_engine_v4: cleaned rug demand + attributes + store stock
FEV4 = Path(os.environ.get("FEV4_ROOT", HOME / "Projects" / "forecast_engine_v4"))
FEV4_RUGS = FEV4 / "data" / "rugs_v1"
SKU_ATTRIBUTES = FEV4_RUGS / "sku_attributes.parquet"
SKU_FAMILIES = FEV4_RUGS / "sku_families.parquet"
WEEKLY_FACTS = FEV4_RUGS / "weekly_facts.parquet"
STORE_STOCK = FEV4_RUGS / "store_stock_monthly.parquet"
SALES_2026_DIR = FEV4 / "sales_2026"

# legacy export dump: importer/warehouse stock with value in lei
LEGACY = Path(os.environ.get(
    "LEGACY_ROOT",
    HOME / "Downloads" / "Supply-Inventory v1.0 codex",
))
WAREHOUSE_STOCK_FILES = [
    LEGACY / "new_stock_data_20may" / f"supplier_stock_{y}.csv" for y in (22, 23, 24, 25)
]

# PREFERRED importer-stock source: the same export, but carrying `ARTICOL COD`
# and already filtered to INDOMEX SRL. Covers 2022-01 -> 2026-08 across three
# files with OVERLAPPING ranges, so they must be de-duplicated on (period, code)
# before anything is summed — one of the three is wholly redundant.
#
# Snapshotted into the project because the originals land in ~/Downloads, which
# is transient. Re-snapshot by copying furnizor_stoc_*.csv in here again.
WAREHOUSE_CODED_DIR = ALARM_ROOT / "data_source"
WAREHOUSE_CODED_GLOB = "furnizor_stoc_*.csv"

CONFIG_PATH = ALARM_ROOT / "config.json"

PANEL_PARQUET = OUT_DIR / "panel.parquet"
META_JSON = OUT_DIR / "meta.json"
SKU_EXTRA_PARQUET = OUT_DIR / "sku_extra.parquet"   # cached scan, see sources.sku_extra()

# Folders that carry per-SKU catalogue attributes. Coverage differs sharply and
# it matters which one a field comes from:
#   P1+P2 sales data/          — the ACTIVE export. Carries FURNIZOR EXT, ACTIV,
#                                VECHIME IN COLECTIE. Carries NO SUBCLASA for rugs.
#   baneasa date addition…/    — active patch, same shape.
#   sales_data_prep1p2/        — OLD prep. The ONLY source of SUBCLASA for rugs
#                                (4,484 of ~9,200 codes). Frozen: it will not
#                                refresh when new exports arrive.
SALES_ATTR_DIRS = [
    LEGACY / "P1+P2 sales data",
    LEGACY / "baneasa date addition + ploiesti",
    LEGACY / "sales_data_prep1p2",
]


def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def ensure_dirs() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    MANUAL_DIR.mkdir(parents=True, exist_ok=True)
