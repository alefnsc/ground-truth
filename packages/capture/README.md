# @ground-truth/capture

Dependency-free TypeScript, pure functions, no I/O, no clock, no `Math.random`. It
turns a stream of noisy wrist positions from a phone camera into per-repetition work,
peak force and range of motion, or **refuses the session with a stated reason**. The
only dependency is [`@ground-truth/physics`](../physics/README.md), which does the
arithmetic once the positions are clean.

**Nothing in this package has been checked against real video.** Every number in this
file comes from synthetic sessions (a seeded noise generator, ideal minimum-jerk
motion) or is labelled as an estimate. See "What only real video can settle" before
presenting any output as a measurement.

```sh
npm test                                        # from the repo root
npm run typecheck -w @ground-truth/capture
```

```ts
import { analyzeSession, metersPerUnitFromStature, type PoseFrame } from "@ground-truth/capture";

// frames: PoseFrame[] = { tS, wristY, visibility }[]  (see "Adapter contract")
const metersPerUnit = metersPerUnitFromStature(1.8, eyeY, ankleY); // from an upright side-on calibration frame
const r = analyzeSession(frames, { massKg: 20, gEnvMs2: 9.81, metersPerUnit });

if (r.ok) {
  // { startS, durationS, liftDurationS, filterLimited, rangeOfMotionM, positiveWorkJ, negativeWorkJ, peakForceN, impulseNs }[]
  r.reps;
  r.totalPositiveWorkJ; r.maxPeakForceN;
  r.provenance; // { loadSource: "CAMERA", confidence: "MEDIUM" | "LOW" }  (grades capture conditions, not accuracy)
} else {
  r.reasons; // e.g. ["LOW_FRAME_RATE", "GAP_TOO_LONG"]. No measurement is returned.
}
```

A refusal is a return value, never an exception. It carries the reasons and the
quality diagnostics (frame rate, lost-frame fraction, longest gap, duration, dropped
frames) and no work, force, range of motion or provenance. **No frame content can make
`analyzeSession` throw**: NaN, infinities, duplicate or out-of-order timestamps and
timestamps in the wrong unit are refused or dropped. Invalid *options* (a negative mass,
a cutoff above Nyquist, a threshold outside its range) are programmer errors and throw
a `RangeError` naming the argument.

## Adapter contract

The adapter that turns a pose model's output into `PoseFrame`s (it ships with the demo,
not here) must produce:

- **`tS` in seconds**, strictly increasing, and the **capture time of the frame**, not
  the time a callback ran. Callback time carries scheduling jitter that the pipeline
  cannot tell from motion. Milliseconds are refused (the stream reads as 0.06 Hz), not
  converted.
- **`visibility` 0 when there is no detection.** Do not repeat the last position with a
  high visibility. A non-finite visibility, or a non-finite `wristY`, is treated as a
  lost landmark.
- **`wristY` normalised (0–1) with y pointing down**, as pose models report it. This
  package converts to metres, y up, in exactly one place (`toMetersUp`).
- One entry per delivered frame. A frame processed twice (same timestamp) or delivered
  out of order is *dropped* and counted in `QualityReport.droppedFrames`; more than 10 %
  of the stream dropped this way is refused with `LANDMARK_LOST`.

## The pipeline, in order

| Step | Function | What it does |
|---|---|---|
| 1 | `assessQuality` | Drops frames not in time order, then frame rate, lost frames, gaps, duration. Any reason refuses the session. |
| 2 | `resampleUniform` | Drops low-visibility frames, then linear interpolation onto a uniform grid at the median frame rate. Nothing is extrapolated. |
| 3 | `toMetersUp` | The one place where image coordinates (y down) become metres (y up): `yM = −wristY · metersPerUnit`, first sample 0. |
| 4 | `lowPassZeroPhase` | 2nd-order Butterworth, forward then backward, 4 Hz by default. A recording not longer than the filter's padding is refused `TOO_SHORT`. |
| 5 | `segmentReps` | Displacement hysteresis on position extrema. |
| 6 | rep window | Each rep is trimmed to its movement: onset at the end of the last pause before the top, offset at the start of the first pause after it. |
| 7 | `trajectoryWork` | Per trimmed rep, from `@ground-truth/physics`, with the optional constant device force. |

