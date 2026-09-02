// Hand-built SVG charts. This version treats them as working ledgers rather
// than decoration: aligned labels, exact values and large drill-down targets.

const NS = "http://www.w3.org/2000/svg";
let chartUid = 0;

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

function interactive(node, label, onActivate) {
  if (!onActivate) return;
  node.setAttribute("role", "button");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-label", label);
  node.addEventListener("click", onActivate);
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    }
  });
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
      interactive(path, `${seg.label}: ${fmt(v)}`, onClick ? () => onClick(seg) : null);
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

// ----------------------------------------------------------- status ledger --
// A ranked row view replaces the donut on Level 0. It is faster to compare,
// keeps units and lei visible together, and makes the drill-down explicit.
window.drawStatusLedger = function (host, rows, opts = {}) {
  const { get, fmt, secondary, share, colours, onClick, headers = [] } = opts;
  host.innerHTML = "";
  if (!rows.length) { host.innerHTML = `<div class="empty">—</div>`; return; }

  const W = 760, headH = 27, rowH = 61, H = headH + rows.length * rowH;
  const labelX = 13, trackX = 144, trackW = 194;
  const mainX = 474, secondaryX = 606, skuX = 708;
  const max = Math.max(...rows.map((r) => get(r) || 0), 1);
  const s = svg(W, H);

  [headers[0], headers[1], headers[2], headers[3]].forEach((h, i) => {
    if (!h) return;
    const xs = [labelX, mainX, secondaryX, skuX];
    s.appendChild(el("text", {
      x: xs[i], y: 14, class: "axis", "text-anchor": i ? "end" : "start",
      style: "font-weight:700;letter-spacing:.08em;text-transform:uppercase",
    }, h));
  });

  rows.forEach((r, i) => {
    const y = headH + i * rowH;
    const value = get(r) || 0;
    const g = el("g", { class: "hit" });
    g.appendChild(el("rect", { x: 0, y, width: W, height: rowH, fill: "transparent", class: "row-bg" }));
    g.appendChild(el("line", { x1: 0, x2: W, y1: y + rowH - 1, y2: y + rowH - 1, class: "gridline" }));
    g.appendChild(el("rect", { x: 0, y: y + 10, width: 5, height: rowH - 20, fill: colours[r.colour] }));
    g.appendChild(el("text", { x: labelX, y: y + 25, class: "lbl", style: "font-weight:700" }, trunc(r.label, 22)));
    if (r.subLabel) {
      g.appendChild(el("text", { x: labelX, y: y + 42, class: "axis" }, trunc(r.subLabel, 29)));
    }
    g.appendChild(el("rect", { x: trackX, y: y + 24, width: trackW, height: 8, fill: "#E8E5DD" }));
    g.appendChild(el("rect", {
      x: trackX, y: y + 24, width: Math.max(2, value / max * trackW), height: 8,
      fill: colours[r.colour], class: "bar",
    }));
    g.appendChild(el("text", { x: trackX + trackW + 10, y: y + 32, class: "axis" }, share(r)));
    g.appendChild(el("text", { x: mainX, y: y + 32, class: "val", "text-anchor": "end" }, fmt(r)));
    g.appendChild(el("text", { x: secondaryX, y: y + 32, class: "lbl", "text-anchor": "end" }, secondary(r)));
    g.appendChild(el("text", { x: skuX, y: y + 32, class: "axis", "text-anchor": "end" }, r.skuLabel));
    g.appendChild(el("text", { x: 748, y: y + 33, class: "val", "text-anchor": "end" }, "›"));
    const aria = `${r.label}, ${fmt(r)}, ${secondary(r)}, ${r.skuLabel}`;
    interactive(g, aria, onClick ? () => onClick(r) : null);
    s.appendChild(g);
  });

  host.appendChild(s);
};

