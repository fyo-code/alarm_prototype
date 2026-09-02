# CODEX REVIEW — 2026-08-09

Model gpt-5.6-sol, effort xhigh. Job task-msm7ythm-qs1k40, 14m53s.
Codex session: 019fe815-8cd4-7093-b49f-5d3a29417e93 (resume: codex resume 019fe815-8cd4-7093-b49f-5d3a29417e93)

Scope given: NOT the mechanical checks (60 of those already passed in a self-audit) but
semantic/domain defects, the frontend, misleading framing in docs, and an independent
verdict on the black-band contradiction plus my proposed fix.

---

None of the four requested areas is clean. The core defect is not arithmetic; it is that classification, replenishment, priority, UI language, and exports do not share one decision policy.

No files were modified. `git status --short` remained empty.

## CONFIRMED — critical

1. **Inactive SKUs are being ordered. Your diagnosis is correct; neither proposed fix is sufficient.**

   Files: [engine.py:24](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/engine.py:24>), [engine.py:118](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/engine.py:118>), [engine.py:179](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/engine.py:179>), [ASSUMPTIONS.md:57](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/docs/ASSUMPTIONS.md:57>).

   What is wrong: all 1,105 black rows get proposals and CRITICAL because proposal calculation and criticality happen without an eligibility gate. Worse, all 1,105 have `product_state=active`, so the drawer can simultaneously say demand-status “Inactiv” and master-status `ACTIV=D`.

   Boundary defect: 347 black SKUs sold during days 91–180. The documented inactive rule is “no sales in 180 days,” but code classifies every zero-stock/no-90-day-sale row as inactive.

   Consequence: 4,115 units / 2,191,676 lei, 23.4% of quantity and 27.6% of proposal value, enter factory lists, totals, email and exports.

   Judgment on the proposed fixes:

   - Dropping the 365-day component when `units_180d==0` removes only 758 SKUs / 2,980 units. It leaves 347 “inactive” SKUs / 1,135 units because their 91–180-day sales still feed the rate.
   - Capping criticality at MEDIUM is cosmetic. It does not remove the quantity, value, export row, or `priority_score`.

   Correct fix: introduce an explicit `replenishment_eligible` decision gate and apply it to `suggested_qty`, value, priority, criticality, totals and exports. Preserve the blended rate as diagnostic information if wanted. Zero-stock SKUs with sales only in days 91–180 need an explicit dormant/manual-review state, not automatic CRITICAL.

   How to confirm: group `panel.parquet` by `colour`, then split black by `units_180d > 0`. The two groups are 758 and 347 SKUs; both currently have proposals.

2. **Green, blue and grey decisions also contradict their reorder rows.**

   Files: [engine.py:64](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/engine.py:64>), [engine.py:139](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/engine.py:139>), [i18n.js:95](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/i18n.js:95>).

   What is wrong: `suggested_qty` means “below target stock,” while statuses are independently assigned from cover bands. The computed `reorder_point` is never used as an ordering gate.

   Reproduced:

   - 249 green “Echilibrat. Nu-l atinge.” SKUs propose 742 units.
   - 17 blue “Nu comanda” SKUs propose 17 units.
   - 365 grey “Stoc mort” SKUs propose 862 units.
   - 88 green rows are actually below ROP.
   - 23 orange rows are above ROP.

   Excluding black, that is another 1,621 units / 559,994 lei carrying a proposal under a status that says not to replenish. Including black, contradictory statuses account for 5,736 units—32.6% of the complete order.

   Consequence: colour, verdict, urgency and Excel order can recommend opposing actions on the same row.

   How to confirm: filter `suggested_qty>0` by colour and compare `stock_units` with `reorder_point`.

