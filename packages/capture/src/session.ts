/**
 * Session analysis: noisy wrist positions in, per-repetition work, peak force and range
 * of motion out, or a refusal with reason codes.
 *
 * Pipeline: assessQuality → refuse if any reason → resampleUniform → toMetersUp →
 * lowPassZeroPhase → segmentReps → trim each rep to its movement → trajectoryWork per rep.
 */

import { trajectoryWork, type Confidence, type Provenance } from "@ground-truth/physics";
import type { PoseFrame } from "./frames";
import { DEFAULT_CUTOFF_HZ, filterPaddingSamples, lowPassZeroPhase } from "./filter";
import { assessQuality, resampleUniform, type QualityReport, type RefusalReason } from "./quality";
import { requireFinite } from "./internal";
import { toMetersUp } from "./scale";
import { segmentReps, type Rep } from "./segment";

/**
 * Judgement call: HIGH confidence needs a frame rate of at least this. The grade
 * thresholds sit between the nominal camera rates (30 / 29.97 fps, 50 / 59.94 / 60 fps),
 * never on one, so a measured 29.97 and a nominal 30 grade alike.
 */
export const HIGH_CONFIDENCE_MIN_RATE_HZ = 45;
/** Judgement call: HIGH confidence allows at most this fraction of low-visibility frames. */
export const HIGH_CONFIDENCE_MAX_LOW_VISIBILITY = 0.02;
/** Judgement call: a frame rate below this is LOW confidence. */
export const LOW_CONFIDENCE_BELOW_RATE_HZ = 27;
/** Judgement call: more than this fraction of low-visibility frames is LOW confidence. */
export const LOW_CONFIDENCE_ABOVE_LOW_VISIBILITY = 0.05;

/**
 * Judgement call: a pause is a run of at least this long (seconds) in which the smoothed
 * position stays within DWELL_BAND_M. It separates the movement of a rep from the rest,
 * pick-up or set-down around it. Not tuned to any one scenario; see "Rep window" below.
 */
export const DWELL_MIN_S = 0.3;
/**
 * Judgement call: the largest spread (highest minus lowest sample) of the smoothed
 * position inside a pause, metres. 1.5 cm is above the smoothed pose noise at rest
 * (a few millimetres) and below the 10 cm rep threshold. It is also the residual bias of
 * the trimmed window: the first and last 1.5 cm of a lift are inside the pause that
 * ends it, so a 0.5 m rep reads about 3 % short in range of motion and in work.
 */
export const DWELL_BAND_M = 0.015;

export interface SessionOptions {
  massKg: number;
  gEnvMs2: number;
  /** Metres per normalised image unit (see metersPerUnitFromStature), or null if no calibration was done. */
  metersPerUnit: number | null;
  /** Constant device force resisting upward motion (e.g. an ARED setting). Default 0. */
  deviceForceN?: number;
  cutoffHz?: number;
  minPhaseDisplacementM?: number;
}

export interface RepResult {
  startS: number; // seconds from the first frame of the recording to the movement onset (the end of the pause before the lift)
  durationS: number; // movement onset to movement offset (the start of the pause after the lowering)
  liftDurationS: number; // movement onset to the top, the turnaround the segmenter found
  rangeOfMotionM: number; // height of the lift, smoothed top minus smoothed onset
  positiveWorkJ: number;
  negativeWorkJ: number; // <= 0
  peakForceN: number;
  impulseNs: number;
}

export type SessionResult =
  | {
      ok: true;
      reps: RepResult[];
      totalPositiveWorkJ: number;
      maxPeakForceN: number;
      quality: QualityReport;
      provenance: Provenance;
    }
  | { ok: false; reasons: RefusalReason[]; quality: QualityReport };

