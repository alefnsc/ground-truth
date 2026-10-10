# @ground-truth/demo

A single-page web demo of the two currencies of the [brief](../../docs/strategy.md): **energy**
(mechanical work) and **load** (a skeletal load stimulus), for a day of exercise under Earth, Moon,
Mars and ISS gravity, and a way to measure a real lifting set from a camera or a video file.

Plain TypeScript, Vite, no UI framework, no CSS framework, no chart library. All numbers come from
[`@ground-truth/physics`](../physics/README.md) and [`@ground-truth/capture`](../capture/README.md);
the demo adds a pure scenario model (`src/model/`), a thin pose-model adapter (`src/pose/`) and DOM
views (`src/view/`). It runs in the browser and sends nothing anywhere.

**Load accounting, not a measurement or prediction of bone.** Every number carries the source it came
from.

## Run it

```sh
npm install                                   # once, from the repo root
npm run dev -w @ground-truth/demo             # http://localhost:5173
npm run dev:https -w @ground-truth/demo       # for a phone, see below
npm run build -w @ground-truth/demo           # static files in packages/demo/dist (git-ignored)
npm test                                      # from the repo root: all packages
npm run typecheck --workspaces
```

**On a phone.** Browsers only allow camera access on HTTPS or on `localhost`. `dev:https` serves on your
network with a self-signed certificate (`@vitejs/plugin-basic-ssl`), so the phone shows a certificate warning
that you have to accept once. Open the "Network" address Vite prints.

**Network.** Opening a camera or a video loads the pose library's runtime and model from two hosts:
`cdn.jsdelivr.net` (two WASM files) and `storage.googleapis.com` (the model, a few megabytes). No video frame
leaves the page and nothing is stored. The pose library (`@mediapipe/tasks-vision`) also tries to send usage
metrics to Google (`odml.pa.googleapis.com`, a request every 60 s). Per the library's own privacy notice these are
"metrics about the performance and utilization of the APIs", not the input data; the notice puts the duty to
obtain consent for them on the integrator. **This page blocks that request** with a Content-Security-Policy in
`index.html` that sets only `connect-src` to `'self'` and the two hosts above; `test/network.test.ts` pins the
policy and the hosts. The camera is released as soon as a recording stops, and when you leave the Capture tab.

## What each view shows

**Two currencies.** An environment selector (Earth, Moon, Mars, ISS; arrow keys move between them), a body
mass and a leg length, and two large numbers: **Energy** (the work of the included sessions, in kJ) and **Load**
(the daily load stimulus as a percentage of the same day on Earth), with a line naming what the Load number rests on.
Below them a card per session (a treadmill run, resistive squats, a cycle ergometer, and any camera set you add),
each with its energy, peak load in newtons and in Earth body weights, and the tag of each; open it for its sources,
intermediate values and editable parameters. With the Moon or Mars selected a note says that the run peak there is an
assumption, unlike the ISS's measured decrement, and that those rows are not to be compared with the ISS row. A card
can be left out of today's totals. The cycle card shows a dash for load, with the reason. A mission horizon (30 to 1095
days, with buttons for 180 and 1095) shows the loading missing as Earth-days ("135 of 180 Earth-days of loading
missing", which does not depend on body mass), the raw deficit in stimulus-days below the Earth baseline, and how many
times the daily loading cycles of the dominant bout would be needed at the same peak load to match the Earth
stimulus, which no amount of added volume achieves.

**Capture.** A protocol card, then a camera or a video file, a scale (a known length held at the wrist, which is
preferred, or the stature method), the mass of the weight, the environment and an optional constant device
force, and Record / Stop. The result is either the reasons the recording was refused, in plain sentences and
with no numbers, or per repetition the positive work, peak force, range of motion and lift time, with a visible
note on a rep that was too fast for the filter or was measured over less than 90 % of the detected movement, and
the set's confidence. **Add to today** puts the set into the other view as an `ESTIMATE` session (the camera path has not been validated on
real video; the scale is itself an estimate). Its peak load is the force on the weight, not through the skeleton, and
excludes body weight. A set is a
record of a real lift, so it is the same in every environment of the other view and is not re-scaled.

**Provenance tags.** `MEASURED` (measured directly, such as a frame rate), `MANUAL` (entered, or a device setting), `MODEL` (a published formula
with stated parameters), `ASSUMPTION` (a parameter this demo chose), `CALIBRATED`, `ESTIMATE` (a range or an
estimate). Strongest to weakest the order is MEASURED, MANUAL, MODEL, CALIBRATED, ESTIMATE, ASSUMPTION, and a number carries
the weakest tag among its inputs and its formula: a treadmill energy rests on an assumed cadence, so it is
`ASSUMPTION` even though its formula is published; a camera number is `ESTIMATE` while the capture package says
it has not been validated on real video. A number that
cannot be computed is a dash and the reason, never a guess.

## Energy and load per environment