3. **Lead time materially changes quantity despite repeated claims that it only changes ranking.**

   Files: [engine.py:52](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/engine.py:52>), [engine.py:64](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/engine.py:64>), [i18n.js:50](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/i18n.js:50>), [ASSUMPTIONS.md:24](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/docs/ASSUMPTIONS.md:24>), [BUILD_NOTES.md:128](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/docs/BUILD_NOTES.md:128>).

   What is wrong: lead time enters both demand coverage and safety stock:

   `target = rate × (lead + review) + z × sigma × sqrt(lead + review)`.

   Reproduced total proposals with all else unchanged:

   - 14 days: 9,927 units
   - 90 days: 17,599 units
   - 180 days: 26,214 units

   `GIORIENTAL1500KBR` alone changes from 882 to 646 units when lead time changes from 90 to 14 days.

   Consequence: entering the requested real lead times changes the actual factory order materially while the customer is explicitly told it will not.

   How to confirm: recompute `target_stock` and `ceil(target-stock)` at different lead times using the existing panel’s rate and sigma.

## CONFIRMED — high

4. **Unknown product states are presented as confirmed active stock. Product warnings are also stale.**

   Files: [engine.py:130](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/engine.py:130>), [build.py:217](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/build.py:217>), [app.js:487](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/app.js:487>), [app.js:753](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/app.js:753>), [i18n.js:17](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/i18n.js:17>), [ASSUMPTIONS.md:84](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/docs/ASSUMPTIONS.md:84>).

   What is wrong: `np.where(not_active/phase_out, grey_phaseout, grey_active)` sends `unknown` into `grey_active`. Meanwhile the ribbon, dead-stock note, Verification page, email and Excel notes still claim product state is absent and heuristic.

   Reproduced grey split:

   - Actually active: 1,100 SKUs / 4,884.6 units / 1.068M lei.
   - Unknown: 331 SKUs / 2,506 units / 993,288 lei.
   - Not active: 2 SKUs / 2 units.

   Therefore 33.9% of grey units and 48.2% of grey value labelled “produs activ / alarma reală” are actually unknown. `ASSUMPTIONS.md`’s claim that 1,431 grey codes are confirmed active is semantically false even though the 1,431 substate count is arithmetically correct.

   How to confirm: group grey rows by `product_state`, not `substate`.

5. **“Sells well” / “confidence” is neither sales performance nor confidence.**

   Files: [server.py:115](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:115>), [app.js:265](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/app.js:265>), [i18n.js:35](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/i18n.js:35>), [BUILD_NOTES.md:114](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/docs/BUILD_NOTES.md:114>).

   What is wrong: `moving_pct` is the percentage of current stock units belonging to SKUs with any sale during 90 days. One unit sold is enough to classify every remaining unit on that SKU as “moving.” BUILD_NOTES then calls the percentage “confidence.”

   Example: GIZA displays 92.1% “sells well.” That means 92.1% of its stock is on non-grey SKUs; it does not mean 92.1% sold, sell-through, forecast confidence, or probability.

   Consequence: the number directly answers “merită să comand aici?” with a metric that cannot answer that question.

   How to confirm: compare `moving_units / stock_units` in `factory_table()` with actual `units_90d`.

6. **The units/lei toggle changes bar lengths but not the selected top rows, ranking or coverage denominator.**

   Files: [server.py:189](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:189>), [server.py:242](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:242>), [app.js:265](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/app.js:265>), [app.js:472](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/app.js:472>), [BUILD_NOTES.md:113](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/docs/BUILD_NOTES.md:113>).

   Reproduced:

   - Level-0 stock chart in lei still uses the top ten by units. Only 6/10 factories overlap with the true top ten by value.
   - The displayed set covers 69.9% of value, while the true value top ten covers 82.1%; the API coverage note still reports 75.9%, the unit denominator.
   - Reorder-value mode also remains selected and sorted by quantity; 3 of the true value top ten are missing.
   - On GIZA’s family chart, only 6/15 unit-selected families overlap the value top fifteen.
   - In value mode, the family “health” stack collapses into one blue value segment.
   - The dead-stock family chart ignores the toggle entirely.

   Consequence: the “Lei” screen is not the money view it claims to be.

