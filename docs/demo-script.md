# Ground Truth — demo script

This replaces [`strategy.md`](strategy.md) §10 for the demo. It uses the numbers the model computes. Where a figure comes
from the brief or a source it cites, it says so.

## How to use this

Three kinds of lines:

- **SAY** is what to say. Short sentences. Every claim is phrased as what the model computes, not what happens to bodies.
- **SHOW** is what to have on screen.
- **IF IT GOES WRONG** is what to do.

Every figure in the narration is in the table below, or is marked as coming from the brief. The table is generated from
the model by `renderScriptNumbers()` (`packages/demo/src/model/scriptNumbers.ts`), and `packages/demo/test/scriptNumbers.test.ts`
fails if the table drifts from the model or if the narration quotes a figure that is in neither place.

## The numbers

Default day on the demo's defaults. Thousands are separated by a thin space, as on screen.

<!-- numbers:start -->
**The default day** (78.4 kg, leg 0.9 m: treadmill run, resistive squats, cycle ergometer)

| Environment | Day energy | Load, % of the same day on Earth | Cycles to match (run) | Earth-days of loading missing, of 180 | Earth-days of loading missing, of 1095 |
| --- | --- | --- | --- | --- | --- |
| Earth | 711 kJ | 100% | — | 0 of 180 | 0 of 1095 |
| Moon | 437 kJ | 17.1% | 1 345× | 149 of 180 | 908 of 1095 |
| Mars | 507 kJ | 37.9% | 48.9× | 112 of 180 | 680 of 1095 |
| ISS | 603 kJ | 25.1% | 256× | 135 of 180 | 820 of 1095 |

**Each session**

| Session | Environment | Energy | Peak load | Peak load in Earth body weights |
| --- | --- | --- | --- | --- |
| Treadmill run | Earth | 314 kJ | 1 923 N | 2.50× |
| Treadmill run | Moon | 51.8 kJ | 318 N | 0.41× |
| Treadmill run | Mars | 119 kJ | 727 N | 0.95× |
| Treadmill run | ISS | 220 kJ | 481 N | 0.63× |
| Resistive squats | Earth | 31.8 kJ | 1 769 N | 2.30× |
| Resistive squats | Moon | 20.3 kJ | 1 127 N | 1.47× |
| Resistive squats | Mars | 23.2 kJ | 1 291 N | 1.68× |
| Resistive squats | ISS | 18.0 kJ | 1 000 N | 1.30× |
| Cycle ergometer | Earth | 365 kJ | — | — |
| Cycle ergometer | Moon | 365 kJ | — | — |
| Cycle ergometer | Mars | 365 kJ | — | — |
| Cycle ergometer | ISS | 365 kJ | — | — |

**One session at a time, Earth against the ISS**

| Day | Earth energy | ISS energy | Energy change | Earth load | ISS load |
| --- | --- | --- | --- | --- | --- |
| Run only | 314 kJ | 220 kJ | −30.0% | 100% | 25.0% |
| Squats only | 31.8 kJ | 18.0 kJ | −43.5% | 100% | 56.5% |
| Cycle only | 365 kJ | 365 kJ | 0% | — | — |

**The default day, Earth to ISS:** energy change −15.2%, load 25.1% of the Earth day.
<!-- numbers:end -->

## The beats

### 1. Earth, the ordinary day

SHOW: the Two currencies view, Earth selected, all three sessions included.

SAY: This is one ordinary day on Earth: a run, a set of squats, and a ride on a cycle ergometer.
The model gives the day 711 kJ of energy and a load of 100%.
Energy here is mechanical work. It is not calories.
Load is a daily stimulus, as a percentage of the same day on Earth. It is load accounting. It is not a measurement of bone.
On Earth, gravity makes the two numbers move together.

IF IT GOES WRONG: if the page shows other numbers than the table, a default has changed and the pin test will have failed.
Stop and regenerate before presenting.

### 2. Switch to the ISS

SHOW: click ISS. Then point at the line under the Load number that begins "Rests on:".

SAY: Same day, on the ISS. In this model the day's energy goes from 711 kJ to 603 kJ, a change of −15.2%.
The load goes to 25.1% of the Earth day.
So in this model energy fell by 15.2% and load fell to 25.1%. The two numbers do not move together any more.
Why, from the model: the run's peak load is the Earth peak reduced by a measured on-orbit decrement for running,
75% (Genc 2010, from the brief). The squats lose the body-weight term: 1769 N on Earth, 1000 N on the ISS.
Read the "Rests on:" line aloud. It lists what the Load number depends on.

