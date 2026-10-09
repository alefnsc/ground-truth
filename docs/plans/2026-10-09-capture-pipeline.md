# Capture Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn a stream of noisy wrist positions from a phone camera into per-repetition work, peak force and range of motion, or refuse the session with a stated reason.

**Architecture:** A second dependency-free package, `packages/capture`, that is pure signal processing: scale, quality gate, resampling, zero-phase low-pass, rep segmentation, then `@ground-truth/physics` for the numbers. It takes plain frame objects, so it is testable with synthetic data. The browser camera and the pose model are not in this plan; a thin adapter that produces these frames ships with the demo.

**Tech stack:** TypeScript (strict), Vitest, npm workspaces, Node 24. Depends on `@ground-truth/physics` (workspace).

**Authority:** [`docs/strategy.md`](../strategy.md) and [`packages/physics/README.md`](../../packages/physics/README.md), sections "Noise sensitivity" and "Known gaps".

## Global constraints

- No runtime dependencies other than `@ground-truth/physics`. No camera, DOM, network or storage code.
- Pure functions, SI units in names (`tS`, `yM`, `rateHz`, `cutoffHz`), `RangeError` naming the argument for invalid input.
- A session that cannot be measured honestly is **refused with reason codes**, never returned with a bad number. Refusal is a normal return value, not an exception.
- Every result carries `provenance: { loadSource: "CAMERA", confidence }`.
- Image coordinates are normalised (0–1) with **y pointing down**, as pose models report them. Conversion to metres with y pointing up happens in exactly one place.
- No `Math.random` and no clock. Test noise comes from a seeded generator defined in the test helpers.
- Tolerances in this plan are targets backed by the physics review's measurements. If one cannot be met, report the measured error; do not loosen it silently and do not tune parameters to a single test.
- Every threshold is a named, exported constant with a comment saying whether it is a published value, a measured one, or a judgement call.
- Commit after each task. `npm test` from the repo root must be clean, and `npm run typecheck --workspaces`.

---

### Task 1: Physics additions the pipeline needs

**Files:**
- Modify: `packages/physics/src/mechanics.ts`, `packages/physics/src/index.ts`, `packages/physics/README.md` (update "Known gaps")
- Test: `packages/physics/test/mechanics.test.ts`

**API changes (backward compatible)**

```ts
export interface TrajectoryOptions {
  /** Constant device force resisting upward motion, like added weight (e.g. an ARED setting). Default 0. */
  deviceForceN?: number;
}

export function trajectoryWork(samples, massKg, gEnvMs2, options?: TrajectoryOptions): TrajectoryWork;

// TrajectoryWork gains:
//   pathLengthM: number;  // Σ |Δy|
//   impulseNs: number;    // signed ∫ F dt = (m·g_env + F_device)·Δt + m·(v_end − v_start)

export function forceSeries(samples, massKg, gEnvMs2, options?: TrajectoryOptions): { tS: number; forceN: number }[]; // interior samples only
```

The force model becomes `F = m·(g_env + a) + F_device`. The device force is constant and always directed against +y, so on the way down it does negative work, exactly as weight does. Impulse is computed from end velocities, not by integrating the noisy force series.

**Tests** (10 kg, cosine lift `h = 0.5 m`, `T = 1 s`, 60 Hz unless stated)

| Case | Expectation |
|---|---|
| `g = 0`, `deviceForceN: 1000`, lift | `positiveWorkJ` ≈ 500 (1 %), `negativeWorkJ` ≈ 0, `peakForceN` ≈ 1024.67 (1 %) |
| `g = 0`, `deviceForceN: 1000`, lift then lower | `positiveWorkJ` ≈ 500, `negativeWorkJ` ≈ −500, `netWorkJ` ≈ 0 |
| No options | every existing assertion unchanged |
| `pathLengthM` | 0.5 for the lift, 1.0 for lift then lower (`displacementM` 0) |
| `impulseNs`, Earth, full lift | ≈ 98.1 (0.5 %) |
| `impulseNs`, Earth, first half of the lift (0.5 s) | ≈ 56.904 (1 %) — `49.05 + 10 × 0.7854` |
| `impulseNs`, `g = 0`, `deviceForceN: 1000`, full lift | ≈ 1000 (0.5 %) |
| `forceSeries`, constant acceleration `a = 2` on Earth | length `n − 2`, every `forceN` ≈ 118.1 |
| `deviceForceN: -1` or `NaN` | `RangeError` |

