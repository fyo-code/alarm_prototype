# What the coded importer export changed — 2026-08

Three files (`furnizor_stoc_*.csv`), snapshotted to `alarm_v1/data_source/`: importer stock
for **INDOMEX SRL** carrying **`ARTICOL COD`**, covering
**IANUARIE 2022 → AUGUST 2026 (56 months)**.
De-duplicated on (period, code) — the ranges overlap and one file is wholly redundant.
Verified: all 57,126 overlapping keys agree exactly, so the dedup cannot double-count.

**Reviewed by Codex (gpt-5.6-sol, xhigh) after the first integration pass. It found six real
defects, all since fixed; every figure below is post-fix.** See `docs/reviews/`.

## Integrity check first

The coded file reproduces the old name-keyed one exactly at December 2025:
**65,675.89 units / 8,350,596.21 lei in both.** Same data, code column added.

## 1. The name-join is gone

| | Name-keyed | Code-keyed |
|---|---|---|
| Importer units included | 66.5% | **72.7%** |
| Importer lei included | 70.1% | **94.4%** |

**Careful with that percentage.** It is *not* "mapped to a code" — every row in the new
export has a code. It is the **category-inclusion share**: how much of INDOMEX's stock is
rug rather than bath mat, adhesive, broadloom or labels.

## 2. Correction to a claim I made

I told Fyo the code column would add "+39% more units". **Wrong.** Most previously-unmapped
volume is non-rug INDOMEX product, which should be *excluded* from a rug alarm. Excluded by
name bucket via `config.json → rug_inclusion`, and now actually reported on Level 0:

- bath_mats: **10,733 units / 177,944 lei**
- broadloom_and_grass: **5,015 units / 219,778 lei**
- accessories: **4,144 units / 79,741 lei**
- stair_treads: **1,286 units / 25,366 lei**
- other: **137 units / 13,897 lei**

## 3. The real prize: never-sold stock became visible

The rug universe is derived from **sales** history, so a rug that never sold had no row.

> **684 codes / 12,227 units / 2,649,579 lei** of rugs with zero sales ever.

Exactly the dead stock the alarm exists to find. They enter as `sku_origin="warehouse_only"`,
classify grey by definition, and invariant tests assert they never receive a proposal.

A second cohort appeared once the join order was fixed: **673 `store_only` codes /
1,619 units** — stock sitting in shops for codes with no sales history and no
importer row.

## 4. The photograph

| | Before | Now |
|---|---|---|
| As-of | 2025-12-31 | **2026-06-30** |
| Units | 56,513 | **71,383** |
| Money | 9,044,735 lei | **11,970,002 lei** |
| Dead stock | 7,393 u / 2.06M lei | **27,533 u / 6,311,106 lei** |
| Real acquisition cost | 1,540 codes, 84.6% of money | **2,687 codes, 92%** |

Dead stock moved 13.1% → **38.6%** of units. Never-sold stock explains
**61%** of that 20,141-unit increase — not all of it. The rest comes from the
as-of moving forward and from the store layer being fully counted.

## 5. Per-layer dating

Store snapshots do not share a cadence. Each store contributes its latest position at or
before as-of, recorded per store:

{
  "BANEASA": "2026-06",
  "BRASOV": "2026-06",
  "CONSTANTA": "2025-12",
  "IASI": "2025-12",
  "ORADEA": "2025-12",
  "PIPERA": "2026-06",
  "SIBIU": "2026-06"
}

Stale: **CONSTANTA, IASI, ORADEA** — 4,058 units carried forward from
December 2025, against 10,649 units current at June 2026. The full store layer
(14,707 units) is now preserved; an earlier join order silently dropped 2,531.68 of it.

**Disclosed in:** the Level-0 ribbon (which previously asserted the opposite and is fixed),
the Check page, and the first note inside every Excel export.

## 6. New capability: the trend — with a comparability warning

56 months of importer stock by code. `GET /api/trend` plus a chart on Level 0.

| Window | Units | Value |
|---|---|---|
| Jan 2022 → Aug 2026 | −12.9% | **+1.3%** |
| Aug 2022 → Aug 2026 | −16.9% | **−11.9%** |
| Aug 2025 → Aug 2026 | −9.7% | +7.6% |

**This does not establish that the position is improving, and the UI now says so.** The
series is **not like-for-like**: 3,000 codes at the start, 2,917 at the end, only **538 in
both**. A value rise is range replacement and mix, not the same stock appreciating — average
acquisition cost per unit is up **16.3%**, which is the defensible reading. Baseline choice
flips the sign, so the endpoint is published alongside two alternatives rather than cherry-picked.

## 7. Producer inference — consistent, stamped, switchable

Real data wins (`SUBCLASA`, then `FURNIZOR EXT`). Only gaps are candidates for 3-letter
prefix inference, only where the prefix maps to exactly one producer among codes with a real
`SUBCLASA`. Every such row is stamped `INFERRED_from_code_prefix`; an invariant test asserts
inference never overrides real data. Off with
`config.json → producer.infer_from_code_prefix = false`.

| factory_source | codes | units |
|---|---|---|
| `SUBCLASA_scan` | 3,937 | 48,005 |
| `INFERRED_from_code_prefix` | 1,547 | 11,697 |
| `none` | 451 | 11,613 |
| `FURNIZOR_EXT_fallback` | 19 | 69 |

## Still open

- **`grey_active` on unknown state.** All warehouse-only rows have `product_state="unknown"`
  yet land in `grey_active`, whose UI verdict asserts the product *is* still active. This
  change made the affected volume materially larger. It is one of the four held design
  questions and **now the most urgent of them** — see `OPEN_QUESTIONS.md`.
- **`family=NEATRIBUIT`** is now the largest pseudo-family, distorting family rankings.
- **2026 store stock for Constanța / Iași / Oradea.** Note it is *not* the only thing blocking
  an August photograph: the other four stores also stop at June 2026, and sales stop 2026-07-06.
- Whether **bath mats** (10,733 units) belong in the rug alarm — one config line.
