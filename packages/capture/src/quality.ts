/**
 * Quality gate, gap filling and uniform resampling. A session that cannot be measured
 * honestly is refused with reason codes (a return value, never an exception).
 */

import type { PoseFrame } from "./frames";

export type RefusalReason = "NO_SCALE" | "LOW_FRAME_RATE" | "LANDMARK_LOST" | "GAP_TOO_LONG" | "TOO_SHORT";

/** Judgement call: below this a 1 s lift has too few samples. */
export const MIN_RATE_HZ = 24;
/** Judgement call: a frame whose landmark visibility is below this is not trusted. */
export const VISIBILITY_THRESHOLD = 0.5;
/** Judgement call. */
export const MAX_LOW_VISIBILITY_FRACTION = 0.1;
/** Judgement call: a quarter of a typical 1 s lift. */
export const MAX_GAP_S = 0.25;
/** Judgement call: one rep takes about 2 s; a recording under 1 s cannot contain one. */
export const MIN_DURATION_S = 1.0;

export interface QualityReport {
  rateHz: number; // median frame rate
  lowVisibilityFraction: number;
  longestGapS: number; // longest run of missing or low-visibility time
  durationS: number;
  reasons: RefusalReason[]; // empty when acceptable
}

function validateFrames(frames: readonly PoseFrame[]): void {
  let previousT = Number.NEGATIVE_INFINITY;
  frames.forEach((f, i) => {
    if (!Number.isFinite(f.tS)) throw new RangeError(`frames[${i}].tS must be a finite number, got ${f.tS}`);
    if (f.tS <= previousT) {
      throw new RangeError(`frames[${i}].tS must be greater than frames[${i - 1}].tS (time must be strictly increasing)`);
    }
    previousT = f.tS;
    if (!Number.isFinite(f.visibility) || f.visibility < 0 || f.visibility > 1) {
      throw new RangeError(`frames[${i}].visibility must be within [0, 1], got ${f.visibility}`);
    }
  });
}

/**
 * Median frame rate over ALL frames (the camera's rate, not the usable one), so a hole
 * in the timestamps or a run of flagged frames does not move it. 0 when under 2 frames.
 */
function medianRateHz(frames: readonly PoseFrame[]): number {
  if (frames.length < 2) return 0;
  const dts = frames.slice(1).map((f, i) => f.tS - (frames[i] as PoseFrame).tS).sort((a, b) => a - b);
  const mid = dts.length >> 1;
  const medianDt = dts.length % 2 === 1 ? (dts[mid] as number) : ((dts[mid - 1] as number) + (dts[mid] as number)) / 2;
  return 1 / medianDt;
}

const isVisible = (f: PoseFrame): boolean => f.visibility >= VISIBILITY_THRESHOLD;

/**
 * Gaps are measured between usable frames: the time from one visible frame to the next
 * visible one, so a run of k lost frames at rate r is (k + 1) / r, and a hole in the
 * timestamps is its own width. Time lost at the start or end of the recording (before
 * the first or after the last visible frame) counts too. With no visible frame the
 * whole recording is one gap.
 */
function longestGapS(frames: readonly PoseFrame[]): number {
  if (frames.length === 0) return 0;
  const first = (frames[0] as PoseFrame).tS;
  const last = (frames[frames.length - 1] as PoseFrame).tS;
  let longest = 0;
  let previousVisibleT = first;
  let sawVisible = false;
  for (const f of frames) {
    if (!isVisible(f)) continue;
    if (sawVisible) longest = Math.max(longest, f.tS - previousVisibleT);
    else longest = Math.max(longest, f.tS - first); // lost time at the start
    previousVisibleT = f.tS;
    sawVisible = true;
  }
  if (!sawVisible) return last - first;
  return Math.max(longest, last - previousVisibleT); // lost time at the end
}

export function assessQuality(frames: readonly PoseFrame[], hasScale: boolean): QualityReport {
  validateFrames(frames);
  const rateHz = medianRateHz(frames);
  const lowVisibilityFraction = frames.length === 0 ? 0 : frames.filter((f) => !isVisible(f)).length / frames.length;
  const gapS = longestGapS(frames);
  const durationS = frames.length < 2 ? 0 : (frames[frames.length - 1] as PoseFrame).tS - (frames[0] as PoseFrame).tS;

  const reasons: RefusalReason[] = [];
  if (!hasScale) reasons.push("NO_SCALE");
  // 1/(1/24) is not exactly 24 in floating point; a camera running at exactly the minimum must pass.
  if (rateHz < MIN_RATE_HZ * (1 - 1e-9)) reasons.push("LOW_FRAME_RATE");
  if (lowVisibilityFraction > MAX_LOW_VISIBILITY_FRACTION) reasons.push("LANDMARK_LOST");
  if (gapS > MAX_GAP_S) reasons.push("GAP_TOO_LONG");
  if (durationS < MIN_DURATION_S) reasons.push("TOO_SHORT");

  return { rateHz, lowVisibilityFraction, longestGapS: gapS, durationS, reasons };
}

/**
 * Drops low-visibility frames (their wristY is never read), then linearly interpolates
 * onto a uniform grid at the median frame rate. The grid runs from the first to the last
 * visible frame: nothing is extrapolated. tS is on the frames' own clock.
 */
export function resampleUniform(frames: readonly PoseFrame[]): { rateHz: number; tS: number[]; wristY: number[] } {
  validateFrames(frames);
  const rateHz = medianRateHz(frames);
  const kept = frames.filter(isVisible);
  if (kept.length < 2) {
    throw new RangeError(`frames must contain at least 2 frames with visibility >= ${VISIBILITY_THRESHOLD}, got ${kept.length}`);
  }
  kept.forEach((f) => {
    if (!Number.isFinite(f.wristY)) throw new RangeError(`wristY of a visible frame must be a finite number, got ${f.wristY}`);
  });

  const t0 = (kept[0] as PoseFrame).tS;
  const tEnd = (kept[kept.length - 1] as PoseFrame).tS;
  const count = Math.floor((tEnd - t0) * rateHz + 1e-9) + 1;
  const tS: number[] = new Array<number>(count);
  const wristY: number[] = new Array<number>(count);
  let j = 0; // kept[j] <= t < kept[j + 1]
  for (let k = 0; k < count; k++) {
    const t = t0 + k / rateHz;
    while (j < kept.length - 2 && (kept[j + 1] as PoseFrame).tS <= t) j++;
    const a = kept[j] as PoseFrame;
    const b = kept[j + 1] as PoseFrame;
    const w = (t - a.tS) / (b.tS - a.tS);
    tS[k] = t;
    wristY[k] = a.wristY + w * (b.wristY - a.wristY);
  }
  return { rateHz, tS, wristY };
}