**Commit** — `feat(physics): device force, path length, impulse and force series`

---

### Task 2: Package scaffold, frame types and scale

**Files:**
- Create: `packages/capture/package.json` (name `@ground-truth/capture`, same shape as physics, `"license": "Apache-2.0"`, dependency `"@ground-truth/physics": "*"`), `tsconfig.json`, `vitest.config.ts`
- Create: `packages/capture/src/frames.ts`, `packages/capture/src/scale.ts`, `packages/capture/src/index.ts`
- Test: `packages/capture/test/scale.test.ts`, helper `packages/capture/test/helpers.ts`

**Types**

```ts
export interface PoseFrame {
  tS: number;          // capture timestamp, seconds
  wristY: number;      // normalised image coordinate, y down
  visibility: number;  // 0..1 as reported by the pose model
}
```

**Scale.** The user stands upright, side-on, for a calibration frame. Stature is entered; the eye and ankle landmarks are read from the frame.

```ts
// Eye height 0.936·H and ankle height 0.039·H (Drillis & Contini segment proportions, as tabulated in Winter, Biomechanics and Motor Control of Human Movement).
export const EYE_TO_ANKLE_FRACTION_OF_STATURE = 0.897;

export function metersPerUnitFromStature(statureM: number, eyeY: number, ankleY: number): number;
// = (0.897 · statureM) / (ankleY − eyeY); throws if ankleY <= eyeY or the span is under 0.2 of the frame

export function toMetersUp(frames: readonly PoseFrame[], metersPerUnit: number): { tS: number; yM: number }[];
// yM = −wristY · metersPerUnit, shifted so the first sample is 0
```

🚩 The two proportions are quoted from memory of a standard table. Mark the constant `ANTHROPOMETRIC ESTIMATE — verify against the source before the hackathon` and say in the README that scale is the largest single source of error in the pipeline: a 3 % error in scale is a 3 % error in work.

**Tests**

| Call | Expectation |
|---|---|
| `metersPerUnitFromStature(1.80, 0.20, 0.80)` | ≈ 2.691 |
| ankle above eye, or span 0.1 | `RangeError` |
| `toMetersUp` on `wristY` 0.6 → 0.4 with scale 2.5 | `yM` 0 → 0.5 (moving up the image is positive) |

**Helpers** (`test/helpers.ts`): `lcg(seed)` returning a deterministic uniform generator in [−1, 1); `minJerk(tau)` = `10τ³ − 15τ⁴ + 6τ⁵`; `syntheticSession({ reps, heightM, upS, downS, restS, rateHz, noiseM, seed, metersPerUnit })` producing `PoseFrame[]` with rests before, between and after reps.

**Commit** — `feat(capture): package scaffold, frame types and stature scale`

---

### Task 3: Quality gate, gap filling and uniform resampling

**Files:** `packages/capture/src/quality.ts`, test `packages/capture/test/quality.test.ts`

```ts
export type RefusalReason = "NO_SCALE" | "LOW_FRAME_RATE" | "LANDMARK_LOST" | "GAP_TOO_LONG" | "TOO_SHORT";

export const MIN_RATE_HZ = 24;                    // judgement call: below this a 1 s lift has too few samples
export const VISIBILITY_THRESHOLD = 0.5;          // judgement call
export const MAX_LOW_VISIBILITY_FRACTION = 0.10;  // judgement call
export const MAX_GAP_S = 0.25;                    // judgement call: a quarter of a typical lift
export const MIN_DURATION_S = 1.0;

export interface QualityReport {
  rateHz: number;                 // median frame rate
  lowVisibilityFraction: number;
  longestGapS: number;            // longest run of missing or low-visibility time
  durationS: number;
  reasons: RefusalReason[];       // empty when acceptable
}

export function assessQuality(frames: readonly PoseFrame[], hasScale: boolean): QualityReport;

// Drops low-visibility frames, then linearly interpolates onto a uniform grid at the median rate.
export function resampleUniform(frames: readonly PoseFrame[]): { rateHz: number; tS: number[]; wristY: number[] };
```

**Tests**

