# Ground Truth — strategy brief

NASA Space Apps Challenge 2026 · [Create Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/create-health-monitoring-software-for-astronauts-on-space-missions/)

Every quantitative claim below carries a source. Figures marked **[pre-ARED]**
describe the era before the current resistive device and must never be quoted as
the situation today — that is the most common error in writing about ISS
exercise, and it was present in our own first draft.

---

## 1. The challenge, as actually published

Published 2026-09-17. The page carries **one paragraph and nothing else** — the
Resources tab is an empty string in the CMS. There is no Background, no
Objectives, no Potential Considerations, no NASA data list.

> Long-duration missions expose astronauts to space radiation, isolation and
> confinement, altered gravity, and a hostile closed environment, which can
> bring immune changes, bone loss, cardiovascular events, and behavioral health
> problems. On long missions, astronauts carry much of the responsibility for
> spotting these changes in themselves. Your challenge is to build a health
> monitoring software that gathers health indicators and enables astronauts to
> evaluate and act on the status of their health.

Difficulty: Intermediate. Subjects: Human Exploration, Software, Space Exploration.

### Timeline ([Participant FAQs](https://www.spaceappschallenge.org/resources/participant-faqs/))

| Date | Event |
| --- | --- |
| Sep 17, 2026 | Challenge summaries (what we have) |
| **Oct 28, 2026** | **Full challenge statements, with NASA's own suggested datasets** |
| Nov 13, 2026 | Project Submission Guide + Judging & Awards Guide |
| **Nov 14–15, 2026** | **Hackathon.** Submission closes Sun 23:59 local |
| Dec 2026 / Jan 2027 | Nominees / global winners |

Everything in this brief is pre-work. **October 28 is the date that can
invalidate parts of it** — specifically §6, because NASA will name the datasets
it expects us to use.

### Two phrases that drive the whole strategy

1. The named risks are **bone loss, cardiovascular events, immune changes,
   behavioral health**. Calories are not among them. A gravity-corrected
   calorie is a good hook and answers no risk the challenge names.
2. "astronauts carry much of the responsibility for **spotting these changes in
   themselves**" — this is a crew-facing autonomy problem, not a ground
   telemetry dashboard. It is a design constraint, not a framing choice.

### There is no prior art to study

Enumerating every challenge slug Space Apps has ever published (99 distinct)
turns up no previous astronaut-health challenge. The nearest precedent is 2025's
*Build a Space Biology Knowledge Engine*, whose Best Use of Science winner
(**SpaceGenes+**, Germany) was an OSDR-backed dashboard on radiation and
microgravity effects. Scale for calibration: 2025 had 114,000+ participants in
18,860 teams across 167 countries.

---

## 2. The thesis: two currencies

**Energy and load are different quantities. On Earth gravity couples them, so
every consumer fitness model gets away with conflating them. In orbit the
coupling breaks, and the conflation becomes the bug.**

- **Energy** — mechanical work (J) and metabolic expenditure (kcal).
- **Load** — peak force (N), impulse (N·s), and a saturating, rate-sensitive
  skeletal load stimulus.

A 45-minute cycle-ergometer session is substantial energy and approximately zero
femoral loading. A 12-rep ARED squat set is modest energy and the single largest
osteogenic event of the crew member's day. One number cannot represent both, and
the number every wearable reports is the wrong one.

### Why load, and not calories

**Bone is the one system that cannot be measured in flight.** DXA is a ground
instrument; the in-flight record is a gap between a pre-flight scan and a
post-flight scan six months later. The only way to track bone during a mission
is to account for its *input*. That is the product.

The supporting physiology, verified:

