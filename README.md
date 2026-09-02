# Alarm — rug inventory prototype

A stock-alarm platform for rug procurement at a Romanian furniture retailer.
It answers two questions: **where is money sitting in the wrong stock**, and
**what should be ordered** — with the argument behind every number.

Romanian first, English toggle. FastAPI + vanilla JS, hand-written SVG charts,
no CDN and no external request at runtime.

```
Fotografia (Level 0)  →  Fabrică (Level 1)  →  Articole (Level 2)
   the photograph          the order list        the SKU + its "why"
```

Plus *Verificare* (assumptions and limits), *Timpi de livrare* (the one manual
input the tool asks for), and a weekly e-mail trigger.

---

## Run it

```bash
cd alarm_v1
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pipeline.build          # builds data/panel.parquet (~30s)
.venv/bin/uvicorn app.server:app --port 8700
```

Then open <http://localhost:8700>. Stop with `Ctrl+C`.

`pipeline.build` reads source exports that are **not in this repo** — see
`alarm_v1/pipeline/paths.py` for the expected locations, and
`alarm_v1/docs/DATA_REQUEST.md` for the exact file formats.

## What is where

| Path | |
|---|---|
| `alarm_v1/pipeline/` | ingest → velocity → safety stock → reorder → status → priority |
| `alarm_v1/app/` | FastAPI API, the weekly e-mail, and the single-page front end |
| `alarm_v1/config.json` | every threshold, window, colour and default — no hardcoded literals |
| `alarm_v1/docs/` | assumptions, data requests, build notes, open questions, external reviews |
| `alarm_v1/design_experiments/` | an alternative front end for side-by-side comparison; disposable |

## Read these first

- **`alarm_v1/docs/ASSUMPTIONS.md`** — every number that is assumed rather than measured, and what would replace it.
- **`alarm_v1/docs/OPEN_QUESTIONS.md`** — decisions still owed by a human. Q0 is a known false label on unknown product state.
- **`alarm_v1/docs/NEW_DATA_2026-08.md`** — what the code-keyed importer export changed, including corrections to earlier claims.
- **`alarm_v1/docs/reviews/`** — two independent code reviews and the disposition of every finding.

## Design principles

1. **Every assumption is visible in the product**, not just in the docs — the ribbon, the *Verificare* page, the SKU drawer, and a README sheet inside every Excel export.
2. **Config over code.** Running this for another product group should be a config edit plus a source map.
3. **Proportions are the product; absolute scale is a human decision.** Every Excel export carries a live multiplier cell so quantities can be scaled uniformly to factory minimums.
4. **Say what is not known.** Cross-code sales and internal project consumption are named as false-signal traps wherever the numbers they affect appear.

## Note on data

The pipeline's source exports are excluded from this repo. A few small files
under `alarm_v1/docs/data_request_samples/` and `alarm_v1/manual/` do contain
real rows and real supplier names, kept because they document the exact export
formats the tool consumes.

## Status

Prototype under active iteration. Not a product, not deployed, no service
guarantees. Figures in the docs are dated and reflect the build at that date.