| Case | Expectation |
|---|---|
| Clean 60 Hz, 6 s, with scale | no reasons; `rateHz` ≈ 60 |
| Same without scale | `["NO_SCALE"]` |
| 15 Hz | includes `LOW_FRAME_RATE` |
| 15 % of frames with visibility 0.2, scattered | includes `LANDMARK_LOST` |
| 5 % low-visibility, scattered | no reasons |
| 0.4 s of consecutive low-visibility frames | includes `GAP_TOO_LONG` |
| A 0.4 s hole in timestamps (frames missing) | includes `GAP_TOO_LONG` |
| 0.5 s recording | includes `TOO_SHORT` |
| Several problems at once | all applicable reasons, in the order of the union type |
| `resampleUniform` on jittered timestamps of a known line | values on the line within 1e-9; uniform spacing |
| `resampleUniform` with scattered low-visibility frames carrying garbage `wristY` | garbage does not appear in the output |

**Commit** — `feat(capture): quality gate, gap filling and uniform resampling`

---

### Task 4: Zero-phase low-pass filter

**Files:** `packages/capture/src/filter.ts`, test `packages/capture/test/filter.test.ts`

```ts
export const DEFAULT_CUTOFF_HZ = 4; // measured in the physics review: 3–4 Hz for peak force on ~1 s lifts

// Second-order Butterworth, applied forward then backward (zero phase), with reflected edge padding.
export function lowPassZeroPhase(values: readonly number[], rateHz: number, cutoffHz?: number): number[];
```

Biquad from the bilinear transform with pre-warping: `K = tan(π·fc/fs)`, `norm = 1 / (1 + √2·K + K²)`, `b0 = K²·norm`, `b1 = 2·b0`, `b2 = b0`, `a1 = 2·(K² − 1)·norm`, `a2 = (1 − √2·K + K²)·norm`. Two passes square the magnitude response, so the amplitude gain at frequency `f` is `1 / (1 + r⁴)` with `r = tan(π·f/fs) / tan(π·fc/fs)`.

`cutoffHz` must be below `rateHz / 2`; otherwise `RangeError`. Fewer samples than the padding needs: `RangeError`.

**Tests** (`fs = 60`, `fc = 4`; measure sine amplitude over the middle half of a 10 s signal)

| Case | Expectation |
|---|---|
| Constant input | unchanged within 1e-9, including the first and last samples |
| Linear ramp | unchanged within 1e-6 in the middle half |
| 1 Hz sine | gain ≈ 0.9963 (±0.002) |
| 4 Hz sine (the cutoff) | gain ≈ 0.5 (±0.01) |
| 20 Hz sine | gain < 0.001 |
| Zero phase: 1 Hz sine in, peaks of output | at the same sample indices as the input's (±1 sample) |
| Symmetric pulse | output symmetric about the same centre |
| `cutoffHz = 30` at 60 Hz, or 5 samples | `RangeError` |

**Commit** — `feat(capture): zero-phase Butterworth low-pass`

---

### Task 5: Repetition segmentation

**Files:** `packages/capture/src/segment.ts`, test `packages/capture/test/segment.test.ts`

```ts
export const MIN_PHASE_DISPLACEMENT_M = 0.10; // judgement call: smaller reversals are treated as jitter

export interface Rep { startIndex: number; topIndex: number; endIndex: number } // lift start, turnaround, lowering end

// Input is a smoothed, uniformly sampled vertical position in metres (up positive).
export function segmentReps(yM: readonly number[], minPhaseDisplacementM?: number): Rep[];
```

A rep is an upward phase of at least the minimum displacement followed by a downward phase of at least the minimum displacement. Turning points are local extrema of position that survive the displacement threshold (hysteresis), not raw velocity sign changes. A lift with no lowering is not a rep.

**Tests** (clean signals built from `minJerk`, 60 Hz)

| Case | Expectation |
|---|---|
| 3 reps of 0.5 m with 0.5 s rests | 3 reps; each `yM[topIndex] − yM[startIndex]` ≈ 0.5 (2 %); `startIndex < topIndex < endIndex`; reps do not overlap |
| A stationary signal with ±3 mm ripple | 0 reps |
| One lift, no lowering | 0 reps |
| 2 reps with no rest between them | 2 reps; the first `endIndex` equals the second `startIndex` (±2 samples) |
| A 0.5 m rep with a 0.05 m dip half-way up | 1 rep |
| Reps of 0.08 m | 0 reps with the default threshold; 3 with `minPhaseDisplacementM = 0.05` |
| Starts mid-lowering (first motion is down) | the partial movement is ignored; later full reps are counted |

