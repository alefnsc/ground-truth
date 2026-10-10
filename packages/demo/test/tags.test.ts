import { describe, expect, it } from "vitest";
import { VALIDATED_ON_REAL_VIDEO } from "@ground-truth/capture";
import { computeDay, deficitOverMission, type SessionSpec } from "../src/model/day";
import {
  ENVS,
  cameraPipelineTag,
  cameraSession,
  cycleErgometer,
  derive,
  peakInBodyWeights,
  resistiveSquats,
  source,
  treadmillRun,
  type Person,
  type Quantity,
  type Tag,
} from "../src/model/scenarios";

/*
 * A number is no more certain than its least certain input. Strongest to weakest:
 * MEASURED, MANUAL, MODEL, CALIBRATED, ESTIMATE, ASSUMPTION.
 */
const person: Person = { massKg: 78.4, legLengthM: 0.9 };
const tagOf = (label: string, details: readonly { label: string; tag: Tag }[]): Tag | undefined => details.find((d) => d.label === label)?.tag;
const manual = (v: number): Quantity => source(v, "x", "MANUAL", "entered");
const model = (v: number): Quantity => derive(v, "x", "MODEL", [manual(1)], "a formula");
const assumed = (v: number): Quantity => source(v, "x", "ASSUMPTION", "chosen");

describe("derive", () => {
  it("the tag is the weakest of the formula and the inputs", () => {
    expect(derive(1, "x", "MODEL", [manual(1)], "n").tag).toBe("MODEL");
    expect(derive(1, "x", "MODEL", [manual(1), assumed(1)], "n").tag).toBe("ASSUMPTION");
    expect(derive(1, "x", "ESTIMATE", [manual(1), model(1)], "n").tag).toBe("ESTIMATE");
    expect(derive(1, "x", "EXACT", [manual(1), model(1)], "n").tag).toBe("MODEL");
    expect(derive(1, "x", "MEASURED", [manual(1)], "n").tag).toBe("MANUAL");
    expect(derive(1, "x", "CALIBRATED", [model(1)], "n").tag).toBe("CALIBRATED");
  });
  it("a formula with its own tag needs no inputs; an exact one needs some", () => {
    expect(derive(1, "x", "MODEL", [], "n").tag).toBe("MODEL");
    expect(() => derive(1, "x", "EXACT", [], "n")).toThrow(RangeError);
  });
  it("a value that cannot be computed keeps the weakest tag and its reason", () => {
    const q = derive(null, "x", "MODEL", [assumed(1)], "because");
    expect(q).toEqual({ value: null, unit: "x", tag: "ASSUMPTION", note: "because" });
  });
  it("rejects an empty note", () => {
    expect(() => derive(1, "x", "MODEL", [], " ")).toThrow(RangeError);
  });
});

describe("preset tags", () => {
  it("treadmill energy rests on the assumed cadence and rise: ASSUMPTION, in every environment where it exists", () => {
    for (const env of [ENVS.EARTH, ENVS.MOON, ENVS.MARS, ENVS.ISS]) expect(treadmillRun(person, env).energy.tag).toBe("ASSUMPTION");
  });

  it("treadmill peak: ISS rests on the assumed 2.5 multiple, so ASSUMPTION; so does its multiple of body weight", () => {
    const iss = treadmillRun(person, ENVS.ISS);
    expect(iss.peakLoad.tag).toBe("ASSUMPTION");
    expect(peakInBodyWeights(iss, person).tag).toBe("ASSUMPTION");
    expect(treadmillRun(person, ENVS.MOON).peakLoad.tag).toBe("ASSUMPTION");
  });

  it("every parameter and intermediate of the treadmill carries its own tag", () => {
    const d = treadmillRun(person, ENVS.ISS).details;
    expect(tagOf("Duration", d)).toBe("MANUAL");
    expect(tagOf("Cadence", d)).toBe("ASSUMPTION");
    expect(tagOf("Steps", d)).toBe("ASSUMPTION");
    expect(tagOf("Vertical travel of the centre of mass per step", d)).toBe("ASSUMPTION");
    expect(tagOf("Earth peak force", d)).toBe("ASSUMPTION");
    expect(tagOf("Harness load", d)).toBe("MANUAL");
    expect(tagOf("Effective force", d)).toBe("MODEL");
    expect(tagOf("Loading cycles, one leg", d)).toBe("ASSUMPTION");
    expect(tagOf("Walk-run transition speed", d)).toBe("MODEL");
  });

  it("squat energy moves the whole body mass through the stroke, an assumption: ASSUMPTION. The static peak force is MODEL", () => {
    const s = resistiveSquats(person, ENVS.EARTH);
    expect(s.energy.tag).toBe("ASSUMPTION");
    expect(s.peakLoad.tag).toBe("MODEL");
    expect(resistiveSquats(person, ENVS.ISS).energy.tag).toBe("ASSUMPTION");
  });

  it("every parameter and intermediate of the squats carries its own tag", () => {
    const d = resistiveSquats(person, ENVS.MOON).details;
    expect(tagOf("Device force set", d)).toBe("MANUAL");
    expect(tagOf("Sets × reps", d)).toBe("MANUAL");
    expect(tagOf("Stroke", d)).toBe("MANUAL");
    expect(tagOf("Device force applied", d)).toBe("MANUAL");
    expect(tagOf("Body weight in this environment", d)).toBe("MODEL");
    expect(tagOf("Total force", d)).toBe("MODEL");
    const replaced = resistiveSquats(person, ENVS.MOON, { deviceForceN: 1000, sets: 3, repsPerSet: 12, strokeM: 0.5, replaceBodyWeight: true });
    expect(tagOf("Device force applied", replaced.details)).toBe("MODEL");
  });

  it("the ergometer's energy is MODEL (CEVIS) and its metabolic range ESTIMATE", () => {
    const c = cycleErgometer(person, ENVS.ISS);
    expect(c.energy.tag).toBe("MODEL");
    expect(tagOf("Metabolic cost, lower bound", c.details)).toBe("ESTIMATE");
    expect(tagOf("Duration", c.details)).toBe("MANUAL");
  });

  it("a session that cannot be done keeps a tag from its inputs, not a stronger one", () => {
    const t = treadmillRun(person, ENVS.TRANSIT);
    expect(t.energy.value).toBeNull();
    expect(["MODEL", "ASSUMPTION"]).toContain(t.energy.tag);
  });
});