### Refusal reasons and thresholds

Every threshold is a named, exported constant. All are judgement calls except where
noted. `visibilityThreshold` and `maxGapS` can be passed in `SessionOptions` (defaults
unchanged).

| Reason | Refused when | Constant |
|---|---|---|
| `NO_SCALE` | `metersPerUnit` is `null` | |
| `LOW_FRAME_RATE` | median frame rate < 20 Hz, or the timestamps are so irregular that the grid would hold over 4 samples per delivered frame | `MIN_RATE_HZ` |
| `LANDMARK_LOST` | more than 10 % of frames have visibility < 0.5 (or a non-finite `wristY`), or more than 10 % were dropped for their timestamps | `MAX_LOW_VISIBILITY_FRACTION`, `VISIBILITY_THRESHOLD` |
| `GAP_TOO_LONG` | more than 0.25 s between usable frames | `MAX_GAP_S` |
| `TOO_SHORT` | recording under 1.0 s, or no longer than the filter padding (`ceil(3·rate/cutoff)` samples, 90 at 60 Hz with a 2 Hz cutoff) | `MIN_DURATION_S`, `PADDING_CUTOFF_PERIODS` |

`MIN_RATE_HZ` is 20, under every nominal camera rate (23.976, 24, 25, 29.97, 30): a
median of measured timestamps lands a hair either side of a nominal rate, so no
threshold may sit on one.

Gaps are measured between *usable* frames: the time from one visible frame to the next.
A run of `k` lost frames at rate `r` is a gap of `(k + 1) / r`, a hole in the timestamps
is its own width, and time lost before the first or after the last visible frame counts
too. Reasons come back in the order of the `RefusalReason` union.

**A gap just under the limit is not free.** The refusal threshold only decides what is
bridged by linear interpolation; the bridge still costs accuracy where the signal is
curved. Measured in review on synthetic lifts, with the longest gap that is accepted:
a gap at the turnaround of a 0.5 s lift under-reads range of motion by 8.1 % at 60 Hz
and 5.1 % at 30 Hz; a gap at the acceleration peak of a 1 s lift over-reads peak force
by 6.1 %. Lower `maxGapS` if that matters more than keeping a marginal session.

### Confidence grades capture conditions, not accuracy

`provenance.confidence` is a function of the frame rate and the fraction of lost frames
and of nothing else: not scale, not depth, not the pose model's noise, not whether the
reps were clean. It was `HIGH` for a rep that read 121 % high and for a 3 % scale error.
It is therefore **capped at `MEDIUM`** while `VALIDATED_ON_REAL_VIDEO` is `false`, which
it is until the checks under "What only real video can settle" have been done. The
uncapped grade is exported as `gradeCaptureConditions`: `HIGH` at ≥ 45 Hz with ≤ 2 %
lost frames, `LOW` below 27 Hz or above 5 % lost frames, otherwise `MEDIUM`
(`HIGH_CONFIDENCE_*`, `LOW_CONFIDENCE_*`; the boundaries sit between the nominal rates,
so 29.97 and 30.3 grade alike, and 59.94 and 50).

### Rep window: what belongs to a rep

`segmentReps` cuts a rep from one minimum to the next, which on its own bills the whole
rest before it, a pick-up from the floor, or a set-down to the rep (the first version of
this package read a dumbbell picked up from the floor as 1.10 m and 108.5 J for a 0.5 m,
49.05 J curl, and rest noise added 7 to 19 % after a 10 s rest). `analyzeSession` trims
each rep on the **smoothed** position (so noise does not make a pause look shorter than
it is):

