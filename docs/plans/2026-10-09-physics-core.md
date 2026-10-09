# Physics Core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A dependency-free TypeScript package of pure functions that turns a recorded exercise session into the two currencies of the brief: energy (mechanical work, J) and load (peak force, N, and a skeletal load stimulus).

**Architecture:** One npm workspace package, `packages/physics`, with no runtime dependencies and no I/O. Every function takes plain numbers and returns plain objects, so the same code runs in a browser, in the demo and inside another product. Camera capture and the demo screen are separate plans that import this package.

**Tech stack:** TypeScript 5 (strict), Vitest, npm workspaces, Node 24.

**Authority:** [`docs/strategy.md`](../strategy.md) §2 and §3. Where this plan and the brief disagree, the brief wins and the disagreement is reported, not silently resolved.

## Global constraints

- No runtime dependencies. Dev dependencies: `typescript`, `vitest` only.
- SI units everywhere, and the unit is in the name: `massKg`, `forceN`, `workJ`, `powerW`, `speedMs`, `gEnvMs2`.
- Pure functions. No classes, no module state, no `Date.now()`, no randomness.
- Measured is kept apart from estimated. Mechanical work and peak force are computed from inputs. Metabolic cost is only ever returned as a labelled range, never one number.
- Kilocalories are never derived from mechanics as a single figure (brief §2, "Metabolic energy").
- Every constant that comes from the brief carries a comment with its source. A constant this plan *infers* says so in the comment with the word `CALIBRATED`.
- Invalid input throws `RangeError` with a message naming the argument. Invalid means: non-finite numbers, negative mass, fewer than 3 trajectory samples, non-increasing time.
- Tests use `toBeCloseTo` or an explicit relative tolerance; never exact float equality on computed values.
- Commit after each task. Run from the repo root: `npm test`.

## Two places where the numbers differ from the brief's prose

Both are recorded here so nobody "fixes" the tests to match the prose.

1. **Ergometer error.** The brief says an 11.8 W offset on a 75 W prescription "is a 16 % error". That counts the offset alone (11.8 / 75 = 15.7 %). The full correction `0.98 × 75 − 11.8` gives 61.7 W, which is 17.7 % below the display. The tests assert 61.7 W.
2. **Load stimulus gap.** The brief says achieved peak load is about a quarter of Earth-equivalent "and with m = 4 that is a very large gap in S". `S` is homogeneous of degree 1 in peak load, so a quarter of the load gives exactly a quarter of `S`. What is very large is the number of cycles needed to compensate: `(1/0.25)^4 = 256` times as many. The package exposes that number as `cyclesToMatch`.

---

### Task 1: Workspace, constants and session types

**Files:**
- Create: `package.json`, `tsconfig.base.json`
- Create: `packages/physics/package.json`, `packages/physics/tsconfig.json`, `packages/physics/vitest.config.ts`
- Create: `packages/physics/src/constants.ts`, `packages/physics/src/session.ts`, `packages/physics/src/index.ts`
- Test: `packages/physics/test/constants.test.ts`

**Step 1: Scaffold**

Root `package.json`: `"private": true`, `"workspaces": ["packages/*"]`, script `"test": "npm test --workspaces"`. No `license` field yet (the licence is an open decision for the repo owner).

`packages/physics/package.json`: name `@ground-truth/physics`, version `0.1.0`, `"type": "module"`, `"main"`/`"types"` pointing at `src/index.ts`, scripts `"test": "vitest run"` and `"typecheck": "tsc --noEmit"`.

`tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `target` and `module` `ES2022`, `moduleResolution` `Bundler`.

**Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { G_ENV_MS2, STANDARD_GRAVITY_MS2, GENC_2010_PEAK_LOAD_DECREMENT } from "../src/index";

describe("constants", () => {
  it("carries the brief's gravity table", () => {
    expect(G_ENV_MS2.EARTH).toBe(9.81);
    expect(G_ENV_MS2.MARS).toBe(3.71);
    expect(G_ENV_MS2.MOON).toBe(1.62);
    expect(G_ENV_MS2.ISS).toBe(0);
    expect(STANDARD_GRAVITY_MS2).toBe(9.81);
  });

  it("carries Genc 2010's on-orbit peak-load decrements", () => {
    expect(GENC_2010_PEAK_LOAD_DECREMENT).toEqual({ running: 0.75, walking: 0.77, squat: 0.65 });
  });
});
```

**Step 3: Run it; expect failure** (`Cannot find module '../src/index'`).

**Step 4: Implement**

