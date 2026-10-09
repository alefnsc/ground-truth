/**
 * Session analysis: noisy wrist positions in, per-repetition work, peak force and range
 * of motion out, or a refusal with reason codes.
 *
 * Pipeline: assessQuality → refuse if any reason → resampleUniform → toMetersUp →
 * lowPassZeroPhase → segmentReps → trajectoryWork per rep.
 */

import { trajectoryWork, type Confidence, type Provenance } from "@ground-truth/physics";
import type { PoseFrame } from "./frames";
import { lowPassZeroPhase } from "./filter";
import { assessQuality, resampleUniform, type QualityReport, type RefusalReason } from "./quality";
import { toMetersUp } from "./scale";
import { segmentReps } from "./segment";

/** Judgement call: HIGH confidence needs a frame rate of at least this. */
export const HIGH_CONFIDENCE_MIN_RATE_HZ = 50;
/** Judgement call: HIGH confidence allows at most this fraction of low-visibility frames. */
export const HIGH_CONFIDENCE_MAX_LOW_VISIBILITY = 0.02;
/** Judgement call: a frame rate below this is LOW confidence. */
export const LOW_CONFIDENCE_BELOW_RATE_HZ = 30;
/** Judgement call: more than this fraction of low-visibility frames is LOW confidence. */
export const LOW_CONFIDENCE_ABOVE_LOW_VISIBILITY = 0.05;

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
  startS: number; // seconds from the first frame of the recording to the start of the lift
  durationS: number;
  rangeOfMotionM: number; // height of the lift, smoothed top minus smoothed start
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

// 1/(1/30) is not exactly 30 in floating point; a camera running at exactly a boundary belongs to the middle band.
const RATE_EPSILON = 1e-9;

function confidenceOf(quality: QualityReport): Confidence {
  if (quality.rateHz < LOW_CONFIDENCE_BELOW_RATE_HZ * (1 - RATE_EPSILON) || quality.lowVisibilityFraction > LOW_CONFIDENCE_ABOVE_LOW_VISIBILITY) {
    return "LOW";
  }
  if (quality.rateHz >= HIGH_CONFIDENCE_MIN_RATE_HZ * (1 - RATE_EPSILON) && quality.lowVisibilityFraction <= HIGH_CONFIDENCE_MAX_LOW_VISIBILITY) {
    return "HIGH";
  }
  return "MEDIUM";
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

  const quality = assessQuality(frames, metersPerUnit !== null);
  if (quality.reasons.length > 0 || metersPerUnit === null) {
    return { ok: false, reasons: quality.reasons, quality };
  }

  const grid = resampleUniform(frames);
  const uniform: PoseFrame[] = grid.tS.map((tS, i) => ({ tS, wristY: grid.wristY[i] as number, visibility: 1 }));
  const metres = toMetersUp(uniform, metersPerUnit);
  const smoothed = lowPassZeroPhase(metres.map((p) => p.yM), grid.rateHz, options.cutoffHz);
  const samples = metres.map((p, i) => ({ tS: p.tS, yM: smoothed[i] as number }));
  const t0 = (frames[0] as PoseFrame).tS;

  const reps: RepResult[] = segmentReps(smoothed, options.minPhaseDisplacementM).map((rep) => {
    const window = samples.slice(rep.startIndex, rep.endIndex + 1);
    const work = trajectoryWork(window, options.massKg, options.gEnvMs2, { deviceForceN: options.deviceForceN ?? 0 });
    const start = samples[rep.startIndex] as { tS: number; yM: number };
    const top = samples[rep.topIndex] as { tS: number; yM: number };
    const end = samples[rep.endIndex] as { tS: number; yM: number };
    return {
      startS: start.tS - t0,
      durationS: end.tS - start.tS,
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
