# Format samples for DATA_REQUEST.md

Small clickable extracts of the real export files, so the format can be seen
without opening a 45 MB CSV. Header plus a few rows, verbatim — nothing edited.

| Sample | Cut from | Shows |
|---|---|---|
| `SAMPLE_const_magazin_stock.csv` | `new_stock_data_20may/const_magazin_stock.csv` | store stock as it is now — **50 columns, ends `DECEMBRIE 2025/STOC`** |
| `SAMPLE_iasi_magazin_stock.csv` | `new_stock_data_20may/iasi_magazin_stock.csv` | same |
| `SAMPLE_oradea_magazin_stock.csv` | `new_stock_data_20may/oradea_magazin_stock.csv` | same |
| `SAMPLE_TARGET_stock_magazin_baneasa.csv` | `forecast_engine_v4/stock_magazin_baneasa.csv` | **the target shape — 56 columns, ends `IUNIE 2026/STOC`.** Six more month columns than the three above |
| `SAMPLE_supplier_stock_25_INDOMEX_dec.csv` | `new_stock_data_20may/supplier_stock_25.csv` | importer stock, filtered to `INDOMEX SRL` + `DECEMBRIE 2025` — the exact rug slice used |
| `SAMPLE_has_COD_ARTICOL_constanta_sales_2026.csv` | `forecast_engine_v4/sales_2026/constanta_sales_2026.csv` | an export that already carries `COD ARTICOL` as its first column |
| `SAMPLE_has_SUBCLASA_23_pip_more_detail.csv` | `sales_data_prep1p2/23 pip more detail+date.csv` | where `SUBCLASA` (the producer) lives |

Regenerate with the `head`/`grep` commands recorded in the git commit for this folder.
