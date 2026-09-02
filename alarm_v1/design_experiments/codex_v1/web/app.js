// ALARM V1 — Level 0 → Level 1 → Level 2, in one page, with export at each level.
(() => {
"use strict";

const S = {
  lang: localStorage.getItem("alarm_lang") || "ro",
  basis: localStorage.getItem("alarm_basis") || "units",
  tab: "l0",
  factory: null,
  focusFamily: localStorage.getItem("alarm_family") || "",
  filter: {},          // {colour, substate, factory, family, reorder_only, q}
  meta: null,
  ribbonOpen: localStorage.getItem("alarm_ribbon") !== "0",
};

const COLOURS = { green:"#2E9E5B", orange:"#E8A33D", red:"#D14343",
                  blue:"#2F72C4", grey:"#8A8F98", black:"#3A3F47" };
const NEUTRAL = "#252A2E";
const ORDER = ["red","orange","green","blue","grey","black"];

const T = (k) => (window.I18N[S.lang] || window.I18N.ro)[k] ?? k;
const SEGL = (c) => (window.SEG[S.lang] || window.SEG.ro)[c] ?? c;
const SUBL = (c) => (window.SUB[S.lang] || window.SUB.ro)[c] ?? c;
const fpFilter = () => (S.focusFamily ? { family: S.focusFamily } : {});
const facName = (f) => (f === "NEATRIBUIT" ? T("unattributed") : f);
const tpl = (k, vars) => String(T(k)).replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? "");

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

// ------------------------------------------------------------------ format --
const loc = () => (S.lang === "ro" ? "ro-RO" : "en-GB");
const n0 = (v) => (v == null || !isFinite(v)) ? "—" : new Intl.NumberFormat(loc(), {maximumFractionDigits:0}).format(v);
const n1 = (v) => (v == null || !isFinite(v)) ? "—" : new Intl.NumberFormat(loc(), {minimumFractionDigits:1, maximumFractionDigits:1}).format(v);
const lei = (v) => (v == null || !isFinite(v)) ? "—" : n0(v) + " lei";
const kLei = (v) => {
  if (v == null || !isFinite(v)) return "—";
  if (Math.abs(v) >= 1e6) return n1(v/1e6) + "M lei";
  if (Math.abs(v) >= 1e4) return n0(v/1e3) + "k lei";
  return n0(v) + " lei";
};
const pct = (v) => (v == null || !isFinite(v)) ? "—" : n1(v) + "%";
const mos = (v) => (v == null || !isFinite(v)) ? "∞" : n1(v);
const byBasis = (o) => S.basis === "units" ? (o.units ?? 0) : (o.value ?? 0);
const fmtBasis = (v) => S.basis === "units" ? n0(v) : kLei(v);

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " → " + r.status);
  return r.json();
}

function qs(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "" && v !== false) p.set(k, v);
  });
  const s = p.toString();
  return s ? "?" + s : "";
}

function exportUrl(params, level) {
  return "/api/export" + qs({ ...params, level });
}

// ------------------------------------------------------------------ chrome --
function renderChrome() {
  document.documentElement.lang = S.lang;
  $("brandSub").textContent = T("brand_sub");
  $("tabs").setAttribute("aria-label", T("nav_main"));
  $("railLegend").setAttribute("aria-label", T("state_legend"));

  const groups = [
    ["nav_decision", [["l0","tab_l0","01"],["l1","tab_l1","02"],["l2","tab_l2","03"]]],
    ["nav_control", [["check","tab_check","04"],["lt","tab_lt","05"],["mail","tab_mail","06"]]],
  ];
  $("tabs").innerHTML = groups.map(([label, tabs]) => `<div class="nav-group">
    <div class="nav-label">${esc(T(label))}</div>
    ${tabs.map(([id,k,n]) => `<button type="button" data-tab="${id}" class="${S.tab===id?"on":""}">
      <span class="tab-index">${n}</span><span>${esc(T(k))}</span></button>`).join("")}
  </div>`).join("");
  $("tabs").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => go(b.dataset.tab)));

  $("railLegend").innerHTML = `<div class="rail-legend-title">${esc(T("state_legend"))}</div>` +
    ORDER.slice(0, 5).map((c) => `<div class="rail-state" style="--state:${COLOURS[c]}">
      <i></i><span>${esc(SEGL(c))}</span></div>`).join("");
  $("basisLabel").textContent = T("basis_label");
  $("langLabel").textContent = T("lang_label");

  $("basisToggle").innerHTML = [["units","by_units"],["value","by_value"]].map(([v,k]) =>
    `<button data-basis="${v}" class="${S.basis===v?"on":""}">${esc(T(k))}</button>`).join("");
  $("basisToggle").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => { S.basis = b.dataset.basis;
      localStorage.setItem("alarm_basis", S.basis); renderChrome(); render(); }));

  $("langToggle").innerHTML = ["ro","en"].map((v) =>
    `<button data-lang="${v}" class="${S.lang===v?"on":""}">${v.toUpperCase()}</button>`).join("");
  $("langToggle").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => { S.lang = b.dataset.lang;
      localStorage.setItem("alarm_lang", S.lang); renderChrome(); renderRibbon(); render(); }));

  const tabKey = { l0:"tab_l0", l1:"tab_l1", l2:"tab_l2", check:"tab_check", lt:"tab_lt", mail:"tab_mail" };
  const decisionTab = ["l0","l1","l2"].includes(S.tab);
  $("workEyebrow").textContent = T(decisionTab ? "work_decision" : "work_control");
  $("workTitle").textContent = T(tabKey[S.tab]);
  $("workMeta").innerHTML = S.meta ? [
    `${esc(T("as_of_short"))} <b>${esc(S.meta.as_of)}</b>`,
    `<b>${S.meta.coverage.stores_at_as_of.length}</b> ${esc(T("stores_short"))}`,
  ].map((x) => `<span>${x}</span>`).join("") : "";
  $("ribbonX").title = S.lang === "ro" ? "Ascunde nota despre date" : "Hide the data note";
  $("drawerClose").setAttribute("aria-label", T("drawer_close"));
}

function renderRibbon() {
  if (!S.meta) return;
  $("ribbon").classList.toggle("hidden", !S.ribbonOpen);
  $("ribbonT").textContent = T("ribbon_t");
  $("ribbonBody").innerHTML = tpl("ribbon", {
    as_of: S.meta.as_of,
    lt: S.meta.config.replenishment.default_lead_time_days,
  });
}

function renderFoot() {
  if (!S.meta) return;
  const c = S.meta.coverage;
  $("foot").innerHTML = [
    `Alarmă V1 · ${esc(S.meta.category["label_" + S.lang] || S.meta.category.label_ro)}`,
    `${S.lang==="ro"?"fotografie":"photograph"}: ${S.meta.as_of}`,
    `${S.lang==="ro"?"depozit":"warehouse"}: ${esc(c.warehouse.period || "—")}`,
    `${S.lang==="ro"?"vânzări până la":"sales through"}: ${c.sales_week_max}`,
    `${S.lang==="ro"?"construit":"built"}: ${S.meta.built_at.slice(0,16).replace("T"," ")}`,
  ].map((x) => `<span>${x}</span>`).join("");
}

function go(tab, opts = {}) {
  S.tab = tab;
  if (opts.factory !== undefined) S.factory = opts.factory;
  if (opts.filter) S.filter = opts.filter;
  renderChrome();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindActivate(node, action) {
  node.addEventListener("click", action);
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  });
}