1. A *pause* is a run of at least `DWELL_MIN_S` = 0.3 s in which the smoothed position
   spreads (highest minus lowest) no more than `DWELL_BAND_M` = 1.5 cm. Both are judgement
   calls and are not tuned to any scenario.
2. **Onset.** Walk back from the top, first stepping over the top plateau (every sample
   within 1.5 cm of the top), so a pause *at* the top is never mistaken for the pause
   before the lift. The lift starts at the last sample of the latest pause before that.
   A pause half-way up (a barbell racked at the shoulders, then pressed) counts: the
   press starts where it ends.
3. **Offset.** Walk forward from the top, over the top plateau, to the first pause; the
   lowering ends at its first sample. A pause at the top stays *inside* the window
   (between the lift and the lowering); nothing is cut there.
4. If there is no pause (reps with no rest between them) the segmenter's boundary is kept.
5. Work, peak force, impulse, path length, `startS`, `durationS`, `liftDurationS` and
   `rangeOfMotionM` are all computed on the trimmed window. `liftDurationS` is onset to
   top; `durationS` is onset to offset.

**Residual bias, measured by the tests on synthetic sessions** (0.5 m, 1 s minimum-jerk
lift, 1 s lowering): the pause claims the first and last 1.5 cm of the movement, which a
minimum-jerk lift takes 0.14 s to cover. So work and range of motion read about
`DWELL_BAND_M / ROM` short (**work −3.2 %, range of motion −2.6 %** at 0.5 m; the same
band is 7.5 % of a 0.2 m movement), `startS` reads **0.13 to 0.15 s late**, and
`durationS` **0.27 to 0.30 s short** for a 2 s rep (the time error grows with the lift:
it is about 0.14 × each leg's duration). The plan's target of 0.15 s on both timings is
not met with these constants; the tests assert the measured worst case (0.2 s and
0.35 s) rather than tuning them away. A real lift is not minimum-jerk, so these are the
bias of the method on an idealised profile, not a prediction.

Limits of the trimming, by design or by measurement:

- A **sub-threshold movement** (under 10 cm) between two reps is attributed to neither
  rep when a pause separates it from each of them (tested: a 0.08 m partial between two
  full reps, with 0.6 s pauses either side, leaves both reps within 5 %). When no pause
  separates it from a rep — it follows the lowering at once — it stays in that rep and
  its work is added to it, as before.
- A **pause of 0.3 s or more inside a lift** splits it: only the part after the last such
  pause is measured (that is what lets the rack-to-shoulders press work, and what costs a
  sticking-point pause its first half).
- The junction between two reps with no rest is borderline for a pause when a lift is
  about 1 s (the position is within 1.5 cm for 0.29 s). Either result is within the same
  band of error.
- A top that **drifts** down slowly (a few cm over a second) leaves no plateau to step
  over, so the lowering can be cut short.

### Behaviour worth knowing

- **Segmentation is displacement hysteresis, not velocity sign changes.** A turning
  point is confirmed only once the position has moved back by at least the threshold
  from it, so a 5 cm dip half-way up a lift does not split it and ±3 mm jitter makes no
  rep. A rep is a minimum, the next maximum and the next minimum. A lift with no
  lowering is not a rep, and a movement that begins mid-lowering is ignored.
- **A recording that starts mid-lift** is counted as a rep for the part that is visible,
  and one that **stops mid-lowering** ends its last rep at the last sample if the lowering
  has already passed the threshold. Work, range of motion and duration are then partial.
- **`startS`** is measured from the first frame of the recording (the first with a usable
  timestamp), so a clock that starts at 123456.789 s changes nothing.
- **Edge padding** is a point reflection about the end sample (`2·x₀ − xⱼ`), three
  cutoff periods long, with the filter started in its steady state: a constant input
  comes out unchanged to the last sample, and a trace that starts mid-lift keeps its first
  sample within 1 mm (a mirror reflection is 26.6 mm out). It needs more samples than the
  padding (46 at 60 Hz and 4 Hz).

### Fast lifts: the filter, `filterLimited`, and what 4 Hz means

The default cutoff is 4 Hz at the **−6 dB point of the two-pass filter** (gain exactly
0.5 at 4 Hz). Its −3 dB point is `0.802 × fc` ≈ 3.2 Hz. The default suits lifts of about
0.8 s or slower; a faster lift is shaped by the filter. Each rep reports
`filterLimited: true` when `liftDurationS` is under `FILTER_LIMITED_LIFT_S` = 0.7 s
(measured in review). `liftDurationS` is taken on the trimmed window, so it reads about
14 % under a lift's full time: 0.7 s here is a lift of about 0.8 s.

Filter bias on a 0.5 m lift with zero noise at 60 Hz, 4 Hz cutoff, **measured in review
on synthetic signals, before the rep window was trimmed** (signed, against the rep's
true value):

| Lift time | Work | Peak force | Range of motion (pre-ringing) |
|---|---|---|---|
| 1.0 s | +0.37 % | −0.01 % | +0.27 % |
| 0.8 s | +0.65 % | −0.37 % | |
| 0.6 s | +1.30 % | −1.98 % | +0.94 % |
| 0.4 s | −5.92 % | −10.51 % | +1.99 % |
| 0.4 s at 30 Hz | −9.05 % | −10.90 % | |

A faster cutoff recovers the 0.4 s lift: with 6 Hz it reads −2.3 % work and −3.3 % peak
force, with 8 Hz −1.2 % and −0.9 % (review; noise rises with the cutoff, so raise it
only for lifts that need it). The zero-phase filter rings slightly *before* a lift that
starts from rest, so a lift that is not trimmed would read its range of motion high: a
few tenths of a percent for a ~1 s lift (+0.27 %), and 0.94 % and 1.99 % at 0.6 s and
0.4 s.

The same lifts after the window trim, measured by the tests' scenarios against a 2000 Hz
reference of the same rep (the −3 % is the window residual above, not the filter):

| Lift time | Work | Peak force | Range of motion |
|---|---|---|---|
| 1.0 s | −3.15 % | −0.01 % | −2.55 % |
| 0.8 s | −3.17 % | −0.37 % | −2.30 % |
| 0.6 s | −3.32 % | −1.98 % | −1.89 % |
| 0.4 s | −9.69 % | −10.51 % | +0.18 % |

The 0.4 s row is pinned by a test (work −9.7 % and peak −10.5 %, each ±1 point), which
also pins the default cutoff at 4 Hz.

## Measured errors (synthetic, not real video)

Every number below was measured with the scenarios of `test/session.test.ts` and
`test/window.test.ts` on **synthetic sessions**: a 10 kg load, 0.5 m minimum-jerk lifts
of 1 s with 1 s lowerings and 0.5 s rests (5 s and 10 s in the rows that say so), Earth
gravity, positions with uniform ±noise from a seeded generator (`test/helpers.ts`).
The pose model, a real camera and a real arm are not in the loop, so these are lower
bounds on what real video will do. Truth per rep: positive work 49.05 J, peak force
126.97 N, range of motion 0.5 m. Errors are the largest over the reps (and seeds) of the
session, signed as measured minus truth. This table was regenerated after the rep window
was trimmed; the first version of the package, whose windows ran minimum to minimum, read
work +0.4 to +0.9 % in the first rows.

| Scenario | Reps | Work | Peak force | Range of motion | Confidence (uncapped) |
|---|---|---|---|---|---|
| 60 Hz, no noise | 3 | −3.15 % | −0.01 % | −2.55 % | MEDIUM (HIGH) |
| 60 Hz, ±2 mm (seed 1) | 3 | −3.16 % | +1.26 % | −2.58 % | MEDIUM (HIGH) |
| 60 Hz, ±2 mm (five seeds, worst) | 3 | −3.37 % | +2.58 % | −2.79 % | MEDIUM (HIGH) |
| 30 Hz, ±2 mm | 3 | −2.28 % | +2.02 % | −1.88 % | MEDIUM (MEDIUM) |
| 60 Hz, ±5 mm (seed 1) | 3 | −3.19 % | +3.42 % | −2.45 % | MEDIUM (HIGH) |
| 60 Hz, ±5 mm (seed 2) | 3 | −3.02 % | +6.71 % | −2.44 % | MEDIUM (HIGH) |
| 60 Hz, ±2 mm, 4 % of frames lost | 3 | −3.16 % | +1.46 % | −2.58 % | MEDIUM (MEDIUM) |
| 5 reps, ±2 mm (seeds 3, 17, 99; worst) | 5, 5, 5 | −3.37 % | +2.34 % | −2.79 % | MEDIUM (HIGH) |
| 5 s rests, ±2 mm (seeds 1–3, worst) | 3 | −3.27 % | +2.77 % | −2.71 % | MEDIUM (HIGH) |
| 5 s rests, ±5 mm (seeds 1–3, worst) | 3 | −3.40 % | +6.94 % | −2.75 % | MEDIUM (HIGH) |
| 10 s rests, ±2 mm (seeds 1–3, worst) | 3 | −3.41 % | +1.45 % | −2.78 % | MEDIUM (HIGH) |
| 10 s rests, ±5 mm (seeds 1–3, worst) | 3 | −3.59 % | +4.22 % | −2.92 % | MEDIUM (HIGH) |
| Floor pick-up, pause, 3 curls, set-down, ±2 mm | 3 | −3.18 % | +2.07 % | −2.56 % | MEDIUM (HIGH) |
| Rack to shoulders, 2 presses, un-rack, ±2 mm | 2 | −3.12 % | +1.58 % | −2.56 % | MEDIUM (HIGH) |
| 0.08 m partial between 2 reps, ±2 mm | 2 | −3.18 % | +1.20 % | −2.56 % | MEDIUM (HIGH) |
| ISS, 1000 N device force, ±2 mm (vs 500 J, 1028.9 N) | 3 | −2.64 % | +0.16 % | −2.58 % | MEDIUM (HIGH) |
| Scale 3 % too large, no noise | 3 | −0.26 % | +0.67 % | +0.37 % | MEDIUM (HIGH) |
| Scale 3 % too large, ±2 mm | 3 | +0.67 % | +1.98 % | +1.10 % | MEDIUM (HIGH) |

The last two rows are **not** a sign that scale error cancels: the +3 % from the scale
and the −3 % from the trimmed window are independent errors that happen to be the same
size on a 0.5 m rep. Against the *uncorrected* session, a 3 % larger scale still makes
work and range of motion exactly 3 % larger (the tests assert this).

The test assertions use tolerances (work within 4–10 %, peak within 3–10 % depending on
the case); where the plan's original target was beaten by the window residual (work 2 %,
range of motion 1 % for the noise-free rep) the assertion carries the measured bound
(4 % and 3 %).

