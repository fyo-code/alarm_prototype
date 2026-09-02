# BUILD NOTES — Alarm V1

Built 2026-08-08 in the worktree `claude/alarm-v1-build-analysis-931f6b`, folder `alarm_v1/`.
Nothing outside that folder was modified except the two project tracking files
(`PROGRESS.md`, `CLAUDE.md` changelog), as the project rules require.

---

## 0. Scope of the data used — read this first

**Every figure in this build comes from our own project data. Nothing is taken from, compared
against, or calibrated to the reference images.**

Those images are Tibi's hand-made mockups. They were supplied to explain the *visual language*
he thinks in — what blue means, what grey means, how a drill-down should feel — and they are
used here only for that: layout, colour semantics, page order, which chart belongs where. The
numbers printed on them describe a different period and a different scope from our exports, so
they are not like-for-like and any comparison would have been misleading. An earlier draft of
this document did compare against them; that comparison has been removed, and the *Verificare*
page in the app was rebuilt so it contains no external baseline of any kind.

The data actually used, all of it from the main project folder:

| Layer | File | Documented in the project as |
|---|---|---|
| Sales / demand | `P1+P2 sales data/`, `baneasa date addition + ploiesti/`, `sales_2026/` (via the V4 de-duplicated `weekly_facts`) | `FORECAST_V2_DATA_DICTIONARY_AND_BUSINESS_RULES.md`, `forecast_data/csv_spec.md` |
| Monthly store stock, 7 stores | `stock_magazin_*.csv`, `new_stock_data_20may/{const,iasi,oradea}_magazin_stock.csv` | `active_docs/ITER5L_V2_PHASE8C_MONTHLY_STORE_STOCK.md` |
| Monthly importer/warehouse stock + lei | `new_stock_data_20may/supplier_stock_{22..25}.csv` | `active_docs/ITER5M_V2_PHASE8D_SUPPLIER_STOCK.md` |
| Product attributes (producer, gamă, dimension) | `SUBCLASA`, `DIMENSIUNI`, family parse (via V4 `sku_attributes` / `sku_families`) | dictionary + `csv_spec.md` |

## 1. The finding that shaped the whole build

**The warehouse layer had never been joined to the rug SKUs, and it is where the money is.**

Working only from our own exports: the rug dataset used for the forecast engine carries monthly
*store* stock across 7 stores — about 14,900 units at December 2025. But
`new_stock_data_20may/supplier_stock_25.csv`, filtered to importer `INDOMEX SRL`, holds a far
bigger position with a value column:

> **65,676 units · 8,350,596 lei · December 2025** (importer stock)

Two things follow. First, store stock alone is roughly a fifth of the real position, so any
photograph built on it would understate the problem by 4–5×. Second, `VALOARE STOC / STOC` is
the **only per-unit cost anywhere in our data** — without this layer there is no "capital
blocat" figure at all, and the money view the brief requires would be impossible.

**Why it had not been joined:** the export identifies articles by name, not by `COD ARTICOL`.
The project already knows this — `ITER5M_V2_PHASE8D_SUPPLIER_STOCK.md` documents the same file
family, builds a `supplier_stock_sku_map_v2` with `exact_unique` / `ambiguous` / `unmapped`
confidence, and states that **only `exact_unique` rows should be used**. We followed the same
standard: rebuilt a name→code map from the sales exports and dropped any name resolving to more
than one code.

Coverage achieved, and how it compares to the project's own documented rate on the same files:

| | Rows | Units | Lei |
|---|---|---|---|
| INDOMEX rug rows, Dec 2025 | 2,999 | 65,676 | 8,350,596 |
| `exact_unique` match | 1,676 (55.9%) | 43,650 (**66.5%**) | 5,857,378 (**70.1%**) |
| Unmapped | 1,323 | 22,026 | 2,493,218 |

The project's own Phase 8D run reports 62.5% exact rows on `supplier_stock_25.csv` across all
importers. We get 55.9% of rows on the rug subset — the same order of magnitude, which suggests
we are hitting the normal ceiling of a name-key join rather than doing something wrong. That
ceiling is a data-format problem with a one-column fix (`DATA_GAPS.md` §1), not a modelling
problem.

**What is in the unmapped block** (name-based grouping, nothing attributed to any producer or
gamă): bath mats 6,066 u · rugs with no code match 6,660 u · broadloom/grass/rolls 4,471 u ·
accessories 4,082 u · stair treads 598 u · other 149 u. It is shown as its own chart on
Level 0 so the coverage gap is visible rather than absorbed silently into the totals.

**Validating that `SUBCLASA` is the producer** — the project dictionary defines it only
generically ("finer hierarchy below `CLASA`"), so this was checked against our data rather than
assumed:

- `CLASA` has exactly **one** value across all rugs (`006   MOBILIER DE CASA - ACCESORII`), so
  `SUBCLASA` is not subdividing a product hierarchy here — there is nothing to subdivide.