describe("camera tags", () => {
  const scale = source(0.75, "m per frame height", "ESTIMATE", "from a known length");
  const mass = source(10, "kg", "MANUAL", "entered");
  const set = { id: "c", title: "c", reps: 2, totalPositiveWorkJ: 98, maxPeakForceN: 127, inputs: [scale, mass], details: [] };

  it("the pipeline tag is read from the capture package's validation constant", () => {
    expect(cameraPipelineTag()).toBe(VALIDATED_ON_REAL_VIDEO ? "MEASURED" : "ESTIMATE");
  });

  it("energy and peak are no stronger than the pipeline and the scale", () => {
    const s = cameraSession(set);
    expect(s.energy.tag).toBe("ESTIMATE");
    expect(s.peakLoad.tag).toBe("ESTIMATE");
  });

  it("a set with no inputs still takes the pipeline's tag", () => {
    const s = cameraSession({ ...set, inputs: [] });
    expect(s.energy.tag).toBe(cameraPipelineTag());
  });
});

describe("day tags", () => {
  const treadmill: SessionSpec = { kind: "treadmill" };
  const squats: SessionSpec = { kind: "squats" };
  const cycle: SessionSpec = { kind: "cycle" };
  const camera = (): SessionSpec => ({ kind: "camera", session: cameraSession({ id: "c", title: "c", reps: 2, totalPositiveWorkJ: 98, maxPeakForceN: 127, inputs: [], details: [] }) });

  it("a day with the run: every figure rests on the assumed cadence and multiple, so ASSUMPTION", () => {
    for (const env of [ENVS.EARTH, ENVS.ISS]) {
      const day = computeDay(person, env, [treadmill, cycle]);
      expect(day.totalEnergy.tag).toBe("ASSUMPTION");
      expect(day.stimulus.tag).toBe("ASSUMPTION");
      expect(day.earthStimulus.tag).toBe("ASSUMPTION");
      expect(day.stimulusRatio.tag).toBe("ASSUMPTION");
      expect(day.cyclesToMatch.tag).toBe("ASSUMPTION");
      expect(deficitOverMission(day, 180).tag).toBe("ASSUMPTION");
    }
  });

  it("a day of squats only: the per-leg peak assumes an equal split (F6), so the stimulus figures are ASSUMPTION; cycles to match compares two-leg totals, so MODEL; the squat energy is ASSUMPTION", () => {
    const day = computeDay(person, ENVS.ISS, [squats]);
    expect(day.stimulus.tag).toBe("ASSUMPTION"); // F6: was MODEL
    expect(day.earthStimulus.tag).toBe("ASSUMPTION"); // F6: was MODEL
    expect(day.stimulusRatio.tag).toBe("ASSUMPTION"); // F6: was MODEL
    expect(day.cyclesToMatch.tag).toBe("MODEL");
    expect(deficitOverMission(day, 180).tag).toBe("ASSUMPTION"); // F6: was MODEL
    expect(day.totalEnergy.tag).toBe("ASSUMPTION");
  });

  it("a day of only cycling: energy MODEL, no stimulus to tag beyond MODEL", () => {
    const day = computeDay(person, ENVS.EARTH, [cycle]);
    expect(day.totalEnergy.tag).toBe("MODEL");
    expect(day.stimulus.tag).toBe("MODEL");
    expect(day.stimulusRatio.tag).toBe("MODEL");
  });

  it("totals without a camera set carry the tag of the model sessions; with one they are ESTIMATE", () => {
    expect(computeDay(person, ENVS.EARTH, [cycle]).totalEnergy.tag).toBe("MODEL");
    expect(computeDay(person, ENVS.EARTH, [cycle, camera()]).totalEnergy.tag).toBe("ESTIMATE");
    expect(computeDay(person, ENVS.EARTH, [camera()]).totalEnergy.tag).toBe("ESTIMATE");
    expect(computeDay(person, ENVS.EARTH, [camera()]).stimulus.tag).toBe("ESTIMATE");
  });
});