- **[pre-ARED]** Lang 2004, 14 ISS crew 2000–03, iRED era, QCT + DXA: hip areal
  BMD **1.4–1.5 %/month**, lumbar spine **0.9 %/month**. Compartment-resolved at
  the hip: **trabecular 2.2–2.7 %/month vs cortical 0.4–0.5 %/month**
  ([JBMR 19:1006](https://academic.oup.com/jbmr/article/19/6/1006/7592735)).
- **With ARED**, adequate energy intake and vitamin D: pelvis, femoral neck,
  trochanter and total hip BMD **unchanged from preflight** by DXA (Smith 2012,
  n=13) ([JBMR 27:1896](https://onlinelibrary.wiley.com/doi/full/10.1002/jbmr.1647)).
  Later work calls this *partial* protection, because DXA does not see the
  trabecular compartment where the loss concentrates
  ([Sibonga 2019](https://pubmed.ncbi.nlm.nih.gov/31400472/)).
- **Recovery is incomplete.** At one year post-flight only **34.0 %** of
  astronauts regain preflight hip BMD and **46.8 %** spine; recovery is
  logarithmic then plateaus ([PMC12626757](https://pmc.ncbi.nlm.nih.gov/articles/PMC12626757/),
  [Sibonga 2007](https://ntrs.nasa.gov/citations/20070032016)).

Two consequences for the UI, both non-obvious:

1. A monthly-decline curve must be **countermeasure-conditional**. Drawing the
   pre-ARED curve for a crew member who is training is simply false.
2. **Report per compartment.** DXA-equivalent output hides a 5:1 difference
   between trabecular and cortical loss. A load model that resolves compartments
   says something the flown instrument cannot — which is a far stronger claim
   than restating a headline number.

### The load model

Skeletal adaptation responds to **peak strain magnitude** and **strain rate**,
and saturates in **cycle count** — the fortieth rep contributes far less than
the fourth. The standard formulation is Carter/Whalen/Beaupré daily load
stimulus, with the load term raised to a high exponent so that peaks dominate
and volume does not:

```
S_day = ( Σ_i  n_i · σ_i^m )^(1/m)          m ≈ 4
```

`σ_i` is peak stress at the site for loading type *i*, `n_i` the cycle count. A
saturating form (Turner/Robling osteogenic index, with rest insertion between
bouts) is the refinement if time allows; the exponent is what matters for the
demo.

Then the headline number:

```
Deficit(T) = ∫₀ᵀ ( S_earth_baseline − S_achieved(t) ) dt     per site
```

Sites that matter, in the order the evidence supports: **femoral neck,
trochanter, total hip, lumbar spine** — the hip first, because that is where the
pre-ARED loss concentrated.

**Calibration anchor, verified:** on-orbit single-leg peak loads run far below
1 g at matched activity — decrements averaged **75 % for running, 77 % for
walking, 65 % for squats** even at maximum device settings
([Genc 2010](https://pubmed.ncbi.nlm.nih.gov/20728086/)), and "typical applied
forces are less than body weight"
([De Witt & Ploutz-Snyder 2014](https://pubmed.ncbi.nlm.nih.gov/24835563/)).
So the achieved stimulus is roughly a quarter of Earth-equivalent, and with
`m = 4` that is a *very* large gap in `S`. This is the number the demo is built on.

### The energy model, and its honest limits

Per device, using verified specs:

**ARED** — pneumatic + flywheel resistive.

```
W_concentric = ∫ ( F_pneumatic(x) + F_flywheel(ẍ) ) dx
W_eccentric  ≤ 0.90 × W_concentric
```

Not a constant force. Two vacuum cylinders give a nearly-constant 340 kgf each
(cams compensate the geometry over the stroke), but the flywheel subassembly adds
a velocity-dependent inertial term worth **up to +91 kgf (≈893 N) at the lift
bar** at the 600 lbf setting over a 30 in stroke at a 2 s rep period — spiking at
bottom-of-stroke, relieving at top. Eccentric runs at ≤90 % of concentric.
Ranges: **bar 0–272 kgf (0–2669 N) over 76.2 cm; cable 0–68 kgf (0–667 N) over
183 cm** ([NTRS 20060028227](https://ntrs.nasa.gov/api/citations/20060028227/downloads/20060028227.pdf),
[ESA](https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Node-3_Cupola/advanced_Resistive_Exercise_Device)).
Protocol: 6–15 reps × 3–5 sets, progression 3–5 %/week
([Petersen 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4971634/)).

**Body-weight replacement — the correction that makes cross-gravity comparison
possible at all.** On Earth a squat moves bar load *plus* body mass; on ARED in
microgravity only the bar load acts. NASA states in-flight squat and deadlift
loads must be *increased to account for the loss of body weight*
([ISS Daily Summary, 2023-12-18](https://www.nasa.gov/blogs/stationreport/2023/12/18/iss-daily-summary-report-12-18-2023/)).
So:

```
F_total(site) = F_device + m · g_env          # g_env ≈ 0 on ISS
F_device_for_earth_equivalence = F_target − m · g_env
```

Without this term a 0-g session and a 1-g session are not comparable, and
comparing them is the entire product.

**Treadmill (T2 / COLBERT)** — the harness *is* the gravity.

```
F_eff      = m · g_env + F_SLD
W_per_step ≈ F_eff · Δz_COM        (+ horizontal KE fluctuation)
```

Subject load device is set to **70–80 % body weight** as the practical
comfortable maximum, and **~50 % BW for the first one to two weeks** in flight
([Petersen 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4971634/)). Speed to
**12 mph**, stepping in 0.5 mph from 1.5 mph; logs accelerometer, **load cell**,
motor speed and heart rate
([NTRS 20130009882](https://ntrs.nasa.gov/api/citations/20130009882/downloads/20130009882.pdf)).
The flown SLD is a passive bungee; the 178–979 N active spec that circulates is
ESA's Subject Loading System requirement, not the flown hardware.

**Cycle ergometer — and a correction.** CEVIS (25–350 W, 1 W steps, 50–120 rpm)
**was replaced by FERGO in October 2023** (25–500 W ±5 %, to 120 rpm)
([ESA](https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Biking_in_space)).
Neither reports cumulative work — you integrate `P·dt` yourself. And displayed
watts overstate delivered mechanical power; the dynamometer correction is

```
P_actual = 0.98 × P_displayed − 11.8        # CEVIS
```

([NASA/TP-2007-214760](https://ntrs.nasa.gov/api/citations/20070023931/downloads/20070023931.pdf)).
An 11.8 W offset on a 75 W prescription is a 16 % error — worth showing.

**Metabolic energy.** Do not re-derive kcal from mechanics. Use `E_met ≈
W_mech / η` with η ≈ 0.20–0.25 for cycling as a **cross-check**, present the
device's own kcal **labelled as a 1 g model**, and prefer a heart-rate-based
estimate calibrated against a pre-flight test where one exists. This is exactly
Vocaid's existing rule — the device's score is shown as the device's, never
restated as ours — applied to a case where the device is demonstrably wrong.

### Partial gravity is not a scaled version of Earth

Moon **1.62**, Mars **3.71**, Earth **9.81**, ISS ~10⁻⁶ g. The walk–run
transition scales with the Froude number:

```
v_transition = √( Fr · g · L )        Fr ≈ 0.5, L = leg length
```

At lunar gravity that speed is low enough that normal walking stops working,
which is why Apollo crews loped. For the model this means gait-derived
quantities cannot be scaled linearly between environments — a genuinely
checkable physics result, and a good thirty seconds of the demo.

---

## 3. Gravity and applied force as first-class fields

An `environment` object on **every session record**, not a global toggle. This is
the same shape as per-number provenance — which is why it plugs cleanly into a
stack already built that way.

```jsonc
{
  "environment": {
    "g_env_ms2": 0.0,              // 9.81 | 3.71 | 1.62 | ~0
    "body": "ISS",                 // EARTH | MOON | MARS | ISS | TRANSIT
    "mass_kg": 78.4,
    "mass_source": "SLAMMD",       // SCALE invalid in microgravity
    "mass_measured_at": "2026-11-02T09:12:00Z"
  },
  "applied_load": {
    "device": "ARED",              // ARED | T2 | FERGO | E4D | ROCKY | NONE
    "mode": "RESISTIVE",
    "setting_n": 1780,
    "force_model": "PNEUMATIC_PLUS_FLYWHEEL",
    "eccentric_ratio": 0.9,
    "support_fraction": null       // T2 only: SLD as fraction of 1g body weight
  },
  "provenance": {
    "load_source": "MANUAL_ENTRY", // see §8 — this is the real-world default
    "confidence": "LOW"
  }
}
```

`mass_source` matters: a scale measures weight, and in microgravity there is
none. NASA uses **SLAMMD**, which applies a known force via two springs and
regresses position against time for acceleration, `m = F/a`, accurate to
**0.5 lb (≈0.23 kg)** over 90–240 lb. It lives in the HRF-1 rack in Columbus and
is still in service — its yearly calibration run appears in the
[ISS Daily Summary of 2024-05-22](https://www.nasa.gov/blogs/stationreport/2024/05/22/iss-daily-summary-report-5-22-2024/).

---

## 4. The existing stack: transfers, breaks, gaps

### Transfers unchanged

Overnight resting heart rate, HRV (RMSSD/SDNN), respiratory rate, sleep stages
and efficiency, SpO2, cuff blood pressure, CGM glucose, skin-temperature trend,
and food-from-photo down to micronutrients.

One caveat on the strongest selling point. *Overnight resting HR is the measure
that aligns best across brands* remains true as a **comparability** claim, and
that is worth keeping. It cannot carry a "watch it rise in flight" story,
because the in-flight direction is genuinely contested: 24-hour ambulatory
recording shows **reduced** HR, diastolic pressure, HR/DBP variability and PVCs
([Verheyden/Aubert](https://journals.physiology.org/doi/abs/10.1152/jappl.1996.80.3.910)),
while Hughson's ISS cohort found **no change** in HR, BP or baroreflex
([Hughson 2012](https://journals.physiology.org/doi/full/10.1152/japplphysiol.01196.2011)).
HRV reduction is clearest **during sleep**
([Vandeput 2013](https://journals.physiology.org/doi/full/10.1152/ajpregu.00423.2012)).
Show the trend against the crew member's own preflight baseline; assert no
population direction.

### Breaks — all are 1 g models

Steps, distance, floors, elevation, pace, GPS, scale weight, swimming metrics,
estimated VO2 max, and every proprietary composite (strain, readiness, body
battery). Device calorie estimates are shown **labelled as 1 g models**, beside
the corrected value.

### Needs revalidation rather than removal

Wrist-accelerometry sleep staging in free-float. The movement prior that
staging depends on is different when there is no bed.

### Missing, and mandatory for this challenge

The challenge names four risk families. Two of them — *hostile closed
environment* and *isolation and confinement* — have no counterpart in a consumer
wearable stack, and most teams will drop them. They are cheap to add and they
are where Relevance is won.

| Domain | Signal | Verified anchor |
| --- | --- | --- |
| Environment | Cabin **ppCO2** | ISS typically **~3 mmHg**; standard is **≤3 mmHg 1-h average** (NASA-STD-3001 Vol 2, lowered from the 3.8–7.5 band still widely quoted). Headache odds **double per +1 mmHg**; a 7-day average **<2.5 mmHg** holds risk <1 % ([OCHMO-TB-004](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf), [Law 2014](https://pubmed.ncbi.nlm.nih.gov/24806559/)) |
| Environment | Radiation dose | **0.2–0.5 mSv/day**, 40–90 mSv per 6-month increment; career limit **<600 mSv** (2022 standard, universal across age and sex); Mars transit **662 ± 108 mSv** round trip ([OCHMO-TB-020](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-020-radiation-protection.pdf), [Zeitlin 2013](https://www.science.org/doi/10.1126/science.1235989)) |
| Environment | Light spectrum / lux | SSLA tunable LED replaced fluorescents from 2016 ([NTRS 20160005080](https://ntrs.nasa.gov/api/citations/20160005080/downloads/20160005080.pdf)) |
| Exercise | Device telemetry | See §8 — largely absent in practice |
| Body | Mass | SLAMMD, not a scale |
| Cognition | Reaction time | **WinSCAT**, 5 subtests, **medically required monthly**, scored against that individual's preflight baseline ([NASA TM-20205008023](https://ntrs.nasa.gov/api/citations/20205008023/downloads/NASA_TM20205008023.pdf)); research battery is UPenn **Cognition**, 10 tests, ~16–20 min ([UPenn](https://www.med.upenn.edu/uep/cognition.html)) |
| Vision | SANS self-tests | **~66 %** of long-duration crew show ≥1 sign; clinically significant disc edema **~15 %**; hyperopic shift **≥ +0.75 D**; quantified as peripapillary **ΔTRT ≥ 20 µm**. On-orbit: OCT primary, plus tonometry, visual acuity, Amsler grid ([NASA IWS 2023](https://ntrs.nasa.gov/api/citations/20220014606/downloads/Brunstetter%20-%20IWS%202023%20SANS%20Clinical%20Update%20-%20Abstract%20-%2023Sep22.pdf)) |
| Bone | Turnover markers, urinary calcium | The only in-flight observable of bone, and the empirical check on our load model |
| Cardiovascular | Fluid-shift proxies | Stagnant or **retrograde internal jugular flow in 6/11** crew at flight day ~50, one occlusive thrombus found in flight ([Marshall-Goebel 2019](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2755307)); LV mass **−12 %** after 10 days ([Perhonen 2001](https://journals.physiology.org/doi/full/10.1152/jappl.2001.91.2.645)); orthostatic intolerance ~20–25 % short-duration, ~83 % long-duration (small n) |
| Immune | Latent herpesvirus shedding | Shuttle → ISS: **VZV 41→65 %, EBV 82→96 %, CMV 47→61 %**, by qPCR on saliva/urine/blood, with salivary cortisol/DHEA and NK-cell function ([PMC13149593](https://pmc.ncbi.nlm.nih.gov/articles/PMC13149593/)) |
| Behavioral | Mood, workload, journal | Operational baseline is a **Private Psychological Conference every two weeks** ([NTRS 20220015121](https://ntrs.nasa.gov/api/citations/20220015121/downloads/AAPL%20Meeting%20Presentation%20OCT%202022%20Beven%20Final.pdf)) |

### Nutrition is load-bearing, and terrestrial intuition is inverted

Two rules from the exploration standard
([JSC-67378](https://ntrs.nasa.gov/api/citations/20205008306/downloads/JSC67378%20Expl%20Nutr%20Reqs%20042020.pdf))
invert what a consumer nutrition tracker does:

- **Iron is a ceiling, not a target: ≤8 mg/d.** Verbatim rationale: to *"prevent
  iron overload, a situation that may lead to oxidative tissue damage."* Red
  cell mass falls 10–12 % in the first ~10 days, and Trudel 2022 showed this is
  ongoing **hemolysis**, persisting a year post-flight
  ([Nat Med](https://www.nature.com/articles/s41591-021-01637-7)). Measured
  in-flight intakes run **15–23 mg/d** — two to three times the limit.
- **Sodium is restricted (1500–2300 mg/d)** because excess drives calcium
  excretion and renal stone risk. Measured intakes still run 3800–4600 mg/d.
  This wires nutrition **directly into the bone model**.

Also corrected: **vitamin D is 25 µg (1000 IU)/d**, not the 800 IU still widely
quoted. Calcium 1000–1200 mg/d. Protein 1.2–1.8 g/kg.

A conventional tracker asks "did you hit your iron RDA?" and flags the exact
wrong direction. A camera-based micronutrient reader that knows the exploration
standard flags the right one. That is the single clearest argument for carrying
the food-from-photo feature into this build.

---

## 5. "Length of training" — four readings

The phrase is ambiguous. Three readings are design inputs; one is a trap.

**1. Session length — the daily prescription.** **2.5 h/day scheduled**, of
which **≈1.5 h is actual exercise** and ~1.0 h is setup, stow and hygiene —
**40 % overhead**. Prescribed **7 days/week** (not 6), targeting 6–7 resistance
and 4–7 cardiovascular sessions weekly; a typical day is one resistance bout plus
one cardiovascular bout ([Petersen 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4971634/)).
That 40 % overhead is a product opportunity in itself: crew time is the scarcest
resource on any vehicle.

**2. Mission length — the horizon the deficit integral runs over.** ISS
increment ~6 months; Artemis surface stays days to weeks; Mars round trip ~2.5–3
years, of which the transit alone is ~360 days and 662 ± 108 mSv. This is the
demo slider.

**3. Trend-window length — how long a signal must persist to be actionable.**
The consumer 7/30/90 windows are an Earth habit. Re-derive them from each
system's time constant:

| System | Window | Why |
| --- | --- | --- |
| HRV, sleep, cognition | 3–7 days | Responds within days; WinSCAT cadence is monthly, so the wearable fills the gap |
| ppCO2 → headache risk | 7-day average | Directly from Law 2014 — the evidence gives us the window |
| Fluid shift, blood pressure | Weeks | IJV flow changes observed by flight day ~50 |
| Bone | Months | And never measured in flight — hence §2 |

Deriving the window from the physiology rather than inheriting it from a
consumer app is a small thing that reads as Validity.

**4. Model/dataset length — the trap.** Real flight *n* is tiny: Standard
Measures is **52 crewmembers** total, and the data is request-only. **Do not
train a model on flight data.** Use physics plus published effect sizes, and
validate against analogs. In a 48-hour hackathon, simulated scenarios driven by a
verified model beat a model fit to almost nothing — and they are honest, which
the judges score.

---

## 6. Data

⚠️ **This section is the most likely to be superseded on October 28**, when NASA
publishes the datasets it expects entrants to use.

### The blunt finding

**There is no public dataset of astronaut vitals, actigraphy, sleep, DXA or
cardiovascular time series, and no public ISS exercise log.** Verified across
OSDR, data.nasa.gov and the literature. OSDR holds 112 human studies, almost all
transcriptomics; its non-omics slice (ALSDA) has 83 studies of which only 7 are
human, and searches for `heart rate`, `wearable`, `biometric` and `actigraphy`
return **zero hits**. Crew physiological data is Privacy-Act protected;
LSDA/NLSP requests run **months** through review boards and a DUA.

Saying this explicitly in the submission is worth points. Correctly
characterising data-access constraints reads as Validity, which is scored.

### Open, usable now

| Source | What | Access |
| --- | --- | --- |
| [OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) | **Best pick.** Inspiration4 serum metabolic panel + immune/cardiac cytokines, pre/in/post-flight. 9 CSV/XLSX, ~700 KB | Open, no account |
| [OSD-942](https://osdr.nasa.gov/bio/repo/data/studies/OSD-942) / [OSD-946](https://osdr.nasa.gov/bio/repo/data/studies/OSD-946) | Bed rest **× exercise countermeasure** — the only open NASA data with an exercise-intervention factor | Open |
| [RadLab](https://visualization.osdr.nasa.gov/radlab/) + [Environmental Data App](https://www.nasa.gov/reference/osdr-environmental-data/) | ISS radiation dosimetry and cabin temperature/RH/**CO2** time series, documented API | Open |
| [Flight Crew Physiological Data for Crew State Monitoring](https://data.nasa.gov/dataset/flight-crew-physiological-data-for-crew-state-monitoring) | Pilot/copilot pairs, **256 Hz** physiological recordings, ~20 experiments. Rarely cited | Open, licence "not specified" |
| [MRID book, JSC 28913](https://nlsp.nasa.gov/explore/lsah/mrid_book.pdf) | Medical Requirements Integration Document — **the best free data dictionary for what NASA actually measures on crew**. Build the schema from this | Open PDF |
| [Standard Measures paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC12612093/) | N=52 crew, six domains, full variable list and timepoint schedule. Data not downloadable — **the paper is the usable artifact**, enough for a realistic synthetic generator | Open |

OSDR is genuinely open — no DUA, no registration, plus
`aws s3 ls --no-sign-request s3://nasa-osdr/`.

### Validation stand-ins (open, no account, ~3.4 GB total)

- **[MMASH](https://physionet.org/content/mmash/1.0.0/)** — 22 subjects × 24 h,
  RR intervals, triaxial accelerometry, sleep, hourly activity diary, salivary
  cortisol and melatonin. 23.5 MB, ODbL. **The closest open analog to a crew
  day.**
- **[LifeSnaps](https://zenodo.org/records/7229547)** — 71 subjects over 4+
  months; HR, **RMSSD**, sleep stages, SpO2, skin temperature, plus surveys.
  615 MB, CC-BY-4.0. The longitudinal set.
- **[PRCP](https://physionet.org/content/prcp/1.0.0/)** — slow tilt / fast tilt /
  stand-up with ECG and arterial BP. 54 MB. The only open tilt-protocol data,
  and the closest open proxy for orthostatic deconditioning.
- **[Simultaneous measurements with five devices](https://physionet.org/content/simultaneous-measurements/1.0.2/)**
  — includes a Hexoskin Hx1, realistically the only open data in Astroskin's
  native format.

Tooling: NeuroKit2 (MIT), YASA (BSD-3), GGIR (Apache-2.0), HeartPy. 🚩 Avoid
`hrv-analysis` in anything we ship — GPLv3.

### Do not cite

The NASA Twins Study is **not public** — not in OSDR, no dbGaP accession. OSDR
`OS-826` surfaces as "Twins Study" but is *"Twin Study validation"*, a **rodent**
experiment. Use the [*Science* 2019 paper](https://www.science.org/doi/10.1126/science.aau8650)
and its supplementary tables instead. HERA data: zero public hits. Bed rest:
request-only, with one open EEG exception.

---

## 7. Autonomy, and the comms delay

"Spotting these changes in themselves" is the challenge's own phrasing, and it
rules out a ground-in-the-loop architecture. Mars one-way light time is 4–24
minutes; there are conjunction blackouts. NASA's own framing is the ExMC risk
*"Inability to Adequately Recognize or Treat an Ill or Injured Crewmember."*

Architectural consequences:

- **Local inference. No cloud round trip.** Everything that produces a number or
  an alert runs on the vehicle.
- **Deferred, bandwidth-budgeted sync to ground** — store-and-forward, which is
  precisely the problem NASA's in-development **xEHR** exists to solve
  ([NTRS 20230003216](https://ntrs.nasa.gov/citations/20230003216)).
- **Cite the spec.** [ExMC Clinical Decision Support System Architecture
  Recommendation, HRP-48032 Rev. B, NTRS 20220017869](https://ntrs.nasa.gov/citations/20220017869)
  and its [ConOps companion](https://ntrs.nasa.gov/citations/20220017856). Tracing
  our design to NASA's own architecture recommendation is the cheapest Validity
  point available.

Two existing roadmap items get repurposed rather than invented:

- The **consent-scoped, time-boxed, revocable professional share** becomes the
  flight-surgeon link under crew consent. This is not a stretch — it mirrors how
  crew medical privacy actually works, right down to the fortnightly private
  psychological conference and the Privacy-Act protection on the data.
- The **MCP connector** gets re-pointed at a *local* assistant instead of a
  hosted one. Same interface, inverted topology.

---

## 8. Prior art, and where the actual gap is

**The hardware is solved and flying. The open problem, stated by NASA in its own
documents, is integration.**

### What already flies — do not rebuild

- **CHeCS** (Crew Health Care System), ISS baseline since 2001: HMS, EHS, CMS.
  Worth knowing that it is **hardware and checklists, not an integrated app** —
  there is no unified crew-facing health application in CHeCS.
- ⭐ **EveryWear (EVW)** — the closest existing thing to an astronaut health app,
  and **we must differentiate from it explicitly or lose Creativity**. Built by
  MEDES for CNES, operated via CADMOS. iPad app plus onboard server. Food diary
  by **barcode scanning**, water, medication, questionnaires, wearable ingest
  (core-temp pills, actigraphy, glucometer, dosimeter), and end-to-end encrypted
  crew↔flight-surgeon messaging. On ISS since Increment 49 (2016), standard for
  all ESA ISS astronauts, and **ported to Orion for Artemis II**
  ([IAC-2022](https://dl.iafastro.directory/event/IAC-2022/paper/69181/),
  [ESA, Apr 2026](https://blogs.esa.int/orion/2026/04/06/everywear-from-earth-orbit-to-the-moon/)).
- **Astroskin / Bio-Monitor** (CSA/Hexoskin) — smart shirt, 3-lead ECG,
  respiration, SpO2, BP, skin temp, accelerometry; on ISS since Jan 2019, with a
  Gateway contract awarded Nov 2024. There is a
  [REST API](https://api.hexoskin.com/docs/) but keys are request-by-email —
  keep it off the critical path.
- **Bio-Analyzer** (CSA) — in-flight blood/saliva/urine analysis from <1 mL.
- **AMOS** — autonomous medical officer support that **flew and worked**: two
  crew performed bladder and kidney ultrasound with *zero* ground guidance and
  no prior exposure to the software ([NTRS 20230000965](https://ntrs.nasa.gov/citations/20230000965)).
- **IMM / MEDPRAT / IMPACT** — probabilistic medical risk and kit optimisation.

Our three differentiators against EveryWear, stated plainly: **barcode vs
camera** (a barcode scanner is useless for a rehydrated spaceflight food system
and for anything not in a database); **logging vs modelling** (EveryWear records
what happened, it does not compute a load deficit); and **no gravity model at
all** anywhere in the flown stack.

### The gap, in NASA's own words

NASA human-factors research states that each ISS exercise device has "a unique,
customized software system interface with unique layouts/hierarchy," and that
the programs **"are not adaptable and provide no real-time feedback or
motivation."** The R&D response is **NextGen One Portal**, a unified GUI across
MED-2, ARED, Orion Flywheel, T2, Hopper, ATLAS and HULK, usability-tested as
beating the flown ARED interface.
**[NTRS 20170010129](https://ntrs.nasa.gov/citations/20170010129) — read before
designing any exercise UI.**

Exercise prescription itself is human-driven: each crew member is paired roughly
two years pre-flight with an **ASCR** specialist. There is no published NASA
exercise-prescription software product.

### The finding that justifies the whole project

**ARED has recorded no instrumented data since mid-2011.** The force platform is
defective and the instrumentation lost power. Since 2011-06-01, sessions are
**hand-entered into Excel** — cycles, exercise time, exercise name, weight, sets,
crew ID. The device was designed with a tablet, DAQ, multi-channel sensors and
WLAN downlink, and none of it is in service. The workarounds have been one-off
studies: XSENS ForceShoe (2014), ESA's ARED-K kinematics
([NTRS 20140012615](https://ntrs.nasa.gov/citations/20140012615),
[NTRS 20130009882](https://ntrs.nasa.gov/api/citations/20130009882/downloads/20130009882.pdf)).

The incumbent we are competing with is a spreadsheet. That is a far better pitch
than competing with a wearable's calorie model, and it explains why the
`provenance.load_source: MANUAL_ENTRY` field in §3 is the realistic default
rather than a fallback.

### Substrate

**[nasa/openmct](https://github.com/nasa/openmct)** (Apache-2.0) — NASA's own web
mission-control framework, flown on ASTERIA, Cold Atom Lab and MarCO/InSight.
"Health monitoring" in Open MCT means *spacecraft* health; there is no NASA
deployment for crew physiology. That makes it both an excellent substrate and a
defensible novelty claim. 🚩 Crowded-lane warning: repos like `AstroKestrel` and
`AstroVitals` already do "AI astronaut health dashboard on OSDR data" — the
obvious idea is taken, so the gravity model must be front and centre.

---

## 9. Honesty, scope, and judging

### The criterion is "Influence", not "Impact"

The 2026 guide publishes **Nov 13** and the URL currently 404s. The most recent
verifiable official text is the
[archived 2024 guide](https://web.archive.org/web/20241127094016/https://www.spaceappschallenge.org/resources/judging-awards-guide/):
**Influence · Creativity · Validity · Relevance · Presentation**. The guide adds
its own hint — *"remember to pay equal attention to the final criterion:
presentation… recruit team members with… expertise in storytelling, design."*
There are ten global awards; **Best Use of Science**, **Best Use of Data** and
**Best Storytelling** are the realistic targets. **Re-read the guide on Nov 13.**

| Criterion | Our strongest card |
| --- | --- |
| Influence | Bone loss is a named risk on every exploration roadmap; the load data is currently not captured at all |
| Creativity | No flown system models gravity; EveryWear logs, it does not compute |
| Validity | Every number sourced; ARED modelled as non-constant force; BWR term; data-access limits stated rather than hidden |
| Relevance | Answers all four named risk families, including the two most teams will drop |
| Presentation | The cycle-ergometer moment — one slider, two numbers diverging |

### The honesty line

Outputs are **load accounting**: physics bookkeeping with stated assumptions, not
clinical inference. We do not diagnose, and we do not claim to measure bone. The
same discipline that makes the consumer product say *"the device's score, shown
as the device's"* is what keeps a wellness-grade product credible when it starts
talking about the skeleton. Say it on a slide, in those words.

### Out of scope for 48 hours

Training any model on flight data. Real device integration. Requesting LSDA
data. Clinical validation. Anything requiring a DUA.

### What we would do next — the strongest closing slide

**TRISH EXPAND** opened its commercial-spaceflight health database to outside
researchers in **March 2026**, via an open call for secondary analysis of
de-identified data — multi-omics, **smartwatch sleep and activity**, cognitive
tests, questionnaires across private missions
([announcement](https://blogs.bcm.edu/2026/03/17/from-the-labs-trish-opens-commercial-spaceflight-database-to-scientific-community/)).
Too slow for the hackathon; exactly right as the next step, and it shows we know
where real validation would come from.

---

## 10. The demo

> For the demo, see [`demo-script.md`](demo-script.md): it uses the numbers the model computes. The script below asserts outcomes (for example "Energy barely moves") that the physics does not produce.

One screen. A gravity selector: **Earth · Moon · Mars · ISS**. A session list
below it. Two large numbers at the top: **Energy** and **Load**.

1. Start on Earth with an ordinary session. Both numbers are healthy. This is
   the world every fitness app models.
2. Switch to **ISS**. Energy barely moves. Load collapses. Name the reason: on
   Earth gravity supplies the load for free; in orbit only the device does, and
   the device is set to 70 % of a body weight the crew member no longer has.
3. Open the **45-minute FERGO session**. Energy is large. Load is ~zero. *This
   is the whole product in one screen* — an excellent workout that does nothing
   for the femoral neck, and no wearable on the market can tell you so.
4. Show the **cumulative deficit** integrating over the mission. Slide the
   horizon from a 6-month ISS increment to a 3-year Mars round trip and watch it
   diverge per compartment — trabecular separating from cortical.
5. Close on **provenance**: every number labelled with the instrument that
   produced it, and the ARED row reading `MANUAL_ENTRY / confidence: LOW` —
   because that is the truth on the actual ISS today, and it is the gap we are
   closing.

---

## Open items

- **Oct 28** — full challenge statement. Re-read §6 against NASA's named datasets.
- **Nov 13** — judging guide. Confirm "Influence" wording.
- Worth an email now: the
  [Antarctic overwintering HRV study](https://www.nature.com/articles/s41598-025-31009-x)
  is "available on reasonable request" and is the most on-target isolation
  dataset found.
- Unverified and left out of the brief: LSDA request turnaround (~13 months,
  page would not load), ESA Erasmus Experiment Archive access status (HTTP 401).