The default day: a 30-minute treadmill run, three sets of 12 resistive squats at 1000 N, and a 45-minute
cycle-ergometer session at 150 W displayed, for a 78.4 kg person with a 0.9 m leg. Computed by `computeDay`
(`src/model/day.ts`); the formulas and the parameters are below. Both load bouts are on a per-leg basis (the run's
peak is the force through one leg; the squat's total force is halved).

| Environment | Energy | Load (daily stimulus, % of the same day on Earth) | Run: energy / peak | Squats: energy / peak | Cycle: energy | Cycles to match (run) |
|---|---|---|---|---|---|---|
| Earth | 711 kJ | 100 % | 314 kJ / 1,923 N | 31.8 kJ / 1,769 N | 365 kJ | no deficit |
| Moon | 437 kJ | 17.1 % | 51.8 kJ / 318 N | 20.3 kJ / 1,127 N | 365 kJ | 1,345x |
| Mars | 507 kJ | 37.9 % | 119 kJ / 727 N | 23.2 kJ / 1,291 N | 365 kJ | 48.9x |
| ISS | 603 kJ | 25.1 % | 220 kJ / 481 N | 18.0 kJ / 1,000 N | 365 kJ | 256x |

(Thousands are written here with a comma; the page uses a thin no-break space, so that a comma-decimal reader does
not take 1,923 N for 1.9 N.) Loading missing from 180 days of that day repeated daily, in Earth-days: Moon 149 of 180,
Mars 112, ISS 135 (134.8). Raw deficit in stimulus-days below the Earth baseline (it scales with body mass): Moon
2,040,137 at 180 days and 12,410,835 at 1095; Mars 1,527,660 and 9,293,268; ISS 1,842,429 and 11,208,108. The deficit
is linear in the horizon (nothing adapts or recovers in the model). The Moon reads lower than the ISS because the
ISS run peak is the Earth peak minus a measured decrement while the Moon and Mars peaks are an assumption (peak
proportional to effective weight): the rows are not comparable and the page says so.

### Which beats of the brief's demo script the model reproduces

The script ([`docs/strategy.md`](../../docs/strategy.md) §10) asserts outcomes in two of its five beats. The
demo shows what the physics computes, and no parameter was adjusted to make a beat come true.

1. **Earth, an ordinary session, both numbers healthy.** Reproduced as stated: 711 kJ, 100 %.
2. **"Switch to ISS. Energy barely moves. Load collapses."** Half of it. **Load collapses**: 100 % to 25.1 % for this
   day (the run alone reads exactly 25 %, the measured 75 % on-orbit decrement for running). **Energy barely moves**
   does not come out of the model: 711 kJ to 603 kJ is 15 % lower. The run's energy falls by 30 % (the harness
   supplies 70 % of a body weight) and the squats' by 43 % (the device force is the whole force). The day only looks
   steady because the 365 kJ ergometer session is the same in every environment: a day of squats and cycling alone
   moves from 397 kJ to 383 kJ, 3.5 % lower. The brief's explanation (gravity supplies the load for free on Earth; in
   orbit only the device does, set to 70 % of a body weight) is what the model implements.
3. **The 45-minute cycle session: energy large, load about zero.** Reproduced, structurally: 365 kJ, more than the
   Earth run (314 kJ), identical in every environment, with no skeletal load term in the model, shown as a dash with
   the reason. (The brief calls it a FERGO session; the model uses the CEVIS dynamometer correction, and the physics
   package does not claim the same correction for FERGO.)
4. **The cumulative deficit over the mission, diverging per compartment.** The deficit and the 180-day and 1095-day
   horizons are shown. **Per-compartment divergence (trabecular against cortical) is not modelled** and not shown;
   the view says so.
5. **Provenance on every number.** Reproduced: every number has a tag and a note. The brief's closing image, an ARED
   row reading `MANUAL_ENTRY` / confidence `LOW`, is not: the demo has no session record with the brief's §3 fields,
   and its squat card is a generic resistive device whose force is a `MANUAL` entry.

### Two defaults a judge may question

- **The ergometer session (150 W for 45 minutes, 365 kJ) is the largest energy item of the day**, larger than the run.
  It is what makes the day's energy look steady on the ISS. Edit it on its card; the load numbers do not depend on it.
- **The 1000 N squat setting is light against the brief's 1780 N example.** With 1780 N the default day reads Earth
  725 kJ, Moon 451 kJ, Mars 521 kJ, ISS 617 kJ (14.9 % below Earth), and a load of 100 % / 20.0 % / 38.3 % / 26.0 %;
  the beats' verdicts do not change. A day of squats only reads 69.8 % on the ISS at 1780 N (56.5 % at 1000 N).

## Parameters this demo chose (tagged `ASSUMPTION` in the UI)

| Parameter | Value | Where it is used |
|---|---|---|
| Cadence | 170 steps/min | steps = duration × cadence; treadmill energy |
| Vertical travel of the centre of mass per step | 0.08 m | treadmill energy, `steps × F_eff × Δz` |
| Earth peak force of running | 2.5 × body weight (2 to 3 is commonly cited) | treadmill peak load, and the Earth baseline |
| Peak load of running in partial gravity | peak = 2.5 × effective weight | Moon, Mars (not a published result) |
| Loading cycles of one leg | steps / 2 (one foot strike per stride) | the treadmill's weight in the load stimulus |
| Squat load per leg | half the total force (equal sharing between the legs), one cycle per rep | the squats' bout in the load stimulus |
| Whole body moved through the stroke | the squat energy takes the total force, body weight included, over the full stroke | squat energy |

