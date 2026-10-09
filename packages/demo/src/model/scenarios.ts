/**
 * Preset sessions: pure functions (person, environment, parameters) -> SessionResult.
 *
 * Every number comes back as a Quantity with its provenance tag and a note, so a view
 * never has to invent a source. A number that cannot be computed honestly is `null`, with
 * the reason in the note. Formulas are docs/strategy.md §2; the arithmetic lives in
 * @ground-truth/physics wherever it exists there.
 *
 * Tag order, from the least to the most assumed (used when a total mixes tags): see
 * `weakestTag`.
 */

import {
  G_ENV_MS2,
  GENC_2010_PEAK_LOAD_DECREMENT,
  STANDARD_GRAVITY_MS2,
  ergometerWorkJ,
  froudeTransitionSpeedMs,
  metabolicRange,
  totalForceN,
  treadmillEffectiveForceN,
  deviceForceForEarthEquivalenceN,
  type Body,
  type LoadBout,
} from "@ground-truth/physics";

export type Tag = "MEASURED" | "MANUAL" | "MODEL" | "ASSUMPTION" | "CALIBRATED" | "ESTIMATE";

/** `value` null means not computable; the note then says why. Otherwise the note says where the number comes from. */
export interface Quantity {
  value: number | null;
  unit: string;
  tag: Tag;
  note: string;
}

/** A Quantity shown in a session's expandable details. The label is the only addition to the plan's Quantity. */
export interface Detail extends Quantity {
  label: string;
}

export interface SessionResult {
  id: string;
  title: string;
  energy: Quantity; // mechanical work, J
  peakLoad: Quantity; // N
  bout: LoadBout | null; // null when the session has no skeletal load term in this model
  details: Detail[]; // parameters and intermediate values shown on expand
}

export interface Person {
  massKg: number;
  legLengthM: number;
}

export interface Env {
  body: Body;
  gEnvMs2: number;
}

export const EARTH_ENV: Env = { body: "EARTH", gEnvMs2: G_ENV_MS2.EARTH };

/** The environments of the demo's selector, plus TRANSIT (reachable from the model, not from the selector). */
export const ENVS: Readonly<Record<Body, Env>> = {
  EARTH: EARTH_ENV,
  MOON: { body: "MOON", gEnvMs2: G_ENV_MS2.MOON },
  MARS: { body: "MARS", gEnvMs2: G_ENV_MS2.MARS },
  ISS: { body: "ISS", gEnvMs2: G_ENV_MS2.ISS },
  TRANSIT: { body: "TRANSIT", gEnvMs2: G_ENV_MS2.TRANSIT },
};

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/**
 * Least to most assumed, following the physics README ("Measured versus estimated"): numbers computed from
 * the inputs, then a published model with stated parameters, then calibrated or estimated, then a parameter
 * this demo chose.
 */
const TAG_ORDER: readonly Tag[] = ["MEASURED", "MANUAL", "MODEL", "CALIBRATED", "ESTIMATE", "ASSUMPTION"];

/** The most assumed of the tags: a sum or a ratio is no better sourced than its weakest part. An empty list is MODEL. */
export function weakestTag(tags: readonly Tag[]): Tag {
  let worst = -1;
  for (const tag of tags) worst = Math.max(worst, TAG_ORDER.indexOf(tag));
  return worst < 0 ? "MODEL" : (TAG_ORDER[worst] as Tag);
}

export function quantity(value: number | null, unit: string, tag: Tag, note: string): Quantity {
  return { value, unit, tag, note };
}

function detail(label: string, value: number | null, unit: string, tag: Tag, note: string): Detail {
  return { label, value, unit, tag, note };
}

// ---------------------------------------------------------------------------
// Parameters. Every one is exported with its tag and source.
// ---------------------------------------------------------------------------

export interface TreadmillParams {
  durationS: number;
  cadenceStepsPerMin: number;
  comVerticalM: number;
  earthPeakMultiplier: number;
  supportFraction: number;
}

export const TREADMILL_DEFAULTS: Readonly<TreadmillParams> = {
  /** MANUAL: session length, an entry. 30 minutes. */
  durationS: 1800,
  /** ASSUMPTION (this demo's choice): 170 steps/min, a common running cadence. Not measured on anyone. */
  cadenceStepsPerMin: 170,
  /** ASSUMPTION: vertical travel of the centre of mass per step, 0.08 m. Brief §2 gives W_per_step ≈ F_eff · Δz_COM but no Δz_COM. */
  comVerticalM: 0.08,
  /** ASSUMPTION: peak vertical ground reaction force in running as a multiple of body weight; 2 to 3 body weights is commonly cited, 2.5 is the middle. */
  earthPeakMultiplier: 2.5,
  /** MANUAL (a device setting; brief §2, subject load device at 70 % of 1 g body weight). Used on the ISS only. */
  supportFraction: 0.7,
};

