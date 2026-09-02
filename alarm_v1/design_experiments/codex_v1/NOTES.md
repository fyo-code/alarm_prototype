# Codex V1 — design notes

## Position

This version treats Alarmă as a procurement workbench, not a reporting dashboard. The primary user should be able to answer two questions immediately:

1. What needs to be ordered?
2. Where is money sitting in the wrong stock?

Everything else supports or audits those two decisions.

## Significant decisions

### 1. A decision flow instead of six equal tabs

I moved navigation into a persistent left rail and divided it into **Decizie** (Fotografia → Fabrică → Articole) and **Control** (Verificare, Timpi de livrare, E-mail).

The original puts all six destinations in one horizontal row. That makes operational steps and support screens look equally important, and it hides the intended drill-down sequence. The rail makes the 0 → 1 → 2 path legible without adding explanatory copy to every screen.

### 2. Fotografia starts with the two money decisions

The first screen now opens with two large, clickable decision blocks:

- order quantity plus order value;
- the share and absolute value of blue + grey stock.

The original opens with five equal KPI cards, followed by a donut. “De comandat acum” therefore competes visually with total SKU count and factory count, even though it is the main action. Totals remain available, but in a quieter baseline strip.

### 3. The donut became a stock-state ledger

I replaced the status donut with aligned rows on a common scale. Each row keeps the selected measure, the other measure, the share, and the SKU count visible together. The rows drill into Articole, and the sub-state links preserve direct access to cases such as red-out, extreme blue, active dead stock, and phase-out.

The original donut communicates composition, but makes close values hard to compare and forces the user to move between slices and a separate table to read exact units and lei. For an experienced buyer, aligned quantities are faster than area/angle estimation.

### 4. Blue is no longer a generic chart colour

Blue now means **overstock only**. Neutral ink is used for factory order volume, width distribution, factory selection, and the engine comparison.

The original uses blue for several neutral series, including order-volume bars. That breaks the product’s most useful learned language: blue should immediately mean “too much stock,” not merely “this is a bar.” Green, orange, red, blue, and grey remain reserved for their stock states.

### 5. Factory is an order sheet first

The factory screen gives the proposed order the strongest summary treatment, puts the export beside the factory title, and keeps the order table as the first full section. Every line now ends with an explicit arrow/“open reasoning” affordance.

The original already places the order list first, which is directionally right, but surrounds it with equal KPI cards and relies on row hover to communicate drill-down. This version makes “approve/export/open evidence” read as the main workflow.

### 6. Articole is a working list, not a generic data table

Filters and search form one attached control bar above the table. Every row has an explicit reasoning column and opens the existing SKU drawer. The drawer reads as an evidence sheet: verdict first, six facts, then the “why” chain, store distribution, sibling widths, and source assumptions.

The original subtitle says to click a row, but the rows themselves do not visibly promise what opens. The added action column makes the evidence model discoverable for a sceptical, non-technical user.

### 7. A procurement-document visual language

The interface uses warm paper, ruled sections, square controls, compact labels, and tabular figures. It avoids floating rounded cards, gradients, shadows, external fonts, and decorative motion. System fonts are used exclusively.

The original is restrained, but still reads as a conventional card dashboard. The ledger/worksheet treatment is more familiar for a user who spends the day comparing suppliers, order lines, units, and lei.

### 8. Data limitations stay visible without dominating the task

The as-of and missing-data warning remains directly under the workspace header. Verification, cost audit, lead-time editing, and the email preview remain fully reachable under Control. The unmapped warehouse block stays on Fotografia, but below the decision sections because it is a data-acquisition issue rather than today’s order list.

### 9. Laptop density and accessibility

At 1280 px the rail narrows, analytical two-column grids stack when necessary, and all figures remain readable instead of shrinking charts into illegible thumbnails. The navigation becomes horizontal on smaller screens. Drill-down cards and SVG chart rows support keyboard activation; visible focus and reduced-motion preferences are respected.

## Figure deliberately not fixed

In the current API response, `/api/level0?basis=value` returns `reorder_total.qty` equal to the reorder value (about 7.93M in the current dataset), while `reorder_total.value` contains the same value. Showing that `qty` field as pieces would mislabel lei as units.

Because this experiment is presentation-only, I did not change the endpoint or recompute quantity client-side. In Lei mode the primary decision block shows the valid reorder value and SKU count, with a note that quantity remains available in the Bucăți view. This backend/data-contract issue should be fixed outside the design experiment before the two measures can be shown together in that mode.

## Preserved contract and features

- Same API endpoint set and call count as the original frontend.
- All six screens remain reachable.
- Bucăți/Lei and RO/EN toggles remain persistent.
- Gamă focus, segment and sub-state drill-downs remain available.
- Factory and SKU click-throughs remain available.
- All existing Excel/cost-audit exports remain available.
- The SKU drawer retains the full “why” list, store split, family siblings, and assumptions.
- Charts remain dependency-free, hand-written SVG.
- No fonts, CDNs, packages, or runtime external requests were added.