function confidenceOf(quality: QualityReport): Confidence {
  if (quality.rateHz < LOW_CONFIDENCE_BELOW_RATE_HZ || quality.lowVisibilityFraction > LOW_CONFIDENCE_ABOVE_LOW_VISIBILITY) {
    return "LOW";
  }
  if (quality.rateHz >= HIGH_CONFIDENCE_MIN_RATE_HZ && quality.lowVisibilityFraction <= HIGH_CONFIDENCE_MAX_LOW_VISIBILITY) {
    return "HIGH";
  }
  return "MEDIUM";
}

/** True when the smoothed position stays within DWELL_BAND_M over samples a..b (inclusive). */
function isPause(y: readonly number[], a: number, b: number): boolean {
  let lo = y[a] as number;
  let hi = lo;
  for (let i = a + 1; i <= b; i++) {
    const v = y[i] as number;
    if (v < lo) lo = v;
    else if (v > hi) hi = v;
    if (hi - lo > DWELL_BAND_M) return false;
  }
  return true;
}

/**
 * Rep window. segmentReps cuts a rep minimum to minimum, which puts the whole rest
 * before it, the pick-up, or the set-down after it, into the rep: noise rectifies into
 * work during a rest, and carrying a weight off the floor is not a repetition. Each rep
 * is therefore trimmed to its movement, on the SMOOTHED position (the band is applied to
 * the filtered trace, so noise does not make a pause look shorter than it is):
 *
 *  - Onset. Walk back from the top. First step over the top plateau (every sample within
 *    DWELL_BAND_M of the top), so a pause AT the top is never taken for the pause before
 *    the lift: the lift ends at the turnaround the segmenter found and the lowering
 *    starts there. Then take the latest pause (a run of DWELL_MIN_S within DWELL_BAND_M)
 *    that ends at or after the segmenter's start; the lift starts at the last sample of
 *    that pause. A pause half-way up (rack to shoulders, then press) is such a pause, so
 *    the press starts where it ends.
 *  - Offset. Walk forward from the top, over the top plateau, to the first pause that
 *    starts at or before the segmenter's end; the lowering ends at its first sample.
 *  - A pause may reach outside the segmenter's rep (a rest is split at its lowest sample,
 *    so part of it lies in the neighbouring rep), but the onset is never before the
 *    segmenter's start nor the offset after its end.
 *  - No pause found (reps with no rest between them): the segmenter's boundary is kept,
 *    which is where the two reps meet. A movement under the rep threshold that is NOT
 *    separated from a rep by a pause (it follows the lowering at once) stays in that
 *    rep; one with a pause either side is attributed to neither.
 *
 * Residual bias: the 1.5 cm band means the first and last 1.5 cm of the movement are
 * judged part of the pause, so range of motion and work read about DWELL_BAND_M / ROM
 * (3 % for 0.5 m) short. A pause of DWELL_MIN_S or more inside a lift splits it: only the
 * part after the last such pause is measured.
 */
function trimmedWindow(y: readonly number[], rep: Rep, rateHz: number): { onset: number; offset: number } {
  const run = Math.max(2, Math.round(DWELL_MIN_S * rateHz) + 1); // samples in a pause: first to last spans DWELL_MIN_S
  const topY = y[rep.topIndex] as number;

  let beforeTop = rep.topIndex;
  while (beforeTop > rep.startIndex && (y[beforeTop] as number) >= topY - DWELL_BAND_M) beforeTop--;
  let onset = rep.startIndex;
  for (let last = beforeTop; last >= rep.startIndex; last--) {
    if (last - run + 1 >= 0 && isPause(y, last - run + 1, last)) {
      onset = last;
      break;
    }
  }

  let afterTop = rep.topIndex;
  while (afterTop < rep.endIndex && (y[afterTop] as number) >= topY - DWELL_BAND_M) afterTop++;
  let offset = rep.endIndex;
  for (let first = afterTop; first <= rep.endIndex; first++) {
    if (first + run - 1 < y.length && isPause(y, first, first + run - 1)) {
      offset = first;
      break;
    }
  }

  if (!(onset < rep.topIndex && rep.topIndex < offset && offset - onset >= 2)) {
    return { onset: rep.startIndex, offset: rep.endIndex };
  }
  return { onset, offset };
}

function requireNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a finite number >= 0, got ${value}`);
}

export function analyzeSession(frames: readonly PoseFrame[], options: SessionOptions): SessionResult {
  requireNonNegativeFinite("massKg", options.massKg);
  requireNonNegativeFinite("gEnvMs2", options.gEnvMs2);
  requireNonNegativeFinite("deviceForceN", options.deviceForceN ?? 0);
  const metersPerUnit = options.metersPerUnit;
  if (metersPerUnit !== null && (!Number.isFinite(metersPerUnit) || metersPerUnit <= 0)) {
    throw new RangeError(`metersPerUnit must be a finite number > 0, or null, got ${metersPerUnit}`);
  }

  if (options.cutoffHz !== undefined) {
    requireFinite("cutoffHz", options.cutoffHz);
    if (options.cutoffHz <= 0) throw new RangeError(`cutoffHz must be > 0, got ${options.cutoffHz}`);
  }

  const quality = assessQuality(frames, metersPerUnit !== null);
  if (quality.reasons.length > 0 || metersPerUnit === null) {
    return { ok: false, reasons: quality.reasons, quality };
  }

  const grid = resampleUniform(frames);
  // The filter needs more samples than its padding; a recording shorter than that is TOO_SHORT (at the cutoff asked for).
  const cutoffHz = options.cutoffHz ?? DEFAULT_CUTOFF_HZ;
  if (cutoffHz >= grid.rateHz / 2) throw new RangeError(`cutoffHz must be below rateHz / 2 (${grid.rateHz / 2}), got ${cutoffHz}`);
  if (grid.tS.length <= filterPaddingSamples(grid.rateHz, cutoffHz)) {
    const reasons: RefusalReason[] = ["TOO_SHORT"];
    return { ok: false, reasons, quality: { ...quality, reasons } };
  }
  const uniform: PoseFrame[] = grid.tS.map((tS, i) => ({ tS, wristY: grid.wristY[i] as number, visibility: 1 }));
  const metres = toMetersUp(uniform, metersPerUnit);
  const smoothed = lowPassZeroPhase(metres.map((p) => p.yM), grid.rateHz, cutoffHz);
  const samples = metres.map((p, i) => ({ tS: p.tS, yM: smoothed[i] as number }));
  const t0 = (frames[0] as PoseFrame).tS;

  const reps: RepResult[] = segmentReps(smoothed, options.minPhaseDisplacementM).map((rep) => {
    const { onset, offset } = trimmedWindow(smoothed, rep, grid.rateHz);
    const window = samples.slice(onset, offset + 1);
    const work = trajectoryWork(window, options.massKg, options.gEnvMs2, { deviceForceN: options.deviceForceN ?? 0 });
    const start = samples[onset] as { tS: number; yM: number };
    const top = samples[rep.topIndex] as { tS: number; yM: number };
    const end = samples[offset] as { tS: number; yM: number };
    return {
      startS: start.tS - t0,
      durationS: end.tS - start.tS,
      liftDurationS: top.tS - start.tS,
      rangeOfMotionM: top.yM - start.yM,
      positiveWorkJ: work.positiveWorkJ,
      negativeWorkJ: work.negativeWorkJ,
      peakForceN: work.peakForceN,
      impulseNs: work.impulseNs,
    };
  });

  return {
    ok: true,
    reps,
    totalPositiveWorkJ: reps.reduce((sum, r) => sum + r.positiveWorkJ, 0),
    maxPeakForceN: reps.reduce((max, r) => Math.max(max, r.peakForceN), 0),
    quality,
    provenance: { loadSource: "CAMERA", confidence: confidenceOf(quality) },
  };
}
