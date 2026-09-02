"""The weekly trigger.

Its job is not to be the report. Its job is to pull you into the platform:
the photograph, three to five numbers, one link. The drill-down cannot live in
an email — that is exactly why the platform exists.

Charts are built from table cells with background colours, not images and not
SVG, so they render in Outlook, Gmail and on a phone without a single external
request.
"""
from __future__ import annotations

import math

import pandas as pd

COLOURS = {"green": "#2E9E5B", "orange": "#E8A33D", "red": "#D14343",
           "blue": "#2F72C4", "grey": "#8A8F98", "black": "#3A3F47"}

L = {
    "ro": {
        "subject": "Alarmă stoc covoare — fotografia săptămânii",
        "hello": "Bună, Tibi.",
        "intro": "Fotografia stocului de covoare, la {as_of}. Cifrele de mai jos sunt calculate automat — imaginea pe care ai făcut-o de mână există acum singură.",
        "photo": "Fotografia — unde stă marfa",
        "units": "bucăți", "value": "lei", "skus": "SKU-uri",
        "headline": "Cinci cifre",
        "h_capital": "Capital blocat în albastru + gri",
        "h_extreme": "Peste 24 de luni de stoc (lichidare, nu reaprovizionare)",
        "h_dead": "Stoc mort, produs încă activ",
        "h_reorder": "De comandat acum",
        "h_green": "Stoc sănătos (obiectiv discutat: spre 40%+)",
        "cta": "Deschide alarma și intră pe fabrică →",
        "cta_note": "Click pe orice fabrică → lista de comandă în 2 minute → export Excel.",
        "top": "Primele fabrici de comandat",
        "honesty": "Ce am presupus și ce lipsește",
        "foot": "Alarmă V1 · construită pe date reale · fiecare presupunere e marcată în aplicație.",
        "of_total": "din total",
    },
    "en": {
        "subject": "Rug stock alarm — this week's photograph",
        "hello": "Hi Tibi.",
        "intro": "The rug stock photograph, as of {as_of}. Everything below is computed automatically — the picture you made by hand now exists on its own.",
        "photo": "The photograph — where the goods sit",
        "units": "units", "value": "lei", "skus": "SKUs",
        "headline": "Five numbers",
        "h_capital": "Capital tied up in blue + grey",
        "h_extreme": "Over 24 months of cover (a liquidation case, not a reorder case)",
        "h_dead": "Dead stock on a still-active product",
        "h_reorder": "To order now",
        "h_green": "Healthy stock (objective discussed: toward 40%+)",
        "cta": "Open the alarm and drill into a factory →",
        "cta_note": "Click any factory → the order list in 2 minutes → Excel export.",
        "top": "Top factories to order from",
        "honesty": "What we assumed and what is missing",
        "foot": "Alarm V1 · built on real data · every assumption is labelled in the app.",
        "of_total": "of total",
    },
}

SEG_LABEL = {
    "ro": {"green": "Sănătos", "orange": "De comandat curând", "red": "Critic",
           "blue": "Supra-stoc", "grey": "Stoc mort", "black": "Inactiv"},
    "en": {"green": "Healthy", "orange": "Reorder soon", "red": "Critical",
           "blue": "Overstocked", "grey": "Dead stock", "black": "Inactive"},
}

ORDER = ["green", "orange", "red", "blue", "grey"]


def _n(x, dec=0, lang: str = "ro") -> str:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return "—"
    if not math.isfinite(v):
        return "—"
    s = f"{v:,.{dec}f}"
    if lang == "ro":
        # RO: space as thousands separator, comma as decimal
        return s.replace(",", " ").replace(".", ",")
    return s


