/**
 * A day of sessions in one environment: total energy, the daily load stimulus, the same day on
 * Earth, their ratio, and the mission deficit. Pure. Every number comes back as a Quantity with a
 * tag and a note; a number that cannot be computed honestly is null with the reason.
 *
 * Load accounting, not a measurement or prediction of bone.
 */

import { LOAD_STIMULUS_EXPONENT, cumulativeDeficit, cyclesToMatch, dailyLoadStimulus, type LoadBout } from "@ground-truth/physics";
import {
  CYCLE_DEFAULTS,
  EARTH_ENV,
  SQUAT_DEFAULTS,
  TREADMILL_DEFAULTS,
  cycleErgometer,
  quantity,
  resistiveSquats,
  treadmillRun,
  validatePerson,
  weakestTag,
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
}

const STIMULUS_UNIT = "N·cycles^(1/4)";
const NO_LOAD_TERM = "No skeletal load term in this day's sessions (a cycle ergometer has none in this model, and a session that cannot be done here has none either).";

function bouts(sessions: readonly SessionResult[]): LoadBout[] {
  return sessions.flatMap((s) => (s.bout ? [s.bout] : []));
}

function stimulusOf(sessions: readonly SessionResult[], where: string): Quantity {
  const contributing = sessions.filter((s) => s.bout !== null);
  const tag = weakestTag(contributing.map((s) => s.peakLoad.tag));
  if (contributing.length === 0) return quantity(0, STIMULUS_UNIT, tag, `${NO_LOAD_TERM} So the stimulus is 0 ${where}.`);
  return quantity(
    dailyLoadStimulus(bouts(sessions)),
    STIMULUS_UNIT,
    tag,
    `S = (Σ n · σ^${LOAD_STIMULUS_EXPONENT})^(1/${LOAD_STIMULUS_EXPONENT}) over the day's bouts ${where} (Carter, Whalen and Beaupré; brief §2). Load accounting, not a measurement or prediction of bone. Tag: the least certain of the peak loads that enter it.`,
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
    totalEnergy = quantity(0, "J", "MODEL", "No sessions in this day.");
  } else if (energies.length === 0) {
    totalEnergy = quantity(null, "J", "MODEL", "None of the sessions in this day can be computed in this environment.");
  } else {
    const skipped = sessions.length - energies.length;
    totalEnergy = quantity(
      energies.reduce((sum, e) => sum + (e.value as number), 0),
      "J",
      weakestTag(energies.map((e) => e.tag)),
      `Mechanical work summed over the sessions${skipped > 0 ? ` that can be computed here (${skipped} cannot)` : ""}. Tag: the least certain of the energies summed. Mechanical work, not metabolic energy.`,
    );
  }

  // Stimulus here and on Earth.
  const stimulus = stimulusOf(sessions, `in this environment`);
  const earthStimulus = stimulusOf(earthSessions, "on Earth");
  const ratioTag = weakestTag([stimulus.tag, earthStimulus.tag]);

  // Ratio.
  let stimulusRatio: Quantity;
  if (earthStimulus.value === 0 || earthStimulus.value === null || stimulus.value === null) {
    stimulusRatio = quantity(null, "× Earth", ratioTag, `${NO_LOAD_TERM} The same day on Earth has none either, so there is nothing to compare.`);
  } else {
    stimulusRatio = quantity(
      stimulus.value / earthStimulus.value,
      "× Earth",
      ratioTag,
      "Daily load stimulus as a fraction of the same day of sessions on Earth, same person. Tag: the least certain of the two stimuli. Load accounting, not a measurement or prediction of bone.",
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
    cycles = quantity(null, "× cycles", ratioTag, `${NO_LOAD_TERM} There is no peak load to compare.`);
  } else {
    const here = (sessions[dominant] as SessionResult).bout;
    const there = (earthSessions[dominant] as SessionResult).bout as LoadBout;
    const peakRatio = (here?.peakLoad ?? 0) / there.peakLoad;
    const basis = `the ${(sessions[dominant] as SessionResult).title.toLowerCase()}, the bout that contributes most to the day on Earth`;
    if (peakRatio <= 0) {
      cycles = quantity(null, "× cycles", weakestTag([ratioTag, "MODEL"]), `Peak load is 0 for ${basis}, so no number of extra cycles makes it up.`);
    } else if (peakRatio >= 1) {
      cycles = quantity(null, "× cycles", weakestTag([ratioTag, "MODEL"]), `Peak load for ${basis} is not below its Earth value, so no extra cycles are needed.`);
    } else {
      cycles = quantity(
        cyclesToMatch(peakRatio),
        "× cycles",
        weakestTag([ratioTag, "MODEL"]),
        `How many times the loading cycles are needed at this peak load to match the Earth stimulus: (peak ratio)^−${LOAD_STIMULUS_EXPONENT}, for ${basis}. Assumes the stress at the bone scales with the force, which is this package's assumption.`,
      );
    }
  }

  return { sessions, totalEnergy, stimulus, earthStimulus, stimulusRatio, cyclesToMatch: cycles };
}

/**
 * (earthStimulus − stimulus) × days, in stimulus-days: the day repeated unchanged every day. Null when the
 * day has no baseline load term (nothing to fall below).
 */
export function deficitOverMission(day: DayResult, days: number): Quantity {
  if (!Number.isFinite(days) || days <= 0) throw new RangeError(`days must be a finite number > 0, got ${days}`);
  const unit = "stimulus-days below the Earth baseline";
  const tag = weakestTag([day.stimulus.tag, day.earthStimulus.tag]);
  if (day.earthStimulus.value === null || day.earthStimulus.value === 0 || day.stimulus.value === null) {
    return quantity(null, unit, tag, `${NO_LOAD_TERM} There is no Earth baseline to fall below.`);
  }
  const deficit = cumulativeDeficit(
    [
      { day: 0, achieved: day.stimulus.value },
      { day: days, achieved: day.stimulus.value },
    ],
    day.earthStimulus.value,
  );
  return quantity(
    deficit,
    unit,
    tag,
    `(Earth stimulus − stimulus) × ${days} days: this day repeated unchanged every day, with no adaptation or recovery modelled. Load accounting, not a prediction of bone. Per-compartment (trabecular, cortical) behaviour is not modelled.`,
  );
}