**Commit** — `feat(capture): rep segmentation with displacement hysteresis`

---

### Task 6: Session analysis and end-to-end behaviour on noisy input

**Files:** `packages/capture/src/session.ts`, `packages/capture/src/index.ts`, `packages/capture/README.md`, test `packages/capture/test/session.test.ts`

```ts
export interface SessionOptions {
  massKg: number;
  gEnvMs2: number;
  metersPerUnit: number | null;
  deviceForceN?: number;
  cutoffHz?: number;
  minPhaseDisplacementM?: number;
}

export interface RepResult {
  startS: number; durationS: number;
  rangeOfMotionM: number;
  positiveWorkJ: number; negativeWorkJ: number;
  peakForceN: number; impulseNs: number;
}

export type SessionResult =
  | { ok: true; reps: RepResult[]; totalPositiveWorkJ: number; maxPeakForceN: number;
      quality: QualityReport; provenance: Provenance }
  | { ok: false; reasons: RefusalReason[]; quality: QualityReport };

export function analyzeSession(frames: readonly PoseFrame[], options: SessionOptions): SessionResult;
```

Pipeline: `assessQuality` → refuse if any reason → `resampleUniform` → `toMetersUp` → `lowPassZeroPhase` → `segmentReps` → `trajectoryWork` per rep.

Confidence: `HIGH` when `rateHz ≥ 50` and `lowVisibilityFraction ≤ 0.02`; `LOW` when `rateHz < 30` or `lowVisibilityFraction > 0.05`; otherwise `MEDIUM`. Named constants, judgement calls.

**Tests** — sessions from `syntheticSession`: 10 kg, 0.5 m, 1 s up, 1 s down, 0.5 s rests, Earth. Truth per rep: positive work 49.05 J, peak force 126.97 N (`10 × (9.81 + 5.7735·h/T²)`), range of motion 0.5 m.

| Case | Expectation |
|---|---|
| 3 reps, 60 Hz, no noise | 3 reps; work within 2 %, peak within 3 %, ROM within 1 % |
| 3 reps, 60 Hz, ±2 mm noise | 3 reps; work within 5 %, peak within 10 %, ROM within 3 %; confidence `HIGH` |
| 3 reps, 30 Hz, ±2 mm noise | 3 reps; work within 5 %; confidence `MEDIUM` |
| 3 reps, 60 Hz, ±5 mm noise | 3 reps; work within 10 % (peak force: assert nothing, report the measured error) |
| 3 reps, 60 Hz, ±2 mm, 4 % of frames low-visibility at fixed indices | 3 reps; work within 8 %; confidence `MEDIUM` |
| 5 reps, three different seeds | 5 reps every time |
| `metersPerUnit: null` | `ok: false`, reasons include `NO_SCALE`, no numbers present |
| 15 Hz | `ok: false`, `LOW_FRAME_RATE` |
| Stationary noisy 6 s | `ok: true`, `reps` empty, totals 0 |
| ISS, `deviceForceN: 1000`, 3 reps, ±2 mm | positive work per rep within 5 % of `1000 × 0.5 + ` the kinetic part you derive for the min-jerk profile |
| Scale 3 % too large | work 3 % too large (within 0.5 points) — documents that scale error passes straight through |

For the ISS case derive the expected positive work analytically in a comment before asserting it.

**README** (`packages/capture/README.md`): the pipeline in order; the refusal reasons and thresholds; a table of the measured errors from the tests above, labelled synthetic; the scale caveat; and "what this package does not do": no camera, no pose model, no object detection (the wrist stands in for the load), 2D only (movement must be side-on), free weights and constant device force only.

**Commit** — `feat(capture): session analysis with refusal reasons and confidence`

---

## Out of this plan

The browser camera adapter and the pose model (they ship with the demo), any UI, loading rate (a third derivative of position; revisit with real video), per-joint kinematics, multi-person frames, and anything about real-video validation, which is a manual check before the hackathon.
