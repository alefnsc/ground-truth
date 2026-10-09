# @ground-truth/physics

Dependency-free TypeScript, pure functions, no I/O. It turns a recorded exercise
session into the two currencies of the [brief](../../docs/strategy.md):

- **Energy** — mechanical work in joules, and a labelled metabolic range.
- **Load** — peak force in newtons, and a skeletal load stimulus with its
  cumulative deficit against an Earth baseline.

Gravity (`gEnvMs2`) and applied device force are inputs to every calculation, so
the same code compares a session on Earth with one on the ISS. SI units; the
unit is in the name (`massKg`, `forceN`, `workJ`, `speedMs`, `gEnvMs2`). Invalid
input throws a `RangeError` naming the argument.

**This package does load accounting, not clinical inference.** It does
bookkeeping on loads that someone or something supplied; it does not measure
bone and does not predict bone loss.

```sh
npm test                                      # from the repo root
npm run typecheck -w @ground-truth/physics
```

## Usage

### Constants and session types (`constants`, `session`)

```ts
import { G_ENV_MS2, GENC_2010_PEAK_LOAD_DECREMENT, type Environment } from "@ground-truth/physics";

const env: Environment = {
  gEnvMs2: G_ENV_MS2.ISS, // 0
  body: "ISS",
  massKg: 78.4,
  massSource: "SLAMMD",
  massMeasuredAt: "2026-11-02T09:12:00Z",
};
GENC_2010_PEAK_LOAD_DECREMENT.squat; // 0.65
```

### Mechanics (`mechanics`)

Work and peak force from vertical position samples, for any gravity. The scheme
is the discrete work-energy theorem, so a mass that starts and ends at rest has
net work exactly `m · g_env · Δy`. No smoothing is applied.

```ts
import { trajectoryWork, metabolicRange } from "@ground-truth/physics";

const r = trajectoryWork(samples, 10, 9.81); // samples: { tS, yM }[]
r.positiveWorkJ; r.negativeWorkJ; r.netWorkJ; r.peakForceN; r.displacementM;
metabolicRange(r.positiveWorkJ); // { lowJ, highJ, kind: "ESTIMATE", basis }
```

### Devices and environment (`devices`)

```ts
import {
  ergometerActualPowerW, ergometerWorkJ, totalForceN, deviceForceForEarthEquivalenceN,
  treadmillEffectiveForceN, aredRepWorkJ, aredPeakForceN, froudeTransitionSpeedMs,
} from "@ground-truth/physics";

ergometerActualPowerW(75);                       // 61.7 W (0.98·P − 11.8)
deviceForceForEarthEquivalenceN(1769.1, 78.4, 0); // 1769.1 N on the ISS
treadmillEffectiveForceN(78.4, 0, 0.7);           // 538.4 N
aredRepWorkJ(2669, 0.762);                        // { concentricJ: 2033.8, eccentricJ: 1830.4 }
aredPeakForceN(2669, 0.762, 2);                   // 3562 N
froudeTransitionSpeedMs(1.62, 0.9);               // 0.854 m/s on the Moon
```

### Load stimulus (`load`)

```ts
import { dailyLoadStimulus, cyclesToMatch, cumulativeDeficit } from "@ground-truth/physics";

dailyLoadStimulus([{ cycles: 12, peakLoad: 2000 }]); // 3722.4  ( (Σ n σ⁴)^(1/4) )
cyclesToMatch(0.25);                                  // 256
cumulativeDeficit([{ day: 0, achieved: 25 }, { day: 180, achieved: 25 }], 100); // 13500
```

## Measured versus estimated

Computed from the inputs you give it (a function of the data, nothing assumed):
`trajectoryWork` (work and peak force), `ergometerActualPowerW` and
`ergometerWorkJ`, `totalForceN`, `deviceForceForEarthEquivalenceN`,
`treadmillEffectiveForceN`, `aredRepWorkJ`, `froudeTransitionSpeedMs`,
`dailyLoadStimulus`, `cyclesToMatch`, `cumulativeDeficit`.

Modelled or estimated, and labelled as such:

- `metabolicRange` is a range (gross efficiency 0.20–0.25), tagged `"ESTIMATE"`.
  Kilocalories are never derived from mechanics as a single figure.
- `aredPeakForceN` rests on `ARED_FLYWHEEL_EFFECTIVE_MASS_KG`, which is
  **CALIBRATED** to one anchor in the brief (+893 N at 2669 N, 0.762 m, 2 s), not
  published. `aredRepWorkJ` defaults the eccentric ratio to 0.9, the brief's upper bound.
- `ergometerActualPowerW` is the CEVIS dynamometer correction; CEVIS was replaced
  by FERGO in October 2023 and this package does not claim the same correction
  for FERGO.
- `cumulativeDeficit` is only as good as the baseline and the achieved series you
  pass in. The stimulus exponent `m = 4` is the standard Carter/Whalen/Beaupré
  value, not a fitted one.

## Two places where the numbers differ from the brief's prose

Recorded so nobody "fixes" the tests to match the prose.

1. **Ergometer error.** The brief says an 11.8 W offset on a 75 W prescription
   "is a 16 % error". That counts the offset alone (11.8 / 75 = 15.7 %). The full
   correction `0.98 × 75 − 11.8` gives 61.7 W, which is 17.7 % below the display.
   The tests assert 61.7 W.
2. **Load stimulus gap.** The brief says achieved peak load is about a quarter of
   Earth-equivalent "and with m = 4 that is a very large gap in S". `S` is
   homogeneous of degree 1 in peak load, so a quarter of the load gives exactly a
   quarter of `S`. What is very large is the number of cycles needed to
   compensate: `(1/0.25)^4 = 256` times as many. The package exposes that number
   as `cyclesToMatch`.
