/**
 * The table of numbers that docs/demo-script.md quotes, generated from the model and the same formatters the UI uses,
 * for the default day (78.4 kg, leg 0.9 m: treadmill run, resistive squats, cycle ergometer). The script embeds this text
 * between two markers and test/scriptNumbers.test.ts pins it: change a parameter or a formula and the test fails until
 * the script is regenerated.
 */

import { computeDay, missingEarthDays, type SessionSpec } from "./day";
import { DEFAULT_PERSON, ENVS, peakInBodyWeights, type Person } from "./scenarios";
import { DASH, formatEnergy, formatForce, formatMultiple, formatPercent, formatQuantity } from "../view/format";

const BODIES = [
  ["EARTH", "Earth"],
  ["MOON", "Moon"],
  ["MARS", "Mars"],
  ["ISS", "ISS"],
] as const;

const TREADMILL: SessionSpec = { kind: "treadmill" };
const SQUATS: SessionSpec = { kind: "squats" };
const CYCLE: SessionSpec = { kind: "cycle" };
const DEFAULT_DAY: SessionSpec[] = [TREADMILL, SQUATS, CYCLE];

const row = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;
const table = (header: readonly string[], rows: readonly (readonly string[])[]): string[] => [row(header), row(header.map(() => "---")), ...rows.map(row)];

/** The change from `from` to `to` as a signed percentage ("−15.2%"), or a dash when it cannot be computed. */
function change(from: number | null, to: number | null): string {
  if (from === null || to === null || from === 0) return DASH;
  const ratio = (to - from) / from;
  return `${ratio < 0 ? "−" : ""}${formatPercent(Math.abs(ratio))}`;
}

function earthDays(day: ReturnType<typeof computeDay>, days: number): string {
  const q = missingEarthDays(day, days);
  return q.value === null ? DASH : `${formatQuantity({ ...q, unit: "" })} of ${days}`;
}

export function renderScriptNumbers(person: Person = DEFAULT_PERSON): string {
  const out: string[] = [];

  out.push(`**The default day** (${person.massKg} kg, leg ${person.legLengthM} m: treadmill run, resistive squats, cycle ergometer)`, "");
  out.push(
    ...table(
      ["Environment", "Day energy", "Load, % of the same day on Earth", "Cycles to match (run)", "Earth-days of loading missing, of 180", "Earth-days of loading missing, of 1095"],
      BODIES.map(([body, label]) => {
        const day = computeDay(person, ENVS[body], DEFAULT_DAY);
        return [label, formatEnergy(day.totalEnergy.value), formatPercent(day.stimulusRatio.value), formatMultiple(day.cyclesToMatch.value), earthDays(day, 180), earthDays(day, 1095)];
      }),
    ),
    "",
  );

  out.push("**Each session**", "");
  const sessionRows: string[][] = [];
  for (const [spec, title] of [[TREADMILL, "Treadmill run"], [SQUATS, "Resistive squats"], [CYCLE, "Cycle ergometer"]] as const) {
    for (const [body, label] of BODIES) {
      const day = computeDay(person, ENVS[body], [spec]);
      const s = day.sessions[0];
      if (!s) continue;
      sessionRows.push([title, label, formatEnergy(s.energy.value), formatForce(s.peakLoad.value), formatMultiple(peakInBodyWeights(s, person).value)]);
    }
  }
  out.push(...table(["Session", "Environment", "Energy", "Peak load", "Peak load in Earth body weights"], sessionRows), "");

  out.push("**One session at a time, Earth against the ISS**", "");
  const single: [string, SessionSpec][] = [["Run only", TREADMILL], ["Squats only", SQUATS], ["Cycle only", CYCLE]];
  out.push(
    ...table(
      ["Day", "Earth energy", "ISS energy", "Energy change", "Earth load", "ISS load"],
      single.map(([name, spec]) => {
        const earth = computeDay(person, ENVS.EARTH, [spec]);
        const iss = computeDay(person, ENVS.ISS, [spec]);
        return [name, formatEnergy(earth.totalEnergy.value), formatEnergy(iss.totalEnergy.value), change(earth.totalEnergy.value, iss.totalEnergy.value), formatPercent(earth.stimulusRatio.value), formatPercent(iss.stimulusRatio.value)];
      }),
    ),
  );

  // The default day's energy change on the ISS, the number beat 2 turns on.
  const earthDay = computeDay(person, ENVS.EARTH, DEFAULT_DAY);
  const issDay = computeDay(person, ENVS.ISS, DEFAULT_DAY);
  out.push("", `**The default day, Earth to ISS:** energy change ${change(earthDay.totalEnergy.value, issDay.totalEnergy.value)}, load ${formatPercent(issDay.stimulusRatio.value)} of the Earth day.`);

  return out.join("\n");
}
