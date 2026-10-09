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
import { assessQuality, resampleUniform, type QualityOptions, type QualityReport, type RefusalReason } from "./quality";
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
 * (a few millimetres) and below the 10 cm rep threshold. It only DETECTS pauses: a run
 * stays inside this band until the movement has already travelled up to 1.5 cm, so the
 * rep boundary is not placed at the pause's edge but at the rest level (ONSET_TOLERANCE_M).
 */
export const DWELL_BAND_M = 0.015;
/**
 * Judgement call: how far from a pause's rest level (metres) a sample may be and still be
 * rest. It is sized to the residual noise of the smoothed signal, a few tenths of a
 * millimetre for ±2 mm input noise and about 1 mm for ±5 mm, with margin for the filter's
 * pre-ringing; it is not tuned to any scenario. The lift starts at the last pause sample
 * within this of the level, the lowering ends at the first. A min-jerk lift of 0.5 m in
 * 1 s covers 3 mm in 0.08 s, so the onset still reads a little late (about 0.6 % of that
 * range of motion is left out at each end).
 */
export const ONSET_TOLERANCE_M = 0.003;

/**
 * Measured in the physics review and in this package's review, on synthetic lifts at the
 * default 4 Hz cutoff: a lift shorter than this is shaped by the filter (work and peak
 * force read low, range of motion high; see the README table). It is compared with
 * `liftDurationS`, which is measured on the TRIMMED window and so reads about 8 % under
 * the full time of a 1 s lift (the first 3 mm are left out): 0.7 s here is a lift of about 0.77 s.
 */
export const FILTER_LIMITED_LIFT_S = 0.7;

/**
 * False until the pipeline has been checked against real video (a tape-measured rep, a
 * known mass through a measured height). While it is false the confidence grade is capped
 * at MEDIUM: the grade describes CAPTURE CONDITIONS (frame rate, lost frames), not accuracy,
 * and it was HIGH for a rep that read +121 % and for a 3 % scale error.
 */
export const VALIDATED_ON_REAL_VIDEO = false;

export interface SessionOptions extends QualityOptions {
  massKg: number;
  gEnvMs2: number;
  /** Metres per normalised image unit (see metersPerUnitFromStature), or null if no calibration was done. */
  metersPerUnit: number | null;
  /** Constant device force resisting upward motion (e.g. an ARED setting). Default 0. */
  deviceForceN?: number;
  cutoffHz?: number;
  minPhaseDisplacementM?: number;
  // visibilityThreshold and maxGapS (from QualityOptions) move the quality gate's limits; the defaults are VISIBILITY_THRESHOLD and MAX_GAP_S.
}

export interface RepResult {
  startS: number; // seconds from the first frame of the recording to the movement onset (where the position leaves the rest level before the lift)
  durationS: number; // movement onset to movement offset (where the position reaches the rest level after the lowering)
  liftDurationS: number; // movement onset to the top, the turnaround the segmenter found
  /** True when liftDurationS is under FILTER_LIMITED_LIFT_S: the 4 Hz default cutoff shapes a lift this fast, so work and peak force read low. */
  filterLimited: boolean;
  rangeOfMotionM: number; // height of the lift, smoothed top minus smoothed onset
  positiveWorkJ: number;
  negativeWorkJ: number; // <= 0
  peakForceN: number;
  impulseNs: number;
}

/**
 * `provenance.confidence` grades the CAPTURE CONDITIONS (frame rate, lost frames), not the
 * accuracy of the numbers, and is capped at MEDIUM while VALIDATED_ON_REAL_VIDEO is false.
 */
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

/**
 * The grade of the CAPTURE CONDITIONS alone, before the real-video cap: frame rate and
 * lost frames. It says nothing about accuracy: scale, depth and the pose model's noise
 * are not in it.
 */
export function gradeCaptureConditions(quality: Pick<QualityReport, "rateHz" | "lowVisibilityFraction">): Confidence {
  if (quality.rateHz < LOW_CONFIDENCE_BELOW_RATE_HZ || quality.lowVisibilityFraction > LOW_CONFIDENCE_ABOVE_LOW_VISIBILITY) {
    return "LOW";
  }
  if (quality.rateHz >= HIGH_CONFIDENCE_MIN_RATE_HZ && quality.lowVisibilityFraction <= HIGH_CONFIDENCE_MAX_LOW_VISIBILITY) {
    return "HIGH";
  }
  return "MEDIUM";
}