// -------------------------------------------------------------------- L0 ----
async function viewL0() {
  const [d, fams] = await Promise.all([
    get("/api/level0" + qs({ family: S.focusFamily, basis: S.basis })),
    get("/api/families" + qs({ limit: 120 })),
  ]);
  const segs = d.segments.filter((s) => s.units > 0 || s.value > 0);
  const order = (c) => ORDER.indexOf(c);
  segs.sort((a, b) => order(a.colour) - order(b.colour));
  const tot = d.totals;
  const green = segs.find((s) => s.colour === "green") || {units:0,value:0};
  const stuck = ["blue","grey"].reduce((a, c) => {
    const s = segs.find((x) => x.colour === c) || {units:0,value:0};
    return { units: a.units + s.units, value: a.value + s.value };
  }, {units:0,value:0});

  const v = $("view");
  v.className = "";
  v.innerHTML = `
    <div class="page-head">
      <div>
        <div class="page-kicker">${esc(T("l0_kicker"))} · ${esc(S.meta.as_of)}</div>
        <h1>${esc(T("l0_title"))}</h1>
        <div class="sub">${esc(T("l0_sub"))}</div>
      </div>
      <div class="spacer"></div>
      <button class="btn" id="expAll">↓ ${esc(T("export"))} — ${S.lang==="ro"?"tot":"everything"}</button>
    </div>

    <div class="scope-bar">
      <span class="scope-label">${esc(T("focus_lbl"))}</span>
      <select class="search" id="famFocus">
        <option value="">${esc(T("focus_all"))}</option>
        ${fams.rows.map((f) => `<option value="${esc(f.family)}" ${S.focusFamily===f.family?"selected":""}>${esc(f.family)} — ${n0(f.units)} ${esc(T("u"))} · ${f.skus} ${esc(T("seg_skus"))}</option>`).join("")}
      </select>
      ${S.focusFamily ? `<span class="scope-note">${esc(T("focus_note"))}</span>` : ""}
    </div>

    <div class="decision-grid">
      <div class="decision-card reorder click" id="kReorder" role="button" tabindex="0">
        <div class="decision-label">${esc(T("k_reorder"))}</div>
        <div class="decision-value">${S.basis === "units"
          ? `${n0(d.reorder_total.qty)} <span class="decision-unit">${esc(T("u"))}</span>`
          : kLei(d.reorder_total.value)}</div>
        <div class="decision-secondary">${S.basis === "units"
          ? `<b>${kLei(d.reorder_total.value)}</b> · ${d.reorder_total.skus} ${esc(T("skus"))}`
          : `${d.reorder_total.skus} ${esc(T("skus"))} · ${esc(T("l0_qty_units_view"))}`}</div>
        <div class="decision-note">${esc(T("l0_order_action"))}</div><span class="decision-arrow" aria-hidden="true">→</span>
      </div>
      <div class="decision-card stuck" id="kStuck">
        <div class="decision-label">${esc(T("k_stuck"))}</div>
        <div class="decision-value">${pct(byBasis(stuck) / byBasis(tot) * 100)}</div>
        <div class="decision-secondary">${S.basis === "units"
          ? `${n0(stuck.units)} ${esc(T("u"))} · <b>${kLei(stuck.value)}</b>`
          : `${kLei(stuck.value)} · <b>${n0(stuck.units)} ${esc(T("u"))}</b>`}</div>
        <div class="decision-links"><span>${esc(T("l0_stuck_action"))}:</span>
          <button type="button" id="kBlue">${esc(SEGL("blue"))} →</button>
          <button type="button" id="kGrey">${esc(SEGL("grey"))} →</button>
        </div>
      </div>
    </div>

    <div class="inventory-strip" aria-label="${esc(T("l0_inventory_t"))}">
      <div class="inventory-stat"><div class="k">${esc(T("k_units"))}</div><div class="v">${n0(tot.units)}</div>
        <div class="s">${tot.skus_with_stock} ${esc(T("skus"))}</div></div>
      <div class="inventory-stat"><div class="k">${esc(T("k_value"))}</div><div class="v">${kLei(tot.value)}</div>
        <div class="s">${S.meta.config.money.basis === "cost" ? (S.lang==="ro"?"cost de achiziție":"acquisition cost") : ""}</div></div>
      <div class="inventory-stat click" id="kGreen" role="button" tabindex="0"><div class="k">${esc(T("k_green"))}</div>
        <div class="v" style="color:var(--green)">${pct(byBasis(green) / byBasis(tot) * 100)}</div>
        <div class="s">${esc(T("k_green_s"))}</div></div>
      <div class="inventory-stat"><div class="k">${esc(T("k_factories"))}</div><div class="v">${n0(tot.factories)}</div>
        <div class="s">${n0(tot.skus)} ${esc(T("skus"))} ${S.lang==="ro"?"analizate":"analysed"}</div></div>
    </div>

    <div class="section-grid">
      <div class="card feature">
        <div class="card-head"><div class="grow">
          <h2><span class="section-number">01</span>${esc(T("l0_status_t"))}</h2>
          <div class="hint">${esc(T("l0_status_h"))}</div>
        </div></div>
        <div id="statusLedger"></div>
        <div class="substate-links" id="substateLinks"></div>
      </div>

      <div class="card feature">
        <div class="card-head"><div class="grow">
          <h2><span class="section-number">02</span>${esc(T("top_reorder_t"))}</h2>
          <div class="hint">${esc(T("top_reorder_h"))}</div>
        </div>
        <button class="btn" id="expRe">↓ ${esc(T("export"))}</button></div>
        <div id="chReorder"></div>
      </div>
    </div>

    <div class="page-section-label"><span>${esc(T("l0_context_t"))}</span></div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><div class="grow">
          <h2>${esc(T("top_stock_t"))}</h2>
          <div class="hint">${esc(T("top_stock_h"))}</div>
        </div></div>
        <div id="chStock"></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="grow">
          <h2>${esc(T("skucount_t"))}</h2>
          <div class="hint">${esc(T("skucount_h"))}</div>
        </div></div>
        <div id="chSku"></div>
      </div>
    </div>

    <div class="card" style="margin-top:12px">
        <div class="card-head"><div class="grow">
          <h2>${esc(T("unmapped_t"))}</h2>
          <div class="hint">${esc(T("unmapped_h"))}</div>
        </div></div>
        <div id="unmapped"></div>
    </div>
  `;

  // One aligned ledger is easier to compare than slices in a donut. Both
  // measures stay visible; the basis toggle only determines bar length.
  const ledgerRows = segs.map((s) => ({
    ...s,
    label: SEGL(s.colour),
    subLabel: (s.substates || []).filter((x) => x.units > 0 || x.skus > 0)
      .map((x) => SUBL(x.substate)).join(" · "),
    skuLabel: `${n0(s.skus)} ${T("seg_skus")}`,
  }));
  drawStatusLedger($("statusLedger"), ledgerRows, {
    colours: COLOURS,
    get: byBasis,
    fmt: (s) => S.basis === "units" ? `${n0(s.units)} ${T("u")}` : kLei(s.value),
    secondary: (s) => S.basis === "units" ? kLei(s.value) : `${n0(s.units)} ${T("u")}`,
    share: (s) => pct(byBasis(s) / (byBasis(tot) || 1) * 100),
    headers: [T("status_col"), T("status_selected"), T("status_other"), T("skus")],
    onClick: (s) => go("l2", { filter: { ...fpFilter(), colour: s.colour } }),
  });

  // Preserve direct sub-state drill-down without making it compete with the
  // main status rows.
  const totU = tot.units || 1, totV = tot.value || 1;
  const substateRows = segs.flatMap((s) => (s.substates || [])
    .filter((x) => x.units > 0 || x.skus > 0)
    .map((x) => ({ ...x, colour: s.colour })));
  $("substateLinks").innerHTML = substateRows.length ?
    `<span>${esc(T("l0_substates"))}:</span>` + substateRows.map((x) =>
      `<button type="button" data-sub="${esc(x.substate)}"><i style="--state:${COLOURS[x.colour]}"></i>${esc(SUBL(x.substate))}</button>`).join("") : "";
  $("substateLinks").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => go("l2", { filter: { ...fpFilter(), substate: b.dataset.sub } })));

  // top factories by proposed reorder + how well they sell
  const re = d.top_reorder;
  drawFactoryQueue($("chReorder"), re.rows.map((r) => ({
    label: facName(r.factory),
    value: S.basis === "units" ? r.reorder_qty : r.reorder_value,
    colour: NEUTRAL,
    secondary: `${n0(r.moving_pct)}% ✓`,
    title: `${r.factory}: ${n0(r.reorder_qty)} ${T("units")} · ${lei(r.reorder_value)} · ` +
           `${n0(r.moving_pct)}% ${T("l1_moving")}`,
    factory: r.factory,
  })), {
    fmt: fmtBasis,
    onClick: (r) => go("l1", { factory: r.factory }),
    note: tpl("coverage_re", { n: re.rows.length, total: re.n_total, pct: n0(re.coverage.pct) }) +
      ` &nbsp;·&nbsp; ${S.lang==="ro"
        ? "Numărul din dreapta = cât din marfa fabricii s-a vândut în ultimele 90 de zile."
        : "The number on the right = how much of that factory's stock sold in the last 90 days."}`,
  });

  // active vs dead
  const st = d.top_stock;
  drawStackedHBar($("chStock"), st.rows.map((r) => ({
    label: facName(r.factory),
    total: S.basis === "units" ? r.units : r.value,
    secondary: `${n1(r.dead_pct)}% ${S.lang==="ro"?"mort":"dead"}`,
    parts: S.basis === "units"
      ? [{ key: T("c_active"), value: r.units - r.dead_units, colour: COLOURS.green },
         { key: T("c_dead"),   value: r.dead_units, colour: COLOURS.grey }]
      : [{ key: T("c_active"), value: r.value - r.dead_value, colour: COLOURS.green },
         { key: T("c_dead"),   value: r.dead_value, colour: COLOURS.grey }],
    factory: r.factory,
  })), {
    fmt: fmtBasis,
    onClick: (r) => go("l1", { factory: r.factory }),
    note: tpl("coverage", { n: st.rows.length, total: st.n_total, pct: n0(st.coverage.pct) }),
  });

  // SKU counts
  drawHBar($("chSku"), segs.map((s) => ({
    label: SEGL(s.colour), value: s.skus, colour: COLOURS[s.colour],
    secondary: `${pct(s.units / totU * 100)} ${S.lang==="ro"?"din buc.":"of units"}`,
    colourKey: s.colour,
  })), {
    fmt: (v) => `${n0(v)} ${T("seg_skus")}`,
    onClick: (r) => go("l2", { filter: { colour: segs.find((s) => SEGL(s.colour) === r.label).colour } }),
    labelWidth: 150,
    note: S.lang === "ro"
      ? `Total <b>${n0(tot.skus)}</b> coduri în fotografie, din care <b>${n0(tot.skus_with_stock)}</b> au stoc.`
      : `<b>${n0(tot.skus)}</b> codes in the photograph, <b>${n0(tot.skus_with_stock)}</b> of them holding stock.`,
  });

  // unmapped warehouse residual
  const um = S.meta.unmapped;
  const bl = { bath_mats: S.lang==="ro"?"covorașe de baie":"bath mats",
               broadloom_and_grass: S.lang==="ro"?"mochetă / gazon / rulouri":"broadloom / grass / rolls",
               accessories: S.lang==="ro"?"accesorii (adeziv, clips, etichete)":"accessories (adhesive, clips, labels)",
               stair_treads: S.lang==="ro"?"trepte":"stair treads",
               rugs_no_code_match: S.lang==="ro"?"covoare fără potrivire de cod":"rugs with no code match",
               other: S.lang==="ro"?"altele":"other" };
  drawHBar($("unmapped"), (um.buckets || []).map((b) => ({
    label: bl[b.bucket] || b.bucket,
    value: S.basis === "units" ? b.units : b.value,
    colour: "#b9c0c9",
    secondary: `${b.lines} ${S.lang==="ro"?"linii":"lines"}`,
  })), {
    fmt: fmtBasis, labelWidth: 240,
    note: (S.lang === "ro"
      ? `Am legat <b>${n0(S.meta.coverage.warehouse.unit_match_pct)}%</b> din unitățile de depozit și <b>${n0(S.meta.coverage.warehouse.value_match_pct)}%</b> din lei la un cod SKU. Nelegat: <b>${n0(um.units)}</b> buc. / <b>${kLei(um.value)}</b>. <b>Cererea concretă:</b> exportul de depozit cu COD ARTICOL, nu doar denumire.`
      : `We tied <b>${n0(S.meta.coverage.warehouse.unit_match_pct)}%</b> of warehouse units and <b>${n0(S.meta.coverage.warehouse.value_match_pct)}%</b> of lei to a SKU code. Unmapped: <b>${n0(um.units)}</b> units / <b>${kLei(um.value)}</b>. <b>The concrete ask:</b> the warehouse export keyed on COD ARTICOL, not just the name.`),
  });
  if (S.focusFamily) {
    const d2 = document.createElement("div");
    d2.className = "coverage-note";
    d2.innerHTML = S.lang === "ro"
      ? "Blocul acesta e <b>global</b> — nu poate fi filtrat pe gamă, pentru că marfa nemapată nu are cod, deci nici gamă."
      : "This block is <b>global</b> — it cannot be filtered by family, because unmapped goods have no code and therefore no family.";
    $("unmapped").appendChild(d2);
  }

  $("famFocus").onchange = (e) => {
    S.focusFamily = e.target.value;
    localStorage.setItem("alarm_family", S.focusFamily);
    render();
  };
  const fp = S.focusFamily ? { family: S.focusFamily } : {};
  $("expAll").onclick = () => (window.location = exportUrl(fp, "nivel0"));
  $("expRe").onclick = () => (window.location = exportUrl({ ...fp, reorder_only: true }, "nivel0"));
  $("kBlue").onclick = () => go("l2", { filter: { ...fpFilter(), colour: "blue" } });
  $("kGrey").onclick = () => go("l2", { filter: { ...fpFilter(), colour: "grey" } });
  bindActivate($("kGreen"), () => go("l2", { filter: { ...fpFilter(), colour: "green" } }));
  bindActivate($("kReorder"), () => go("l2", { filter: { ...fpFilter(), reorder_only: true } }));
}