IF IT GOES WRONG: do not say that energy barely moves. The brief's old script says so; the model gives −15.2%.

### 3. The two currencies come apart

SHOW: untick "Include in today" on the run and the squats, so only the cycle ergometer is left. Then tick the run alone.

SAY: Take the cycle ergometer alone. Its energy is 365 kJ on Earth and 365 kJ on the ISS. It is the same in every environment.
The model gives it no skeletal load term, so Load shows a dash and says why. That is a modelling choice.
The brief's reason is that pedalling puts almost no peak load through the hip.
The model uses the CEVIS dynamometer correction, though the brief names FERGO.
Now the run alone. On the ISS its energy goes from 314 kJ to 220 kJ, a change of −30.0%, and its load goes from 100% to 25.0%.
Squats alone: energy from 31.8 kJ to 18.0 kJ, a change of −43.5%, load 56.5%.
The point: joules and load are different quantities. The same joules can come with very different load, or with none.

IF IT GOES WRONG: if asked whether the ergometer "loads the bone", say that the model does not give it a load term and that is a modelling choice.

### 4. The horizon

SHOW: the Mission horizon slider; the button for 180 days, then the button for 1095 days.

SAY: Repeat this day, every day, on the ISS. At 180 days, the length of an ISS increment (from the brief),
135 of 180 Earth-days of loading are missing in this model.
At 1095 days, the length of a Mars round trip (from the brief), 820 of 1095.
That 1095-day figure is for free-fall conditions, not for Mars gravity.
It is one number for the whole skeleton. Per-compartment behaviour, trabecular against cortical, is not modelled.
This is load accounting. It is not a prediction.

IF IT GOES WRONG: if asked about trabecular and cortical bone, say it is not modelled and the page says so.

### 5. Every number has a source

SHOW: the tag chips on the Today numbers and on a session card. Open a card and show the Device force tagged MANUAL.
Then the Capture view with a short clip the pipeline refuses.

SAY: Every number carries a tag that says where it came from. A device force typed by hand is tagged MANUAL.
The brief, in its section 8 and citing NTRS 20140012615 and NTRS 20130009882, says ARED sessions have been
hand-entered into Excel since 2011.
Here is a clip the camera pipeline refuses, and the reason in plain words. It gives no numbers.
A camera result, when there is one, is tagged ESTIMATE, and its confidence is capped until the pipeline is validated on real video.

IF IT GOES WRONG: do not show a camera result as if it were measured. If the clip is analysed instead of refused, say that it is an estimate and move on.

### 6. Close: what is not done

SAY: What is not done. This has never run on astronaut data: the brief's section 6 says there is none that is public.
The camera path has not been validated on real video.
The Moon and Mars rows rest on an assumption that the ISS row does not.
The next step in the brief's section 9 is TRISH EXPAND, opened to outside researchers in March 2026.

## Moon and Mars

Their run peak is an assumption: 2.5× the effective weight, no harness. The ISS row uses a measured decrement.
Do not compare those rows with the ISS row. The on-screen note says the same. If the Moon or Mars is shown, the day's load
reads 17.1% and 37.9%, and read the note first.

## Do not say

- **"Energy barely moves."** The model gives −15.2% for the day.
- **That load "collapses" without "in this model".** It is a computed figure, not an observation.
- **Bone loss, bone density, or any prediction.** The model is load accounting.
- **Calories.** Energy is mechanical work.
- **"Validated", "accurate" or "measured" for camera numbers.** They are ESTIMATE and unvalidated.
- **Per-compartment divergence.** It is not modelled.
- **Mars gravity for the 1095-day horizon.** That figure is for free-fall conditions.
- **Anything that implies ISS data or ARED instrumentation.** We have none.
- **FERGO calibration.** The model uses the CEVIS correction.
- **Any brand name.** The title is Ground Truth.

## If something fails live

- **Camera permission denied:** open a video file instead.
- **The model is slow to load:** say it loads from this page's own files, and wait.
- **No wrist detected:** this is the refusal beat. Use it.
- **The screen is too small:** the phone-width layout is supported.

## Length

The submission's video length limit is not known yet. Confirm it in the submission guide on 2026-11-13.
Beats 1 to 3 carry the thesis and stand alone. Beats 4 to 6 can each shrink to one sentence. No timings are given because none can be backed.