export interface SquatParams {
  deviceForceN: number;
  sets: number;
  repsPerSet: number;
  strokeM: number;
  replaceBodyWeight: boolean;
}

export const SQUAT_DEFAULTS: Readonly<SquatParams> = {
  /** MANUAL: the force set on the device, 1000 N. */
  deviceForceN: 1000,
  /** MANUAL: 3 sets. */
  sets: 3,
  /** MANUAL: 12 reps per set (brief §2's example set). */
  repsPerSet: 12,
  /** MANUAL: 0.5 m stroke. */
  strokeM: 0.5,
  /** When true, the device force is raised so the total matches the same setting on Earth (brief §2, body-weight replacement). */
  replaceBodyWeight: false,
};

export interface CycleParams {
  durationS: number;
  displayedPowerW: number;
}

export const CYCLE_DEFAULTS: Readonly<CycleParams> = {
  /** MANUAL: 45 minutes (brief §10's session). */
  durationS: 2700,
  /** MANUAL: 150 W as shown on the ergometer's display. */
  displayedPowerW: 150,
};

export type PresetKind = "treadmill" | "squats" | "cycle";

export type ParamField =
  | { kind: "number"; key: string; label: string; unit: string; min: number; max: number; step: number }
  | { kind: "boolean"; key: string; label: string };

/** What a view may edit, and within which limits. Data only. */
export const PARAM_FIELDS: Readonly<Record<PresetKind, readonly ParamField[]>> = {
  treadmill: [
    { kind: "number", key: "durationS", label: "Duration", unit: "s", min: 60, max: 7200, step: 60 },
    { kind: "number", key: "cadenceStepsPerMin", label: "Cadence", unit: "steps/min", min: 100, max: 220, step: 1 },
    { kind: "number", key: "comVerticalM", label: "Vertical travel of the centre of mass per step", unit: "m", min: 0.01, max: 0.2, step: 0.005 },
    { kind: "number", key: "earthPeakMultiplier", label: "Earth peak force", unit: "× body weight", min: 1, max: 4, step: 0.1 },
    { kind: "number", key: "supportFraction", label: "Harness load (ISS only)", unit: "× 1 g body weight", min: 0, max: 1, step: 0.05 },
  ],
  squats: [
    { kind: "number", key: "deviceForceN", label: "Device force", unit: "N", min: 0, max: 5000, step: 50 },
    { kind: "number", key: "sets", label: "Sets", unit: "", min: 1, max: 10, step: 1 },
    { kind: "number", key: "repsPerSet", label: "Reps per set", unit: "", min: 1, max: 30, step: 1 },
    { kind: "number", key: "strokeM", label: "Stroke", unit: "m", min: 0.1, max: 1, step: 0.05 },
    { kind: "boolean", key: "replaceBodyWeight", label: "Add the body weight the environment lacks" },
  ],
  cycle: [
    { kind: "number", key: "durationS", label: "Duration", unit: "s", min: 60, max: 7200, step: 60 },
    { kind: "number", key: "displayedPowerW", label: "Displayed power", unit: "W", min: 20, max: 400, step: 5 },
  ],
};

// ---------------------------------------------------------------------------
// Validation: programmer errors throw. A view clamps its inputs before calling.
// ---------------------------------------------------------------------------

function requirePositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a finite number > 0, got ${value}`);
}

export function validatePerson(person: Person): void {
  requirePositiveFinite("massKg", person.massKg);
  requirePositiveFinite("legLengthM", person.legLengthM);
}

// ---------------------------------------------------------------------------
// Treadmill run
// ---------------------------------------------------------------------------

export function treadmillRun(person: Person, env: Env, p: TreadmillParams = TREADMILL_DEFAULTS): SessionResult {
  validatePerson(person);
  requirePositiveFinite("durationS", p.durationS);
  requirePositiveFinite("cadenceStepsPerMin", p.cadenceStepsPerMin);
  requirePositiveFinite("comVerticalM", p.comVerticalM);
  requirePositiveFinite("earthPeakMultiplier", p.earthPeakMultiplier);
  if (!Number.isFinite(p.supportFraction) || p.supportFraction < 0 || p.supportFraction > 1) {
    throw new RangeError(`supportFraction must be within [0, 1], got ${p.supportFraction}`);
  }

  const onIss = env.body === "ISS";
  const steps = (p.durationS / 60) * p.cadenceStepsPerMin;
  const harnessFraction = onIss ? p.supportFraction : 0;
  const fEffN = treadmillEffectiveForceN(person.massKg, env.gEnvMs2, harnessFraction);
  // On the T2 treadmill the relevant gravity for gait is the harness-supplied one, not the cabin's 0 (physics README).
  const gaitG = onIss ? p.supportFraction * STANDARD_GRAVITY_MS2 : env.gEnvMs2;
  const transitionMs = froudeTransitionSpeedMs(gaitG, person.legLengthM);
  const earthBodyWeightN = person.massKg * STANDARD_GRAVITY_MS2;
  const strikesPerLeg = steps / 2;

  const details: Detail[] = [
    detail("Duration", p.durationS, "s", "MANUAL", "Session length, entered."),
    detail("Cadence", p.cadenceStepsPerMin, "steps/min", "ASSUMPTION", "Chosen by this demo; not measured on anyone."),
    detail("Steps", steps, "steps", "ASSUMPTION", "Duration × cadence."),
    detail("Vertical travel of the centre of mass per step", p.comVerticalM, "m", "ASSUMPTION", "Chosen by this demo; the brief gives the formula but no value."),
    detail("Earth peak force", p.earthPeakMultiplier, "× body weight", "ASSUMPTION", "Running peak vertical force is commonly cited at 2 to 3 body weights; this demo takes 2.5."),
    detail(
      "Harness load",
      p.supportFraction,
      "× 1 g body weight",
      "MANUAL",
      onIss ? "Subject load device setting, applied here (ISS)." : "Subject load device setting; used on the ISS only, not applied in this environment.",
    ),
    detail(
      "Effective force",
      fEffN,
      "N",
      "MODEL",
      onIss ? "F_eff = m · g_env + harness load × m · 1 g (brief §2). A static model, not a measured ground reaction force." : "F_eff = m · g_env (brief §2). A static model, not a measured ground reaction force.",
    ),
    detail("Loading cycles, one leg", strikesPerLeg, "cycles", "ASSUMPTION", "One foot strike per stride on a given leg: half the steps. The load stimulus counts cycles at one site."),
    detail(
      "Walk-run transition speed",
      transitionMs,
      "m/s",
      "MODEL",
      onIss ? "√(Fr · g · L) with Fr = 0.5 and g the harness-supplied gravity (brief §2)." : "√(Fr · g · L) with Fr = 0.5 (brief §2). Gait does not scale linearly between gravities.",
    ),
  ];

  if (!(fEffN > 0)) {
    const reason = "A treadmill session is not possible here: no gravity presses the foot to the belt and no harness load is applied.";
    return {
      id: "treadmill",
      title: "Treadmill run",
      energy: quantity(null, "J", "MODEL", reason),
      peakLoad: quantity(null, "N", "MODEL", reason),
      bout: null,
      details,
    };
  }

  const energyJ = steps * fEffN * p.comVerticalM;
  const energy = quantity(
    energyJ,
    "J",
    "MODEL",
    "Steps × F_eff × vertical travel of the centre of mass per step (brief §2). Mechanical work only, not metabolic energy. Uses two ASSUMPTION parameters: cadence and vertical travel.",
  );

  let peakLoad: Quantity;
  if (onIss) {
    const earthPeakN = p.earthPeakMultiplier * earthBodyWeightN;
    peakLoad = quantity(
      earthPeakN * (1 - GENC_2010_PEAK_LOAD_DECREMENT.running),
      "N",
      "MODEL",
      "The Earth peak (an ASSUMPTION multiple of body weight) reduced by the measured on-orbit decrement for running, 75 % (Genc 2010), even at maximum device settings. The harness load does not enter this figure.",
    );
  } else {
    peakLoad = quantity(
      p.earthPeakMultiplier * fEffN,
      "N",
      "ASSUMPTION",
      "Peak assumed to scale with the effective weight. Partial-gravity running is not a scaled copy of Earth running, so treat this as indicative.",
    );
  }

  return { id: "treadmill", title: "Treadmill run", energy, peakLoad, bout: { cycles: strikesPerLeg, peakLoad: peakLoad.value as number }, details };
}

// ---------------------------------------------------------------------------
// Resistive squats
// ---------------------------------------------------------------------------

export function resistiveSquats(person: Person, env: Env, p: SquatParams = SQUAT_DEFAULTS): SessionResult {
  validatePerson(person);
  if (!Number.isFinite(p.deviceForceN) || p.deviceForceN < 0) throw new RangeError(`deviceForceN must be a finite number >= 0, got ${p.deviceForceN}`);
  requirePositiveFinite("sets", p.sets);
  requirePositiveFinite("repsPerSet", p.repsPerSet);
  requirePositiveFinite("strokeM", p.strokeM);

  const reps = p.sets * p.repsPerSet;
  // Body-weight replacement: the setting is a target for the total on Earth; the device supplies what the environment does not.
  const deviceN = p.replaceBodyWeight
    ? deviceForceForEarthEquivalenceN(p.deviceForceN + person.massKg * STANDARD_GRAVITY_MS2, person.massKg, env.gEnvMs2)
    : p.deviceForceN;
  const bodyWeightN = person.massKg * env.gEnvMs2;
  const totalN = totalForceN(deviceN, person.massKg, env.gEnvMs2);

  const details: Detail[] = [
    detail("Device force set", p.deviceForceN, "N", "MANUAL", "Entered."),
    detail("Sets × reps", reps, "reps", "MANUAL", `${p.sets} sets of ${p.repsPerSet}, entered.`),
    detail("Stroke", p.strokeM, "m", "MANUAL", "Entered."),
    detail(
      "Device force applied",
      deviceN,
      "N",
      p.replaceBodyWeight ? "MODEL" : "MANUAL",
      p.replaceBodyWeight ? "F_device = F_target − m · g_env, with the target the setting plus the full Earth body weight (brief §2)." : "As entered; the body weight the environment lacks is not added.",
    ),
    detail("Body weight in this environment", bodyWeightN, "N", "MODEL", "m · g_env."),
    detail("Total force", totalN, "N", "MODEL", "F_total = F_device + m · g_env (brief §2). Static: the inertial term is not included."),
    detail("Loading cycles", reps, "cycles", "MANUAL", "One per rep, both legs together."),
  ];

  const peakLoad = quantity(totalN, "N", "MODEL", "Total force F_device + m · g_env (brief §2). Static: the inertial term of the movement is not included, so a fast rep loads more than this.");
  const energy = quantity(reps * totalN * p.strokeM, "J", "MODEL", "Reps × total force × stroke: concentric work only, force taken as constant over the stroke (brief §2).");
  return { id: "squats", title: "Resistive squats", energy, peakLoad, bout: { cycles: reps, peakLoad: totalN }, details };
}

// ---------------------------------------------------------------------------
// Cycle ergometer
// ---------------------------------------------------------------------------

export function cycleErgometer(person: Person, _env: Env, p: CycleParams = CYCLE_DEFAULTS): SessionResult {
  validatePerson(person);
  requirePositiveFinite("durationS", p.durationS);
  requirePositiveFinite("displayedPowerW", p.displayedPowerW);

  const workJ = ergometerWorkJ([
    { tS: 0, displayedPowerW: p.displayedPowerW },
    { tS: p.durationS, displayedPowerW: p.displayedPowerW },
  ]);
  const met = metabolicRange(workJ);

  const details: Detail[] = [
    detail("Duration", p.durationS, "s", "MANUAL", "Entered."),
    detail("Displayed power", p.displayedPowerW, "W", "MANUAL", "As shown on the ergometer's display."),
    detail("Metabolic cost, lower bound", met.lowJ, "J", "ESTIMATE", `Work ÷ 0.25. ${met.basis}. A range, never a single figure.`),
    detail("Metabolic cost, upper bound", met.highJ, "J", "ESTIMATE", `Work ÷ 0.20. ${met.basis}. A range, never a single figure.`),
  ];

  return {
    id: "cycle",
    title: "Cycle ergometer",
    energy: quantity(workJ, "J", "MODEL", "Displayed power corrected with the CEVIS dynamometer relation, P = 0.98 · displayed − 11.8 W (NASA/TP-2007-214760), integrated over the session. Same in every environment."),
    peakLoad: quantity(null, "N", "MODEL", "No skeletal load term in this model: pedalling puts no meaningful peak force through the legs' bones."),
    bout: null,
    details,
  };
}

// ---------------------------------------------------------------------------
// Camera set
// ---------------------------------------------------------------------------

export interface CameraSetInput {
  id: string;
  title: string;
  reps: number;
  totalPositiveWorkJ: number;
  maxPeakForceN: number;
  /** Shown on expand: scale, mass, environment, confidence, per-set flags. Built by the capture flow. */
  details: Detail[];
}

/**
 * A set measured from a camera or a video file. The energy and the peak load are MEASURED, with the capture
 * package's caveats in the notes. The set is a record of a real lift in the environment it was recorded in,
 * so it is the same in every environment of the selector: it is not re-scaled.
 */
export function cameraSession(set: CameraSetInput): SessionResult {
  return {
    id: set.id,
    title: set.title,
    energy: quantity(
      set.totalPositiveWorkJ,
      "J",
      "MEASURED",
      "Positive work of the tracked wrist over the detected reps, from a camera or video file. Scale is the largest error. Not validated on real video.",
    ),
    peakLoad: quantity(
      set.maxPeakForceN,
      "N",
      "MEASURED",
      "Largest peak force over the reps, from second differences of the filtered wrist position. The noisiest output: indicative only. Not validated on real video.",
    ),
    bout: set.reps > 0 ? { cycles: set.reps, peakLoad: set.maxPeakForceN } : null,
    details: set.details,
  };
}