// -------------------------------------------------------------------- L1 ----
async function viewL1() {
  if (!S.factory) {
    const d = await get("/api/level0" + qs({ basis: S.basis }));
    const v = $("view"); v.className = "";
    v.innerHTML = `<div class="page-head"><div><h1>${esc(T("l1_title"))}</h1>
      <div class="sub">${S.lang==="ro"?"Alege o fabrică.":"Pick a factory."}</div></div></div>
      <div class="card"><div id="pick"></div></div>`;
    drawHBar($("pick"), d.top_stock.rows.map((r) => ({
      label: facName(r.factory), value: S.basis === "units" ? r.units : r.value,
      colour: NEUTRAL, factory: r.factory,
      secondary: `${n1(r.dead_pct)}% ${S.lang==="ro"?"mort":"dead"}`,
    })), { fmt: fmtBasis, onClick: (r) => go("l1", { factory: r.factory }) });
    return;
  }

  const d = await get(`/api/factory/${encodeURIComponent(S.factory)}` + qs({ basis: S.basis }));
  const h = d.headline;
  const v = $("view"); v.className = "";

  v.innerHTML = `
    <div class="crumb">
      <button data-go="l0">${esc(T("tab_l0"))}</button><span>›</span><span>${esc(facName(d.factory))}</span>
    </div>
    <div class="page-head">
      <div>
        <div class="page-kicker">${esc(T("l1_kicker"))}</div>
        <h1>${esc(facName(d.factory))}</h1>
        <div class="sub">${S.lang==="ro"?"Locul":"Rank"} ${h.rank_by_units}/${h.n_factories} ${S.lang==="ro"?"după volum":"by volume"} ·
          ${pct(h.share_of_all_units)} ${S.lang==="ro"?"din bucăți":"of units"} ·
          ${pct(h.share_of_all_value)} ${S.lang==="ro"?"din bani":"of money"}</div>
      </div>
      <div class="spacer"></div>
      <button class="btn primary" id="expOrder">↓ ${esc(T("export"))} — ${S.lang==="ro"?"comanda":"the order"}</button>
      <button class="btn" id="expAllF">↓ ${esc(T("export"))} — ${S.lang==="ro"?"tot stocul":"all stock"}</button>
    </div>

    <div class="kpis">
      <div class="kpi order"><div class="k">${esc(T("l1_order_summary"))}</div><div class="v">${n0(h.reorder_qty)} ${esc(T("u"))}</div>
        <div class="s">${kLei(h.reorder_value)} · ${h.reorder_skus} ${esc(T("skus"))}</div></div>
      <div class="kpi"><div class="k">${S.lang==="ro"?"Se vinde bine":"Sells well"}</div>
        <div class="v" style="color:var(--green)">${n0(h.moving_pct)}%</div>
        <div class="s">${esc(T("l1_moving"))}</div></div>
      <div class="kpi"><div class="k">${esc(T("k_units"))}</div><div class="v">${n0(h.units)}</div>
        <div class="s">${h.skus} ${esc(T("skus"))} · ${h.families} ${S.lang==="ro"?"game":"families"}</div></div>
      <div class="kpi"><div class="k">${esc(T("k_value"))}</div><div class="v money">${kLei(h.value)}</div><div class="s"></div></div>
      <div class="kpi"><div class="k">${esc(T("c_lt"))}</div><div class="v">${h.lead_time_days}</div>
        <div class="s"><span class="tag assumed">${esc(T("assumed"))}</span></div></div>
    </div>

    <div class="card feature">
      <div class="card-head"><div class="grow">
        <h2><span class="section-number">01</span>${esc(T("l1_order_t"))}</h2>
        <div class="hint">${esc(T("l1_order_h"))}</div>
      </div>
      <button class="btn" id="expOrder2">↓ ${esc(T("export"))}</button></div>
      <div class="tbl-wrap"><table class="data" id="orderTbl"></table></div>
      <div class="coverage-note" id="orderNote"></div>
    </div>

    <div class="grid g2" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><div class="grow"><h2>${esc(T("l1_fam_t"))}</h2>
          <div class="hint">${esc(T("l1_fam_h"))}</div></div></div>
        <div id="chFam"></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="grow"><h2>${esc(T("l1_dead_t"))}</h2>
          <div class="hint">${esc(T("l1_dead_h"))}</div></div>
          <button class="btn" id="expDead">↓ ${esc(T("export"))}</button></div>
        <div id="chDead"></div>
      </div>
    </div>

    <div class="grid g2" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><div class="grow"><h2>${esc(T("l1_worst_t"))}</h2>
          <div class="hint">${esc(T("l1_worst_h"))}</div></div></div>
        <div class="tbl-wrap"><table class="data" id="worstTbl"></table></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="grow"><h2>${esc(T("l1_width_t"))}</h2>
          <div class="hint">${esc(T("l1_width_h"))}</div></div></div>
        <div id="chWidth"></div>
      </div>
    </div>
  `;

  v.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));

  // --- the order list, first on the page (this is the payoff) ---------------
  const oc = [
    ["sku", T("c_sku"), "sku"], ["family", T("c_family")], ["width_cm", T("c_w"), "num"],
    ["stock_units", T("c_stock"), "num"], ["months_of_supply", T("c_mos"), "num"],
    ["rate_mo", T("c_rate"), "num"], ["suggested_qty", T("c_qty"), "num"],
    ["suggested_value", T("c_qtyv"), "num"], ["criticality", T("c_crit")],
    ["action", T("l1_open_line")],
  ];
  $("orderTbl").innerHTML =
    `<thead><tr>${oc.map(([, l, c]) => `<th class="${c==="num"?"num":""}">${esc(l)}</th>`).join("")}</tr></thead>` +
    `<tbody>${d.reorder.map((r) => `<tr class="row" data-sku="${esc(r.sku)}">
      <td class="sku"><span class="stripe" style="background:${COLOURS[r.colour]}"></span>${esc(r.sku)}</td>
      <td class="muted">${esc(r.family || "—")}</td>
      <td class="num muted">${r.width_cm ? n0(r.width_cm) : "—"}</td>
      <td class="num">${n0(r.stock_units)}</td>
      <td class="num">${mos(r.months_of_supply)}</td>
      <td class="num muted">${n1(r.rate_mo)}</td>
      <td class="num"><b>${n0(r.suggested_qty)}</b></td>
      <td class="num muted">${kLei(r.suggested_value)}</td>
      <td><span class="pill ${esc(r.criticality)}">${esc(r.criticality)}</span></td>
      <td class="row-arrow" aria-label="${esc(T("l1_open_line"))}">→</td>
    </tr>`).join("")}</tbody>`;
  $("orderTbl").querySelectorAll("tr.row").forEach((tr) =>
    tr.addEventListener("click", () => openSku(tr.dataset.sku)));
  $("orderNote").innerHTML = S.lang === "ro"
    ? `Primele <b>${d.reorder.length}</b> din <b>${d.reorder_n_total}</b> articole cu propunere. Cantitățile sunt o bază — exportul are un multiplicator ca să le scalezi uniform la minimul fabricii.`
    : `Top <b>${d.reorder.length}</b> of <b>${d.reorder_n_total}</b> articles with a proposal. Quantities are a base — the export carries a multiplier so you can scale them uniformly to the factory minimum.`;

  // --- families by volume + health ------------------------------------------
  drawStackedHBar($("chFam"), d.families.map((f) => ({
    label: f.family,
    total: f.total,
    parts: ORDER.map((c) => ({ key: SEGL(c), value: f[c] || 0, colour: COLOURS[c] })),
    family: f.family,
  })), {
    fmt: fmtBasis,
    onClick: (r) => go("l2", { filter: { factory: S.factory, family: r.family } }),
    note: tpl("coverage", { n: d.families.length, total: d.families_n_total,
      pct: n0(d.families.reduce((a, x) => a + x.total, 0) / (d.families_measure_total || 1) * 100) }),
  });

  // --- dead by family, split by product state -------------------------------
  drawStackedHBar($("chDead"), d.dead_by_family.map((f) => ({
    label: f.family,
    total: S.basis === "units" ? f.units : f.value,
    secondary: S.basis === "units" ? kLei(f.value) : `${n0(f.units)} ${T("u")}`,
    parts: S.basis === "units"
      ? [{ key: S.lang==="ro"?"produs activ":"product active", value: f.dead_active_units, colour: COLOURS.grey },
         { key: "phase-out", value: f.dead_phaseout_units, colour: COLOURS.grey, pattern: true }]
      // value mode: the active/phase-out split is only computed in units, so show
      // one honest total rather than a split scaled by the wrong measure
      : [{ key: T("c_dead"), value: f.value, colour: COLOURS.grey }],
    family: f.family,
  })), {
    fmt: fmtBasis,
    onClick: (r) => go("l2", { filter: { factory: S.factory, family: r.family, colour: "grey" } }),
    note: S.lang === "ro"
      ? `Starea produsului este un <b>proxy euristic</b>, nu exportul real — vezi <b>Verificare</b>. Fără starea reală, tot ce e gri arată ca o alarmă.`
      : `Product state here is a <b>heuristic proxy</b>, not the real export — see <b>Check & limits</b>. Without the real state, everything grey looks like an alarm.`,
  });

  // --- worst families --------------------------------------------------------
  $("worstTbl").innerHTML =
    `<thead><tr><th>${esc(T("c_family"))}</th><th class="num">${esc(T("c_stock"))}</th>
      <th class="num">${esc(T("c_rot"))}</th><th class="num">${esc(T("c_pct_dead"))}</th>
      <th class="num">${esc(T("c_trapped"))}</th></tr></thead>` +
    `<tbody>${d.worst.map((r) => `<tr class="row" data-family="${esc(r.family)}">
      <td>${esc(r.family)}</td>
      <td class="num">${n0(r.units)}</td>
      <td class="num">${mos(r.rotation_months)}</td>
      <td class="num" style="color:${r.dead_pct > 50 ? "var(--red)" : "inherit"}">${n0(r.dead_pct)}%</td>
      <td class="num"><b>${kLei(r.trapped)}</b></td>
    </tr>`).join("")}</tbody>`;
  $("worstTbl").querySelectorAll("tr.row").forEach((tr) =>
    tr.addEventListener("click", () => go("l2", { filter: { factory: S.factory, family: tr.dataset.family } })));

  // --- width distribution ----------------------------------------------------
  drawVBar($("chWidth"), d.widths.slice(0, 12).map((w) => ({
    label: `${n0(w.width_cm)}`, value: S.basis === "units" ? w.units : w.value,
    secondary: `${w.skus} ${T("seg_skus")}`, colour: NEUTRAL, width: w.width_cm,
  })), { fmt: fmtBasis });

  const p = { factory: S.factory };
  $("expOrder").onclick = $("expOrder2").onclick = () =>
    (window.location = exportUrl({ ...p, reorder_only: true }, "nivel1"));
  $("expAllF").onclick = () => (window.location = exportUrl(p, "nivel1"));
  $("expDead").onclick = () => (window.location = exportUrl({ ...p, colour: "grey" }, "nivel1"));
}

