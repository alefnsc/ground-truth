/**
 * Pure formatters for the views. Rounding and unit choice only; no model arithmetic.
 * A value that cannot be computed (null) is always the dash, never "0" or "NaN".
 */

import type { Quantity } from "../model/scenarios";

export const DASH = "—";

function group(integerDigits: string): string {
  return integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** About three significant figures without an exponent: no decimals from 100 up, one from 10, two below. Zero is "0". */
function number(value: number): string {
  if (value === 0) return "0"; // also -0
  const a = Math.abs(value);
  const decimals = a >= 99.95 ? 0 : a >= 9.995 ? 1 : 2;
  const [whole = "", fraction] = Math.abs(value).toFixed(decimals).split(".");
  return `${value < 0 ? "−" : ""}${group(whole)}${fraction === undefined ? "" : `.${fraction}`}`;
}

/** Joules below 1000, kilojoules from there. Mechanical work: never kilocalories. */
export function formatEnergy(joules: number | null): string {
  if (joules === null) return DASH;
  return Math.abs(joules) >= 999.5 ? `${number(joules / 1000)} kJ` : `${number(joules)} J`;
}

export function formatForce(newtons: number | null): string {
  return newtons === null ? DASH : `${number(newtons)} N`;
}

/** A ratio (1 = 100 %) as a percentage. */
export function formatPercent(ratio: number | null): string {
  return ratio === null ? DASH : `${number(ratio * 100)}%`;
}

export function formatMultiple(multiple: number | null): string {
  return multiple === null ? DASH : `${number(multiple)}×`;
}

/** A whole number with thousands grouped, for stimulus-days. */
export function formatDays(value: number | null): string {
  if (value === null) return DASH;
  const rounded = Math.round(value);
  return rounded === 0 ? "0" : `${rounded < 0 ? "−" : ""}${group(String(Math.abs(rounded)))}`;
}

/** Any Quantity, by its unit. A whole number keeps no decimals (steps, cycles, seconds). */
export function formatQuantity(q: Quantity): string {
  if (q.value === null) return DASH;
  if (q.unit === "J") return formatEnergy(q.value);
  if (q.unit === "N") return formatForce(q.value);
  const text = Number.isInteger(q.value) ? formatDays(q.value) : number(q.value);
  if (q.unit === "") return text;
  if (q.unit.startsWith("×")) return `${text}× ${q.unit.slice(1).trim()}`;
  return `${text} ${q.unit}`;
}
