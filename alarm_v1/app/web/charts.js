// Hand-built SVG charts. No chart library on purpose:
//  - zero external requests, so this runs in a meeting room with bad wifi
//  - every label, every coverage note and every click target is deliberate
//  - a library's default look is exactly the "generic AI dashboard" we were
//    warned about.

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  if (text !== undefined) n.textContent = text;
  return n;
}

function svg(w, h) {
  const s = el("svg", { class: "chart", viewBox: `0 0 ${w} ${h}`,
                        preserveAspectRatio: "xMinYMin meet" });
  return s;
}

function trunc(s, n) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ------------------------------------------------------------------ donut --
// value accessor lets the same chart show units or lei with one toggle.
window.drawDonut = function (host, segs, opts) {
  const { colours, fmt, centerValue, centerLabel, onClick, get } = opts;
  host.innerHTML = "";
  const W = 300, H = 300, cx = W / 2, cy = H / 2, R = 128, r = 78;
  const s = svg(W, H);
  const total = segs.reduce((a, x) => a + (get(x) || 0), 0) || 1;

  let angle = -Math.PI / 2;
  const gap = 0.012;
  segs.forEach((seg) => {
    const v = get(seg) || 0;
    if (v <= 0) return;
    const sweep = (v / total) * Math.PI * 2;
    const a0 = angle + gap / 2, a1 = angle + sweep - gap / 2;
    if (a1 > a0) {
      const large = sweep > Math.PI ? 1 : 0;
      const p = [
        `M ${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)}`,
        `A ${R} ${R} 0 ${large} 1 ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)}`,
        `L ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`,
        `A ${r} ${r} 0 ${large} 0 ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}`,
        "Z",
      ].join(" ");
      const path = el("path", { d: p, fill: colours[seg.colour], class: "donut-seg" });
      path.appendChild(el("title", {}, `${seg.label} — ${fmt(v)} (${(v / total * 100).toFixed(1)}%)`));
      if (onClick) path.addEventListener("click", () => onClick(seg));
      s.appendChild(path);

      // in-ring percentage for the segments large enough to carry one
      const pct = v / total * 100;
      if (pct >= 7) {
        const mid = (a0 + a1) / 2, rr = (R + r) / 2;
        s.appendChild(el("text", {
          x: cx + rr * Math.cos(mid), y: cy + rr * Math.sin(mid) + 4,
          "text-anchor": "middle", fill: "#fff",
          style: "font-size:12.5px;font-weight:700;pointer-events:none",
        }, `${pct.toFixed(0)}%`));
      }
    }
    angle += sweep;
  });

  s.appendChild(el("text", { x: cx, y: cy - 2, "text-anchor": "middle", class: "center-v" }, centerValue));
  s.appendChild(el("text", { x: cx, y: cy + 16, "text-anchor": "middle", class: "center-k" }, centerLabel));
  host.appendChild(s);
};

// ------------------------------------------------------------ horiz. bars --
// rows: [{label, value, colour?, note?, secondary?}]
window.drawHBar = function (host, rows, opts = {}) {
  const { fmt, colour = "#2F72C4", onClick, labelWidth = 168, note, barH = 20, gap = 11 } = opts;
  host.innerHTML = "";
  if (!rows.length) { host.innerHTML = `<div class="empty">—</div>`; return; }
  const W = 720, padR = 132;
  const H = rows.length * (barH + gap) + 8;
  const s = svg(W, H);
  const max = Math.max(...rows.map((r) => r.value || 0), 1);
  const trackW = W - labelWidth - padR;

  rows.forEach((r, i) => {
    const y = i * (barH + gap) + 4;
    const g = el("g", { class: onClick ? "hit" : null });
    g.appendChild(el("text", { x: labelWidth - 10, y: y + barH - 5, "text-anchor": "end", class: "lbl" },
                     trunc(r.label, 21)));
    g.appendChild(el("rect", { x: labelWidth, y, width: trackW, height: barH, rx: 4, fill: "#eef1f5" }));
    const w = Math.max(2, (r.value / max) * trackW);
    g.appendChild(el("rect", { x: labelWidth, y, width: w, height: barH, rx: 4,
                               fill: r.colour || colour, class: "bar" }));
    g.appendChild(el("text", { x: labelWidth + w + 8, y: y + barH - 5, class: "val" }, fmt(r.value)));
    if (r.secondary) {
      g.appendChild(el("text", { x: W - 2, y: y + barH - 5, "text-anchor": "end", class: "axis" }, r.secondary));
    }
    g.appendChild(el("title", {}, r.title || `${r.label}: ${fmt(r.value)}`));
    if (onClick) g.addEventListener("click", () => onClick(r));
    s.appendChild(g);
  });
  host.appendChild(s);
  if (note) {
    const d = document.createElement("div");
    d.className = "coverage-note";
    d.innerHTML = note;
    host.appendChild(d);
  }
};