// -------------------------------------------------------------------- L2 ----
async function viewL2() {
  const f = S.filter;
  const d = await get("/api/skus" + qs({ ...f, limit: 500 }));
  const v = $("view"); v.className = "";

  const active = [];
  if (f.factory) active.push(["factory", f.factory]);
  if (f.family) active.push(["family", f.family]);
  if (f.colour) active.push(["colour", SEGL(f.colour)]);
  if (f.substate) active.push(["substate", SUBL(f.substate)]);
  if (f.reorder_only) active.push(["reorder_only", T("f_reorder")]);

  v.innerHTML = `
    <div class="crumb">
      <button data-go="l0">${esc(T("tab_l0"))}</button>
      ${f.factory ? `<span>›</span><button data-gofac="${esc(f.factory)}">${esc(facName(f.factory))}</button>` : ""}
      <span>›</span><span>${esc(T("l2_title"))}</span>
    </div>
    <div class="page-head">
      <div><div class="page-kicker">${esc(T("l2_kicker"))}</div><h1>${esc(T("l2_title"))}</h1><div class="sub">${esc(T("l2_sub"))}</div></div>
      <div class="spacer"></div>
      <button class="btn primary" id="expL2">↓ ${esc(T("export"))} (${n0(d.n_total)})</button>
    </div>

    <div class="filters filter-bar">
      <button class="chip ${!f.colour && !f.substate ? "on" : ""}" data-c="">${esc(T("f_all"))}</button>
      ${ORDER.map((c) => `<button class="chip ${f.colour===c?"on":""}" data-c="${c}">
        <span class="dot" style="background:${COLOURS[c]}"></span>${esc(SEGL(c))}</button>`).join("")}
      <button class="chip ${f.reorder_only?"on":""}" data-ro="1">${esc(T("f_reorder"))}</button>
      ${active.filter(([k]) => k==="factory"||k==="family").map(([k, val]) =>
        `<button class="chip on" data-clear="${k}">${esc(val)} ✕</button>`).join("")}
      <input class="search" id="q" placeholder="${esc(T("f_search"))}" value="${esc(f.q || "")}">
    </div>

    <div class="card table-card">
      <div class="tbl-wrap"><table class="data" id="l2tbl"></table></div>
      <div class="coverage-note">${S.lang==="ro"
        ? `Afișate <b>${n0(d.rows.length)}</b> din <b>${n0(d.n_total)}</b> articole. Exportul conține toate cele ${n0(d.n_total)}.`
        : `Showing <b>${n0(d.rows.length)}</b> of <b>${n0(d.n_total)}</b> articles. The export contains all ${n0(d.n_total)}.`}</div>
    </div>
  `;

  const cols = [
    ["sku", T("c_sku")], ["factory", T("c_factory")], ["family", T("c_family")],
    ["width_cm", T("c_w"), "num"], ["stock_units", T("c_stock"), "num"],
    ["stock_value", T("c_value"), "num"], ["rate_mo", T("c_rate"), "num"],
    ["months_of_supply", T("c_mos"), "num"], ["months_since_sale", T("c_idle"), "num"],
    ["suggested_qty", T("c_qty"), "num"], ["criticality", T("c_crit")],
    ["action", T("l2_row_action")],
  ];
  $("l2tbl").innerHTML =
    `<thead><tr>${cols.map(([, l, c]) => `<th class="${c==="num"?"num":""}">${esc(l)}</th>`).join("")}</tr></thead>` +
    `<tbody>${d.rows.map((r) => `<tr class="row" data-sku="${esc(r.sku)}">
      <td class="sku"><span class="stripe" style="background:${COLOURS[r.colour]}"></span>${esc(r.sku)}</td>
      <td class="muted">${esc(facName(r.factory))}</td>
      <td class="muted">${esc(r.family || "—")}</td>
      <td class="num muted">${r.width_cm ? n0(r.width_cm) : "—"}</td>
      <td class="num">${n0(r.stock_units)}</td>
      <td class="num muted">${kLei(r.stock_value)}</td>
      <td class="num muted">${n1(r.rate_mo)}</td>
      <td class="num">${mos(r.months_of_supply)}</td>
      <td class="num muted">${r.months_since_sale == null ? "—" : n1(r.months_since_sale)}</td>
      <td class="num">${r.suggested_qty ? `<b>${n0(r.suggested_qty)}</b>` : "—"}</td>
      <td>${r.criticality ? `<span class="pill ${esc(r.criticality)}">${esc(r.criticality)}</span>` : ""}</td>
      <td class="row-arrow" aria-label="${esc(T("l2_row_action"))}">→</td>
    </tr>`).join("")}</tbody>`;

  $("l2tbl").querySelectorAll("tr.row").forEach((tr) =>
    tr.addEventListener("click", () => openSku(tr.dataset.sku)));
  v.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
  v.querySelectorAll("[data-gofac]").forEach((b) =>
    b.addEventListener("click", () => go("l1", { factory: b.dataset.gofac })));
  v.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => {
    const nf = { ...S.filter }; delete nf.substate;
    if (b.dataset.c) nf.colour = b.dataset.c; else { delete nf.colour; }
    go("l2", { filter: nf });
  }));
  v.querySelectorAll("[data-ro]").forEach((b) => b.addEventListener("click", () => {
    const nf = { ...S.filter }; nf.reorder_only = !nf.reorder_only;
    if (!nf.reorder_only) delete nf.reorder_only;
    go("l2", { filter: nf });
  }));
  v.querySelectorAll("[data-clear]").forEach((b) => b.addEventListener("click", () => {
    const nf = { ...S.filter }; delete nf[b.dataset.clear]; go("l2", { filter: nf });
  }));
  const q = $("q");
  let tmr;
  q.addEventListener("input", () => {
    clearTimeout(tmr);
    tmr = setTimeout(() => { const nf = { ...S.filter, q: q.value }; go("l2", { filter: nf }); q.focus(); }, 320);
  });
  $("expL2").onclick = () => (window.location = exportUrl(S.filter, "nivel2"));
}