**Peak force is the noisiest output.** Over 200 seeds the worst peak-force error was
**3.37 % at ±2 mm and 8.72 % at ±5 mm** (measured in review, reproduced with the trimmed
window; work and range of motion worst 3.45 % and 2.86 % at ±2 mm, 4.03 % and 3.32 % at
±5 mm). White noise is the optimistic case: real pose-model error is correlated in time.
A 1 cm wobble at 2.5 Hz — inside the pass band — measured +4 to +10 % work and +11 to
+14 % peak force in review, so the table above is a lower bound on the error of real
video. The plan's ISS expected value is `1000 × 0.5 J` plus a kinetic term; for a
minimum-jerk lift that term is zero, because the ½ m v² borrowed while accelerating is
returned while braking inside the same lift and no interval changes sign (the derivation
is in the test).

## Scale

Metres-per-unit is set by the entered stature and the eye and ankle landmarks of a
calibration frame, through the proportion `EYE_TO_ANKLE_FRACTION_OF_STATURE` = 0.897.
**A scale error is passed straight through: 3 % in scale is 3 % in work and in range of
motion**, and nothing downstream can detect it. That proportion is an **ANTHROPOMETRIC
ESTIMATE — verify against the source before the hackathon.** It is eye height 0.936·H
minus ankle height 0.039·H (Drillis & Contini segment proportions, as tabulated in
Winter, *Biomechanics and Motor Control of Human Movement*), quoted from memory of the
table and not yet checked.

