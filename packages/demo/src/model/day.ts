/**
 * A day of sessions in one environment: total energy, the daily load stimulus, the same day on
 * Earth, their ratio, and the mission deficit. Pure. Every number comes back as a Quantity with a
 * tag and a note; a number that cannot be computed honestly is null with the reason.
 *
 * Load accounting, not a measurement or prediction of bone.
 */

import { LOAD_STIMULUS_EXPONENT, cumulativeDeficit, cyclesToMatch, dailyLoadStimulus, type Body, type LoadBout } from "@ground-truth/physics";
import {
  CYCLE_DEFAULTS,
  EARTH_ENV,
  SQUAT_DEFAULTS,
  TREADMILL_DEFAULTS,
  cycleErgometer,
  derive,
  resistiveSquats,
  treadmillRun,
  validatePerson,
  type CycleParams,
  type Env,
  type Person,
  type Quantity,
  type SessionResult,
  type SquatParams,
  type TreadmillParams,
} from "./scenarios";

/** What the day is made of. A camera set is a finished record of a real lift: it does not change with the environment. */
export type SessionSpec =
  | { kind: "treadmill"; params?: Partial<TreadmillParams> }
  | { kind: "squats"; params?: Partial<SquatParams> }
  | { kind: "cycle"; params?: Partial<CycleParams> }
  | { kind: "camera"; session: SessionResult };

export function runSession(spec: SessionSpec, person: Person, env: Env): SessionResult {
  switch (spec.kind) {
    case "treadmill":
      return treadmillRun(person, env, { ...TREADMILL_DEFAULTS, ...spec.params });
    case "squats":
      return resistiveSquats(person, env, { ...SQUAT_DEFAULTS, ...spec.params });
    case "cycle":
      return cycleErgometer(person, env, { ...CYCLE_DEFAULTS, ...spec.params });
    case "camera":
      return spec.session;
  }
}

export interface DayResult {
  sessions: SessionResult[];
  totalEnergy: Quantity; // sum of non-null energies
  stimulus: Quantity; // dailyLoadStimulus of all bouts
  earthStimulus: Quantity; // same person, same sessions, body EARTH
  stimulusRatio: Quantity; // stimulus / earthStimulus
  cyclesToMatch: Quantity; // cyclesToMatch(peak ratio of the dominant bout), null when the ratio is 0 or >= 1
  /** The session whose bout `cyclesToMatch` refers to (lower case, e.g. "treadmill run"), or null when there is none. */
  cyclesToMatchBout: string | null;
}

/** What the Load number rests on, one line, shown under it. */
export const LOAD_RESTS_ON =
  "Rests on: exponent m = 4 (Carter, Whalen and Beaupré); stress at the bone proportional to force; the static squat peak, per leg; the 2.5 body-weight running multiple (an assumption); steps / 2 loading cycles per leg; the Genc 2010 decrement on the ISS.";

/** Shown with the Moon or Mars selected, without opening anything. Null elsewhere. */
export function partialGravityCaveat(body: Body): string | null {
  return body === "MOON" || body === "MARS"
    ? "The ISS run uses a measured decrement (Genc 2010). No such measurement exists for the Moon or Mars, so their run peak is an assumption (2.5 × effective weight, no harness). Do not compare these rows with the ISS row."
    : null;
}

const STIMULUS_UNIT = "N·cycles^(1/4)";
const NO_LOAD_TERM = "No skeletal load term in this day's sessions (a cycle ergometer has none in this model, and a session that cannot be done here has none either).";

function bouts(sessions: readonly SessionResult[]): LoadBout[] {
  return sessions.flatMap((s) => (s.bout ? [s.bout] : []));
}

function stimulusOf(sessions: readonly SessionResult[], where: string): Quantity {
  const inputs = sessions.flatMap((s) => (s.bout ? s.boutInputs : []));
  if (inputs.length === 0) return derive(0, STIMULUS_UNIT, "MODEL", [], `${NO_LOAD_TERM} So the stimulus is 0 ${where}.`);
  return derive(
    dailyLoadStimulus(bouts(sessions)),
    STIMULUS_UNIT,
    "MODEL",
    inputs,
    `S = (Σ n · σ^${LOAD_STIMULUS_EXPONENT})^(1/${LOAD_STIMULUS_EXPONENT}) over the day's bouts ${where} (Carter, Whalen and Beaupré; brief §2). Load accounting, not a measurement or prediction of bone. Tag: the least certain of the peak loads and cycle counts that enter it.`,
  );
}