// ---------------------------------------------------------------- drawer ----
function whyHtml(why) {
  const map = {
    rate: (v) => [T("why_rate"), tpl("why_rate_v", { rate: n1(v.rate), u90: n0(v.u90), u365: n0(v.u365) })],
    cover: (v) => [T("why_cover"), tpl("why_cover_v", { stock: n0(v.stock), months: mos(v.months), days: v.days == null ? "∞" : n0(v.days) })],
    lead: (v) => [T("why_lead"), tpl("why_lead_v", { days: n0(v.days), review: n1(v.review) }) +
      `<span class="formula">${esc(v.source)}</span>`],
    safety: (v) => [T("why_safety"), tpl("why_safety_v", { ss: n0(v.ss), sl: v.sl }) +
      `<span class="formula">${tpl("why_safety_f", { z: v.z, sigma: n1(v.sigma) })}</span>`],
    target: (v) => [T("why_target"), tpl("why_target_v", { target: n0(v.target), stock: n0(v.stock), qty: n0(v.qty) })],
    slack: (v) => [T("why_slack"), tpl("why_slack_v", { days: n0(v.days) })],
    dead: (v) => [T("why_dead"), tpl("why_dead_v", { idle: v.idle_months == null ? "—" : n1(v.idle_months),
      value: n0(v.value), state: T("state_" + (v.state || "unknown")) })],
    over: (v) => [T("why_over"), tpl("why_over_v", { months: mos(v.months), excess: n0(v.excess_units), value: n0(v.excess_value) })],
  };
  return `<ul class="why-list">${(why || []).map((p) => {
    const fn = map[p.k]; if (!fn) return "";
    const [k, val] = fn(p.v);
    return `<li><span class="wk">${esc(k)}</span><span class="wv">${val}</span></li>`;
  }).join("")}</ul>`;
}

