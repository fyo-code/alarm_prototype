# ASSUMPTIONS — every number in Alarm V1 that we made up

Written 2026-08-08. Refreshed 2026-08-14 after the coded importer export landed and a
Codex review of that integration. Figures below are post-fix.
**Nothing on this list is a fact from Mobexpert's systems.** Each entry says what we assumed,
why, where it lives in the code, and what would replace it.

Three rules were followed everywhere:

1. Every assumption is **visible in the product**, not buried here. The ribbon at the top of
   every screen, the *Verificare* page, the SKU drawer, and the README sheet inside every
   Excel export all carry them.
2. Every assumption is a **config value or a CSV**, never a hardcoded literal. Replacing it
   is an edit, not a code change.
3. **Every measured figure comes from our own project data** — the sales exports, the monthly
   store stock, and the monthly importer stock, all listed in `BUILD_NOTES.md` §0 with the
   project document that defines each one. No number is taken from, compared against, or
   calibrated to the reference images: those are used for visual language only (colour
   semantics, page order, chart placement), and their printed figures cover a different period
   and scope, so a comparison would not be like-for-like. An earlier draft did make such
   comparisons; they were removed and `/api/sanity` now carries no external baseline at all.

---

## A1 — Factory lead time: 90 days, everywhere

| | |
|---|---|
| **Assumed** | 90 days for every producer (90 labels after the FURNIZOR EXT fallback; ~30 real factories behind them) |
| **Truth** | Unknown. Lead time lives at factory level (~30 real values). Tibi's own example: Target = 2 weeks. |
| **Lives in** | `config.json → replenishment.default_lead_time_days`, overridable per factory in `manual/lead_times.csv` |
| **Marked in UI** | Orange `presupus` tag on the factory KPI, the source string in every SKU's "why", and a whole editable page (*Timpi de livrare*) |
| **What it changes** | Safety stock, reorder point, target stock, the red/orange band boundary, and the **priority ranking**. It does *not* change quantities much — mostly it changes the order of the list. |
| **Replace with** | ~30 numbers from Tibi. Type them into *Timpi de livrare* and press save; everything recomputes in place. |

**Design note (brief §3b):** a short lead time **demotes** an item. `priority = money_at_risk_per_month / (1 + slack_days/30)` where `slack = days_of_cover − lead_time_days`. Short lead time → more slack → lower urgency. The quantity is untouched.

## A2 — Order cycle (review period): 3 months

| | |
|---|---|
| **Assumed** | 3.0 months between order events per zone |
| **Why** | Imports ship rarely — "Trimit o dată". A quarterly cadence is the least-wrong single number. |
| **Lives in** | `config.json → replenishment.review_period_months` |
| **What it changes** | Safety stock, target stock, and the healthy-band width. This is the **second most sensitive assumption after lead time.** |
| **Replace with** | The real ordering cadence per zone (China / Turkey / Europe). |

## A3 — Safety stock formula and service level

| | |
|---|---|
| **Assumed** | `SS = z(1.28) × σ_monthly × √(lead_months + review_months)`, i.e. a 90% service level, periodic review |
| **Why** | It must be a formula — asking a human for safety stock across tens of thousands of SKUs kills adoption ("n-o să facă nimeni"). Boring and standard is the point: it has to be defensible to the person holding the budget. |
| **Lives in** | `pipeline/engine.py → safety_stock()`, parameters in `config.json → replenishment` |
| **Marked in UI** | The formula is printed, with the actual σ and z, inside every SKU's "why" |
| **Known weakness** | Rug demand is over-dispersed (variance/mean ≈ 8–11, measured in V4). A normal-z safety stock under-states the tail on the lumpiest SKUs. σ has a Poisson floor (`√rate`) so thin-history SKUs still get a buffer. |

## A4 — Status band thresholds

| Band | Rule |
|---|---|
| 🔴 red — out | stock = 0 **and** sold in the last 90 days |
| 🔴 red — low | months of cover < lead time |
| 🟠 orange | lead time ≤ cover < (lead time + order cycle) |
| 🟢 green | (lead + cycle) ≤ cover ≤ 2× (lead + cycle) |
| 🔵 blue | cover > 2× (lead + cycle) |
| 🔵 blue extreme | cover > 24 months |
| ⚪ grey | stock > 0 **and** zero sales in 90 days |
| ⚫ inactive | no stock **and** no sales in 180 days |

**Assumed:** the `2×` overstock factor and the 24-month extreme cut-off.
**Lives in:** `config.json → replenishment.overstock_factor`, `taxonomy.extreme_overstock_months`.
Dead = 90 days is the working definition already in use inside the company, not ours.

**Deliberate addition (brief §7):** the five colours stay, but three of them are split into
sub-states because each hid two different decisions. That is the answer to *"poate trebuie să
fie opt cadrane"* — the smallest split that changes what you do next, not eight for the sake of eight.

## A5 — Sales rate blend

**Assumed:** monthly rate = 65% of the 90-day rate + 35% of the 12-month rate.
**Why:** recency-leaning without being jumpy on a lumpy signal.
**Lives in:** `config.json → velocity.short_weight`.

## A6 — Product state: real `ACTIV` on 93% of the picture. Nothing invented.

| | |
|---|---|
| **Source** | `ACTIV` from the sales exports — `D` (da/active) / `N` (nu/not active). Real data. |
| **Coverage** | **100% of the 9,235 rug codes** carry `ACTIV` (6,130 D / 3,101 N). In the photograph: **3,954 of 5,954 real** (66%), 2,000 `unknown` — the unknown count grew because warehouse-only and store-only codes have no sales row and therefore no `ACTIV`. |
| **Consistency** | Zero codes disagree across export files, so the value is unambiguous. |
| **Lives in** | `pipeline/sources.py → sku_extra()`, applied in `pipeline/build.py` |

**Two corrections were needed to get here, both my own errors:**

1. I first reported this field as absent and invented a stock-drain heuristic instead. It was wrong:
   measured against real `ACTIV` on the overlap, agreement was **5%** (it called 53 of 56 codes
   `phase_out` that are in fact `ACTIV=D`). Retired to `manual/product_state_HEURISTIC.csv`, which
   the build does not read.
2. I then reported `ACTIV` coverage as 21.8%. That was a filter bug — I filtered the sales exports
   on `GRUPA_PRODUSE`, but the P2 half of the export, which carries `ACTIV`, has no
   `GRUPA_PRODUSE` column, so those files were silently dropped. Filtering by SKU membership
   instead gives **100%**.

**What the real data says:** of 3,344 dead codes, **1,861 are confirmed `ACTIV=D`**,
**2 confirmed inactive**, and **1,481 are `unknown`**.

**OPEN DEFECT, flagged by the Codex review and deliberately not fixed unilaterally:** every dead
row that is not explicitly inactive lands in substate `grey_active`, whose UI verdict asserts the
product *is* still active. That is a false statement for the **1,481 codes / 15,030 units /
3,048,087 lei** whose state is genuinely unknown, and the coded-export integration made that
volume materially larger. It is one of the four held design questions and now the most urgent —
see `OPEN_QUESTIONS.md`.

## A7 — Unit cost: real for 92% of the money — every assumed code named

| Cost source | SKUs | Units | Lei | Share of lei |
|---|---|---|---|---|
| **Real** — `VALOARE STOC ÷ STOC`, importer export | 2,687 | 65,811 | 10,957,710 | **92%** |
| **Assumed** — 55% of realised average selling price | 2,089 | 3,282 | 1,012,293 | 8% |
| **No value** — contributes 0 lei | 1,178 | 2,291 | 0 | 0% |
