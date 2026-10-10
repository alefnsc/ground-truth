import { describe, expect, it } from "vitest";
import { LOAD_RESTS_ON, computeDay, deficitOverMission, missingEarthDays, partialGravityCaveat, type DayResult, type SessionSpec } from "../src/model/day";
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
    expect(day.totalEnergy.tag).toBe("ASSUMPTION"); // F2: was MODEL; the run and the squats rest on assumptions
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
   * All three sessions, F6 convention: both bouts are per leg. n_t = 2550 (one leg's strikes), n_s = 36 (one per rep).
   *   ISS:   run σ = 480.69, squat σ = 1000 / 2 = 500.
   *          2550 × 480.69⁴ = 2550 × 5.33901e10 = 1.36145e14;  36 × 500⁴ = 36 × 6.25e10 = 2.25e12;
   *          sum 1.38395e14; ^(1/4): √ = 1.17641e7, √ = 3429.9 N·cycles^¼.
   *   Earth: run σ = 1922.76, squat σ = 1769.104 / 2 = 884.552.
   *          2550 × 1922.76⁴ = 2550 × 1.36679e13 = 3.48530e16;  36 × 884.552⁴ = 36 × 6.12200e11 = 2.20392e13;
   *          sum 3.48750e16; ^(1/4): √ = 1.86748e8, √ = 13 665.6.
   *   Ratio = 3429.9 / 13 665.6 = 0.25099.
   * The run dominates the Earth stimulus (3.485e16 against 2.2e13), so cycles to match = (480.69 / 1922.76)^−4 = 256.
   */
  it("a mixed day: the stimulus is a sum under the fourth power, and the run dominates it", () => {
    const day = computeDay(person, ENVS.ISS, [treadmill, squats, cycle]);
    expect(day.stimulus.value).toBeCloseTo(3429.9, 0);
    expect(day.earthStimulus.value).toBeCloseTo(13665.6, 0);
    expect(day.stimulusRatio.value).toBeCloseTo(0.25099, 4);
    expect(day.cyclesToMatch.value).toBeCloseTo(256, 9);
    expect(day.stimulus.value as number).toBeLessThan(day.earthStimulus.value as number);
  });

  /*
   * The same day in all four environments (F6). Peaks: run Earth 2.5 W = 1922.76, Moon 2.5 × 127.008 = 317.52,
   * Mars 2.5 × 290.864 = 727.16, ISS 0.625 W = 480.69; squats per leg Earth 884.552, Moon 563.504, Mars 645.432, ISS 500.
   *   Moon: 2550 × 317.52⁴ = 2.59194e13, 36 × 563.504⁴ = 3.62987e12, sum 2.88493e13, ^(1/4) = 2331.5;  / 13 665.6 = 0.17061
   *   Mars: 2550 × 727.16⁴ = 7.12952e14, 36 × 645.432⁴ = 6.24747e12, sum 7.19199e14, ^(1/4) = 5178.6;  / 13 665.6 = 0.37895
   *   ISS:  3429.9 / 13 665.6 = 0.25099
   * Cycles to match, the run's peak ratio to the power −4: Moon (317.52 / 1922.76)^−4 = (0.165138)^−4 = 1344.67;
   * Mars (727.16 / 1922.76)^−4 = (0.378186)^−4 = 48.886; ISS 256.
   */
  it.each([
    ["MOON", 0.17061, 1344.67],
    ["MARS", 0.37895, 48.886],
    ["ISS", 0.25099, 256],
  ] as const)("the default day on %s: load %s of Earth, cycles to match %s", (body, ratio, cyclesTo) => {
    const day = computeDay(person, ENVS[body], [treadmill, squats, cycle]);
    expect(day.stimulusRatio.value).toBeCloseTo(ratio, 4);
    expect(day.cyclesToMatch.value).toBeCloseTo(cyclesTo, 1);
  });

  it("the default day on Earth is 100 %", () => {
    expect(computeDay(person, ENVS.EARTH, [treadmill, squats, cycle]).stimulusRatio.value).toBe(1);
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
  const measured = cameraSession({ id: "camera-1", title: "Camera set", reps: 3, totalPositiveWorkJ: 147.15, maxPeakForceN: 127, inputs: [], details: [] });

  it("is the same in every environment, so it carries no gap by itself", () => {
    const iss = computeDay(person, ENVS.ISS, [{ kind: "camera", session: measured }]);
    expect(iss.stimulusRatio.value).toBe(1);
    expect(iss.totalEnergy.value).toBeCloseTo(147.15, 9);
    expect(iss.totalEnergy.tag).toBe("ESTIMATE"); // F2: was MEASURED
  });

  it("mixing a camera set with a model takes the weaker tag for the total", () => {
    const day = computeDay(person, ENVS.EARTH, [{ kind: "camera", session: measured }, cycle]);
    expect(day.totalEnergy.tag).toBe("ESTIMATE"); // F2: was MODEL; the camera set is no better than ESTIMATE
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

describe("Earth-day equivalents (M3)", () => {
  // (1 − ratio) × days. The run alone on the ISS: (1 − 0.25) × 180 = 135. The default day: (1 − 0.25099) × 180 = 134.82.
  it("is (1 − ratio) × days", () => {
    expect(missingEarthDays(computeDay(person, ENVS.ISS, [treadmill]), 180).value).toBeCloseTo(135, 9);
    expect(missingEarthDays(computeDay(person, ENVS.ISS, [treadmill, squats, cycle]), 180).value).toBeCloseTo(134.82, 2);
    expect(missingEarthDays(computeDay(person, ENVS.ISS, [treadmill]), 1095).value).toBeCloseTo(0.75 * 1095, 9);
  });
  it("is zero on Earth, null with a reason when the day has no load term, and not negative", () => {
    expect(missingEarthDays(computeDay(person, ENVS.EARTH, [treadmill]), 180).value).toBe(0);
    const none = missingEarthDays(computeDay(person, ENVS.ISS, [cycle]), 180);
    expect(none.value).toBeNull();
    expect(none.note).toMatch(/no skeletal load term/i);
    const measured = cameraSession({ id: "c", title: "c", reps: 1, totalPositiveWorkJ: 1, maxPeakForceN: 1, inputs: [], details: [] });
    expect(missingEarthDays(computeDay(person, ENVS.ISS, [{ kind: "camera", session: measured }]), 180).value).toBe(0);
  });
  it("has the tag of the ratio it comes from", () => {
    const day = computeDay(person, ENVS.ISS, [treadmill]);
    expect(missingEarthDays(day, 180).tag).toBe(day.stimulusRatio.tag);
  });
  it("rejects a horizon that is not positive", () => {
    expect(() => missingEarthDays(computeDay(person, ENVS.ISS, [treadmill]), 0)).toThrow(RangeError);
  });
});

describe("what the cycles-to-match figure refers to (M4)", () => {
  it("names the dominant bout", () => {
    expect(computeDay(person, ENVS.ISS, [treadmill, squats]).cyclesToMatchBout).toBe("treadmill run");
    expect(computeDay(person, ENVS.ISS, [squats]).cyclesToMatchBout).toBe("resistive squats");
    expect(computeDay(person, ENVS.ISS, [cycle]).cyclesToMatchBout).toBeNull();
  });
});

describe("partial-gravity caveat and the assumptions the Load number rests on (F6)", () => {
  it("is shown for the Moon and Mars, with the wording the review asked for, and not for Earth or the ISS", () => {
    for (const body of ["MOON", "MARS"] as const) {
      expect(partialGravityCaveat(body)).toBe(
        "The ISS run uses a measured decrement (Genc 2010). No such measurement exists for the Moon or Mars, so their run peak is an assumption (2.5 × effective weight, no harness). Do not compare these rows with the ISS row.",
      );
    }
    expect(partialGravityCaveat("EARTH")).toBeNull();
    expect(partialGravityCaveat("ISS")).toBeNull();
  });

  it("the Load number lists what it rests on", () => {
    for (const piece of ["exponent m = 4", "proportional to force", "per leg", "2.5 body-weight", "steps / 2", "Genc"]) {
      expect(LOAD_RESTS_ON).toContain(piece);
    }
  });
});