function verdictKey(r) {
  const m = { red_out:"verdict_red_out", red_low:"verdict_red_low", orange_soon:"verdict_orange",
              green_healthy:"verdict_green", blue_slow:"verdict_blue", blue_extreme:"verdict_blue_x",
              grey_active:"verdict_grey_a", grey_phaseout:"verdict_grey_p", inactive:"verdict_black" };
  return m[r.substate] || "verdict_green";
}

async function openSku(sku) {
  $("scrim").classList.add("on");
  $("drawer").classList.add("on");
  $("drawer").setAttribute("aria-hidden", "false");
  $("drawerSku").textContent = sku;
  $("drawerName").textContent = "";
  $("drawerBody").innerHTML = `<div class="loading">…</div>`;
  const d = await get(`/api/sku/${encodeURIComponent(sku)}`);
  const r = d.row;
  $("drawerName").innerHTML =
    `${esc(r.denumire_articol || "")} <span class="muted">· ${esc(facName(r.factory))} · ${esc(r.family || "")}</span>`;

  const stores = d.per_store.filter((s) => s.units > 0);
  const maxStore = Math.max(...d.per_store.map((s) => s.units), 1);

  $("drawerBody").innerHTML = `
    <div class="verdict" style="--state:${COLOURS[r.colour]}"><span class="stripe" style="background:${COLOURS[r.colour]}"></span>
      <b>${esc(SEGL(r.colour))}</b> — ${esc(SUBL(r.substate))}<br>${esc(T(verdictKey(r)))}</div>

    <div class="mini">
      <div><div class="k">${esc(T("c_stock"))}</div><div class="v">${n0(r.stock_units)}</div></div>
      <div><div class="k">${esc(T("c_wh"))}</div><div class="v">${n0(r.wh_units)}</div></div>
      <div><div class="k">${esc(T("c_store"))}</div><div class="v">${n0(r.store_units)}</div></div>
      <div><div class="k">${esc(T("c_mos"))}</div><div class="v">${mos(r.months_of_supply)}</div></div>
      <div><div class="k">${esc(T("c_value"))}</div><div class="v">${kLei(r.stock_value)}</div></div>
      <div><div class="k">${esc(T("c_qty"))}</div><div class="v">${n0(r.suggested_qty)}</div></div>
    </div>

    <div class="section-t">${esc(T("why_t"))}</div>
    ${whyHtml(r.why)}

    <div class="section-t">${esc(T("d_perstore"))}</div>
    <table class="data"><tbody>${d.per_store.map((s) => `<tr>
      <td>${esc(s.store_code)}</td>
      <td style="width:60%"><div style="background:#eef1f5;border-radius:3px;height:12px">
        <div style="background:${COLOURS[r.colour]};height:12px;border-radius:3px;width:${Math.max(2, s.units / maxStore * 100)}%"></div></div></td>
      <td class="num">${n0(s.units)}</td></tr>`).join("")}
      <tr><td><b>${esc(T("c_wh"))}</b></td><td></td><td class="num"><b>${n0(r.wh_units)}</b></td></tr>
      </tbody></table>
    ${stores.length === 0 ? `<div class="coverage-note">${S.lang==="ro"?"Nimic în magazine — tot stocul e în depozit.":"Nothing in stores — all stock is in the warehouse."}</div>` : ""}

    <div class="section-t">${esc(T("d_family"))}</div>
    ${d.family_siblings.length ? `<table class="data">
      <thead><tr><th>${esc(T("c_sku"))}</th><th class="num">${esc(T("c_w"))}</th>
      <th class="num">${esc(T("c_stock"))}</th><th class="num">${esc(T("c_mos"))}</th>
      <th class="num">${esc(T("c_qty"))}</th></tr></thead>
      <tbody>${d.family_siblings.map((s) => `<tr class="row" data-sku="${esc(s.sku)}">
        <td class="sku"><span class="stripe" style="background:${COLOURS[s.colour]}"></span>${esc(s.sku)}</td>
        <td class="num">${s.width_cm ? n0(s.width_cm) : "—"}</td>
        <td class="num">${n0(s.stock_units)}</td>
        <td class="num">${mos(s.months_of_supply)}</td>
        <td class="num">${s.suggested_qty ? n0(s.suggested_qty) : "—"}</td></tr>`).join("")}</tbody></table>
      <div class="coverage-note">${S.lang==="ro"
        ? "Fabrica nu-ți bagă în producție o singură lățime — comanda reală trebuie să acopere gama. De asta gama e aici."
        : "The factory will not run a single width — the real order has to cover the range. That is why the family sits here."}</div>`
      : `<div class="empty">${esc(T("d_nofam"))}</div>`}

    <div class="section-t">${S.lang==="ro"?"Surse și presupuneri":"Sources and assumptions"}</div>
    <ul class="why-list">
      <li><span class="wk">${esc(T("c_lt"))}</span><span class="wv">${n0(r.lead_time_days)} ${S.lang==="ro"?"zile":"days"}
        <span class="formula">${esc(r.lead_time_source)}</span></span></li>
      ${r.producer_entity ? `<li><span class="wk">${esc(T("d_entity"))}</span><span class="wv">${esc(r.producer_entity)}
        <span class="formula">FURNIZOR EXT · ${esc(r.factory_source)}</span></span></li>` : ""}
      <li><span class="wk">${esc(T("c_state"))}</span><span class="wv">${esc(T("state_" + (r.product_state || "unknown")))}
        <span class="formula">${esc(r.state_source)}</span></span></li>
      <li><span class="wk">${S.lang==="ro"?"cost unitar":"unit cost"}</span><span class="wv">${lei(r.unit_cost)}
        <span class="formula">${esc(r.cost_source)}</span></span></li>
      <li><span class="wk">${S.lang==="ro"?"rotație simplă":"simple rotation"}</span><span class="wv">
        ${mos(r.simple_rotation_months)} ${S.lang==="ro"?"luni (stoc ÷ vânzare 3 luni)":"months (stock ÷ 3-month sales)"}</span></li>
    </ul>
  `;
  $("drawerBody").querySelectorAll("tr.row").forEach((tr) =>
    tr.addEventListener("click", () => openSku(tr.dataset.sku)));
}

function closeDrawer() {
  $("scrim").classList.remove("on");
  $("drawer").classList.remove("on");
  $("drawer").setAttribute("aria-hidden", "true");
}

