# @ground-truth/capture

Dependency-free TypeScript, pure functions, no I/O, no clock, no `Math.random`. It
turns a stream of noisy wrist positions from a phone camera into per-repetition work,
peak force and range of motion, or **refuses the session with a stated reason**. The
only dependency is [`@ground-truth/physics`](../physics/README.md), which does the
arithmetic once the positions are clean.

```sh
npm test                                        # from the repo root
npm run typecheck -w @ground-truth/capture
```

```ts
import { analyzeSession, metersPerUnitFromStature, type PoseFrame } from "@ground-truth/capture";

// frames: PoseFrame[] = { tS, wristY, visibility }[]  (normalised image coordinates, y DOWN)
const metersPerUnit = metersPerUnitFromStature(1.8, eyeY, ankleY); // from an upright side-on calibration frame
const r = analyzeSession(frames, { massKg: 20, gEnvMs2: 9.81, metersPerUnit });

if (r.ok) {
  r.reps; // { startS, durationS, rangeOfMotionM, positiveWorkJ, negativeWorkJ, peakForceN, impulseNs }[]
  r.totalPositiveWorkJ; r.maxPeakForceN;
  r.provenance; // { loadSource: "CAMERA", confidence: "HIGH" | "MEDIUM" | "LOW" }
} else {
  r.reasons; // e.g. ["LOW_FRAME_RATE", "GAP_TOO_LONG"]. No measurement is returned.
}
```

A refusal is a return value, never an exception. It carries the reasons and the
quality diagnostics (frame rate, lost-frame fraction, longest gap, duration) and no
work, force, range of motion or provenance. Invalid arguments (a negative mass, a
cutoff above Nyquist, a non-finite number) are programmer errors and throw a
`RangeError` naming the argument.

## The pipeline, in order

| Step | Function | What it does |
|---|---|---|
| 1 | `assessQuality` | Frame rate, lost frames, gaps, duration. Any reason refuses the session. |
| 2 | `resampleUniform` | Drops low-visibility frames, then linear interpolation onto a uniform grid at the median frame rate. Nothing is extrapolated. |
| 3 | `toMetersUp` | The one place where image coordinates (y down) become metres (y up): `yM = −wristY · metersPerUnit`, first sample 0. |
| 4 | `lowPassZeroPhase` | 2nd-order Butterworth, forward then backward, 4 Hz by default. |
| 5 | `segmentReps` | Displacement hysteresis on position extrema. |
| 6 | `trajectoryWork` | Per rep, from `@ground-truth/physics`, with the optional constant device force. |

### Refusal reasons and thresholds

Every threshold is a named, exported constant. All are judgement calls except where
noted.

| Reason | Refused when | Constant |
|---|---|---|
| `NO_SCALE` | `metersPerUnit` is `null` | |
| `LOW_FRAME_RATE` | median frame rate < 24 Hz | `MIN_RATE_HZ` |
| `LANDMARK_LOST` | more than 10 % of frames have visibility < 0.5 | `MAX_LOW_VISIBILITY_FRACTION`, `VISIBILITY_THRESHOLD` |
| `GAP_TOO_LONG` | more than 0.25 s between usable frames | `MAX_GAP_S` |
| `TOO_SHORT` | recording under 1.0 s | `MIN_DURATION_S` |

Gaps are measured between *usable* frames: the time from one visible frame to the next.
A run of `k` lost frames at rate `r` is a gap of `(k + 1) / r`, a hole in the timestamps
is its own width, and time lost before the first or after the last visible frame counts
too. Reasons come back in the order of the `RefusalReason` union.

Confidence is `HIGH` at ≥ 50 Hz with ≤ 2 % lost frames, `LOW` below 30 Hz or above 5 %
lost frames, otherwise `MEDIUM` (`HIGH_CONFIDENCE_*`, `LOW_CONFIDENCE_*`). Segmentation
uses `MIN_PHASE_DISPLACEMENT_M` = 0.10 m: a reversal smaller than that is jitter. The
filter cutoff is `DEFAULT_CUTOFF_HZ` = 4, the value measured in the physics review
(3–4 Hz for peak force on ~1 s lifts).

### Behaviour worth knowing

- **Segmentation is displacement hysteresis, not velocity sign changes.** A turning
  point is confirmed only once the position has moved back by at least the threshold
  from it, so a 5 cm dip half-way up a lift does not split it and ±3 mm jitter makes no
  rep. A rep is a minimum, the next maximum and the next minimum. A lift with no
  lowering is not a rep, and a movement that begins mid-lowering is ignored.
- **Adjacent reps share the minimum between them.** The rest between two reps is split
  at its lowest sample, so one rep's `endIndex` is the next rep's `startIndex`.