// ----------------------------------------------------------- factory queue --
// Narrow, numbered and deliberately compact: this is a work order, not a
// second overview chart competing with the stock-state ledger.
window.drawFactoryQueue = function (host, rows, opts = {}) {
  const { fmt, onClick, note } = opts;
  host.innerHTML = "";
  if (!rows.length) { host.innerHTML = `<div class="empty">—</div>`; return; }

  const W = 440, rowH = 39, H = rows.length * rowH + 3;
  const trackX = 156, trackW = 104;
  const max = Math.max(...rows.map((r) => r.value || 0), 1);
  const s = svg(W, H);

  rows.forEach((r, i) => {
    const y = i * rowH;
    const g = el("g", { class: "hit" });
    g.appendChild(el("rect", { x: 0, y, width: W, height: rowH, fill: "transparent", class: "row-bg" }));
    g.appendChild(el("line", { x1: 0, x2: W, y1: y + rowH - 1, y2: y + rowH - 1, class: "gridline" }));
    g.appendChild(el("text", { x: 4, y: y + 24, class: "axis" }, String(i + 1).padStart(2, "0")));
    g.appendChild(el("text", { x: 29, y: y + 24, class: "lbl", style: "font-weight:650" }, trunc(r.label, 18)));
    g.appendChild(el("rect", { x: trackX, y: y + 16, width: trackW, height: 7, fill: "#E8E5DD" }));
    g.appendChild(el("rect", {
      x: trackX, y: y + 16, width: Math.max(2, r.value / max * trackW), height: 7,
      fill: r.colour, class: "bar",
    }));
    g.appendChild(el("text", { x: 351, y: y + 24, class: "val", "text-anchor": "end" }, fmt(r.value)));
    g.appendChild(el("text", { x: 410, y: y + 24, class: "axis", "text-anchor": "end" }, r.secondary || ""));
    g.appendChild(el("text", { x: 438, y: y + 24, class: "val", "text-anchor": "end" }, "›"));
    interactive(g, r.title || `${r.label}: ${fmt(r.value)}`, onClick ? () => onClick(r) : null);
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
    g.appendChild(el("rect", { x: labelWidth, y, width: trackW, height: barH, fill: "#E8E5DD" }));
    const w = Math.max(2, (r.value / max) * trackW);
    g.appendChild(el("rect", { x: labelWidth, y, width: w, height: barH,
                               fill: r.colour || colour, class: "bar" }));
    g.appendChild(el("text", { x: labelWidth + w + 8, y: y + barH - 5, class: "val" }, fmt(r.value)));
    if (r.secondary) {
      g.appendChild(el("text", { x: W - 2, y: y + barH - 5, "text-anchor": "end", class: "axis" }, r.secondary));
    }
    g.appendChild(el("title", {}, r.title || `${r.label}: ${fmt(r.value)}`));
    interactive(g, r.title || `${r.label}: ${fmt(r.value)}`, onClick ? () => onClick(r) : null);
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
  const hatchId = `hatch-${++chartUid}`;
  const pat = el("pattern", { id: hatchId, width: 6, height: 6,
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
    g.appendChild(el("rect", { x: labelWidth, y, width: trackW, height: barH, fill: "#E8E5DD" }));
    let x = labelWidth;
    r.parts.forEach((p) => {
      if (!p.value) return;
      const w = (p.value / max) * trackW;
      const rect = el("rect", { x, y, width: Math.max(1, w), height: barH,
                                fill: p.pattern ? `url(#${hatchId})` : p.colour, class: "bar" });
      rect.appendChild(el("title", {}, `${r.label} · ${p.key}: ${fmt(p.value)}`));
      g.appendChild(rect);
      x += w;
    });
    g.appendChild(el("text", { x: x + 8, y: y + barH - 5, class: "val" }, fmt(r.total)));
    if (r.secondary) {
      g.appendChild(el("text", { x: W - 2, y: y + barH - 5, "text-anchor": "end", class: "axis" }, r.secondary));
    }
    interactive(g, `${r.label}: ${fmt(r.total)}`, onClick ? () => onClick(r) : null);
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
    g.appendChild(el("rect", { x, y, width: bw, height: Math.max(2, h),
                               fill: r.colour || colour, class: "bar" }));
    g.appendChild(el("text", { x: x + bw / 2, y: y - 6, "text-anchor": "middle", class: "val" }, fmt(r.value)));
    g.appendChild(el("text", { x: x + bw / 2, y: H - padB + 15, "text-anchor": "middle", class: "axis" }, r.label));
    if (r.secondary) {
      g.appendChild(el("text", { x: x + bw / 2, y: H - padB + 28, "text-anchor": "middle", class: "axis" }, r.secondary));
    }
    g.appendChild(el("title", {}, `${r.label}: ${fmt(r.value)}`));
    interactive(g, `${r.label}: ${fmt(r.value)}`, onClick ? () => onClick(r) : null);
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
    s.appendChild(el("rect", { x: x0, y, width: W - x0 - 70, height: 22, fill: "#E8E5DD" }));
    s.appendChild(el("rect", { x: x0, y, width: Math.max(2, (r.value / max) * (W - x0 - 70)),
                               height: 22, fill: r.colour || "#2F72C4" }));
    s.appendChild(el("text", { x: W - 62, y: y + 16, class: "val" }, fmt(r.value)));
  });
  host.appendChild(s);
};