def render_email(panel: pd.DataFrame, meta: dict, cfg: dict, lang: str, base_url: str) -> str:
    t = L.get(lang, L["ro"])
    _N = lambda x, d=0: _n(x, d, lang)
    p1 = lambda x: _N(x, 1)
    seg_label = SEG_LABEL.get(lang, SEG_LABEL["ro"])
    base_url = base_url or "http://localhost:8700"

    tot_u = float(panel["stock_units"].sum())
    tot_v = float(panel["stock_value"].sum())
    by = panel.groupby("colour").agg(u=("stock_units", "sum"), v=("stock_value", "sum"),
                                     n=("sku", "count"))

    def gu(c):
        return float(by["u"].get(c, 0.0))

    def gv(c):
        return float(by["v"].get(c, 0.0))

    stuck_v = gv("blue") + gv("grey")
    extreme = panel[panel["substate"] == "blue_extreme"]
    dead_active = panel[panel["substate"] == "grey_active"]
    reorder = panel[panel["suggested_qty"] > 0]

    # --- the photograph, as a single stacked bar of table cells ---------------
    cells = []
    for c in ORDER:
        u = gu(c)
        if u <= 0:
            continue
        pct = u / tot_u * 100 if tot_u else 0
        cells.append(
            f'<td width="{pct:.2f}%" bgcolor="{COLOURS[c]}" style="height:34px;'
            f'font:600 11px/34px -apple-system,Segoe UI,Arial;color:#fff;text-align:center;">'
            f'{_N(pct)}%</td>' if pct >= 6 else
            f'<td width="{pct:.2f}%" bgcolor="{COLOURS[c]}" style="height:34px;"></td>')
    bar = f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:6px;overflow:hidden"><tr>{"".join(cells)}</tr></table>'

    legend_rows = []
    for c in ORDER:
        u, v, n = gu(c), gv(c), int(by["n"].get(c, 0))
        if u <= 0 and v <= 0:
            continue
        legend_rows.append(f"""
        <tr>
          <td width="14" style="padding:5px 8px 5px 0"><div style="width:11px;height:11px;border-radius:2px;background:{COLOURS[c]}"></div></td>
          <td style="padding:5px 0;font:13px -apple-system,Segoe UI,Arial;color:#1c2530">{seg_label[c]}</td>
          <td align="right" style="padding:5px 0;font:600 13px -apple-system,Segoe UI,Arial;color:#1c2530">{_N(u)} {t['units']}</td>
          <td align="right" style="padding:5px 0 5px 14px;font:13px -apple-system,Segoe UI,Arial;color:#5a6472">{p1(u/tot_u*100 if tot_u else 0)}%</td>
          <td align="right" style="padding:5px 0 5px 14px;font:600 13px -apple-system,Segoe UI,Arial;color:#1c2530">{_N(v)} lei</td>
          <td align="right" style="padding:5px 0 5px 14px;font:13px -apple-system,Segoe UI,Arial;color:#5a6472">{n} {t['skus']}</td>
        </tr>""")

    # --- five numbers ---------------------------------------------------------
    def stat(label, big, small):
        return f"""
        <tr>
          <td style="padding:11px 14px;border:1px solid #e4e8ee;border-radius:8px;background:#fbfcfd">
            <div style="font:12px -apple-system,Segoe UI,Arial;color:#5a6472;padding-bottom:3px">{label}</div>
            <div style="font:700 21px -apple-system,Segoe UI,Arial;color:#111820">{big}</div>
            <div style="font:12px -apple-system,Segoe UI,Arial;color:#5a6472;padding-top:2px">{small}</div>
          </td>
        </tr><tr><td style="height:8px"></td></tr>"""

    stats = "".join([
        stat(t["h_capital"], f"{_N(stuck_v)} lei",
             f"{_N(stuck_v/tot_v*100 if tot_v else 0)}% {t['of_total']} · {_N(gu('blue')+gu('grey'))} {t['units']}"),
        stat(t["h_extreme"], f"{_N(extreme['stock_value'].sum())} lei",
             f"{_N(extreme['stock_units'].sum())} {t['units']} · {len(extreme)} {t['skus']}"),
        stat(t["h_dead"], f"{_N(dead_active['stock_value'].sum())} lei",
             f"{_N(dead_active['stock_units'].sum())} {t['units']} · {len(dead_active)} {t['skus']}"),
        stat(t["h_reorder"], f"{_N(reorder['suggested_qty'].sum())} {t['units']}",
             f"{_N(reorder['suggested_value'].sum())} lei · {len(reorder)} {t['skus']}"),
        stat(t["h_green"], f"{p1(gu('green')/tot_u*100 if tot_u else 0)}%",
             f"{_N(gu('green'))} {t['units']} · {_N(gv('green'))} lei"),
    ])

    # --- top factories --------------------------------------------------------
    ft = (reorder.groupby("factory")
          .agg(qty=("suggested_qty", "sum"), val=("suggested_value", "sum"))
          .sort_values("qty", ascending=False).head(5))
    stocked = panel[panel["stock_units"] > 0]
    movpct = (stocked[stocked["colour"] != "grey"].groupby("factory")["stock_units"].sum()
              / stocked.groupby("factory")["stock_units"].sum() * 100)
    maxq = float(ft["qty"].max()) if len(ft) else 1.0
    frows = []
    for f, r in ft.iterrows():
        w = r["qty"] / maxq * 100 if maxq else 0
        mv = float(movpct.get(f, 0))
        frows.append(f"""
        <tr>
          <td style="padding:6px 10px 6px 0;font:13px -apple-system,Segoe UI,Arial;color:#1c2530;white-space:nowrap">{f}</td>
          <td width="55%" style="padding:6px 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td width="{w:.1f}%" bgcolor="#2F72C4" style="height:14px;border-radius:3px 0 0 3px"></td>
              <td bgcolor="#eef1f5" style="height:14px"></td>
            </tr></table>
          </td>
          <td align="right" style="padding:6px 0 6px 12px;font:600 13px -apple-system,Segoe UI,Arial;color:#111820;white-space:nowrap">{_N(r['qty'])} {t['units']}</td>
          <td align="right" style="padding:6px 0 6px 12px;font:12px -apple-system,Segoe UI,Arial;color:#5a6472;white-space:nowrap">{_N(mv)}% ✓</td>
        </tr>""")

    wh = meta["coverage"]["warehouse"]
    honesty = [
        f"Fotografia e la {meta['as_of']} — ultima lună în care există simultan stoc depozit și stoc în toate magazinele." if lang == "ro"
        else f"The photograph is as of {meta['as_of']} — the last month where warehouse and all store snapshots coexist.",
        (f"{wh.get('unit_match_pct', 0)}% din unitățile din depozit sunt legate de un cod SKU. Restul ({_N(wh.get('units_total',0)-wh.get('units_matched',0))} buc.) apare separat în aplicație."
         if lang == "ro" else
         f"{wh.get('unit_match_pct', 0)}% of warehouse units are tied to a SKU code. The rest ({_N(wh.get('units_total',0)-wh.get('units_matched',0))} units) is shown separately in the app."),
        ("Timpii de livrare pe fabrică lipsesc — folosim 90 de zile peste tot. Sunt ~30 de numere; cu ele, ordinea de prioritate se schimbă real."
         if lang == "ro" else
         "Factory lead times are missing — we use 90 days everywhere. It is ~30 numbers; with them the priority order genuinely changes."),
        ("Starea produsului (in / out / phase-out) lipsește din export. Fără ea, un produs în phase-out arată ca o alarmă, deși treaba e făcută bine."
         if lang == "ro" else
         "Product state (in / out / phase-out) is missing. Without it a phase-out item looks like an alarm when the job was actually done right."),
        ("Vânzările pe cod diferit citesc zero vânzări — un produs care se vinde bine poate apărea mort."
         if lang == "ro" else
         "Cross-code sales read as zero sales — a good seller can look dead."),
        ("Consumul intern / proiectele citesc ca cerere de retail — pot produce comenzi false."
         if lang == "ro" else
         "Internal / project consumption reads as retail demand — it can produce false orders."),
    ]
    honesty_html = "".join(
        f'<li style="padding:3px 0;font:13px/1.5 -apple-system,Segoe UI,Arial;color:#4a5462">{h}</li>'
        for h in honesty)

    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{t['subject']}</title></head>
