/**
 * Mechanical work and peak force from a vertical trajectory of a mass.
 *
 * Model (docs/strategy.md §2, "The energy model"): the force a mass demands of
 * whatever holds it is F = m (g_env + a), and the work is W = ∫ F dy. Work is
 * split by sign. Positive work: force and motion point the same way (on Earth,
 * the lift). Negative work: they oppose (on Earth, the lowering). In free fall a
 * mass still costs work to accelerate and returns it when stopped, so the two cancel.
 *
 * Discretisation (energy-consistent work-energy scheme)
 * -----------------------------------------------------
 * Samples are not assumed to be uniformly spaced.
 *  1. Node velocities v_i come from the second-order three-point derivative of the
 *     quadratic through each sample and its neighbours (centred inside the
 *     trajectory, one-sided at the two ends). That is why at least 3 samples are needed.
 *  2. Over interval i (sample i to i+1) the work is
 *         w_i = m · g_env · Δy_i  +  ½ m (v_{i+1}² − v_i²)
 *     which is ∫ m (g_env + a) dy with the inertial part m·a·dy = m·v·dv taken
 *     exactly. The inertial parts telescope, so
 *         Σ w_i = m · g_env · (y_last − y_first) + ½ m (v_last² − v_first²)
 *     exactly: a mass that starts and ends at rest has net work m · g_env · Δy,
 *     whatever the sampling rate or spacing. That is the energy-consistency requirement.
 *  3. positiveWorkJ is the sum of the w_i > 0 and negativeWorkJ the sum of the w_i < 0.
 *     The sign of w_i is the sign of (force × displacement) over the interval.
 *  4. Peak force is the maximum of |m (g_env + a_k)| over the interior samples, with
 *     a_k the second derivative of the same quadratic (a_k = 2 (u_k − u_{k-1}) /
 *     (t_{k+1} − t_{k-1}) with u the interval velocities). The two end samples have no
 *     centred acceleration and are not used; for a trajectory that starts at rest the
 *     force peak sits within one sample of the end, which at 60 Hz costs ~0.1 %.
 *
 * No smoothing is applied: noise in the input appears in the output.
 */

import { requireFinite, requireNonNegative } from "./validate";

export interface Sample {
  tS: number;
  yM: number;
}

export interface TrajectoryWork {
  positiveWorkJ: number; // >= 0
  negativeWorkJ: number; // <= 0
  netWorkJ: number; // positive + negative
  peakForceN: number; // max |F| over the trajectory
  displacementM: number; // y_last - y_first
}

function validateSamples(samples: readonly Sample[]): void {
  if (samples.length < 3) {
    throw new RangeError(`samples must contain at least 3 samples, got ${samples.length}`);
  }
  let previousT = Number.NEGATIVE_INFINITY;
  samples.forEach((s, i) => {
    requireFinite(`samples[${i}].tS`, s.tS);
    requireFinite(`samples[${i}].yM`, s.yM);
    if (s.tS <= previousT) {
      throw new RangeError(`samples[${i}].tS must be greater than samples[${i - 1}].tS (time must be strictly increasing)`);
    }
    previousT = s.tS;
  });
}

/** Node velocities by the second-order three-point formula on a possibly non-uniform grid. */
function nodeVelocities(t: readonly number[], y: readonly number[]): number[] {
  const n = t.length;
  const at = (a: readonly number[], i: number): number => a[i] as number; // indices are in range by construction
  const v: number[] = new Array<number>(n);

  {
    const h0 = at(t, 1) - at(t, 0);
    const h1 = at(t, 2) - at(t, 1);
    v[0] =
      (-(2 * h0 + h1) / (h0 * (h0 + h1))) * at(y, 0) +
      ((h0 + h1) / (h0 * h1)) * at(y, 1) +
      (-h0 / (h1 * (h0 + h1))) * at(y, 2);
  }
  for (let i = 1; i < n - 1; i++) {
    const h0 = at(t, i) - at(t, i - 1);
    const h1 = at(t, i + 1) - at(t, i);
    v[i] =
      (-h1 / (h0 * (h0 + h1))) * at(y, i - 1) +
      ((h1 - h0) / (h0 * h1)) * at(y, i) +
      (h0 / (h1 * (h0 + h1))) * at(y, i + 1);
  }
  {
    const h0 = at(t, n - 2) - at(t, n - 3);
    const h1 = at(t, n - 1) - at(t, n - 2);
    v[n - 1] =
      (h1 / (h0 * (h0 + h1))) * at(y, n - 3) +
      (-(h0 + h1) / (h0 * h1)) * at(y, n - 2) +
      ((h0 + 2 * h1) / (h1 * (h0 + h1))) * at(y, n - 1);
  }
  return v;
}

export function trajectoryWork(samples: readonly Sample[], massKg: number, gEnvMs2: number): TrajectoryWork {
  validateSamples(samples);
  requireNonNegative("massKg", massKg);
  requireNonNegative("gEnvMs2", gEnvMs2);

  const t = samples.map((s) => s.tS);
  const y = samples.map((s) => s.yM);
  const v = nodeVelocities(t, y);
  const n = samples.length;

  let positiveWorkJ = 0;
  let negativeWorkJ = 0;
  for (let i = 0; i < n - 1; i++) {
    const dy = (y[i + 1] as number) - (y[i] as number);
    const vi = v[i] as number;
    const vj = v[i + 1] as number;
    const w = massKg * gEnvMs2 * dy + 0.5 * massKg * (vj * vj - vi * vi);
    if (w > 0) positiveWorkJ += w;
    else negativeWorkJ += w;
  }

  let peakForceN = 0;
  for (let k = 1; k < n - 1; k++) {
    const dtBefore = (t[k] as number) - (t[k - 1] as number);
    const dtAfter = (t[k + 1] as number) - (t[k] as number);
    const uBefore = ((y[k] as number) - (y[k - 1] as number)) / dtBefore;
    const uAfter = ((y[k + 1] as number) - (y[k] as number)) / dtAfter;
    const a = (2 * (uAfter - uBefore)) / (dtBefore + dtAfter);
    peakForceN = Math.max(peakForceN, Math.abs(massKg * (gEnvMs2 + a)));
  }

  return {
    positiveWorkJ,
    negativeWorkJ,
    netWorkJ: positiveWorkJ + negativeWorkJ,
    peakForceN,
    displacementM: (y[n - 1] as number) - (y[0] as number),
  };
}

export interface MetabolicRange {
  lowJ: number;
  highJ: number;
  kind: "ESTIMATE";
  basis: string;
}

/** Gross efficiency band for cycling. Source: docs/strategy.md §2 "Metabolic energy": E_met ≈ W_mech / η, η ≈ 0.20–0.25. */
const GROSS_EFFICIENCY_LOW = 0.2;
const GROSS_EFFICIENCY_HIGH = 0.25;

/**
 * Metabolic cost implied by a positive mechanical work, as a labelled range: a
 * cross-check, never a single figure and never kilocalories (brief §2). The
 * highest efficiency gives the lowest cost.
 */
export function metabolicRange(positiveWorkJ: number): MetabolicRange {
  requireNonNegative("positiveWorkJ", positiveWorkJ);
  return {
    lowJ: positiveWorkJ / GROSS_EFFICIENCY_HIGH,
    highJ: positiveWorkJ / GROSS_EFFICIENCY_LOW,
    kind: "ESTIMATE",
    basis: "E_met ≈ W_mech / η with gross efficiency η between 0.20 and 0.25 (cycling cross-check, docs/strategy.md §2)",
  };
}
