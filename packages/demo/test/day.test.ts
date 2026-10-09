import { describe, expect, it } from "vitest";
import { computeDay, deficitOverMission, type DayResult, type SessionSpec } from "../src/model/day";
import { ENVS, cameraSession, type Person, type Quantity, type Tag } from "../src/model/scenarios";

/*
 * Person: 78.4 kg. W = 78.4 × 9.81 = 769.104 N. Defaults: treadmill 5100 steps (2550 loading cycles of one leg),
 * squats 36 reps, cycle 365 040 J.
 *
 * The daily stimulus is S = (Σ n σ⁴)^(1/4), so a bout of n cycles at peak σ gives S = n^(1/4) σ, and scaling
 * every peak by r scales S by exactly r.
 */
const person: Person = { massKg: 78.4, legLengthM: 0.9 };
const TAGS: readonly Tag[] = ["MEASURED", "MANUAL", "MODEL", "ASSUMPTION", "CALIBRATED", "ESTIMATE"];

const treadmill: SessionSpec = { kind: "treadmill" };
const squats: SessionSpec = { kind: "squats" };
const cycle: SessionSpec = { kind: "cycle" };

describe("a day on Earth", () => {
  it("is its own baseline: ratio 1, nothing to match, no deficit", () => {
    const day = computeDay(person, ENVS.EARTH, [treadmill, squats, cycle]);
    expect(day.stimulusRatio.value).toBe(1);
    expect(day.cyclesToMatch.value).toBeNull();
    expect(day.cyclesToMatch.note.length).toBeGreaterThan(10);
    expect(day.stimulus.value).toBe(day.earthStimulus.value);
    expect(deficitOverMission(day, 180).value).toBe(0);
  });

  /*
   * Energy: 313 794.432 (treadmill) + 31 843.872 (squats) + 365 040 (cycle) = 710 678.304 J.
   */
  it("sums the energy of its sessions", () => {
    const day = computeDay(person, ENVS.EARTH, [treadmill, squats, cycle]);
    expect(day.totalEnergy.value).toBeCloseTo(710678.304, 6);
    expect(day.totalEnergy.tag).toBe("MODEL");
  });
});

describe("a day on the ISS", () => {
  /*
   * Treadmill only. Earth: σ = 2.5 W = 1922.76 N. ISS: σ = 0.25 × 2.5 W = 480.69 N. Same n = 2550.
   * S_iss / S_earth = 480.69 / 1922.76 = 0.25 exactly; cyclesToMatch(0.25) = 0.25^−4 = 256.
   */
  it("treadmill only: a quarter of the Earth stimulus, and 256 times the cycles to match", () => {
    const day = computeDay(person, ENVS.ISS, [treadmill]);
    expect(day.stimulusRatio.value).toBeCloseTo(0.25, 12);
    expect(day.cyclesToMatch.value).toBeCloseTo(256, 9);
    expect(day.stimulus.value as number).toBeLessThan(day.earthStimulus.value as number);
    // S_earth = 2550^(1/4) × 1922.76 = 7.10616 × 1922.76 = 13 663.44 (hand arithmetic: 2550^(1/2) = 50.498, its root 7.1062).
    expect(day.earthStimulus.value).toBeCloseTo(13663.44, 0);
    expect(day.stimulus.value).toBeCloseTo(0.25 * 13663.44, 0);
  });

  /*
   * Squats only. Earth σ = 1769.104, ISS σ = 1000, same n = 36: the ratio is 1000 / 1769.104 = 0.56526.
   * cyclesToMatch = (1769.104 / 1000)^4 = 1.769104^4: 1.769104² = 3.12973; 3.12973² = 9.7952.
   */
  it("squats only: the ratio is the ratio of the peaks", () => {
    const day = computeDay(person, ENVS.ISS, [squats]);
    expect(day.stimulusRatio.value).toBeCloseTo(1000 / 1769.104, 12);
    expect(day.stimulusRatio.value).toBeCloseTo(0.56526, 5);
    expect(day.cyclesToMatch.value).toBeCloseTo(9.7952, 3);
  });

  /*
   * All three sessions. n_t = 2550, n_s = 36.
   *   ISS:   Σ n σ⁴ = 2550 × 480.69⁴ + 36 × 1000⁴;  480.69² = 231 062.88, ² = 5.33901e10; × 2550 = 1.36145e14;
   *          36 × 10¹² = 3.6e13; sum 1.72145e14; ^(1/4): √ = 1.31204e7, √ = 3622.2 N·cycles^¼.
   *   Earth: 2550 × 1922.76⁴ + 36 × 1769.104⁴;  1922.76² = 3 697 006, ² = 1.36679e13; × 2550 = 3.48530e16;
   *          1769.104² = 3 129 729, ² = 9.79520e12; × 36 = 3.52627e14; sum 3.52057e16; ^(1/4): √ = 1.87632e8, √ = 13 697.9.
   *   Ratio = 3622.2 / 13 697.9 = 0.26444.
   * The dominant bout on Earth is the run (3.485e16 against 3.5e14); its own peak ratio is 0.25, so 256 cycles.
   */
  it("a mixed day: the stimulus is a sum under the fourth power, and the run dominates it", () => {
    const day = computeDay(person, ENVS.ISS, [treadmill, squats, cycle]);
    expect(day.stimulus.value).toBeCloseTo(3622.2, 0);
    expect(day.earthStimulus.value).toBeCloseTo(13697.9, 0);
    expect(day.stimulusRatio.value).toBeCloseTo(0.26444, 4);
    expect(day.cyclesToMatch.value).toBeCloseTo(256, 9);
    expect(day.stimulus.value as number).toBeLessThan(day.earthStimulus.value as number);
  });

  it("energy 'barely moves'? The model says: see the numbers (a mixed day loses the weight-dependent energy)", () => {
    // Earth 710 678.304 J. ISS: 219 656.1024 (treadmill) + 18 000 (squats) + 365 040 (cycle) = 602 696.1024 J,
    // 15.2 % lower than Earth. Not "barely": recorded here so nobody bends the parameters to match the script.
    const iss = computeDay(person, ENVS.ISS, [treadmill, squats, cycle]);
    expect(iss.totalEnergy.value).toBeCloseTo(602696.1024, 4);
    const earth = computeDay(person, ENVS.EARTH, [treadmill, squats, cycle]);
    expect(1 - (iss.totalEnergy.value as number) / (earth.totalEnergy.value as number)).toBeCloseTo(0.1519, 3);
  });
});

