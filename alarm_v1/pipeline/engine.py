"""The decision layer: velocity → safety stock → reorder → status → priority.

Design rules taken straight from the brief:

* Safety stock is ALWAYS a formula, never a field a human fills in (§3e / R15).
* Lead time lives at FACTORY level, never per SKU (§3b / 4.2). Short lead time
  DEMOTES urgency; it never shrinks the quantity.
* Every number carries its argument. `why` is emitted as structured parts so the
  UI can render it in Romanian or English without the pipeline knowing about
  either language.
* Dead stock is cross-checked against product state before it is called an
  alarm (§3a / R11).
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

# ---------------------------------------------------------------- velocity ---


def monthly_rate(u_short: pd.Series, days_short: int,
                 u_long: pd.Series, days_long: int, w_short: float) -> pd.Series:
    """Blended monthly demand rate. Recency-leaning, but not jumpy.

    We do not use a point forecast here on purpose: the rug demand signal is
    massively over-dispersed (variance/mean ≈ 8–11, measured in V4), so a
    smoothed rate plus an explicit variability term beats a clever mean.
    """
    r_short = u_short / (days_short / 30.4375)
    r_long = u_long / (days_long / 30.4375)
    return w_short * r_short + (1.0 - w_short) * r_long


def monthly_sigma(monthly_matrix: pd.DataFrame, rate: pd.Series) -> pd.Series:
    """Std-dev of monthly demand, with a Poisson floor.

    A SKU that sold 3 units in one month and 0 in the other eleven has a real
    sigma; a SKU with no history at all still gets sqrt(rate) so safety stock
    never collapses to zero on a thin signal.
    """
    obs = monthly_matrix.std(axis=1, ddof=0).reindex(rate.index).fillna(0.0)
    floor = np.sqrt(rate.clip(lower=0.0))
    return pd.concat([obs, floor], axis=1).max(axis=1)


# ----------------------------------------------------------- replenishment ---


def safety_stock(sigma_mo: pd.Series, lt_months: pd.Series,
                 review_months: float, z: float) -> pd.Series:
    """SS = z · σ_monthly · √(lead time + review period), in months of exposure.

    The exposure window is lead time PLUS the review period, because between two
    order events you are exposed for both. This is the standard periodic-review
    formula — deliberately boring, fully explainable to a person defending a
    number to the administrator.
    """
    return z * sigma_mo * np.sqrt(lt_months + review_months)


def reorder_numbers(df: pd.DataFrame, review_months: float, z: float) -> pd.DataFrame:
    out = df.copy()
    lt_m = out["lead_time_days"] / 30.4375
    out["lead_time_months"] = lt_m
    out["safety_stock"] = safety_stock(out["sigma_mo"], lt_m, review_months, z)
    out["reorder_point"] = out["rate_mo"] * lt_m + out["safety_stock"]
    out["target_stock"] = out["rate_mo"] * (lt_m + review_months) + out["safety_stock"]
    gap = out["target_stock"] - out["stock_units"]
    out["suggested_qty"] = np.ceil(gap.clip(lower=0)).fillna(0).astype(int)
    # Nothing is proposed for a SKU with no demand signal at all — that is a
    # liquidation question, not a replenishment question.
    out.loc[out["rate_mo"] <= 0, "suggested_qty"] = 0
    out["suggested_value"] = out["suggested_qty"] * out["unit_cost"].fillna(0)
    return out


def months_of_supply(stock: pd.Series, rate: pd.Series) -> pd.Series:
    return np.where(rate > 0, stock / rate, np.inf)


# ---------------------------------------------------------------- taxonomy ---

def classify(df: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Assign Tibi's colour + the sub-state underneath it.

    Top level stays his five colours because that is the language the whole
    company speaks. The sub-state exists because two of those colours hide two
    genuinely different decisions:

      grey  → dead-but-active (a real alarm) vs dead-in-phase-out (job done)
      red   → out of stock (already losing sales) vs below lead time (still time)
      blue  → overstocked vs extreme (>24 months — a liquidation case, not a
              replenishment case)

    This is the "poate trebuie să fie opt cadrane" question, answered with the
    smallest split that changes what you do next.
    """
    out = df.copy()
    over_factor = cfg["replenishment"]["overstock_factor"]
    review = cfg["replenishment"]["review_period_months"]
    extreme = cfg["taxonomy"]["extreme_overstock_months"]

    lt_m = out["lead_time_months"]
    healthy_min = lt_m + review              # below this you must act
    healthy_max = (lt_m + review) * over_factor

    stock = out["stock_units"]
    sold90 = out["units_90d"]
    sold180 = out["units_180d"]
    mos = out["months_of_supply"]

    colour = pd.Series("green", index=out.index, dtype=object)
    sub = pd.Series("green_healthy", index=out.index, dtype=object)

    # 1. nothing in stock, nothing sold recently → not part of the photograph
    m = (stock <= 0) & (sold180 <= 0)
    colour[m], sub[m] = "black", "inactive"

    # 2. nothing in stock, but it sells → already losing sales
    m = (stock <= 0) & (sold90 > 0)
    colour[m], sub[m] = "red", "red_out"

    # 3. nothing in stock, sold in the last 180d but not the last 90d
    m = (stock <= 0) & (sold90 <= 0) & (sold180 > 0)
    colour[m], sub[m] = "black", "inactive"

    # 4. stock on hand, zero sales in the dead window → dead stock
    m = (stock > 0) & (sold90 <= 0)
    colour[m] = "grey"
    # 'not_active' from the ACTIV export is the closest real signal to a
    # phase-out: the product is no longer in the collection, so stock draining
    # to zero is the intended outcome, not an alarm.
    sub[m] = np.where(out.loc[m, "product_state"].isin(["not_active", "phase_out"]),
                      "grey_phaseout", "grey_active")

    # 5. stock on hand and it moves → cover-based bands, lead-time aware
    live = (stock > 0) & (sold90 > 0)
    m = live & (mos < lt_m)
    colour[m], sub[m] = "red", "red_low"
    m = live & (mos >= lt_m) & (mos < healthy_min)
    colour[m], sub[m] = "orange", "orange_soon"
    m = live & (mos >= healthy_min) & (mos <= healthy_max)
    colour[m], sub[m] = "green", "green_healthy"
    m = live & (mos > healthy_max)
    colour[m] = "blue"
    sub[m] = np.where(mos[m] > extreme, "blue_extreme", "blue_slow")

    out["colour"] = colour
    out["substate"] = sub
    return out


