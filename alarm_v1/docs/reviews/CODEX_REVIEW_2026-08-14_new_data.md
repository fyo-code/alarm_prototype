# CODEX REVIEW — 2026-08-14 — the coded-importer integration

Model gpt-5.6-sol, effort xhigh. Job task-mst5dxz3-1vlitm, 15m20s.
Session 01a0010d-ecbd-75b1-ab6f-54de74dd3996 (resume: codex resume 01a0010d-ecbd-75b1-ab6f-54de74dd3996)

Reviewed commit 0876282. Verdict: only class A (de-duplication) clean; B-F had confirmed defects.

---

Verdict: only A is clean. B–F contain confirmed defects.

## CONFIRMED

1. **CRITICAL — the outer join drops store stock.**

[pipeline/build.py:177](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/build.py:177>) left-joins stores onto the sales spine before the warehouse outer join at line 185. Therefore store quantities for codes absent from sales are discarded.

- Selected store snapshots contain **14,707.28 units**.
- Panel `store_units` contains **12,175.60**.
- Missing: **2,531.68 units, 17.2% of the store layer**.
- **339 warehouse-only SKUs already in the panel lose 913 store units**, understating their known value by approximately **359,476 lei**.
- Another **673 positive store-only codes / 1,618.68 units** never receive a row.
- [pipeline/build.py:335](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/build.py:335>) writes the 913 units into the drill-down store file anyway, so 339 rows have `store_units=0` while their per-store detail says otherwise.

Confirm by aggregating the latest selected rows in `STORE_STOCK`, then comparing them with `panel.store_units` and `data/store_stock.parquet`.

2. **HIGH — every new warehouse-only SKU breaks `/api/sku/{sku}`.**

[app/server.py:69](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:69>) does not convert `pd.NA`; [app/server.py:400](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:400>) serializes the entire row.

All 685 warehouse-only rows carry `pd.NA` in fields such as `producer_entity`, `activ`, and `dimensiuni`. Reproduced on `TUMEMOYELLOW050`:

`TypeError: Object of type NAType is not JSON serializable`

The UI has no error handling after the request at [app/web/app.js:683](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/app.js:683>), so the drawer remains loading. Confirm with `curl /api/sku/TUMEMOYELLOW050`; it should return 500.

3. **HIGH — configured exclusions do not override sales-universe membership.**

The rule at [pipeline/sources.py:159](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/sources.py:159>) is:

`in sales universe OR included name bucket`

`config.rug_inclusion.exclude_name_buckets` at [config.json:119](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/config.json:119>) is never read.

June therefore includes at least **3,685.1 units / 115,138 lei** that the configuration explicitly describes as non-rugs:

- Broadloom/artificial grass: **2,228.1 units**
- Stair treads: **1,286**
- Carpet cleaner, cushions and poufs: **165**
- Bath mat code `748496`: **6**, missed because its name says `SET COVOR BAIE`, not `COVOR DE BAIE`

The stated **10,727 excluded bath-mat units is correct but incomplete**. No obvious real rugs were found among June’s excluded positive-stock names.

4. **HIGH — excluded stock is hidden and mislabeled as “unmapped.”**

[pipeline/sources.py:183](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/sources.py:183>) emits `excluded_non_rug`. [app/server.py:163](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:163>) still reads `unmapped_buckets`.

Reproduced `/api/meta` result:

- Unmapped/excluded: **17,630.354 units / 401,589 lei**
- `buckets: []`

Consequently the Level-0 block at [app/web/app.js:325](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/app.js:325>) displays only a dash. The Excel note at [app/server.py:613](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:613>) also says 77.4% was “mapped to a code.” That is false: every source row has a code. **77.4% is the category-inclusion share.**

This directly contradicts the document’s “reported rather than hidden” claim.

5. **HIGH — all 685 new unknown-state rows are presented as active dead stock.**

[pipeline/engine.py:130](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/engine.py:130>) maps every dead row not explicitly inactive to `grey_active`.

All warehouse-only rows have:

- `product_state="unknown"`
- `substate="grey_active"`
- **11,320.2 units / 2.290M lei**

The UI verdict says the product is still active and “this is the real alarm.” Current total grey-but-unknown exposure is **809 SKUs / 12,504.2 units / 2.689M lei**. This change materially worsened the earlier unknown→active defect.

6. **MEDIUM — warehouse-only dimensions and family aggregation are unsound.**