// ------------------------------------------------------------ check page ----
async function viewCheck() {
  const d = await get("/api/sanity");
  const m = S.meta;
  const v = $("view"); v.className = "";
  const rows = d.unit_vs_money.filter((r) => r.colour !== "black").map((r) => `<tr>
      <td><span class="sw" style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${COLOURS[r.colour]}"></span>
      &nbsp;${esc(SEGL(r.colour))}</td>
      <td class="num">${n1(r.unit_share)}%</td>
      <td class="num">${n1(r.value_share)}%</td>
      <td class="num" style="color:${Math.abs(r.gap_pp)>5?"var(--orange)":"var(--ink-3)"}">${r.gap_pp>0?"+":""}${n1(r.gap_pp)} pp</td>
      <td class="num muted">${kLei(r.value)}</td></tr>`).join("");

  const fac = d.by_factory.slice(0, 14).map((f) => `<tr>
    <td>${esc(facName(f.factory))}</td>
    <td class="num">${n0(f.units)}</td>
    <td class="num">${mos(f.simple_months)}</td>
    <td class="num">${mos(f.engine_months)}</td>
    <td class="num" style="color:${Math.abs(f.delta_pct||0)>25?"var(--orange)":"var(--ink-3)"}">${f.delta_pct==null?"—":(f.delta_pct>0?"+":"")+n0(f.delta_pct)+"%"}</td></tr>`).join("");

  const gaps = S.lang === "ro" ? [
    `<b>Timpii de livrare pe fabrică</b> — lipsesc complet. Folosim ${m.config.replenishment.default_lead_time_days} de zile peste tot. Sunt ~30 de numere; cu ele, ordinea de prioritate se schimbă real (livrare scurtă = coboară în listă, nu scade cantitatea).`,
    `<b>Starea produsului (in / out / phase-out)</b> — nu există în export. Am derivat un proxy euristic din comportamentul stocului: ${m.state_source_mix.HEURISTIC_PROXY || 0} coduri au o stare ghicită, ${m.state_source_mix.not_available || 0} rămân necunoscute. Fără starea reală, un produs în phase-out arată ca o alarmă deși treaba e făcută bine.`,
    `<b>Exportul de depozit e pe denumire, nu pe cod</b> — am legat ${n1(m.coverage.warehouse.unit_match_pct)}% din unități și ${n1(m.coverage.warehouse.value_match_pct)}% din lei. Restul (${n0(m.unmapped.units)} buc., ${kLei(m.unmapped.value)}) nu poate intra în analiză. Cererea: același export, cu COD ARTICOL.`,
    `<b>Stoc în tranzit</b> — nu-l avem deloc. Marfa deja comandată apare ca lipsă, deci unele propuneri sunt duble.`,
    `<b>Costul unitar</b> — ${m.cost_source_mix.warehouse_export || 0} coduri au cost real din exportul de depozit; ${m.cost_source_mix.assumed_pct_of_price || 0} folosesc ${Math.round(m.config.money.cost_fallback_ratio_on_price*100)}% din prețul mediu de vânzare ca aproximare; ${m.cost_source_mix.unknown || 0} nu au nicio valoare.`,
    `<b>Vânzări pe cod diferit</b> — nu avem tabela de corespondență. Marfa vândută sub alt cod citește zero vânzări.`,
    `<b>Consum intern / proiecte</b> — nu putem separa amenajările și proiectele HoReCa de cererea de retail.`,
  ] : [
    `<b>Factory lead times</b> — completely missing. We use ${m.config.replenishment.default_lead_time_days} days everywhere. It is ~30 numbers; with them the priority order genuinely changes (a short lead time demotes an item, it never shrinks the quantity).`,
    `<b>Product state (in / out / phase-out)</b> — not in the export. We derived a heuristic proxy from stock behaviour: ${m.state_source_mix.HEURISTIC_PROXY || 0} codes carry a guessed state, ${m.state_source_mix.not_available || 0} stay unknown. Without the real state a phase-out item looks like an alarm when the job was done right.`,
    `<b>The warehouse export is keyed on the name, not the code</b> — we tied ${n1(m.coverage.warehouse.unit_match_pct)}% of units and ${n1(m.coverage.warehouse.value_match_pct)}% of lei. The rest (${n0(m.unmapped.units)} units, ${kLei(m.unmapped.value)}) cannot enter the analysis. The ask: the same export, with COD ARTICOL.`,
    `<b>Stock in transit</b> — we do not have it at all. Goods already ordered read as missing, so some proposals double-count.`,
    `<b>Unit cost</b> — ${m.cost_source_mix.warehouse_export || 0} codes carry a real cost from the warehouse export; ${m.cost_source_mix.assumed_pct_of_price || 0} use ${Math.round(m.config.money.cost_fallback_ratio_on_price*100)}% of the average selling price as an approximation; ${m.cost_source_mix.unknown || 0} have no value at all.`,
    `<b>Cross-code sales</b> — no mapping table. Goods sold under a different code read as zero sales.`,
    `<b>Internal / project consumption</b> — we cannot separate store fit-outs and HoReCa projects from retail demand.`,
  ];

  const assum = S.lang === "ro" ? [
    `Fotografia e la <b>${m.as_of}</b>: ${m.config.as_of_note_ro}`,
    `Stoc = depozit (${esc(m.coverage.warehouse.period)}) + magazine (${m.coverage.stores_at_as_of.length} magazine).`,
    `Stoc mort = <b>zero vânzări în ${m.config.windows.dead_days} de zile</b>, cu stoc pe hârtie.`,
    `Ritm de vânzare = ${Math.round(m.config.velocity.short_weight*100)}% din ritmul pe 90 de zile + ${Math.round((1-m.config.velocity.short_weight)*100)}% din ritmul pe 12 luni.`,
    `Stoc de siguranță = z(${m.config.replenishment.service_level_z}) × σ lunar × √(livrare + ${m.config.replenishment.review_period_months} luni ciclu). <b>Formulă, niciodată introdusă de om.</b>`,
    `Bandă sănătoasă = între (livrare + ciclu) și ${m.config.replenishment.overstock_factor}× (livrare + ciclu) luni de acoperire. Peste asta = albastru; peste ${m.config.taxonomy.extreme_overstock_months} luni = albastru extrem.`,
    `Ciclu de comandă presupus: <b>${m.config.replenishment.review_period_months} luni</b> (${m.config.replenishment.review_period_source}).`,
    `Valoarea = ${m.config.money.basis}. ${m.config.money.basis_note_ro}`,
  ] : [
    `The photograph is as of <b>${m.as_of}</b>: ${m.config.as_of_note_en}`,
    `Stock = warehouse (${esc(m.coverage.warehouse.period)}) + stores (${m.coverage.stores_at_as_of.length} stores).`,
    `Dead stock = <b>zero sales in ${m.config.windows.dead_days} days</b>, with stock on the books.`,
    `Sales rate = ${Math.round(m.config.velocity.short_weight*100)}% of the 90-day rate + ${Math.round((1-m.config.velocity.short_weight)*100)}% of the 12-month rate.`,
    `Safety stock = z(${m.config.replenishment.service_level_z}) × monthly σ × √(lead + ${m.config.replenishment.review_period_months} months cycle). <b>A formula, never a human input.</b>`,
    `Healthy band = between (lead + cycle) and ${m.config.replenishment.overstock_factor}× (lead + cycle) months of cover. Above that = blue; above ${m.config.taxonomy.extreme_overstock_months} months = extreme blue.`,
    `Assumed order cycle: <b>${m.config.replenishment.review_period_months} months</b> (${m.config.replenishment.review_period_source}).`,
    `Value = ${m.config.money.basis}. ${m.config.money.basis_note_en}`,
  ];

  v.innerHTML = `
    <div class="page-head"><div><h1>${esc(T("chk_title"))}</h1>
      <div class="sub">${esc(T("chk_sub"))}</div></div>
      <div class="spacer"></div>
      <a class="btn" href="/api/cost-audit">↓ ${esc(T("cost_audit"))}</a></div>

    <div class="grid g2">
      <div class="card">
        <div class="card-head"><div class="grow"><h2>${esc(T("chk_uvm_t"))}</h2>
          <div class="hint">${esc(T("chk_uvm_h"))}</div></div></div>
        <table class="data">
          <thead><tr><th></th><th class="num">${esc(T("chk_uvm_u"))}</th>
            <th class="num">${esc(T("chk_uvm_v"))}</th><th class="num">${esc(T("chk_delta"))}</th>
            <th class="num">${esc(T("c_value"))}</th></tr></thead>
          <tbody>${rows}</tbody></table>
        <div class="coverage-note">${S.lang === "ro"
          ? `Baza: <b>${n0(d.ours.units)}</b> buc. / <b>${kLei(d.ours.value)}</b> / <b>${n0(d.ours.skus)}</b> coduri cu stoc, la ${m.as_of}. Totul din datele noastre.<br>
             Coloana „diferență” arată unde procentul pe bani nu urmează procentul pe bucăți. Acolo unde e pozitivă, marfa e mai scumpă decât media — aceleași bucăți blochează mai mulți bani.`
          : `Base: <b>${n0(d.ours.units)}</b> units / <b>${kLei(d.ours.value)}</b> / <b>${n0(d.ours.skus)}</b> codes holding stock, at ${m.as_of}. All from our own data.<br>
             The "difference" column shows where the money share does not follow the unit share. Where it is positive the goods are dearer than average — the same pieces tie up more money.`}</div>
      </div>

      <div class="card">
        <div class="card-head"><div class="grow"><h2>${esc(T("chk_rot_t"))}</h2>
          <div class="hint">${esc(T("chk_rot_h"))}</div></div></div>
        <div id="cmp"></div>
        <table class="data" style="margin-top:10px">
          <thead><tr><th>${esc(T("c_factory"))}</th><th class="num">${esc(T("c_stock"))}</th>
            <th class="num">${esc(T("chk_simple_c"))}</th><th class="num">${esc(T("chk_engine_c"))}</th>
            <th class="num">${esc(T("chk_delta"))}</th></tr></thead>
          <tbody>${fac}</tbody></table>
      </div>
    </div>

    <div class="grid g2" style="margin-top:14px">
      <div class="card">
        <h2>${esc(T("chk_gaps_t"))}</h2>
        <div class="hint">${S.lang==="ro"?"Fiecare punct de aici e o cerere concretă de date, nu o scuză.":"Every point here is a concrete data request, not an excuse."}</div>
        <ul class="why-list">${gaps.map((g) => `<li style="grid-template-columns:1fr"><span class="wv">${g}</span></li>`).join("")}</ul>
      </div>
      <div>
        <div class="card">
          <h2>${esc(T("chk_assum_t"))}</h2>
          <ul class="why-list">${assum.map((g) => `<li style="grid-template-columns:1fr"><span class="wv">${g}</span></li>`).join("")}</ul>
        </div>
        <div class="notice" style="margin-top:14px">
          <h3>${esc(T("chk_traps_t"))}</h3>
          <ul>
            <li>${S.lang==="ro"
              ? "<b>Vânzări pe cod diferit.</b> Marfa vândută către rețele externe sub alt cod citește zero vânzări aici. Un produs care se vinde foarte bine poate apărea gri. Nu am cum să corectez asta fără o tabelă de corespondență între coduri."
              : "<b>Cross-code sales.</b> Goods sold to external networks under a different code read as zero sales here. A strong seller can show up grey. This cannot be corrected without a code-mapping table."}</li>
            <li>${S.lang==="ro"
              ? "<b>Consum intern / proiecte.</b> Marfa consumată pentru amenajări de magazin sau proiecte HoReCa citește ca cerere de retail furibundă și poate genera propuneri de comandă false."
              : "<b>Internal / project consumption.</b> Stock consumed for store fit-outs or HoReCa projects reads as ferocious retail demand and can generate false order proposals."}</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  drawCompare($("cmp"),
    { label: T("chk_simple_c"), value: d.overall.simple_months || 0, colour: "#AAA59A" },
    { label: T("chk_engine_c"), value: d.overall.engine_months || 0, colour: NEUTRAL },
    { fmt: (x) => n1(x) + (S.lang==="ro" ? " luni" : " months") });
}

// -------------------------------------------------------- lead time page ----
async function viewLT() {
  const d = await get("/api/leadtimes");
  const v = $("view"); v.className = "";
  v.innerHTML = `
    <div class="page-head">
      <div><h1>${esc(T("lt_title"))}</h1><div class="sub">${esc(T("lt_sub"))}</div></div>
      <div class="spacer"></div>
      <span id="ltMsg" class="sub"></span>
      <button class="btn primary" id="ltSave">${esc(T("lt_save"))}</button>
    </div>
    <div class="card">
      <div class="tbl-wrap"><table class="data" id="ltTbl">
        <thead><tr><th>${esc(T("c_factory"))}</th><th class="num">${esc(T("c_stock"))}</th>
          <th class="num">${esc(T("skus"))}</th><th class="num">${esc(T("c_qty"))}</th>
          <th class="num">${esc(T("lt_days"))}</th><th>${esc(T("lt_source"))}</th></tr></thead>
        <tbody>${d.rows.map((r) => `<tr>
          <td>${esc(facName(r.factory))}</td>
          <td class="num">${n0(r.units)}</td>
          <td class="num muted">${n0(r.skus)}</td>
          <td class="num">${n0(r.reorder_qty)}</td>
          <td class="num"><input class="num lt" data-f="${esc(r.factory)}" type="number" min="1" max="400" value="${n0(r.lead_time_days)}"></td>
          <td class="muted" style="font-size:11.5px">${esc(r.lead_time_source)}</td>
        </tr>`).join("")}</tbody></table></div>
      <div class="coverage-note">${S.lang==="ro"
        ? "Exemplul tău: la o fabrică cu livrare de două săptămâni, o propunere de 2.200 de bucăți nu mai e pe locul 1 — <b>ai oricând timp</b>. Schimbă un număr aici și vezi lista de priorități rearanjându-se."
        : "Your own example: at a factory with a two-week lead time, a 2,200-unit proposal is no longer number 1 — <b>you always have time</b>. Change a number here and watch the priority list reshuffle."}</div>
    </div>`;

  v.querySelectorAll("input.lt").forEach((i) =>
    i.addEventListener("input", () => i.classList.add("edited")));

  $("ltSave").onclick = async () => {
    const rows = [...v.querySelectorAll("input.lt")].map((i) => ({
      factory: i.dataset.f,
      lead_time_days: Number(i.value),
      lead_time_source: i.classList.contains("edited") ? "ENTERED_IN_APP" : "ASSUMED_DEFAULT — replace with the real number from Tibi",
    }));
    $("ltSave").disabled = true;
    $("ltMsg").textContent = "…";
    await fetch("/api/leadtimes", { method: "POST", headers: {"Content-Type":"application/json"},
                                    body: JSON.stringify({ rows }) });
    S.meta = await get("/api/meta");
    $("ltMsg").textContent = T("lt_saved");
    $("ltSave").disabled = false;
    renderFoot();
  };
}

// -------------------------------------------------------------- mail page ---
async function viewMail() {
  const v = $("view"); v.className = "";
  const url = `/api/email?lang=${S.lang}&base_url=${encodeURIComponent(location.origin)}`;
  v.innerHTML = `
    <div class="page-head">
      <div><h1>${esc(T("mail_title"))}</h1><div class="sub">${esc(T("mail_sub"))}</div></div>
      <div class="spacer"></div>
      <span class="sub" id="mailMsg"></span>
      <button class="btn" id="mailCopy">${esc(T("mail_copy"))}</button>
      <a class="btn" href="${url}" target="_blank">${S.lang==="ro"?"Deschide separat":"Open standalone"}</a>
    </div>
    <iframe class="mail" src="${url}"></iframe>`;
  $("mailCopy").onclick = async () => {
    const html = await (await fetch(url)).text();
    await navigator.clipboard.writeText(html);
    $("mailMsg").textContent = T("mail_copied");
  };
}

// -------------------------------------------------------------------- boot --
async function render() {
  $("view").className = "loading";
  $("view").textContent = "…";
  try {
    if (S.tab === "l0") await viewL0();
    else if (S.tab === "l1") await viewL1();
    else if (S.tab === "l2") await viewL2();
    else if (S.tab === "check") await viewCheck();
    else if (S.tab === "lt") await viewLT();
    else if (S.tab === "mail") await viewMail();
  } catch (e) {
    $("view").className = "";
    $("view").innerHTML = `<div class="notice"><h3>Eroare</h3>${esc(e.message)}</div>`;
    console.error(e);
  }
}

async function boot() {
  S.meta = await get("/api/meta");
  $("drawer").setAttribute("aria-hidden", "true");
  renderChrome();
  renderRibbon();
  renderFoot();
  $("ribbonX").addEventListener("click", () => {
    S.ribbonOpen = false; localStorage.setItem("alarm_ribbon", "0"); renderRibbon();
  });
  $("scrim").addEventListener("click", closeDrawer);
  $("drawerClose").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
  await render();
}

boot();
})();