describe("a day of only cycling", () => {
  it("has zero stimulus, and the ratio says why it has no value", () => {
    for (const env of [ENVS.EARTH, ENVS.ISS]) {
      const day = computeDay(person, env, [cycle]);
      expect(day.stimulus.value).toBe(0);
      expect(day.earthStimulus.value).toBe(0);
      expect(day.stimulusRatio.value).toBeNull();
      expect(day.stimulusRatio.note).toMatch(/no skeletal load term/i);
      expect(day.cyclesToMatch.value).toBeNull();
      expect(day.totalEnergy.value).toBeCloseTo(365040, 6);
      expect(deficitOverMission(day, 180).value).toBeNull();
    }
  });
});

describe("transit", () => {
  it("a run is impossible: no load, no energy for it, and no number of cycles makes it up", () => {
    const day = computeDay(person, ENVS.TRANSIT, [treadmill]);
    expect(day.sessions[0]?.energy.value).toBeNull();
    expect(day.totalEnergy.value).toBeNull();
    expect(day.stimulus.value).toBe(0);
    expect(day.stimulusRatio.value).toBe(0);
    expect(day.cyclesToMatch.value).toBeNull();
  });
});

describe("deficit over a mission", () => {
  /*
   * (S_earth − S_achieved) × days = (13 663.44 − 0.25 × 13 663.44) × 180 = 0.75 × 13 663.44 × 180 = 1 844 564.4.
   * Computed as the product, not read off the model.
   */
  it("is (earth − achieved) × days", () => {
    const day = computeDay(person, ENVS.ISS, [treadmill]);
    const d = deficitOverMission(day, 180);
    expect(d.value).toBeCloseTo(((day.earthStimulus.value as number) - (day.stimulus.value as number)) * 180, 6);
    expect(d.value).toBeCloseTo(0.75 * 13663.44 * 180, -1);
    expect(d.unit).toMatch(/days/);
  });

  it("is zero on Earth and grows linearly with the horizon", () => {
    expect(deficitOverMission(computeDay(person, ENVS.EARTH, [treadmill]), 1095).value).toBe(0);
    const iss = computeDay(person, ENVS.ISS, [treadmill]);
    expect((deficitOverMission(iss, 360).value as number) / (deficitOverMission(iss, 180).value as number)).toBeCloseTo(2, 12);
  });

  it("rejects a horizon that is not a positive number of days", () => {
    const day = computeDay(person, ENVS.ISS, [treadmill]);
    expect(() => deficitOverMission(day, 0)).toThrow(RangeError);
    expect(() => deficitOverMission(day, Number.NaN)).toThrow(RangeError);
  });
});

describe("a measured set in the day", () => {
  const measured = cameraSession({ id: "camera-1", title: "Camera set", reps: 3, totalPositiveWorkJ: 147.15, maxPeakForceN: 127, details: [] });

  it("is the same in every environment, so it carries no gap by itself", () => {
    const iss = computeDay(person, ENVS.ISS, [{ kind: "camera", session: measured }]);
    expect(iss.stimulusRatio.value).toBe(1);
    expect(iss.totalEnergy.value).toBeCloseTo(147.15, 9);
    expect(iss.totalEnergy.tag).toBe("MEASURED");
  });

  it("mixing a measured set with a model takes the weaker tag for the total", () => {
    const day = computeDay(person, ENVS.EARTH, [{ kind: "camera", session: measured }, cycle]);
    expect(day.totalEnergy.tag).toBe("MODEL");
    expect(day.totalEnergy.value).toBeCloseTo(365040 + 147.15, 6);
  });
});

describe("an empty day", () => {
  it("has zero energy, zero stimulus and no ratio", () => {
    const day = computeDay(person, ENVS.ISS, []);
    expect(day.totalEnergy.value).toBe(0);
    expect(day.stimulus.value).toBe(0);
    expect(day.stimulusRatio.value).toBeNull();
  });
});

describe("provenance on every number", () => {
  function dayQuantities(day: DayResult): Quantity[] {
    return [day.totalEnergy, day.stimulus, day.earthStimulus, day.stimulusRatio, day.cyclesToMatch, deficitOverMission(day, 180)];
  }

  it("every Quantity a day returns has a non-empty note and a tag from the union, in every environment", () => {
    const specs: SessionSpec[][] = [[], [treadmill], [squats], [cycle], [treadmill, squats, cycle]];
    for (const env of Object.values(ENVS)) {
      for (const list of specs) {
        const day = computeDay(person, env, list);
        for (const q of dayQuantities(day)) {
          expect(q.note.trim().length).toBeGreaterThan(0);
          expect(TAGS).toContain(q.tag);
          expect(q.value === null || Number.isFinite(q.value)).toBe(true);
        }
      }
    }
  });
});