Error budget of the stature method. **These are the reviewer's estimates, not measured
here**:

- Body proportion (the 0.897), landmark placement, self-reported stature and posture each
  contribute about 1 %.
- **Depth is the dominant term.** Scale is proportional to distance from the camera, but
  the stature method scales the body's mid-plane, and the near wrist in a side-on pose is
  roughly 0.15–0.25 m closer to the camera than that. At 2.5 m that is about **+6 to
  +10 % on range of motion and work**. A 10 cm step toward the camera after calibration
  is another 4 %.
- Realistic total: **±5–10 % with a positive bias**.

`metersPerUnitFromKnownLength(lengthM, yA, yB)` = `lengthM / |yB − yA|` is the preferred
calibration: hold an object of known length vertically in the lifting hand, at the wrist's
depth, and read its two ends in one frame. It removes the depth term, because the
reference is at the wrist's own distance (it throws when the span is under 0.05 of the
frame). Whichever method is used, check scale end to end with a **tape-measured rep**
before trusting a number (see below). All of this section is an estimate until that has
been done.

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
- **No real-video validation.** Everything above is synthetic.

### Limits that follow from the method

- **Phantom reps from sway.** The 0.10 m threshold is absolute. A stationary arm with a
  slow sway can cross it: measured, a 6 cm sway at 0.25 Hz gives two 0.12 m reps.