The importer name contains dimensions, but [pipeline/build.py:197](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/build.py:197>) calls `_width(None, sku)`, forcing the suffix heuristic at [pipeline/build.py:58](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/build.py:58>).

- **82 rows / 1,902 units / 89,399 lei** have a dimension visible in the name but a missing or wrong `width_cm`.
- Example: `MHSOFTFLOWER362`, named `45x75cm`, becomes **362 cm**.

All 685 rows are also assigned `family=NEATRIBUIT`. That pseudo-family becomes the largest family: **24,175.9 units / 2.973M lei / 992 SKUs**, distorting family rankings and sibling tables.

`sku_origin` is omitted from both `/api/skus` and Excel columns at [app/server.py:632](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:632>), so users cannot identify the warehouse-only cohort in exports.

`unit_cost`, `avg_price=null`, `rate_mo=0`, and `sigma_mo=0` are otherwise coherent for these rows.

7. **HIGH — the dating disclosure is internally contradictory.**

The default ribbon still says this is the last month with warehouse stock and all seven store snapshots at [app/web/i18n.js:17](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/i18n.js:17>). That is explicitly false: three stores are December 2025.

The Check-page prose and first Excel note do disclose the stale stores. The Level-0 ribbon/footer do not; the ribbon actively states the opposite.

Moreover, [docs/NEW_DATA_2026-08.md:73](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/docs/NEW_DATA_2026-08.md:73>) says 4,058 stale and 10,649 fresh units were carried into the photograph. Those are raw coverage totals. Because of finding 1, the panel actually receives only **3,718 stale and 8,457.6 fresh store units**.

8. **HIGH — the trend arithmetic is exact, but it does not establish improvement.**

The API correctly returns −12.1844% units and +1.1291% value. The cohort is not stable:

- January 2022: 3,047 codes
- August 2026: 2,942 codes
- Codes present at both endpoints: only **544**
- Positive-stock at both: only **192**
- First-only: **2,503 codes / 50,001.81 units**
- Last-only: **2,398 codes / 45,941.3 units**

The +1.1% value conclusion is therefore replacement/mix, not appreciation or comparable-cohort performance. Baseline choice also changes the story:

- Aug 2022 → Aug 2026: units **−15.6%**, value **−11.9%**
- Jan 2022 → Jan 2026: units **−24.2%**, value **−5.0%**
- Aug 2025 → Aug 2026: units **−14.3%**, value **+6.5%**

“Average acquisition value per unit rose 15.2%” is defensible. “The stock position is improving” is not established by this series.

The chart at [app/web/charts.js:233](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/charts.js:233>) scales from observed minimum to maximum rather than zero. Labels reveal the scale, but the filled area can visually exaggerate movement. Visual impact needs your browser check.

9. **MEDIUM — the new document’s numbers mostly reproduce, but several claims do not.**

Recomputed successfully:

- December integrity: **65,675.89 units / 8,350,596.212 lei** in both sources
- Old/new shares: **66.5% / 70.1%** and **77.4% / 95.6%**
- Previously unmatched: **22,025.79 units**; 69.8% falls into stated non-rug buckets
- Warehouse-only: **685 / 11,320.2 / 2,290,198**
- Before: **56,512.7 / 9,044,734.74**, dead **7,392.6 / 2,061,242.94**
- Now: **72,536.9 / 11,720,372.26**, dead **25,762.8 / 5,965,629.01**
- Real-cost share: **2,710 codes / 91.63%**
- Producer table: all four rows reproduce
- All 57,126 overlapping source keys agree exactly

Misleading or false:

- [docs/NEW_DATA_2026-08.md:55](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/docs/NEW_DATA_2026-08.md:55>): warehouse-only stock explains only **11,320.2 of the 18,370.2-unit dead-stock increase—61.6%**, not the entire jump.
- [docs/NEW_DATA_2026-08.md:104](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/docs/NEW_DATA_2026-08.md:104>): the three stale stores are not “the only thing” preventing an August photograph. The other four stores also stop in June, and sales stop at 2026-07-06.
- The canonical [docs/ASSUMPTIONS.md:135](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/docs/ASSUMPTIONS.md:135>) still says as-of is December, dates are never mixed, and the warehouse join is name-keyed.

## SUSPECTED