/** The reported grade: the capture-conditions grade, capped at MEDIUM until VALIDATED_ON_REAL_VIDEO. */
function confidenceOf(quality: QualityReport): Confidence {
  const grade = gradeCaptureConditions(quality);
  return grade === "HIGH" && !VALIDATED_ON_REAL_VIDEO ? "MEDIUM" : grade;
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

/** Median of y[from..to] (the mean of the middle two when the count is even). */
function median(y: readonly number[], from: number, to: number): number {
  const sorted = y.slice(from, to + 1).sort((p, q) => p - q);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * The pause is y[last - run + 1 .. last] and the lift starts after it. Its rest level is the median of its
 * first half, which the coming lift has not reached; the lift starts at the last sample of the pause within
 * ONSET_TOLERANCE_M of that level. If no sample is that close (a level between two samples that are further
 * apart than the tolerance, which a pause that follows a movement at once can produce) the old boundary, the
 * pause's last sample, stays.
 */
function onsetAtRest(y: readonly number[], last: number, run: number): number {
  const first = last - run + 1;
  const level = median(y, first, first + (run >> 1) - 1);
  for (let i = last; i >= first; i--) if (Math.abs((y[i] as number) - level) <= ONSET_TOLERANCE_M) return i;
  return last;
}

/** Mirror image of onsetAtRest: the pause is y[first .. first + run - 1], its level is the median of its SECOND half, and the lowering ends at its first sample within ONSET_TOLERANCE_M of that level (else the old boundary, `first`, stays). */
function offsetAtRest(y: readonly number[], first: number, run: number): number {
  const last = first + run - 1;
  const level = median(y, last - (run >> 1) + 1, last);
  for (let i = first; i <= last; i++) if (Math.abs((y[i] as number) - level) <= ONSET_TOLERANCE_M) return i;
  return first;
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
 *    that ends at or after the segmenter's start. A pause half-way up (rack to shoulders,
 *    then press) is such a pause, so the press starts where it ends.
 *  - Offset. Walk forward from the top, over the top plateau, to the first pause that
 *    starts at or before the segmenter's end.
 *  - Where in the pause the boundary goes. DWELL_BAND_M only detects the pause: a run
 *    stays inside the band until the movement has already travelled up to 1.5 cm, so the
 *    pause's last (first) sample is up to 1.5 cm into the lift (lowering), and putting the
 *    boundary there systematically cost a rep its first and last centimetres (work -3.2 %,
 *    range of motion -2.6 % for 0.5 m, twice that for 0.25 m). The boundary is placed at
 *    the rest level instead. The level is the median of the half of the pause the movement
 *    has not reached (the first half before a lift, the second half after a lowering); the
 *    lift starts at the last pause sample within ONSET_TOLERANCE_M of it, the lowering ends
 *    at the first. The boundary can only fall between the true rest and the pause's edge
 *    (the old boundary), so a level contaminated by the movement (a pause that follows a
 *    movement at once, a lift slow enough to begin inside the window) leaves the boundary
 *    no further from the truth than the edge was. Checked over 558 reps (lifts of 0.6 to
 *    4 s, rests of 0 to 3 s, noise to ±5 mm, heights of 0.15 to 0.5 m, racks with 0.35 s
 *    pauses): no rep's work or range of motion error grew by more than 0.05 points, bar
 *    one whose -0.5 % range of motion became +0.8 % by the filter's pre-ringing. A guard
 *    that kept the edge whenever the half of the pause was not flat was tried and
 *    removed: it only fired where the refined boundary was better (reps with no rest
 *    between them: work -3.2 % with the guard, -0.9 % without). If no pause sample is
 *    within the tolerance of the level, the edge sample stays.
 *  - A pause may reach outside the segmenter's rep (a rest is split at its lowest sample,
 *    so part of it lies in the neighbouring rep), but the onset is never before the
 *    segmenter's start nor the offset after its end.
 *  - No pause found (reps with no rest between them): the segmenter's boundary is kept,
 *    which is where the two reps meet. A movement under the rep threshold that is NOT
 *    separated from a rep by a pause (it follows the lowering at once) stays in that
 *    rep; one with a pause either side is attributed to neither.
 *
 * Residual bias: the first and last ONSET_TOLERANCE_M of the movement are judged rest,
 * about ONSET_TOLERANCE_M / ROM of the range of motion (0.6 % for 0.5 m) and a smaller
 * share of the work; see the README for the measured values. A pause of DWELL_MIN_S or
 * more inside a lift splits it: only the part after the last such pause is measured.
 */
function trimmedWindow(y: readonly number[], rep: Rep, rateHz: number): { onset: number; offset: number } {
  const run = Math.max(2, Math.round(DWELL_MIN_S * rateHz) + 1); // samples in a pause: first to last spans DWELL_MIN_S
  const topY = y[rep.topIndex] as number;

  let beforeTop = rep.topIndex;
  while (beforeTop > rep.startIndex && (y[beforeTop] as number) >= topY - DWELL_BAND_M) beforeTop--;
  let onset = rep.startIndex;
  for (let last = beforeTop; last >= rep.startIndex; last--) {
    if (last - run + 1 >= 0 && isPause(y, last - run + 1, last)) {
      onset = Math.max(onsetAtRest(y, last, run), rep.startIndex);
      break;
    }
  }

  let afterTop = rep.topIndex;
  while (afterTop < rep.endIndex && (y[afterTop] as number) >= topY - DWELL_BAND_M) afterTop++;
  let offset = rep.endIndex;
  for (let first = afterTop; first <= rep.endIndex; first++) {
    if (first + run - 1 < y.length && isPause(y, first, first + run - 1)) {
      offset = Math.min(offsetAtRest(y, first, run), rep.endIndex);
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

  const quality = assessQuality(frames, metersPerUnit !== null, options);
  if (quality.reasons.length > 0 || metersPerUnit === null) {
    return { ok: false, reasons: quality.reasons, quality };
  }

  const grid = resampleUniform(frames, options);
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
  // startS counts from the first frame that has a usable timestamp, so a clock that does not start at 0 changes nothing.
  const t0 = (frames.find((f) => Number.isFinite(f.tS)) as PoseFrame).tS;

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
      filterLimited: top.tS - start.tS < FILTER_LIMITED_LIFT_S,
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