Values the demo entered as presets, tagged `MANUAL` and editable on each card: run duration 1800 s;
harness load 0.7 × 1 g body weight (ISS only, brief §2); squat device force 1000 N, 3 sets of 12, stroke 0.5 m;
ergometer 2700 s at 150 W displayed. Published parameters, tagged `MODEL`: the CEVIS correction
`0.98 · P − 11.8 W`; the Froude number 0.5 at the walk-run transition; the load-stimulus exponent 4; the Genc
2010 decrements (75 % running). The metabolic range of the ergometer session (gross efficiency 0.20 to 0.25) is
an `ESTIMATE`, always shown as a range in joules, never as one figure and never in kilocalories.

## What is not modelled

- **Compartments.** No trabecular or cortical split; one stimulus for the whole skeleton.
- **The inertial term in squats.** Peak load is the static `F_device + m · g_env`; a fast rep loads more.
- **Anything clinical.** No bone density, no bone loss, no diagnosis, no recommendation.
- **Adaptation and recovery.** The deficit is the day repeated, multiplied by the days.
- **A camera set in another gravity.** It is a record, not a model; it does not change with the selector.
- Energy is mechanical work, not metabolic energy; kilocalories are never derived as one figure.

**Implicit assumptions the review found, all stated in the UI details too:**

- The ISS run peak is the Earth peak (an assumed 2.5 body weights) times the measured Genc 2010 decrement, taken at
  maximum device settings. It does not vary with the harness field; the static value (2.5 x effective force) is shown
  beside it for comparison.
- One convention for the load stimulus: forces and cycles are per leg (a stride loads each leg once; a squat rep loads
  each leg once with half the total force). Mixing a one-leg force with a two-leg force would overweight squats up to 16
  times under the fourth power.
- The squat's energy moves the whole body mass through the full stroke; a real squat moves the centre of mass less.
- A camera set's peak is the force on the weight, not through the skeleton, and excludes body weight.
- The stress at the bone is taken as proportional to the force (the physics package's assumption for cycles to match).

## Offline use

The pose model and the WASM runtime load from two URLs, the constants `POSE_MODEL_URL` and `POSE_WASM_BASE` at
the top of `src/pose/source.ts`. An offline build must vendor both: the model is a multi-megabyte binary, so it
is deliberately not in this repository. The WASM version in the URL must equal the version of
`@mediapipe/tasks-vision` in `package.json`, which is pinned (1.1.0, Apache-2.0). The remote model file is fetched
by the library itself, and this page checks no integrity hash; its licence
is not recorded here: check the model's terms before redistributing it.

## Before trusting a camera number

Nothing in the capture path has been checked against real video. The capture package's README lists the ten
checks that only real video can settle ("What only real video can settle" in
[`packages/capture/README.md`](../capture/README.md)). Until they are done the confidence of a set is capped at
`MEDIUM` and grades the recording conditions, not accuracy; scale is the largest error; peak force is the
noisiest output and indicative only.

## Not verified

What no one has exercised, so nothing here should be presented as working:

- The camera: `getUserMedia` on any device, the rear camera preference, and the HTTPS dev server on a real phone
  (including the certificate warning).
- A real lifting video, and the pose model detecting a real person: the pose model has only seen a synthetic
  video with no person in it (it found no wrist, and the recording was refused, as it should be).
- Frame timing on a real phone: whether `requestVideoFrameCallback` times are capture times on a phone camera.
- The look of the page on a real phone and in other browsers than the one it was developed in; screen readers;
  reduced-motion behaviour (the CSS removes animation and transitions; it was not observed).
- Playing a video file at half speed (the setting that lets the pose model keep up) on a slow device.
- Releasing a live camera: the tracks are stopped when a recording stops and when the Capture tab is left, but only
  the video-file path of that code was run (its source was cleared on stop); no camera was opened.
- The network behaviour beyond one browser session: the metrics request was seen blocked (a Content-Security-Policy
  violation naming `odml.pa.googleapis.com` at 60 s) and the model and WASM still loaded and detection still ran,
  watched for about 180 s in one Chromium-based pane with the Vite dev server. Not observed: the request without the
  policy in this session, its payload on the wire (it was blocked; the content is as the library describes it),
  other browsers (an older browser may not let `'self'` cover the dev server's WebSocket), and a built `dist/` served
  by another host.
- The fallback timing branch (a browser without `requestVideoFrameCallback`, where recording is refused with a
  sentence) was never run.
- Frozen-frame tapping, the marker lines, and the stature method (eye and ankle read from a real pose) were never tried
  on a real pose. The stature path ran only against a substituted detector.
- The analysed-result path has only run with a substituted detector (a monkey-patched `detectForVideo` returning a
  synthetic wrist), never with the real model on a real person.
- Cancelling an open (leaving the tab or clicking twice while the camera or model is pending) was exercised only with a
  video file; with a camera it was not.