- **A recording that stops mid-lowering** still ends its last rep at the last sample if
  the lowering has already passed the threshold. Its negative work is then partial.
- **`rangeOfMotionM`** is the smoothed top minus the smoothed start. The zero-phase
  filter undershoots slightly before a lift that starts from rest, so the start sits a
  millimetre or so low and the range reads a few tenths of a percent high.
- **`startS`** is measured from the first frame of the recording.
- **Edge padding** is a point reflection about the end sample (`2·x₀ − xⱼ`), three
  cutoff periods long, with the filter started in its steady state: a constant input
  comes out unchanged to the last sample. It needs more samples than the padding
  (46 at 60 Hz and 4 Hz).

## Measured errors (synthetic, not real video)

Every number below comes from `test/session.test.ts` scenarios on **synthetic
sessions**: a 10 kg load, 0.5 m minimum-jerk lifts of 1 s with 1 s lowerings and 0.5 s
rests, Earth gravity, positions with uniform ±noise from a seeded generator
(`test/helpers.ts`). The pose model, a real camera and a real arm are not in the
loop, so these are lower bounds on what real video will do. Truth per rep: positive
work 49.05 J, peak force 126.97 N, range of motion 0.5 m. Errors are the largest over
the reps of the session, signed as measured minus truth.

| Scenario | Reps | Work | Peak force | Range of motion | Confidence |
|---|---|---|---|---|---|
| 60 Hz, no noise | 3 | +0.37 % | −0.01 % | +0.27 % | HIGH |
| 60 Hz, ±2 mm (seed 1) | 3 | +0.83 % | +1.26 % | +0.47 % | HIGH |
| 60 Hz, ±2 mm (five seeds, worst) | 3 | +0.83 % | +2.58 % | +0.54 % | HIGH |
| 30 Hz, ±2 mm | 3 | +0.55 % | +2.02 % | +0.41 % | MEDIUM |
| 60 Hz, ±5 mm (seed 1) | 3 | +1.45 % | +3.42 % | +0.90 % | HIGH |
| 60 Hz, ±5 mm (seed 2) | 3 | +0.98 % | +6.71 % | +0.96 % | HIGH |
| 60 Hz, ±2 mm, 4 % of frames lost | 3 | +0.69 % | +1.46 % | +0.47 % | MEDIUM |
| 5 reps, ±2 mm (seeds 3, 17, 99; worst) | 5, 5, 5 | +0.90 % | +2.34 % | +0.41 % | HIGH |
| ISS, 1000 N device force, ±2 mm (vs 500 J, 1028.9 N) | 3 | +0.83 % | +0.16 % | +0.47 % | HIGH |
| Scale 3 % too large, no noise | 3 | +3.38 % | +0.67 % | +3.28 % | HIGH |
| Scale 3 % too large, ±2 mm | 3 | +3.86 % | +1.98 % | +3.48 % | HIGH |

The test assertions use the plan's tolerances (work within 2–10 %, peak within 3–10 %
depending on the case), which these measurements beat by a wide margin; the table is
the measurement, not the bound. Peak force is the noisiest output: at ±5 mm it ranged
from 1.4 % to 6.7 % across reps and seeds. The plan's ISS expected value is
`1000 × 0.5 J` plus a kinetic term; for a minimum-jerk lift that term is zero, because
the ½ m v² borrowed while accelerating is returned while braking inside the same lift
and no interval changes sign (the derivation is in the test).

## Scale is the largest single source of error

Metres-per-pixel is set by the entered stature and the eye and ankle landmarks of a
calibration frame, through the proportion `EYE_TO_ANKLE_FRACTION_OF_STATURE` = 0.897.
**A 3 % error in scale is a 3 % error in work and in range of motion**; the table shows
it passing straight through. Nothing downstream can detect it.

That proportion is an **ANTHROPOMETRIC ESTIMATE — verify against the source before the
hackathon.** It is eye height 0.936·H minus ankle height 0.039·H (Drillis & Contini
segment proportions, as tabulated in Winter, *Biomechanics and Motor Control of Human
Movement*), quoted from memory of the table and not yet checked.

## What this package does not do

- No camera and no pose model: it takes plain `PoseFrame` objects, and the adapter that
  produces them ships with the demo.
- No object detection. **The wrist stands in for the load.** A barbell that swings away
  from the wrist, or a cable that is not in the hand, is not measured.
- 2D only. The movement must be side-on to the camera; out-of-plane motion reads as
  less range of motion.
- Free weights and a constant device force only (`deviceForceN`). Variable-resistance
  devices, bands and flywheels are not modelled.
- No loading rate, no per-joint kinematics, no multi-person frames.
- No real-video validation. Everything above is synthetic.