# ---------------------------------------------------------------- priority ---

def priority(df: pd.DataFrame) -> pd.DataFrame:
    """Rank = f(stock gap, sales velocity, lead time).

    Tibi's rule, verbatim: a 2,200-unit proposal from a factory that delivers in
    two weeks drops to about 5th place, because "ai oricând timp". So the score
    is money-at-risk divided by how much slack the lead time leaves you. The
    QUANTITY is untouched — only the position in the list moves.
    """
    out = df.copy()
    daily = out["rate_mo"] / 30.4375
    cover_days = np.where(daily > 0, out["stock_units"] / daily, np.inf)
    out["days_of_cover"] = cover_days
    slack = np.where(np.isfinite(cover_days), cover_days - out["lead_time_days"], np.inf)
    out["slack_days"] = slack

    money_per_month = out["rate_mo"] * out["unit_cost"].fillna(0)
    urgency = 1.0 / (1.0 + np.clip(slack, 0, None) / 30.4375)
    urgency = np.where(np.isfinite(urgency), urgency, 0.0)
    out["urgency"] = urgency
    out["priority_score"] = np.where(out["suggested_qty"] > 0, money_per_month * urgency, 0.0)

    band = pd.Series("", index=out.index, dtype=object)
    band[out["suggested_qty"] > 0] = "MEDIUM"
    band[(out["suggested_qty"] > 0) & (out["months_of_supply"] < 1.0)] = "HIGH"
    band[(out["suggested_qty"] > 0) & (out["stock_units"] <= 0)] = "CRITICAL"
    out["criticality"] = band
    return out


# --------------------------------------------------------------------- why ---

def build_why(row: pd.Series) -> list[dict]:
    """Structured argument behind every line. Rendered by the UI in RO or EN.

    This is the thing the customer singled out as the differentiator — and it is
    what makes step 4 of his decision flow (defending the number to the person
    with the money) possible at all.
    """
    parts: list[dict] = []
    parts.append({"k": "rate", "v": {
        "rate": round(float(row["rate_mo"]), 2),
        "u90": int(row["units_90d"]), "u365": int(row["units_365d"]),
    }})
    parts.append({"k": "cover", "v": {
        "stock": int(row["stock_units"]),
        "months": None if not np.isfinite(row["months_of_supply"]) else round(float(row["months_of_supply"]), 1),
        "days": None if not np.isfinite(row["days_of_cover"]) else int(row["days_of_cover"]),
    }})
    parts.append({"k": "lead", "v": {
        "days": int(row["lead_time_days"]),
        "source": row["lead_time_source"],
        "review": round(float(row["review_period_months"]), 1),
    }})
    parts.append({"k": "safety", "v": {
        "ss": int(math.ceil(float(row["safety_stock"]))),
        "sigma": round(float(row["sigma_mo"]), 2),
        "z": float(row["service_z"]),
        "sl": int(row["service_level_pct"]),
    }})
    parts.append({"k": "target", "v": {
        "target": int(math.ceil(float(row["target_stock"]))),
        "stock": int(row["stock_units"]),
        "qty": int(row["suggested_qty"]),
    }})
    if row["suggested_qty"] > 0 and np.isfinite(row["slack_days"]) and row["slack_days"] > 0:
        parts.append({"k": "slack", "v": {"days": int(row["slack_days"])}})
    if row["colour"] == "grey":
        parts.append({"k": "dead", "v": {
            "idle_months": None if row["months_since_sale"] is None or not np.isfinite(row["months_since_sale"])
            else round(float(row["months_since_sale"]), 1),
            "value": int(round(float(row["stock_value"]))),
            "state": row["product_state"],
        }})
    if row["colour"] == "blue":
        parts.append({"k": "over", "v": {
            "months": None if not np.isfinite(row["months_of_supply"]) else round(float(row["months_of_supply"]), 1),
            "excess_units": int(max(0, round(float(row["stock_units"] - row["target_stock"])))),
            "excess_value": int(max(0, round(float((row["stock_units"] - row["target_stock"]) * (row["unit_cost"] or 0))))),
        }})
    return parts