- **Carry-forward accuracy is materially uncertain.** The true June positions for the three stale stores are unavailable. In the four stores with both snapshots, December→June net stock changed little, but SKU-level absolute churn was **5,086 units**. Removing carried stock as a lower-bound scenario changes **717 proposals by 1,200 units / 358,847 lei**. This does not prove the carry is wrong; it proves it is decision-material.
- **Trend visual emphasis may be misleading.** Static analysis confirms the truncated y-domain, but actual perceived severity needs your viewport check.

## A–F status

- **A clean:** zero conflicting overlaps; de-dup does not double-count current inputs.
- **B not clean:** explicit exclusions are bypassed.
- **C not clean:** dropped store stock, broken drill-downs, bad widths, unknown→active, dominant pseudo-family.
- **D not clean:** carry is disclosed in some places, contradicted in the primary ribbon, and raw coverage does not equal contributed stock.
- **E not clean:** endpoint arithmetic is right; comparability and “improvement” framing are not.
- **F not clean:** headline arithmetic mostly reproduces; several causal and currentness claims are false.

Verification boundary: the normal build reached `panel.to_parquet` and failed only with the expected sandbox `PermissionError`. Uvicorn startup completed but localhost binding was denied, so literal curl was impossible; Level 0, trend, meta, and SKU routes were executed directly. JavaScript syntax checks passed. Workbook serialization was blocked by the sandbox’s unavailable temp directory, so Excel notes were checked statically and by calling `_export_notes()`. No browser was used. Git remained clean; no file was modified.


Codex session ID: 01a0010d-ecbd-75b1-ab6f-54de74dd3996
Resume in Codex: codex resume 01a0010d-ecbd-75b1-ab6f-54de74dd3996

---

## Disposition by Claude (2026-08-14)

I reproduced every finding I checked. **All eight actionable ones are fixed**; one is held
deliberately because it is a design decision Fyo reserved for himself.

| # | Finding | Reproduced | Action |
|---|---|---|---|
| 1 | Outer join dropped store stock | **yes** — 2,531.68 u, 17.2% of the store layer; 913 u on 339 codes read as 0 | **FIXED** — the SKU universe is now the union of all three layers, then each is left-joined onto it. Store layer preserved exactly (14,707.28 = 14,707.28). Surfaced a new `store_only` cohort: 673 codes / 1,619 u |
| 2 | `/api/sku` 500s on warehouse-only rows | **yes** — `NAType is not JSON serializable` | **FIXED** — `_clean()` now catches every pandas NA scalar. All three origins return 200 |
| 3 | `exclude_name_buckets` was dead config | **yes** — zero references in code | **FIXED** — exclusions now win even for sales-universe codes. Classifier widened for `SET COVOR BAIE`, cleaner, cushions, poufs |
| 4 | meta read `unmapped_buckets`, sources emitted `excluded_non_rug` | **yes** — buckets came back `[]` | **FIXED** — reads either, and reports `kind`. Level-0 block now shows all five buckets (21,315 u / 516,727 lei) |
| 5 | Unknown state presented as active dead stock | **yes** | **HELD** — promoted to `OPEN_QUESTIONS.md` **Q0**, the most urgent held question. Not fixed unilaterally: it changes the taxonomy and the dead-stock split Tibi reads |
| 6 | Width from code suffix, not the name | **yes** — 80 rows / 1,890 u wrong; `MHSOFTFLOWER362` named 45x75cm read as 362 cm | **FIXED** — `_width_from_name()` takes precedence. 0 rows now disagree |
| 7 | Ribbon asserted "all 7 store snapshots" — false | **yes** | **FIXED** — ribbon now names the three stale stores explicitly, in both languages |
| 8 | Trend arithmetic right, "improvement" framing not established | **yes** — only 538 codes at both endpoints; Aug 2022 → Aug 2026 is **−11.9% value** vs +1.3% from Jan 2022 | **FIXED** — API returns cohort size and two alternative baselines; the UI note states it is not like-for-like and that the rise is replacement/mix. Average cost per unit (+16.3%) is given as the defensible reading |
| 9 | Several doc claims false or overstated | **yes** | **FIXED** — never-sold stock explains 60.7% of the dead-stock jump, not all of it; the three stale stores are no longer called "the only thing" blocking August; `ASSUMPTIONS.md` A8/A9 rewritten (they still described a December as-of and a name-keyed join) |

Codex's own verification boundary is worth recording: its sandbox blocked the parquet write,
localhost binding and workbook serialisation, so it called routes in-process and checked Excel
notes statically. It did not use a browser and did not modify any file — `git status` stayed clean.
