# DATA REQUEST

Rewritten 2026-08-09. Short version: **seven things missing, five of them small.**

Three requests from the previous version are **deleted** — producer, product state and product
name turned out to already be in the files I have. I had a filter bug and reported them as missing.
See the last section.

Each request below gives: the file, its columns, and what is different about what I need.

---

# 1. Store stock for Constanța, Iași, Oradea — up to the latest month

**These files:**
```
new_stock_data_20may/const_magazin_stock.csv
new_stock_data_20may/iasi_magazin_stock.csv
new_stock_data_20may/oradea_magazin_stock.csv
```

**Columns they have:**

| Column | Type | Example |
|---|---|---|
| `ARTICOL COD` | text | `0640030999444` |
| `MAGAZIN` | text | `M & D RETAIL CONSTANTA SRL` |
| `IANUARIE 2022/STOC` | number | `0.0` |
| `FEBRUARIE 2022/STOC` | number | `2.0` |
| … one column per month … | | |
| `DECEMBRIE 2025/STOC` | number | `1.0` | ← **last column today** |

**What I need that is different:** the same file, with the month columns continuing past
`DECEMBRIE 2025/STOC` up to the latest closed month (`IANUARIE 2026/STOC` … `IULIE 2026/STOC`).
Nothing else changes.

**Reference for the format:** `stock_magazin_baneasa.csv`, `stock_magazin_brasov.csv`,
`stock_magazin_pipera.csv`, `stock_magazin_sibiu.csv` (in the forecast_engine_v4 folder) are the
same export for the other four stores and already run to `IUNIE 2026/STOC`. So this export already
exists in the up-to-date form — just not for these three stores.

---

# 2. Importer stock for 2026

**These files:**
```
new_stock_data_20may/supplier_stock_22.csv
new_stock_data_20may/supplier_stock_23.csv
new_stock_data_20may/supplier_stock_24.csv
new_stock_data_20may/supplier_stock_25.csv   ← newest, ends December 2025
```

**Columns they have:**

| Column | Type | Example |
|---|---|---|
| `PERIOADA PERIOADA` | text (month + year) | `DECEMBRIE 2025` |
| `IMPORTATOR_PRODUCATOR` | text | `INDOMEX SRL` |
| `ARTICOL DENUMIRE` | text | `COVOR SHADOW 160x230cm GREEN` |
| `STOC` | number | `12.0` |
| `VALOARE STOC` | number (lei) | `4521.83` |

**What I need that is different:** a `supplier_stock_26.csv`, same five columns, for 2026 months.
`INDOMEX SRL` alone covers rugs, but the whole file is fine.

**Why this one matters more than it looks:** this file is 92% of the units and 85% of the money in
the whole picture, and it is the only place a purchase cost exists anywhere in our data.

---

# 3. `COD ARTICOL` added to the importer stock file

**Same files as request 2.**

**What I need that is different:** one extra column.

| Column | Type | Example |
|---|---|---|
| `COD ARTICOL` | text | `GISHADOWGR160` | ← **new** |

**The problem:** the file identifies articles only by `ARTICOL DENUMIRE` (the name). I match those
names back to codes myself, and reach 66.5% of units. The other **22,026 units / 2,493,218 lei**
cannot be linked to a code, which means no sales history, no producer, no status and no reorder
line for them — they can only be shown as an unexplained block.

**Reference:** `sales_2026/constanta_sales_2026.csv` uses `COD ARTICOL` as its first column, so the
code is available in the system; it is simply not on this particular export.

---

# 4. Purchase cost for 622 codes

**No existing file has this.** Closest thing is `VALOARE STOC` ÷ `STOC` in the importer file
(request 2), which is how I get cost for everything I can.

**What I need:**

| Column | Type | Example |
|---|---|---|
| `COD ARTICOL` | text | `ONANNERED200` |
| purchase / landed cost per unit | number (lei) | `1882.93` |

Only needed for codes that have no row in the importer file. Where I have no cost I currently
substitute a share of the selling price.

**The exact list of the 622 with no value is ready: `alarm_v1/data/codes_missing_cost.csv`.**
All three buckets are in `alarm_v1/data/cost_source_audit.csv`, also downloadable from the app
(**Verificare → Descarcă auditul de cost**).

**Current position:**

| Cost basis | Codes | Units | Lei | Share of money |
|---|---|---|---|---|
| Real purchase cost | 1,540 | 51,829 | 7,648,554 | **84.6%** |
| Substituted from selling price | 2,874 | 3,343 | 1,396,181 | 15.4% |
| No value at all → counts as 0 lei | 622 | 1,341 | 0 | 0% |

The 622 with nothing are the ones that actually distort the total, so they are the priority.

---

# 5. Stock in transit / on order

**No existing file has this.** Nothing in the project contains open purchase orders.

