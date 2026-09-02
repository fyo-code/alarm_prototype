# DATA GAPS — the asks, in priority order

Each gap is stated as a **concrete request**, small enough that Geo can do it in one step,
with what it unlocks and what it costs us not to have it. Ordered by value per unit of effort.

---

## 1. Warehouse export keyed on `COD ARTICOL` — highest value, smallest ask

**Ask (to Geo):** the same monthly export we already have
(`PERIOADA · IMPORTATOR_PRODUCATOR · ARTICOL DENUMIRE · STOC · VALOARE STOC`)
with **one extra column: `COD ARTICOL`**. Rugs only, `INDOMEX SRL`, monthly, going forward.

**Why it is first:** the current export identifies articles by name. We rebuilt an
`exact_unique` name→code map from the sales exports — the same approach the project's own
Phase 8D used — and it gets us 66.5% of units and 70.1% of the lei. The remaining
**22,026 units / 2,493,218 lei cannot enter the analysis at all**: no code means no sales
history, no producer, no gamă, no status, no reorder line. They are shown on Level 0 as an
explicit unmapped block so the gap is visible, but they cannot be reasoned about.

**What it unlocks:** roughly a third more of the real stock position enters the photograph, and
the money total stops being understated. The largest blocks sitting outside are bath mats
(6,066 u), rugs whose names simply do not match any sold code (6,660 u), and broadloom/rolls
(4,471 u) — slow-moving volume that almost certainly belongs in the dead-stock conversation but
currently cannot be measured or exported.

**Effort:** one column on an export that already exists. The project's Phase 8D notes report a
62.5% exact-match rate on this same file across all importers, so this ceiling is structural to
the name key, not something a better matcher will fix.

---

## 2. Factory lead times — ~30 numbers, from Tibi, not from a system

**Ask (to Tibi):** delivery time in days for each of the ~30 rug factories. A list in an email
is enough. There is a page in the app (*Timpi de livrare*) where they can be typed straight in.

**Why:** currently 90 days for everyone. Lead time is what decides **the order of the list**,
which is the whole point of a priority ranking. Tibi's own example makes it concrete: 2,200
pieces from a factory that delivers in two weeks belongs around 5th place, not 1st, "pentru că
ai oricând timp".

**What it unlocks:** a priority ranking he would actually agree with. Also tightens the
red/orange boundary, since "critical" means "cover below lead time".

**Effort:** ~30 numbers, once. This is the only manual input the tool asks for anywhere —
and deliberately so: safety stock is a formula precisely because per-SKU input would kill adoption.

---

## 3. Product state (in / out / phase-out) per SKU

**Ask:** the internal state code per article, as a two-column export (`COD ARTICOL`, `STARE`).
Even imperfect is far better than absent.

**Why:** it is the difference between an alarm and a job well done. Dead + phase-out means the
promos are already running and the stock is draining by design — "ți-ai făcut treaba bine,
trebuie doar să ai răbdare". Dead + active is the real problem.

**What we did meanwhile:** derived a proxy from stock behaviour (never restocked + drained to
half → phase-out). It flags only **572 of 7,393** dead units as phase-out, which is almost
certainly too few. Every use of it is stamped `HEURISTIC_PROXY` in the UI.

**Cost of not having it:** the dead-stock alarm over-fires, and a 20-year veteran can tell
immediately. This is the gap most likely to make the whole report look naive.

---

## 4. Stock in transit / on order

**Ask:** open purchase orders — article, quantity, expected arrival. Or even just a total per
factory.

**Why:** we currently see zero transit stock, so goods **already ordered read as missing**.
Some share of the 17,599 proposed units is already on a ship. Until this is in, every
proposal should be read as an upper bound.

---

## 5. Unit cost per article

**Ask:** cost or landed cost per `COD ARTICOL`.

**Why:** real cost exists for only 1,540 of the codes in the photograph (from the warehouse
export). 2,874 use an assumed 55% of average selling price; 622 have no value at all and
therefore contribute **0 lei**, which understates the total capital figure.

**Also settles an open question:** for "capital blocat", does Tibi think in acquisition cost or
in list price? We chose cost. If he means list price, every lei number roughly doubles and the
budget conversation changes shape.

---

## 6. Cross-code sales mapping — a false signal, not a gap in coverage

**Ask:** does a correspondence table between article codes exist anywhere? If not, we need a
rule (or a sample of known pairs) to build a heuristic.

**Why:** goods sold to external networks under a different code read as **zero sales** here.
A product that sells well can therefore appear grey and be liquidated by mistake. We cannot
detect it, cannot correct it, and cannot even estimate how much of the dead stock it explains.

This is named on the *Verificare* page and in the footer of every Excel export, because the
honest position is "some of this grey is wrong and we cannot yet tell you which".

---

## 7. Internal / project consumption flag — the other false signal

**Ask:** a movement-type or customer-type flag that separates store fit-outs, șantier and
HoReCa project consumption from retail sales.

**Why:** the opposite error to §6. Stock consumed for a project reads as ferocious retail
demand, so the tool proposes reordering something nobody is buying at retail. False *vedete*,
false reorders.

---

## 8. Fresher store snapshots for Constanța, Iași, Oradea

Those three stop at December 2025; the other four run to June 2026. Combined with the
warehouse file also stopping in December 2025, that is what forces the as-of date back to
2025-12-31. A fresher warehouse export plus these three stores moves the whole photograph to
current, which is the difference between "how stocks looked" and "how stocks look".

---

## Not asked for yet, on purpose

MOQ per factory, container cubaj, loom widths per gamă, and zone definitions are all real and
all matter — but none of them are v1. The tool's job right now is to get the **proportions
between SKUs** right; absolute scale stays a human decision, which is exactly what the
multiplier cell in the Excel export supports. Asking for these now would hand Geo more than he
can do and would delay the things above that actually block the alarm.