- **A recording that starts mid-lift** counts the visible part as a rep.
- **White noise is the optimistic case** for the error table (see above): a 1 cm wobble
  at 2.5 Hz passes the filter and measured +4 to +10 % work and +11 to +14 % peak force.
- **Pauses inside a lift split it**, and a sub-threshold movement that no pause separates
  from a rep stays in it (see "Rep window").
- **Phone-camera pitch and height** are not modelled; the movement is assumed to be in a
  plane facing the camera.

## What only real video can settle

Ten checks that no synthetic test can stand in for. `VALIDATED_ON_REAL_VIDEO` stays
`false` (and confidence stays capped) until they are done.

1. **Scale, end to end:** a tape-measured rep at two distances and with both arms, against
   `rangeOfMotionM`. This is the only way to see the depth term.
2. **The pose model's noise spectrum:** a motionless 20 s recording; look for content at
   1–4 Hz, which the filter passes.
3. **Wrist visibility through a full rep,** near the face, and when the dumbbell
   occludes the hand.
4. **Delivered frame timing on the demo phone:** the actual rate, duplicates, and whether
   timestamps are capture time or callback time.
5. **Whether the wrist landmark slides** along the forearm as the wrist rotates.
6. **The real pick-up / pre-roll / set-down sequence,** to see whether the pause rule
   isolates the reps as it does on synthetic ones.
7. **A known mass through a measured height** at slow, normal and fast tempo, against
   `m·g·h`.
8. **Camera pitch (about 15°) and height:** how much each reads as lost range of motion.
9. **Rep counting on an uneven real set** with a failed last rep.
10. **Peak-force plausibility against a second instrument** (a force plate or an
    accelerometer on the bar). Until then present peak force as indicative only.