**What I need — any of these three shapes works:**

| Column | Type | Example |
|---|---|---|
| `COD ARTICOL` | text | `GISHADOWGR160` |
| quantity ordered, not yet arrived | number | `250` |
| expected arrival | date | `15.10.2026` |

A per-producer total would already help. A single "total units on order" figure would help a little.

**Effect if missing:** goods already on a ship read as missing stock, so some part of the 17,599
proposed reorder units is already coming. Every proposal is an upper bound until this exists.

---

# 6. Two things where I only need a yes/no from you

Neither exists in any file I have. I am not asking for an export yet — just whether the data exists
anywhere.

**6a. Same product sold under a second code.** Does a table linking one `COD ARTICOL` to another
exist? If not, even 20–30 known examples would let me build a rule.
*Effect:* an item sold under a different code reads as zero sales, so a good seller can look dead.

**6b. Internal / project consumption.** Is there a field marking a sale as store fit-out, șantier
or HoReCa project rather than a retail sale? Anything like a movement type or customer type.
*Effect:* project consumption reads as retail demand and can produce reorder proposals for
something no customer is buying.

---

# 7. Producer for 340 codes

**Where producer normally comes from:** the `SUBCLASA` column in the sales exports
(`sales_data_prep1p2/*.csv` and the P2 half of `P1+P2 sales data/*.csv`), which looks like:

| Column | Type | Example |
|---|---|---|
| `COD ARTICOL` | text | `GISHADOWGR160` |
| `SUBCLASA` | text (code + name) | `784   GIZA CARPET` |

That covers 99.7% of rug codes. **340 codes in the picture have it blank** — 2,573 units,
1,018,900 lei, 4.6% of the stock. They show up grouped under `NEATRIBUIT` ("no producer"), which
is currently the 5th largest "producer" on the first screen and is obviously not a real one.

**What I need:** `COD ARTICOL` + `SUBCLASA` for these 340 codes, or a note that it is blank in the
source too. **The exact list is ready: `alarm_v1/data/codes_missing_producer.csv`** (code, name,
size, stock, value).

**Worth knowing:** all 340 have product names, and their code prefixes look like they identify the
producer anyway (`ONWESTGO060` → `ON` → ORNEK; `MEVALCYFGO080` → `ME` → MERINOS). I could fill
these in by prefix, but that would be my guess rather than your data, so I have not done it. Say
the word if you would rather I did.

---

# Priority

| | Request | Size |
|---|---|---|
| 1st | **1 + 2** — Constanța/Iași/Oradea to latest month, and `supplier_stock_26.csv` | two re-exports |
| 2nd | **3** — `COD ARTICOL` on the importer file | one column |
| 3rd | **4** — cost for the 622 codes | small list |
| 4th | **7** — producer for 340 codes | small list |
| 5th | **5** — stock in transit | may not exist |
| 6th | **6a, 6b** — yes/no answers | no export needed |

**Requests 1 and 2 are the only things stopping the picture being current.** Everything is dated
31 December 2025 purely because that is the last month where the importer file and all seven stores
overlap.

Not on this list: factory delivery times (~30 numbers, those come from Tibi, and there is already a
page in the app to type them into), and MOQ / container / loom-width constraints (out of scope for v1).

---

# Deleted from the previous version — I was wrong, we already have these

I had filtered the sales exports on `GRUPA_PRODUSE`. The export is split in two halves, and the
half that carries these fields has no `GRUPA_PRODUSE` column at all — so my filter dropped those
files silently and I read the fields as missing. Corrected coverage on 9,235 rug codes:

| Field | I said | Actually |
|---|---|---|
| `SUBCLASA` — producer | "0% in the active export, frozen in an old folder" | **99.7%**, 67 producers |
| `ACTIV` — product state | "21.8%" | **100%** (6,130 active / 3,101 not active) |
| `DENUMIRE ARTICOL` — product name | "50%" | **99.8%** |
| `DIMENSIUNI` — size | — | **100%** |
| `FURNIZOR EXT` — exporting entity | 75.5% | **98%**, 89 distinct |

Both `SUBCLASA` and `ACTIV` are perfectly consistent per code across every file — zero codes
disagree — so the values are trustworthy.

What this fixed in the build, with no new data:
- **Unattributed producer: 6,536 units → 2,573** (340 codes, 4.6% of units). Attribution is now
  95.4% of units across 59 producers. The remainder is request 7 below.
- **Product state: real for 4,694 of 5,036 codes** (93%), 342 unknown.
- **Dead stock now splits properly:** 1,431 codes / 7,391 units / 2,061,243 lei are dead *while
  still active* — a genuine alarm. Only 2 codes are dead-and-deactivated. So the dead stock is a
  real problem, not stock draining on purpose.
- Product names 50% → 99.6%, which makes a proper model-level "gamă" grouping possible.
