# ALARM V1 — rugs (Tibi prototype)

A working web platform for **Level 0 → Level 1 → Level 2** stock drill-down, Excel export at
every level, and a weekly email trigger that links into it. Built against
`alarm-v1-build-brief.md`, on **real Mobexpert rug data**.

> **This folder is self-contained.** It has its own venv, its own config and its own
> `data/`. It reads two upstream repos read-only and writes nothing outside `alarm_v1/`.
> Nothing in the main Supply-Inventory project, `forecast_engine_v4`, or `stockly_site_demo`
> is touched.

---

## Run it

```bash
cd alarm_v1 && .venv/bin/uvicorn app.server:app --port 8700
```

Then open http://localhost:8700 — Romanian by default, EN toggle top-right.

Rebuild the data layer (after new exports land, or after changing `config.json`):

```bash
cd alarm_v1 && .venv/bin/python -m pipeline.build
```

Regenerate the placeholder product-state file (see `docs/ASSUMPTIONS.md`):

```bash
cd alarm_v1 && .venv/bin/python -m pipeline.state_proxy
```

---

## What is in it

| Screen | Brief | What it does |
|---|---|---|
| **Fotografia** (Level 0) | §2 L0 | Status donut in **units and lei** (one toggle), top factories by proposed reorder with a sells-well indicator, top factories active-vs-dead, SKU counts per state, and the unmapped-warehouse residual. Every element clicks through. Plus a **gamă focus** selector that recomputes the whole photograph for one product family (§6). |
| **Fabrică** (Level 1) | §2 L1 | **The order list is first on the page** — the 2–3-minute promise. Then families by volume & health, dead stock by family split by product state, worst-performing families, and width distribution. |
| **Articole** (Level 2) | §2 L2 | Full SKU list with filters. Click any row for the argument behind the number, stock per store, and the rest of the family. |
| **Verificare** | §4, §5 | Two internal cross-checks — the plain rotation heuristic against the engine rate, and unit share against money share per state — plus every gap and every assumption named. No external baseline. |
| **Timpi de livrare** | §3b | Editable factory lead times (~30 numbers). Save → the whole priority ranking recomputes. |
| **E-mail săptămânal** | §2 email | The weekly trigger: photograph, five numbers, one link. Email-safe HTML, no images, no external requests. |

Excel export sits on **every** level and always contains exactly the articles behind
what was clicked, plus a live **multiplier cell** (B2) that rescales every order
quantity — Tibi's real workflow, automated.

---

## Structure

```
alarm_v1/
├── config.json              every threshold, default, colour and label
├── pipeline/
│   ├── paths.py             read-only upstream paths + output paths
│   ├── sources.py           loads the four raw layers, reconciles them
│   ├── engine.py            velocity → safety stock → reorder → status → priority
│   ├── build.py             the one build; writes data/panel.parquet + meta.json
│   └── state_proxy.py       PLACEHOLDER product state (in/out/phase-out)
├── manual/
│   ├── lead_times.csv       factory lead times (currently all assumed)
│   └── product_state_HEURISTIC.csv   RETIRED guess, NOT read by the build (see ASSUMPTIONS A6)
├── app/
│   ├── server.py            FastAPI: api/level0, api/factory, api/skus, api/export…
│   ├── email_render.py      the weekly email
│   └── web/                 index.html, app.js, charts.js, styles.css, i18n.js
├── data/                    generated — gitignored
│   ├── panel.parquet        one row per SKU, everything the app needs
│   ├── sku_extra.parquet    cached scan of FURNIZOR EXT / ACTIV / VECHIME
│   ├── cost_source_audit.csv     every SKU + whether its cost is real or assumed
│   └── cost_source_summary.csv   the three-bucket summary
├── exports/                 generated Excel files — gitignored
└── docs/
    ├── DATA_REQUEST.md      exactly which files to ask for, in which format
    ├── BUILD_NOTES.md       what was built, why, and what deviates from the brief
    ├── ASSUMPTIONS.md       every assumed or invented number, and where it lives
    ├── DATA_GAPS.md         the data asks, ready to send
    └── OPEN_QUESTIONS.md    decisions that need Fyo or Tibi
```

---

## Data sources (read-only)

| Layer | Source | Notes |
|---|---|---|
| Product attributes (producer, gamă, dimension) | `forecast_engine_v4/data/rugs_v1/sku_attributes.parquet` + `sku_families.parquet` | Producer from `SUBCLASA` (`"784   GIZA CARPET"`) |
| Producer entity, product state | `P1+P2 sales data/`, `baneasa date addition + ploiesti/`, `sales_data_prep1p2/` scanned into `data/sku_extra.parquet` | `FURNIZOR EXT` (82 producers, in the ACTIVE export), `ACTIV`, `VECHIME IN COLECTIE`. **`SUBCLASA` exists only in the old `sales_data_prep1p2/`** — see `docs/DATA_REQUEST.md` R4 |
| Demand (weekly, de-duplicated) | `forecast_engine_v4/data/rugs_v1/weekly_facts.parquet` | 2022-01 → 2026-07, one authoritative copy per store-year |
| Store stock (monthly, 7 stores) | `forecast_engine_v4/data/rugs_v1/store_stock_monthly.parquet` | |
| **Warehouse stock + value in lei** | `Supply-Inventory v1.0 codex/new_stock_data_20may/supplier_stock_25.csv`, importer `INDOMEX SRL` | Keyed on article **name**, not code — see `docs/DATA_GAPS.md` |

No external services, no API keys, no network access at runtime.

**On the reference images:** they are used for the *visual language* only — colour semantics,
page order, which chart belongs where. **No number from them enters this build**, and nothing
here is compared against them: they describe a different period and scope than our exports, so
a comparison would not be like-for-like. Every figure in the product comes from the files above.

---

## Config, not code

`config.json` holds the category filter, the as-of date, every window, the safety-stock
parameters, the status thresholds, the colour taxonomy and the money basis. Running this
for another product group or another retailer should be a config edit plus a source map,
not a rewrite. That is deliberate.