- Every `SUBCLASA` value with ≥20 SKUs maps onto a **single 2-letter SKU code prefix, median
  share 1.00**: MERINOS→`ME*`, MILAT→`MI*`, AGNELLA→`AG*`, LOOMX→`LO*`, JAIPUR→`JA*`. Code
  prefixes are assigned per producer, so the grouping is a producer grouping. GIZA splits
  `GI*` + `OU*` and ORNEK `ON*` + `OU*`, consistent with an outdoor range from the same producer.
- `FURNIZOR` is `INDOMEX SRL` for 8,001 of 9,875 rug SKUs — the importing entity one level up,
  carrying no producer detail. That also independently confirms the `INDOMEX SRL` filter on the
  warehouse export is the right one for rugs.

Caveat that survives: supplier is not always the same entity as factory, and this field cannot
tell them apart. 2,643 of 9,875 codes have no `SUBCLASA` at all → 6,536 units in `NEATRIBUIT`,
which the UI labels as a hole in the data rather than a producer.

---

## 2. Architecture, as the brief corrected it

**Platform is the product. Email is the trigger. Excel is the export.**

- FastAPI + a vanilla-JS single page. **No chart library, no CDN, no external request at
  runtime.** Charts are hand-written SVG. Two reasons: it works in a meeting room with bad
  wifi, and a library's defaults are exactly the "generic AI dashboard" look we were warned
  would be recognised as generic.
- Everything tunable is in `config.json` — thresholds, windows, safety-stock parameters,
  colour taxonomy, money basis, category filter. Running this for another product group or
  another retailer should be a config edit plus a source map.
- The engine is one module (`pipeline/engine.py`) that goes velocity → safety stock → reorder
  → status → priority, and emits the argument for every number as **structured parts**, so the
  pipeline never has to know whether the UI is Romanian or English.

## 3. What was built against each requirement

| Brief | Built |
|---|---|
| §2 L0 status donut by units | ✅ clickable, sub-states in the legend |
| §2 L0 **same view in lei** | ✅ one toggle, top-right; every chart on every screen respects it |
| §2 L0 top suppliers by proposed reorder | ✅ + a "sells well %" on each bar (§3c) |
| §2 L0 top-10 active vs dead | ✅ stacked, dead % called out |
| §2 L0 SKU counts per status | ✅ with the %↔count translation both ways |
| §2 "top N must state its coverage" | ✅ every top-N chart carries "top 10 of 47 = 79% of total" |
| §2 comparative context mandatory | ✅ every figure shows its share of the whole; factory pages show rank and share |
| §2 L1 **reorder list first** | ✅ it is the first card on the factory page |
| §2 L1 families by volume + health | ✅ stacked by colour |
| §2 L1 dead by family, units and lei | ✅ split solid/hatched by product state |
| §2 L1 worst performers with state | ✅ ranked by money trapped in dead stock |
| §2 L1 width distribution | ✅ rugs-specific, 93.1% of codes resolve a width |
| §2 L2 SKU list + why | ✅ drawer with formula, per-store stock, and the rest of the family |
| §2 export at every level | ✅ Level 0 (all / per segment), Level 1 (order / all stock / dead), Level 2 (any filter) |
| §2 email trigger | ✅ email-safe HTML, photograph + 5 numbers + link, RO/EN |
| §3a dead × product state | ✅ implemented; state itself is a labelled proxy (A6) |
| §3b lead-time-adjusted priority | ✅ `money_at_risk / (1 + slack_days/30)`; quantity untouched |
| §3c confidence next to the number | ✅ "93% ✓" on every factory bar and as a KPI on the factory page |
| §3d money everywhere | ✅ units and lei side by side at every level |
| §3e safety stock from a formula | ✅ never an input; formula printed in the "why" |
| §4 sanity check on the rate | ✅ the plain stock ÷ 3-month-sales heuristic against the engine rate, per factory, with the delta — both on our data |
| §5 honesty block | ✅ ribbon on every screen, a whole *Verificare* page, and a README sheet inside every Excel |
| §6 test one gamă first | ✅ a gamă focus selector recomputes the entire Level 0 for one family |

## 4. Things added that the brief did not ask for (§7 invited this)

1. **Sub-states under the five colours.** Tibi asked whether four states might need to be
   eight. Rather than inventing eight, we split only the three colours that hid two different
   decisions: red → out-of-stock vs below-lead-time; grey → dead-active vs dead-phase-out;
   blue → overstocked vs **extreme (>24 months)**. That last one is the interesting one:
   30,848 units / 3.07M lei sit above 24 months of cover. That is not a reordering problem, it
   is a liquidation problem, and it was invisible inside one flat "blue".
2. **The lead-time page as the data request.** Instead of asking for 30 numbers by email and
   waiting, the app has a page where they are typed in and the whole priority ranking recomputes
   on save. The ask and the payoff are in the same place.
3. **The multiplier cell in every Excel export.** Cell B2 is a live factor and the order column
   is `=ROUND(base × $B$2, 0)`. This is his actual observed workflow — export, multiply
   everything by one factor to clear the factory minimum — turned into one cell edit.