`constants.ts`: `G_ENV_MS2` (as const, keys `EARTH | MARS | MOON | ISS`; ISS is `0` — the brief gives ~10⁻⁶ g, treated as zero), `STANDARD_GRAVITY_MS2 = 9.81`, `GENC_2010_PEAK_LOAD_DECREMENT`, each with a source comment.

`session.ts`: types only, mirroring brief §3 in camelCase:

```ts
export type Body = "EARTH" | "MOON" | "MARS" | "ISS" | "TRANSIT";
export type MassSource = "SCALE" | "SLAMMD" | "MANUAL_ENTRY";
export type Device = "ARED" | "T2" | "FERGO" | "FREE_WEIGHT" | "NONE";
export type LoadSource = "MANUAL_ENTRY" | "CAMERA" | "DEVICE";
export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export interface Environment {
  gEnvMs2: number;
  body: Body;
  massKg: number;
  massSource: MassSource;
  massMeasuredAt: string; // ISO 8601
}

export interface AppliedLoad {
  device: Device;
  settingN: number | null;
  eccentricRatio: number | null;
  supportFraction: number | null; // T2 only: SLD as a fraction of 1 g body weight
}

export interface Provenance {
  loadSource: LoadSource;
  confidence: Confidence;
}
```

`index.ts` re-exports both modules.

**Step 5: Run tests and `npm run typecheck -w @ground-truth/physics`; expect pass.**

**Step 6: Commit** — `feat(physics): workspace, gravity constants and session types`

---

### Task 2: Mechanics — work and peak force from a trajectory

**Files:**
- Create: `packages/physics/src/mechanics.ts`
- Test: `packages/physics/test/mechanics.test.ts`
- Modify: `packages/physics/src/index.ts`

**What it computes.** Given vertical position samples of a mass, `F = m · (g_env + a)` and `W = ∫ F dy`. Work is split by sign: positive work (force and motion in the same direction; on Earth, the lift) and negative work (on Earth, the lowering). In free fall a mass still costs work to accelerate and gives it back when stopped, so the two cancel.

**API**

```ts
export interface Sample { tS: number; yM: number }

export interface TrajectoryWork {
  positiveWorkJ: number;   // >= 0
  negativeWorkJ: number;   // <= 0
  netWorkJ: number;        // positive + negative
  peakForceN: number;      // max |F| over the trajectory
  displacementM: number;   // y_last - y_first
}

export function trajectoryWork(samples: readonly Sample[], massKg: number, gEnvMs2: number): TrajectoryWork;

export interface MetabolicRange { lowJ: number; highJ: number; kind: "ESTIMATE"; basis: string }
export function metabolicRange(positiveWorkJ: number): MetabolicRange;
```

Discretisation is the implementer's choice, with one requirement: it must be energy-consistent, meaning that for a mass that starts and ends at rest, `netWorkJ` equals `m · g · displacement` within the tolerances below at 60 Hz sampling. Document the scheme in a comment.

`metabolicRange` uses gross efficiency 0.20–0.25 (brief §2: `E_met ≈ W_mech / η`, a cross-check for cycling, applied here as a labelled range): `lowJ = W / 0.25`, `highJ = W / 0.20`, `basis` names the efficiency band.

**Step 1: Write the failing tests**

Helper in the test file: `cosineLift(heightM, durationS, hz)` returns samples of `y = (h/2)(1 − cos(π t / T))` for `t` in `[0, T]`; `cosineRep` appends the mirrored lowering.

Test cases, all with a 10 kg mass, `h = 0.5 m`, `T = 1 s`, 60 Hz:

| Case | Expectation |
|---|---|
| Lift on Earth | `positiveWorkJ` ≈ 49.05 (within 1 %); `negativeWorkJ` ≈ 0 (abs < 0.5); `netWorkJ` ≈ 49.05; `displacementM` ≈ 0.5 |
| Lift on Earth, peak force | `peakForceN` ≈ 122.77 (within 2 %) — `10 × (9.81 + 0.25 π²)` |
| Lift then lower on Earth | `positiveWorkJ` ≈ 49.05, `negativeWorkJ` ≈ −49.05, `netWorkJ` ≈ 0 (abs < 0.5) |
| Same lift on the ISS (`g = 0`) | `positiveWorkJ` ≈ 3.084 (within 3 %) — `½ · m · v_max²`, `v_max = (h/2)(π/T)`; `negativeWorkJ` ≈ −3.084; `netWorkJ` ≈ 0 (abs < 0.1) |
| Same lift on the Moon | `netWorkJ` ≈ 8.10 (within 1 %) — `10 × 1.62 × 0.5` |
| Sampling at 30 Hz | Earth lift `netWorkJ` still within 1 % of 49.05 |
| Non-uniform time steps | Earth lift resampled with jittered `tS` (deterministic jitter, no randomness) still within 2 % |
| Invalid input | 2 samples, non-increasing `tS`, `massKg < 0`, `NaN` in a sample: each throws `RangeError` |
| `metabolicRange(49.05)` | `lowJ` ≈ 196.2, `highJ` ≈ 245.25, `kind === "ESTIMATE"`, `basis` mentions `0.20` and `0.25` |
| `metabolicRange(-1)` | throws `RangeError` |