7. **Click-through filters do not represent the number clicked.**

   File: [app.js:227](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/app.js:227>), [app.js:302](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/app.js:302>), [app.js:344](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/app.js:344>).

   Reproduced:

   - Under FLORENCE focus, the green number represents 7 SKUs. Clicking the green KPI opens the global 362 green SKUs.
   - The “Albastru + gri” KPI represents 47,759.6 units, but clicking it filters only blue—40,367 units—and drops all 7,392.6 grey units.
   - Reorder KPI, SKU-count chart and factory chart clicks also discard the active family focus.
   - Donut and legend clicks correctly preserve it, so behavior differs within one screen.

   Consequence: “Excel exact articles behind the click” and drill-down trust are broken before export is even reached.

8. **The headline photograph presents the mapped subset as total stock.**

   Files: [server.py:158](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:158>), [app.js:158](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/app.js:158>), [ASSUMPTIONS.md:149](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/docs/ASSUMPTIONS.md:149>).

   What is wrong: “Bucăți în stoc” shows 56,513 without saying “mapped stock.” Another known 22,026 warehouse units / 2.493M lei appear lower on the page but are outside all headline totals, shares and statuses.

   Consequence: the primary photograph omits 28.0% of known combined units and 21.6% of known combined value while looking like a complete total.

   How to confirm: add `/api/meta.totals` to `/api/meta.unmapped`.

9. **Reflected XSS exists in the email endpoint.**

   Files: [server.py:691](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:691>), [email_render.py:85](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/email_render.py:85>), [email_render.py:243](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/email_render.py:243>).

   What is wrong: caller-controlled `base_url` is interpolated directly into an HTML attribute.

   Reproduced output from a malicious value:

   ```html
   <a href="x"><img src=x onerror=alert(1)>/" ...
   ```

   Consequence: a crafted `/api/email?base_url=...` URL returns attacker-controlled executable HTML on the app origin.

## CONFIRMED — medium

10. **SKU drawer simple rotation is exactly 3× too small.**

   Files: [build.py:262](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/build.py:262>), [app.js:720](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/app.js:720>).

   `simple_rotation = stock / units_90d` is a number of 90-day periods, but the drawer labels it months. Correct months are `stock / (units_90d/3)`. Every finite row is off by exactly 3×. `/api/sanity` uses the correct formula, so two product screens disagree.

11. **“Money trapped in dead stock” is estimated using unit share, not calculated from dead-stock value.**

   Files: [server.py:272](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:272>), [server.py:285](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:285>), [i18n.js:55](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/i18n.js:55>).

   `trapped = family_total_value × dead_unit_share` assumes dead and moving units have identical cost. Actual grey `stock_value` already exists.

   Example: GIZA/BEACON displays about 9,860 lei; actual grey value is 32,397 lei.

   Consequence: the “worst families” ordering can be wrong by tens of thousands of lei.

12. **Top-N counts include zero rows, and factory denominators mix stock factories with proposal-only factories.**

   Files: [server.py:115](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:115>), [server.py:198](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:198>), [charts.js:96](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/charts.js:96>).

   Reproduced for ALLEGRO: the chart says top 4 of 2 proposal factories, includes two zero-proposal rows, and renders zero as a visible 2px bar.

   Separately, the Level-0 KPI/API reports 76 factories while only 59 hold stock. The other 17 enter through the outer join because inactive proposal-only rows exist.

13. **Family siblings can cross factories.**

   Files: [server.py:384](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:384>), [app.js:694](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/app.js:694>).

   The sibling query filters only on `family`, while the UI justifies the list as widths that “the factory” must produce together. Sixty-six family labels occur under multiple factories; ALLEGRO spans four.

   Consequence: the drawer can recommend treating unrelated factories as one production family.

14. **A normal search string can crash the SKU endpoint.**

   File: [server.py:347](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:347>).

   `str.contains` treats user input as regex. Searching `[` reproduced `ArrowInvalid: Invalid regular expression`, and the page becomes a generic error screen.

   Fix direction: `str.contains(ql, regex=False, na=False)`.

15. **Lead-time POST accepts corrupting input and reports success.**

   Files: [server.py:420](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/server.py:420>), [app.js:889](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/app.js:889>).

   Reproduced without writing by mocking the write/rebuild: duplicate GIZA rows with `-30` and `"abc"` were accepted with HTTP 200. A duplicate two-row lead-time merge expands the 5,036-row panel to 5,853 rows. The frontend also ignores the POST response status and displays “saved.”