4. **The unmapped-warehouse block as a first-class chart on Level 0.** Most tools would hide a
   34% coverage gap. Showing it, grouped by what is in it, is what makes the rest of the numbers
   trustworthy — and it converts the limitation into a one-column request.
5. **The *Verificare* page.** Two internal cross-checks, no external baseline. (a) The plain
   rotation heuristic (stock ÷ 3-month sales) against the engine's blended rate, per factory —
   where they diverge the plain number is being pulled by one atypical quarter, which is worth
   knowing before defending a quantity. (b) **Unit share against value share** per state, which
   turned out to be a real finding: blue is 71.4% of units but only 53.7% of the money, while
   grey is 13.1% of units and 22.8% of the money. The dead stock is disproportionately
   expensive — visible only once money and units sit side by side.
6. **Plain-language verdicts.** Every SKU drawer opens with one sentence saying what to do
   ("Stoc zero și se vinde. Pierzi vânzări acum."). The colour tells you the state; the sentence
   tells you the decision.
7. **The family panel inside the SKU drawer.** A rug model is ~5 widths and a factory will not
   run a single width. Showing the siblings next to the item is a small nod to the MOQ reality
   that v1 does not model.

## 5. Deliberate omissions

- **Vedete / Boston acceleration detection** — his #1 next request, explicitly v2 in the brief.
  Not started. Nothing in v1 looks for upside.
- **A chart per colour segment** — the sub-state split covers the part he needed (red's
  sub-classes, grey's two meanings). Full per-colour supplier/family breakdown pages are not built.
- **Zone-level ordering, MOQ, cubaj, loom-width optimisation** — out of scope per §6. The
  multiplier workflow is the stand-in.
- **Automated data pipeline** — that is the Geo conversation, after v1 lands.
- **Overrides logging** — nothing is editable in-app yet except lead times, so there is nothing
  to log. Worth wiring the moment order quantities become editable.
- **Any comparison to the reference images** — removed deliberately. Their numbers are from a
  different period and scope; the images are used for visual language only.

## 6. State of the numbers (as of 2025-12-31)

```
56,513 units · 9,044,735 lei · 5,036 codes in the photograph (3,376 holding stock)
47 factories · 966 families

blue    40,367 u (71.4%)  4,856,472 lei   809 codes
  └ extreme (>24 mo)  30,848 u   3,069,044 lei   432 codes
grey     7,393 u (13.1%)  2,061,243 lei  1,433 codes
  └ product still active  6,821 u  1,920,399 lei  1,177 codes
green    5,171 u ( 9.2%)  1,224,741 lei   362 codes
orange   2,444 u ( 4.3%)    596,579 lei   392 codes
red      1,138 u ( 2.0%)    305,700 lei   935 codes

proposed reorder: 17,599 units · 7,928,067 lei across 3,063 codes
rotation: plain heuristic 16.7 months · engine rate 17.9 months
```

**Read the reorder total as an upper bound.** No transit stock, a 90-day lead time everywhere,
and a 3-month order cycle all push it up. The proportions between lines are the product; the
absolute scale is a human decision.

## 7. One number worth a second look

`GIORIENTAL1500KBR` (GIZA CARPET) proposes **882 units** — 24.8/month rate, zero stock. It is
the single largest line in the whole file and it dominates the Giza order list. It is either a
genuine high-volume runner sold by the metre, or a unit-of-measure artefact. Worth confirming
with Tibi before the proposal is shown as final.

## 8. Verification actually performed

- All API endpoints return 200: `meta`, `level0`, `factory/{name}`, `skus`, `sku/{id}`,
  `families`, `leadtimes` (GET + POST), `sanity`, `email` (RO + EN), `export`.
- All six screens render in both languages with no console errors.
- Excel export opened and inspected: 430 rows for the Giza order, header at row 4, frozen
  panes, multiplier in B2, formula `=ROUND(S5*$B$2,0)` in the added column, plus a
  `CITESTE_ME_README` sheet with 10 assumption/limitation lines.
- **One bug found and fixed during verification:** `factory_table()` joined reorder proposals
  onto stock-holding factories with a left join, silently dropping factories that hold zero
  stock but still have a proposal. Level 0 reported 17,569 proposed units while the email
  reported 17,599. Now an outer join; both read 17,599.
- Level 0 recomputes correctly under a gamă focus (FLORENCE: 3,556 units, 310k lei, 1 factory).
- Sales windows are truncated at the as-of date — no post-photograph leakage.
- **Data-provenance audit (after the first draft):** grepped the whole build for every figure
  that had come from the reference images and removed all of them — the hardcoded baseline block
  in `/api/sanity`, the comparison table on the *Verificare* page, its i18n strings, and the
  affected passages in these docs, in `PROGRESS.md` and in the session memory. `/api/sanity` now
  returns no external baseline. The `simple_rotation` column was renamed from `tibi_rotation` to
  stop implying it reproduces someone else's figures rather than a plain heuristic on our data.
  The healthy-share objective ("toward 40%+") is kept but relabelled as an objective discussed
  in the meeting notes, with no baseline attached — see `ASSUMPTIONS.md` A12.