<body style="margin:0;padding:0;background:#f2f4f7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7">
<tr><td align="center" style="padding:26px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e0e5eb">

  <tr><td style="padding:22px 26px 6px">
    <div style="font:600 12px -apple-system,Segoe UI,Arial;letter-spacing:.12em;color:#8a94a2;text-transform:uppercase">ALARMĂ · COVOARE</div>
    <div style="font:700 22px -apple-system,Segoe UI,Arial;color:#111820;padding-top:5px">{t['subject']}</div>
    <div style="font:14px/1.55 -apple-system,Segoe UI,Arial;color:#4a5462;padding-top:11px">{t['hello']}<br>{t['intro'].format(as_of=meta['as_of'])}</div>
  </td></tr>

  <tr><td style="padding:20px 26px 4px">
    <div style="font:600 13px -apple-system,Segoe UI,Arial;color:#111820;padding-bottom:9px">{t['photo']} — {_N(tot_u)} {t['units']} · {_N(tot_v)} lei</div>
    {bar}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding-top:9px">{''.join(legend_rows)}</table>
  </td></tr>

  <tr><td style="padding:18px 26px 0">
    <div style="font:600 13px -apple-system,Segoe UI,Arial;color:#111820;padding-bottom:9px">{t['headline']}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{stats}</table>
  </td></tr>

  <tr><td style="padding:8px 26px 0">
    <div style="font:600 13px -apple-system,Segoe UI,Arial;color:#111820;padding-bottom:4px">{t['top']}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{''.join(frows)}</table>
  </td></tr>

  <tr><td style="padding:20px 26px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td bgcolor="#111820" style="border-radius:8px">
        <a href="{base_url}/" style="display:inline-block;padding:13px 22px;font:600 14px -apple-system,Segoe UI,Arial;color:#ffffff;text-decoration:none">{t['cta']}</a>
      </td>
    </tr></table>
    <div style="font:12px -apple-system,Segoe UI,Arial;color:#8a94a2;padding-top:8px">{t['cta_note']}</div>
  </td></tr>

  <tr><td style="padding:4px 26px 20px">
    <div style="border-top:1px solid #e8ecf1;padding-top:14px">
      <div style="font:600 13px -apple-system,Segoe UI,Arial;color:#111820;padding-bottom:5px">{t['honesty']}</div>
      <ul style="margin:0;padding-left:17px">{honesty_html}</ul>
    </div>
  </td></tr>

  <tr><td bgcolor="#fbfcfd" style="padding:13px 26px;border-top:1px solid #eef1f5">
    <div style="font:11px -apple-system,Segoe UI,Arial;color:#98a1ad">{t['foot']}</div>
  </td></tr>

</table></td></tr></table></body></html>"""