16. **The configuration/portability claim is false.**

   Files: [config.json:2](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/config.json:2>), [paths.py:21](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/paths.py:21>), [sources.py:28](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/sources.py:28>), [BUILD_NOTES.md:101](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/docs/BUILD_NOTES.md:101>).

   Unused config entries include `velocity_short_days`, `stock_universe`, `min_sigma_floor`, export multiplier settings, UI language/top-N, and category slug. Sources still hardcode `rugs_v1`, `INDOMEX SRL`, and `%covoare%`; API top-N values and the HIGH threshold are hardcoded.

   Specific functional defect: `velocity_short_days` is ignored; the short rate uses `dead_days`.

17. **OPEN_QUESTIONS carries a dead blocker.**

   Files: [OPEN_QUESTIONS.md:45](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/docs/OPEN_QUESTIONS.md:45>), [DATA_REQUEST.md:203](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/docs/DATA_REQUEST.md:203>).

   It says only 2,536/5,036 photograph rows have product names and treats this as a blocker. The current panel has 5,015 named rows, matching DATA_REQUEST’s corrected 99.6% framing.

## SUSPECTED — needs domain confirmation

- **`ACTIV=N` is treated as “phase-out; job done correctly.”** [engine.py:136](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/pipeline/engine.py:136>) and [i18n.js:102](</Users/fyodorgolovin/Downloads/Supply-Inventory v1.0 codex/.claude/worktrees/alarm-v1-build-analysis-931f6b/alarm_v1/app/web/i18n.js:102>). The source establishes only “not active,” not intentional phase-out/draining. Current impact is only two units, but the interpretation needs confirmation before broader data arrives.

## Clean subareas

None of the four requested areas is fully clean.

Within them:

- RO/EN dictionaries, segment labels and substate keys have exact parity; no missing literal i18n keys were found.
- Main-SPA dataset values are consistently escaped; the confirmed XSS is isolated to generated email HTML.
- Donut arc arithmetic and the core SVG scaling matched the values passed in.
- Empty Level-0 API state returns coherent zeros and empty collections.
- Red-low, orange, green, blue, extreme-blue and grey inequality boundaries match the written A4 formulas. The inactive boundary does not.
- `DATA_REQUEST.md` is substantially more current and candid than the other documentation.

Codex session ID: 019fe815-8cd4-7093-b49f-5d3a29417e93
Resume in Codex: codex resume 019fe815-8cd4-7093-b49f-5d3a29417e93

---

## Verification of these findings by Claude (2026-08-09)

Spot-checked the highest-impact claims independently. **Every one reproduced exactly:**

| Finding | Codex claim | Reproduced |
|---|---|---|
| #3 lead time changes qty | 9,927 / 17,599 / 26,214 units at 14/90/180d | identical |
| #3 GIORIENTAL1500KBR | 882 -> 646 units at 14d | identical |
| #10 simple_rotation | exactly 3x too small, labelled 'luni' | identical (1.00 vs 3.00 months) |
| #2 contradictory statuses | green 249/742u, blue 17/17u, grey 365/862u | identical |
| #2 ROP disagreement | 88 green below ROP, 23 orange above | identical |
| #1b inactive boundary | 347 black SKUs sold in days 91-180 | identical (347 / 758 split) |
| #4 grey mislabelled | 331 SKUs / 2,506u / 993,288 lei state=unknown shown as 'produs activ' | identical |
| #14 regex crash | search '[' returns 500 | identical |
| #9 XSS | base_url injected into href | identical, payload executes |
| #6 lei toggle | 6/10 overlap, 69.9% vs 82.1% value covered, note says 75.9% | identical |
| #11 trapped money | GIZA/BEACON 9,860 vs actual 32,397 lei | identical |

Conclusion: the report is reliable. It also **corrected me on two points** — my diagnosis of
the black-band defect was incomplete (I missed the 91-180 day boundary group), and *both* of my
proposed fixes were insufficient (one leaves 347 SKUs / 1,135 units, the other is cosmetic).