**Step 2: Run; expect failure.** **Step 3: Implement.** **Step 4: Run tests and typecheck; expect pass.**

**Step 5: Commit** — `feat(physics): work and peak force from a trajectory`

---

### Task 3: Device and environment models

**Files:**
- Create: `packages/physics/src/devices.ts`
- Test: `packages/physics/test/devices.test.ts`
- Modify: `packages/physics/src/index.ts`

**API and the formula behind each**

```ts
// Cycle ergometer (CEVIS dynamometer correction, NASA/TP-2007-214760)
export function ergometerActualPowerW(displayedPowerW: number): number;          // 0.98·P − 11.8, floored at 0
export function ergometerWorkJ(samples: readonly { tS: number; displayedPowerW: number }[]): number; // ∫ P_actual dt, trapezoid

// Body-weight replacement (brief §2)
export function totalForceN(deviceForceN: number, massKg: number, gEnvMs2: number): number;                 // F_device + m·g_env
export function deviceForceForEarthEquivalenceN(targetForceN: number, massKg: number, gEnvMs2: number): number; // F_target − m·g_env

// Treadmill with subject load device (brief §2)
export function treadmillEffectiveForceN(massKg: number, gEnvMs2: number, supportFraction: number): number; // m·g_env + fraction·m·9.81

// ARED (brief §2)
export function aredRepWorkJ(settingN: number, strokeM: number, eccentricRatio?: number): { concentricJ: number; eccentricJ: number };
export function aredPeakForceN(settingN: number, strokeM: number, repPeriodS: number): number;

// Froude walk-run transition (brief §2)
export function froudeTransitionSpeedMs(gEnvMs2: number, legLengthM: number, froude?: number): number; // √(Fr·g·L), Fr default 0.5
```

ARED modelling choices, to be stated in comments:

- Over a stroke that starts and ends at rest the flywheel's inertial term does no net work, so `concentricJ = settingN × strokeM`. `eccentricJ = eccentricRatio × concentricJ`, default ratio `0.9` (brief: eccentric ≤ 0.90 × concentric); a ratio outside `[0, 0.9]` throws.
- Peak force adds an inertial term `M_eff × a_peak`, with a sinusoidal stroke `a_peak = (stroke/2)(2π/period)²`.
- `ARED_FLYWHEEL_EFFECTIVE_MASS_KG` is **CALIBRATED**, not published: it is the value that reproduces the brief's anchor of +893 N at the 600 lbf (2669 N) setting, 30 in (0.762 m) stroke, 2 s period. `a_peak = 0.381 × π² = 3.7603 m/s²`, so `M_eff = 893 / 3.7603 ≈ 237.5 kg`. Compute it in code from the anchor rather than hard-coding the rounded figure.

**Step 1: Write the failing tests**

| Call | Expectation |
|---|---|
| `ergometerActualPowerW(75)` | ≈ 61.7 |
| `ergometerActualPowerW(10)` | `0` (floored; `0.98×10 − 11.8 < 0`) |
| `ergometerWorkJ` for 45 min at a constant 150 W displayed (two samples, `tS` 0 and 2700) | ≈ 365 040 (actual 135.2 W) |
| `totalForceN(1000, 78.4, 9.81)` | ≈ 1769.10 |
| `totalForceN(1000, 78.4, 0)` | `1000` |
| `deviceForceForEarthEquivalenceN(1769.104, 78.4, 0)` | ≈ 1769.10 |
| `deviceForceForEarthEquivalenceN(1769.104, 78.4, 9.81)` | ≈ 1000 |
| `treadmillEffectiveForceN(78.4, 0, 0.7)` | ≈ 538.37 |
| `treadmillEffectiveForceN(78.4, 9.81, 0)` | ≈ 769.10 |
| `aredRepWorkJ(2669, 0.762)` | `concentricJ` ≈ 2033.78, `eccentricJ` ≈ 1830.40 |
| `aredRepWorkJ(2669, 0.762, 0.95)` | throws `RangeError` |
| `aredPeakForceN(2669, 0.762, 2)` | ≈ 3562 (within 1 N) |
| `aredPeakForceN(2669, 0.762, 4)` | ≈ 2892.25 (inertial term quarters when the period doubles) |
| `froudeTransitionSpeedMs(9.81, 0.9)` | ≈ 2.101 |
| `froudeTransitionSpeedMs(1.62, 0.9)` | ≈ 0.854 |
| `froudeTransitionSpeedMs(3.71, 0.9)` | ≈ 1.292 |
| `froudeTransitionSpeedMs(0, 0.9)` | `0` |
| Negative mass, non-finite argument, `supportFraction` outside `[0, 1]` | each throws `RangeError` |