export function computeDay(person: Person, env: Env, specs: readonly SessionSpec[]): DayResult {
  validatePerson(person);
  const sessions = specs.map((spec) => runSession(spec, person, env));
  const earthSessions = specs.map((spec) => runSession(spec, person, EARTH_ENV));

  // Energy.
  const energies = sessions.flatMap((s) => (s.energy.value === null ? [] : [s.energy]));
  let totalEnergy: Quantity;
  if (sessions.length === 0) {
    totalEnergy = derive(0, "J", "MODEL", [], "No sessions in this day.");
  } else if (energies.length === 0) {
    totalEnergy = derive(null, "J", "MODEL", sessions.map((s) => s.energy), "None of the sessions in this day can be computed in this environment.");
  } else {
    const skipped = sessions.length - energies.length;
    totalEnergy = derive(
      energies.reduce((sum, e) => sum + (e.value as number), 0),
      "J",
      "EXACT",
      energies,
      `Summed over the sessions${skipped > 0 ? ` that can be computed here (${skipped} cannot)` : ""}. Tag: the least certain of the energies summed.`,
    );
  }

  // Stimulus here and on Earth.
  const stimulus = stimulusOf(sessions, "in this environment");
  const earthStimulus = stimulusOf(earthSessions, "on Earth");

  // Ratio.
  let stimulusRatio: Quantity;
  if (earthStimulus.value === 0 || earthStimulus.value === null || stimulus.value === null) {
    stimulusRatio = derive(null, "× Earth", "EXACT", [stimulus, earthStimulus], `${NO_LOAD_TERM} The same day on Earth has none either, so there is nothing to compare.`);
  } else {
    stimulusRatio = derive(
      stimulus.value / earthStimulus.value,
      "× Earth",
      "EXACT",
      [stimulus, earthStimulus],
      "Same person, same sessions, against the day on Earth. Tag: the least certain of the two stimuli.",
    );
  }

  // Cycles to match: for the bout that contributes most to the Earth stimulus, its peak here over its peak on Earth.
  let cycles: Quantity;
  let dominant = -1;
  let dominantWeight = 0;
  earthSessions.forEach((s, i) => {
    if (!s.bout) return;
    const weight = s.bout.cycles * s.bout.peakLoad ** LOAD_STIMULUS_EXPONENT;
    if (weight > dominantWeight) {
      dominantWeight = weight;
      dominant = i;
    }
  });
  if (dominant < 0) {
    cycles = derive(null, "× cycles", "EXACT", [stimulus, earthStimulus], `${NO_LOAD_TERM} There is no peak load to compare.`);
  } else {
    const hereSession = sessions[dominant] as SessionResult;
    const thereSession = earthSessions[dominant] as SessionResult;
    const here = hereSession.bout;
    const there = thereSession.bout as LoadBout;
    const peakRatio = (here?.peakLoad ?? 0) / there.peakLoad;
    const basis = `the ${hereSession.title.toLowerCase()} (the bout that contributes most to the day on Earth)`;
    const inputs = [hereSession.peakLoad, thereSession.peakLoad];
    if (peakRatio <= 0) {
      cycles = derive(null, "× cycles", "MODEL", inputs, `Peak load is 0 for ${basis}, so no number of extra cycles makes it up.`);
    } else if (peakRatio >= 1) {
      cycles = derive(null, "× cycles", "MODEL", inputs, `Peak load for ${basis} is not below its Earth value, so no extra cycles are needed.`);
    } else {
      cycles = derive(
        cyclesToMatch(peakRatio),
        "× cycles",
        "MODEL",
        inputs,
        `How many times the loading cycles are needed at this peak load to match the Earth stimulus: (peak ratio)^−${LOAD_STIMULUS_EXPONENT}, for ${basis}. Assumes the stress at the bone scales with the force, which is this package's assumption.`,
      );
    }
  }

  const cyclesToMatchBout = dominant < 0 ? null : (sessions[dominant] as SessionResult).title.toLowerCase();
  return { sessions, totalEnergy, stimulus, earthStimulus, stimulusRatio, cyclesToMatch: cycles, cyclesToMatchBout };
}

/**
 * (earthStimulus − stimulus) × days, in stimulus-days: the day repeated unchanged every day. Null when the
 * day has no baseline load term (nothing to fall below).
 */
export function deficitOverMission(day: DayResult, days: number): Quantity {
  if (!Number.isFinite(days) || days <= 0) throw new RangeError(`days must be a finite number > 0, got ${days}`);
  const unit = "stimulus-days below the Earth baseline";
  const inputs = [day.stimulus, day.earthStimulus];
  if (day.earthStimulus.value === null || day.earthStimulus.value === 0 || day.stimulus.value === null) {
    return derive(null, unit, "EXACT", inputs, `${NO_LOAD_TERM} There is no Earth baseline to fall below.`);
  }
  const deficit = cumulativeDeficit(
    [
      { day: 0, achieved: day.stimulus.value },
      { day: days, achieved: day.stimulus.value },
    ],
    day.earthStimulus.value,
  );
  return derive(
    deficit,
    unit,
    "EXACT",
    inputs,
    `(Earth stimulus − stimulus) × ${days} days: this day repeated unchanged every day, with no adaptation or recovery modelled. Load accounting, not a prediction of bone. Per-compartment (trabecular, cortical) behaviour is not modelled.`,
  );
}

/**
 * The deficit as Earth-days of loading missing: (1 − ratio) × days, so "134.8 of 180 Earth-days of loading missing".
 * It does not scale with body mass, unlike stimulus-days. Never negative: a surplus is not reported as negative days.
 * Null when the day has no load term to compare.
 */
export function missingEarthDays(day: DayResult, days: number): Quantity {
  if (!Number.isFinite(days) || days <= 0) throw new RangeError(`days must be a finite number > 0, got ${days}`);
  const unit = "Earth-days of loading missing";
  const ratio = day.stimulusRatio;
  if (ratio.value === null) return derive(null, unit, "EXACT", [ratio], ratio.note);
  return derive(
    Math.max(0, (1 - ratio.value) * days),
    unit,
    "EXACT",
    [ratio],
    `(1 − load ratio) × ${days} days: the part of ${days} days of Earth-equivalent loading that this day repeated every day does not supply. The same information as the stimulus-days, without the body-mass scale. Load accounting, not a prediction of bone.`,
  );
}