// ------------------------------------------------------ stacked horizontal --
// rows: [{label, parts:[{key,value,colour,pattern?}], total, secondary?}]
window.drawStackedHBar = function (host, rows, opts = {}) {
  const { fmt, onClick, labelWidth = 168, note, barH = 20, gap = 11 } = opts;
  host.innerHTML = "";
  if (!rows.length) { host.innerHTML = `<div class="empty">—</div>`; return; }
  const W = 720, padR = 140;
  const H = rows.length * (barH + gap) + 8;
  const s = svg(W, H);

  // hatch pattern for "phase-out" — visually present but visibly different
  const defs = el("defs");
  const pat = el("pattern", { id: "hatch", width: 6, height: 6,
                              patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  pat.appendChild(el("rect", { width: 6, height: 6, fill: "#c9ced6" }));
  pat.appendChild(el("rect", { width: 2.4, height: 6, fill: "#8A8F98" }));
  defs.appendChild(pat);
  s.appendChild(defs);

  const max = Math.max(...rows.map((r) => r.total || 0), 1);
  const trackW = W - labelWidth - padR;

  rows.forEach((r, i) => {
    const y = i * (barH + gap) + 4;
    const g = el("g", { class: onClick ? "hit" : null });
    g.appendChild(el("text", { x: labelWidth - 10, y: y + barH - 5, "text-anchor": "end", class: "lbl" },
                     trunc(r.label, 21)));
    g.appendChild(el("rect", { x: labelWidth, y, width: trackW, height: barH, rx: 4, fill: "#f3f5f8" }));
    let x = labelWidth;
    r.parts.forEach((p) => {
      if (!p.value) return;
      const w = (p.value / max) * trackW;
      const rect = el("rect", { x, y, width: Math.max(1, w), height: barH,
                                fill: p.pattern ? "url(#hatch)" : p.colour, class: "bar" });
      rect.appendChild(el("title", {}, `${r.label} · ${p.key}: ${fmt(p.value)}`));
      g.appendChild(rect);
      x += w;
    });
    g.appendChild(el("text", { x: x + 8, y: y + barH - 5, class: "val" }, fmt(r.total)));
    if (r.secondary) {
      g.appendChild(el("text", { x: W - 2, y: y + barH - 5, "text-anchor": "end", class: "axis" }, r.secondary));
    }
    if (onClick) g.addEventListener("click", () => onClick(r));
    s.appendChild(g);
  });
  host.appendChild(s);
  if (note) {
    const d = document.createElement("div");
    d.className = "coverage-note";
    d.innerHTML = note;
    host.appendChild(d);
  }
};

// ----------------------------------------------------------- vertical bars --
window.drawVBar = function (host, rows, opts = {}) {
  const { fmt, colour = "#2F72C4", onClick, note } = opts;
  host.innerHTML = "";
  if (!rows.length) { host.innerHTML = `<div class="empty">—</div>`; return; }
  const W = 720, H = 240, padB = 34, padT = 22;
  const s = svg(W, H);
  const max = Math.max(...rows.map((r) => r.value || 0), 1);
  const bw = Math.min(64, (W - 12) / rows.length - 10);
  const step = (W - 12) / rows.length;

  [0, 0.5, 1].forEach((f) => {
    const y = padT + (1 - f) * (H - padT - padB);
    s.appendChild(el("line", { x1: 0, x2: W, y1: y, y2: y, class: "gridline" }));
  });

  rows.forEach((r, i) => {
    const h = (r.value / max) * (H - padT - padB);
    const x = i * step + (step - bw) / 2;
    const y = H - padB - h;
    const g = el("g", { class: onClick ? "hit" : null });
    g.appendChild(el("rect", { x, y, width: bw, height: Math.max(2, h), rx: 3,
                               fill: r.colour || colour, class: "bar" }));
    g.appendChild(el("text", { x: x + bw / 2, y: y - 6, "text-anchor": "middle", class: "val" }, fmt(r.value)));
    g.appendChild(el("text", { x: x + bw / 2, y: H - padB + 15, "text-anchor": "middle", class: "axis" }, r.label));
    if (r.secondary) {
      g.appendChild(el("text", { x: x + bw / 2, y: H - padB + 28, "text-anchor": "middle", class: "axis" }, r.secondary));
    }
    g.appendChild(el("title", {}, `${r.label}: ${fmt(r.value)}`));
    if (onClick) g.addEventListener("click", () => onClick(r));
    s.appendChild(g);
  });
  host.appendChild(s);
  if (note) {
    const d = document.createElement("div");
    d.className = "coverage-note";
    d.innerHTML = note;
    host.appendChild(d);
  }
};

// ---------------------------------------------------- small inline compare --
// two bars, one above the other — used for "your number vs ours"
window.drawCompare = function (host, a, b, opts = {}) {
  const { fmt } = opts;
  host.innerHTML = "";
  const W = 460, H = 78;
  const s = svg(W, H);
  const max = Math.max(a.value, b.value, 1);
  [a, b].forEach((r, i) => {
    const y = i * 34 + 6;
    s.appendChild(el("text", { x: 0, y: y + 16, class: "lbl" }, r.label));
    const x0 = 150;
    s.appendChild(el("rect", { x: x0, y, width: W - x0 - 70, height: 22, rx: 4, fill: "#eef1f5" }));
    s.appendChild(el("rect", { x: x0, y, width: Math.max(2, (r.value / max) * (W - x0 - 70)),
                               height: 22, rx: 4, fill: r.colour || "#2F72C4" }));
    s.appendChild(el("text", { x: W - 62, y: y + 16, class: "val" }, fmt(r.value)));
  });
  host.appendChild(s);
};

// ------------------------------------------------------------- time series --
// rows: [{label, value}] in chronological order. One measure, plain line + area.
window.drawLine = function (host, rows, opts = {}) {
  const { fmt, colour = "#2F72C4", note, yLabel } = opts;
  host.innerHTML = "";
  if (rows.length < 2) { host.innerHTML = `<div class="empty">—</div>`; return; }
  const W = 720, H = 190, padL = 8, padR = 58, padT = 16, padB = 26;
  const s = svg(W, H);
  const vals = rows.map((r) => r.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = (hi - lo) || 1;
  const x = (i) => padL + (i / (rows.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - lo) / span) * (H - padT - padB);

  [0, 0.5, 1].forEach((f) => {
    const yy = padT + f * (H - padT - padB);
    s.appendChild(el("line", { x1: padL, x2: W - padR, y1: yy, y2: yy, class: "gridline" }));
    s.appendChild(el("text", { x: W - padR + 6, y: yy + 4, class: "axis" },
                     fmt(lo + (1 - f) * span)));
  });

  const line = rows.map((r, i) => `${i ? "L" : "M"} ${x(i)} ${y(r.value)}`).join(" ");
  s.appendChild(el("path", {
    d: `${line} L ${x(rows.length - 1)} ${H - padB} L ${x(0)} ${H - padB} Z`,
    fill: colour, opacity: 0.10,
  }));
  s.appendChild(el("path", { d: line, fill: "none", stroke: colour, "stroke-width": 2 }));

  // endpoints only — a 56-point axis of month labels is unreadable
  [0, rows.length - 1].forEach((i) => {
    s.appendChild(el("circle", { cx: x(i), cy: y(rows[i].value), r: 3.5, fill: colour }));
    s.appendChild(el("text", {
      x: i === 0 ? padL : W - padR, y: H - padB + 16,
      "text-anchor": i === 0 ? "start" : "end", class: "axis",
    }, rows[i].label));
  });
  rows.forEach((r, i) => {
    const c = el("circle", { cx: x(i), cy: y(r.value), r: 7, fill: "transparent" });
    c.appendChild(el("title", {}, `${r.label}: ${fmt(r.value)}`));
    s.appendChild(c);
  });
  if (yLabel) s.appendChild(el("text", { x: padL, y: 11, class: "axis" }, yLabel));
  host.appendChild(s);
  if (note) {
    const d = document.createElement("div");
    d.className = "coverage-note"; d.innerHTML = note; host.appendChild(d);
  }
};
