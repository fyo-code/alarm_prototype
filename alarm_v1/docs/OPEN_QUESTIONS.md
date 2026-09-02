# OPEN QUESTIONS

Refreshed 2026-08-14 after the coded importer export landed and Codex reviewed the integration. Everything here is a call I made so
the build could finish, that is genuinely yours or Tibi's to settle. Each says what I chose, why,
and what changes if the answer is different. **All of them are config edits or a CSV drop — none
requires a rebuild.**

Closed, no longer needing a decision:
- ~~Is `SUBCLASA` really the producer?~~ **Validated from our own data** (`ASSUMPTIONS.md` A10).
- ~~Reconcile against the reference images?~~ **No.** Different period and scope. Removed everywhere.
- ~~Money basis: cost or list price?~~ **Acquisition cost, confirmed.** Spend 100 lei, 100 lei is
  blocked. Fallback to a known price only where no acquisition cost exists, and every such code is
  now named in `data/cost_source_audit.csv` and `GET /api/cost-audit` (`ASSUMPTIONS.md` A7).
- ~~Ship the invented product state or not?~~ **Moot — real data found.** `ACTIV` exists in the
  sales exports. Measured the old heuristic against it: 5% agreement, an inverted signal. The
  heuristic is retired; the build now uses `ACTIV` and leaves the rest `unknown` (A6).
- ~~Is `NEATRIBUIT` recoverable?~~ **Partly, and done.** `FURNIZOR EXT` in the active export
  recovered 506 codes / 3,088 units; unattributed is down to 605 codes / 3,448 units. The rest
  needs `DATA_REQUEST.md` R4.
- ~~Which gamă for the "one gamă first" test?~~ **Not a real question** — every gamă already
  appears everywhere; the selector is only an optional filter. Nothing was ever hidden.

---

## For you — highest value first

### Q0. `grey_active` asserts something false on unknown state — NOW THE URGENT ONE
Every dead row that is not explicitly `ACTIV=N` lands in substate `grey_active`, and the UI
verdict for it reads *"produsul e încă activ. Asta e alarma reală."* For codes whose state is
genuinely **unknown** that sentence is simply untrue.

The coded-export integration made this much bigger: warehouse-only and store-only codes have no
sales row, so no `ACTIV`, so they all land here. Affected volume is now over **12,000 units and
2.6M lei**, up from ~2,500 units before.

**Options:** (a) a third substate `grey_unknown` with an honest verdict — my recommendation, it
is a one-line taxonomy addition and stops the false claim; (b) leave it and accept the label is
wrong; (c) treat unknown as not-an-alarm, which would understate.

I have not done this unilaterally because it changes the taxonomy and the headline dead-stock
split that Tibi will read. It is a five-minute change once you choose.

### Q1. As-of date: freeze at 2025-12-31, or run on fresher store data?
**Chose:** froze at **2025-12-31** — the only month where the importer export and all seven store
snapshots coexist.
**Why:** the importer file stops at December 2025; store stock runs to June 2026 for four stores
and December 2025 for Constanța, Iași and Oradea. Mixing a December warehouse position with June
store stock produces a picture that contradicts itself, and that is the kind of thing a
20-year veteran finds in ten seconds.
**Cost:** we are showing December, seven months back. That belongs in the first sentence of the
conversation, not discovered halfway through.
**Alternative I did not build:** a "stores only, June 2026" mode — fresh, but it drops the
importer layer, which is ~75% of the units and 100% of the cost data. Say if you want it anyway.

### Q2. Anything to add to the data request before it goes out?
`docs/DATA_REQUEST.md` names ten asks, each phrased as "the same file as X, but Y" with a real
filename. The top four are R1 (Constanța/Iași/Oradea store stock to current), R2
(`supplier_stock_26.csv`), R3 (`COD ARTICOL` on the importer export) and R4 (`SUBCLASA` per code
from the current export). R1 + R2 together are what move the photograph off 2025-12-31.

### Q3. Which level of the hierarchy is a "gamă"? (a question for Tibi, not a data problem)
**Correction to what I said earlier: it IS derivable from our data.** The codes and names carry a
clean four-level hierarchy —

```
COVOR  FLORENCE  6015   160x230cm  BLUE
       └ model   └design └ width   └ colour
```

— which parses for 82% of the codes that have a product name, yielding **529 models**, **50
designs**, **291 colours**, **146 widths**.

What is genuinely open is **which level he calls a gamă**, and the example makes it concrete:
`FLORENCE` is 49 codes / 3,556 units. By model name that is **one gamă**. By code prefix it is
**ten** (`OUTFLORENCE6015BL`, `OUTFLORENCE6015GO`, …), because the prefix runs all the way down to
model+design+colour. Same rugs, two completely different charts.

**My recommendation:** model level (529 values). It matches how a person talks about a range, and
1,186 mixed-grain labels — what we group by today — is too fragmented to read.
**No longer blocked.** I previously wrote that only 2,536 of 5,036 codes carry a product name.
That was the same filter bug described in `ASSUMPTIONS.md` A6 — the real figure is **5,015 of
5,036 (99.6%)**, and the scan now uses it. Model-level grouping is buildable today; it only needs
your answer on which level counts as a gamă.

---

## For Tibi — questions worth asking in the meeting

### Q4. `GIORIENTAL1500KBR` proposes 882 units. Real, or a unit-of-measure artefact?
24.8/month, zero stock, largest single line in the file, dominates the GIZA order list. Either a
genuine high-volume runner sold by the metre, or the quantities mean something other than pieces.
Thirty seconds of his time.

### Q5. Does a 90% service level sound right?
It sets the safety stock. He will not think in z-scores, but he will have a firm instinct for how
often it is acceptable to be out of stock on a good seller. One question, one number.

### Q6. Is a 3-month order cycle roughly right per zone?
The second most sensitive assumption after lead time. Drives safety stock, target stock and the
width of the healthy band.

### Q7. Does the extreme-overstock cut at 24 months land?
30,848 units / 3.07M lei sit above it — the biggest single number in the build, and a liquidation
case rather than a reordering one. If his instinct says 18 months, or 36, the headline moves a lot.

### Q8. Lead times — the ~30 numbers.
Not really a question, but it is the one input the tool asks for and the thing that most changes
the order of the reorder list. The page is there; the numbers are not.

---

## Deferred on purpose (decisions already settled in the brief, not questions)

Vedete / Boston acceleration detection, per-colour breakdown pages, zone-level ordering, MOQ,
container cubaj, loom-width optimisation, campaign mode, automated pipeline. All v2+.
His own sequencing: *"Dar începe de la alarmă."*