**Step 2: Run; expect failure.** **Step 3: Implement.** **Step 4: Run tests and typecheck; expect pass.**

**Step 5: Commit** — `feat(physics): ergometer, body-weight, treadmill, ARED and Froude models`

---

### Task 4: Skeletal load stimulus and cumulative deficit

**Files:**
- Create: `packages/physics/src/load.ts`
- Test: `packages/physics/test/load.test.ts`
- Modify: `packages/physics/src/index.ts`
- Create: `packages/physics/README.md`

**API**

```ts
export interface LoadBout { cycles: number; peakLoad: number } // peakLoad in any one consistent unit (N or body weights)

export const LOAD_STIMULUS_EXPONENT = 4; // Carter / Whalen / Beaupré, brief §2

// S_day = ( Σ n_i · σ_i^m )^(1/m)
export function dailyLoadStimulus(bouts: readonly LoadBout[], exponent?: number): number;

// How many times more cycles are needed to match a stimulus when peak load is `loadRatio` of the reference.
export function cyclesToMatch(loadRatio: number, exponent?: number): number; // loadRatio^(−m)

// Deficit(T) = ∫ ( S_baseline − S_achieved(t) ) dt, trapezoid over days
export function cumulativeDeficit(series: readonly { day: number; achieved: number }[], baseline: number): number;
```

The package says **load accounting**, never bone loss: these functions do bookkeeping on an input; they do not measure or predict bone. Put that sentence in the module comment and in the README.

**Step 1: Write the failing tests**

| Call | Expectation |
|---|---|
| `dailyLoadStimulus([{ cycles: 12, peakLoad: 2000 }])` | ≈ 3722.4 (`12^(1/4) × 2000`) |
| `dailyLoadStimulus([])` | `0` |
| Peaks dominate: 12 cycles at 2000 vs 1200 cycles at 500 | first is larger (3722.4 vs ≈ 2942.8) |
| Homogeneity: every `peakLoad` × 0.25 | stimulus × 0.25 exactly (relative 1e-12) |
| Two bouts `[{10, 1000}, {5, 2000}]` | ≈ `(10·1000⁴ + 5·2000⁴)^(1/4)` ≈ 3080.07 |
| `cyclesToMatch(0.25)` | `256` |
| `cyclesToMatch(1 − GENC_2010_PEAK_LOAD_DECREMENT.squat)` | ≈ 66.64 |
| `cyclesToMatch(1 − GENC_2010_PEAK_LOAD_DECREMENT.walking)` | ≈ 357.35 |
| `cyclesToMatch(1)` | `1` |
| `cyclesToMatch(0)` or negative | throws `RangeError` |
| `cumulativeDeficit` with baseline 100, achieved 25 on days 0 and 180 | `13500` |
| `cumulativeDeficit` with achieved above baseline | negative (a surplus is allowed and reported as such) |
| `cumulativeDeficit` with one point | `0` |
| Negative `cycles`, non-increasing `day` | throws `RangeError` |

Check the two-bout expectation by hand before trusting the figure above: `10·1e12 + 5·1.6e13 = 9e13`; fourth root ≈ 3080.07.

**Step 2: Run; expect failure.** **Step 3: Implement.** **Step 4: Run tests and typecheck; expect pass.**

**Step 5: README**

`packages/physics/README.md`, short: what the package is, the two currencies, one usage example per module, the "load accounting, not clinical inference" sentence, the list of what is measured versus estimated, and the two notes from "Two places where the numbers differ from the brief's prose" above.

**Step 6: Commit** — `feat(physics): load stimulus, cycles-to-match and cumulative deficit`

---

## Out of this plan

Rep segmentation and smoothing of camera trajectories (the `capture` plan), the demo screen, any UI, any network or storage code, per-bone-site stress models, the Turner/Robling saturating refinement, and any dataset work (re-read brief §6 after 2026-10-28).
