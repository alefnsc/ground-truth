import { describe, expect, it } from "vitest";
import {
  CYCLE_DEFAULTS,
  ENVS,
  SQUAT_DEFAULTS,
  TREADMILL_DEFAULTS,
  cameraSession,
  cycleErgometer,
  peakInBodyWeights,
  resistiveSquats,
  treadmillRun,
  weakestTag,
  type Person,
  type Quantity,
  type SessionResult,
  type Tag,
} from "../src/model/scenarios";

/*
 * Person: 78.4 kg, leg 0.9 m. Every expected value is derived by hand below from the physics formulas
 * (docs/strategy.md §2); none was read off the code.
 *
 *   W   = m · 9.81                = 78.4 × 9.81 = 769.104 N            (body weight on Earth)
 *   Moon: m · 1.62                = 127.008 N
 *   Mars: m · 3.71                = 290.864 N
 */
const person: Person = { massKg: 78.4, legLengthM: 0.9 };
const W_EARTH_N = 769.104;

const TAGS: readonly Tag[] = ["MEASURED", "MANUAL", "MODEL", "ASSUMPTION", "CALIBRATED", "ESTIMATE"];

function allQuantities(s: SessionResult): Quantity[] {
  return [s.energy, s.peakLoad, ...s.details];
}

describe("cycle ergometer", () => {
  /*
   * P_actual = 0.98 × 150 − 11.8 = 147 − 11.8 = 135.2 W (CEVIS correction).
   * Constant power over 2700 s: 135.2 × 2700 = 365 040 J.
   * Metabolic range: 365 040 / 0.25 = 1 460 160 J and 365 040 / 0.20 = 1 825 200 J.
   */
  it("has the same energy in every environment, and no load term", () => {
    for (const env of [ENVS.EARTH, ENVS.MOON, ENVS.MARS, ENVS.ISS, ENVS.TRANSIT]) {
      const s = cycleErgometer(person, env);
      expect(s.energy.value).toBeCloseTo(365040, 6);
      expect(s.peakLoad.value).toBeNull();
      expect(s.peakLoad.note).toMatch(/no skeletal load term in this model/i);
      expect(s.bout).toBeNull();
    }
  });

  it("gives the metabolic cost as a range tagged ESTIMATE, never one figure", () => {
    const s = cycleErgometer(person, ENVS.EARTH);
    const low = s.details.find((d) => d.label.includes("lower"));
    const high = s.details.find((d) => d.label.includes("upper"));
    expect(low?.value).toBeCloseTo(1460160, 6);
    expect(high?.value).toBeCloseTo(1825200, 6);
    expect(low?.tag).toBe("ESTIMATE");
    expect(high?.tag).toBe("ESTIMATE");
    expect(s.details.some((d) => d.unit.toLowerCase().includes("kcal"))).toBe(false);
  });

  it("follows its parameters", () => {
    // 100 W displayed for 600 s: (0.98 × 100 − 11.8) × 600 = 86.2 × 600 = 51 720 J.
    expect(cycleErgometer(person, ENVS.EARTH, { durationS: 600, displayedPowerW: 100 }).energy.value).toBeCloseTo(51720, 6);
    expect(CYCLE_DEFAULTS.durationS).toBe(2700);
  });
});

describe("resistive squats", () => {
  /*
   * 3 sets × 12 reps = 36 reps, stroke 0.5 m, device 1000 N.
   * F_total = F_device + m g_env.
   *   Earth: 1000 + 769.104 = 1769.104 N; energy = 36 × 1769.104 × 0.5 = 18 × 1769.104 = 31 843.872 J
   *   ISS:   1000 + 0       = 1000 N;     energy = 36 × 1000 × 0.5 = 18 000 J
   *   Moon:  1000 + 127.008 = 1127.008 N; energy = 18 × 1127.008 = 20 286.144 J
   */
  it("Earth: the body weight adds to the device force", () => {
    const s = resistiveSquats(person, ENVS.EARTH);
    expect(s.peakLoad.value).toBeCloseTo(1000 + W_EARTH_N, 9);
    expect(s.peakLoad.tag).toBe("MODEL");
    expect(s.energy.value).toBeCloseTo(31843.872, 6);
    expect(s.bout).toEqual({ cycles: 36, peakLoad: expect.closeTo(1769.104, 9) });
  });

  it("ISS: only the device loads, and the energy scales the same way", () => {
    const s = resistiveSquats(person, ENVS.ISS);
    expect(s.peakLoad.value).toBe(1000);
    expect(s.energy.value).toBeCloseTo(18000, 9);
    // Energy over peak load is reps × stroke = 18 m in both environments.
    const earth = resistiveSquats(person, ENVS.EARTH);
    expect((s.energy.value as number) / (s.peakLoad.value as number)).toBeCloseTo(18, 9);
    expect((earth.energy.value as number) / (earth.peakLoad.value as number)).toBeCloseTo(18, 9);
  });

  it("Moon: 1000 + 127.008", () => {
    const s = resistiveSquats(person, ENVS.MOON);
    expect(s.peakLoad.value).toBeCloseTo(1127.008, 9);
    expect(s.energy.value).toBeCloseTo(20286.144, 6);
  });

  /*
   * replaceBodyWeight on the ISS: target = 1000 + 78.4 × 9.81 = 1769.104 N;
   * F_device = target − m × 0 = 1769.104 N; F_total = 1769.104 + 0 = Earth's peak.
   * On the Moon: F_device = 1769.104 − 127.008 = 1642.096 and F_total = 1769.104 again.
   */
  it("replaceBodyWeight on the ISS reproduces the Earth peak, and on the Moon too", () => {
    const earthPeak = resistiveSquats(person, ENVS.EARTH).peakLoad.value as number;
    const iss = resistiveSquats(person, ENVS.ISS, { ...SQUAT_DEFAULTS, replaceBodyWeight: true });
    expect(iss.peakLoad.value).toBeCloseTo(earthPeak, 9);
    expect(iss.energy.value).toBeCloseTo(31843.872, 6);
    const moon = resistiveSquats(person, ENVS.MOON, { ...SQUAT_DEFAULTS, replaceBodyWeight: true });
    expect(moon.peakLoad.value).toBeCloseTo(1769.104, 9);
    const applied = moon.details.find((d) => d.label === "Device force applied");
    expect(applied?.value).toBeCloseTo(1642.096, 9);
  });

  it("on Earth replaceBodyWeight changes nothing", () => {
    const plain = resistiveSquats(person, ENVS.EARTH);
    const replaced = resistiveSquats(person, ENVS.EARTH, { ...SQUAT_DEFAULTS, replaceBodyWeight: true });
    expect(replaced.peakLoad.value).toBeCloseTo(plain.peakLoad.value as number, 9);
  });
});

describe("treadmill run", () => {
  /*
   * 1800 s at 170 steps/min: 30 min × 170 = 5100 steps. Loading cycles for one leg: 2550.
   * Earth: F_eff = m g = 769.104 N.
   *   energy = 5100 × 769.104 × 0.08 = 5100 × 61.52832 = 313 794.432 J
   *   peak   = 2.5 × 769.104 = 1922.76 N
   */
  it("Earth: F_eff = m g, energy = steps × F_eff × 0.08, peak = 2.5 × F_eff", () => {
    const s = treadmillRun(person, ENVS.EARTH);
    const fEff = s.details.find((d) => d.label === "Effective force");
    expect(fEff?.value).toBeCloseTo(769.104, 9);
    expect(s.energy.value).toBeCloseTo(313794.432, 6);
    expect(s.peakLoad.value).toBeCloseTo(1922.76, 9);
    expect(s.energy.tag).toBe("ASSUMPTION"); // F2: was MODEL; cadence and centre-of-mass rise are assumptions
    expect(s.bout?.cycles).toBe(2550);
  });

  /*
   * ISS: F_eff = m × 0 + 0.7 × m × 9.81 = 0.7 × 769.104 = 538.3728 N
   *   energy = 5100 × 538.3728 × 0.08 = 5100 × 43.069824 = 219 656.1024 J
   *   peak = Earth peak × (1 − 0.75) = 0.25 × 2.5 × 769.104 = 0.625 × 769.104 = 480.69 N (Genc 2010 running decrement)
   * Walk-run transition on the harness gravity 0.7 × 9.81 = 6.867: √(0.5 × 6.867 × 0.9) = √3.09015 = 1.7579 m/s.
   */
  it("ISS: the harness supplies the force; the peak is the Earth peak minus the measured 75 %", () => {
    const s = treadmillRun(person, ENVS.ISS);
    const fEff = s.details.find((d) => d.label === "Effective force");
    expect(fEff?.value).toBeCloseTo(538.3728, 9);
    expect(s.energy.value).toBeCloseTo(219656.1024, 6);
    expect(s.peakLoad.value).toBeCloseTo(480.69, 9);
    expect(s.peakLoad.tag).toBe("ASSUMPTION"); // F2: was MODEL; the 2.5 body-weight multiple it scales is an assumption
    const froude = s.details.find((d) => d.label === "Walk-run transition speed");
    expect(froude?.value).toBeCloseTo(1.7579, 3);
  });

  /*
   * Moon: F_eff = 78.4 × 1.62 = 127.008 N; peak = 2.5 × 127.008 = 317.52 N, an assumption
   * (peak scaling with effective weight is not a published result).
   * Walk-run transition: √(0.5 × 1.62 × 0.9) = √0.729 = 0.9^1.5 = 0.8538 m/s.
   */
  it("Moon: the peak scales with the effective weight and is tagged ASSUMPTION", () => {
    const s = treadmillRun(person, ENVS.MOON);
    expect(s.peakLoad.value).toBeCloseTo(317.52, 9);
    expect(s.peakLoad.tag).toBe("ASSUMPTION");
    expect(s.energy.value).toBeCloseTo(51819.264, 6); // 5100 × 127.008 × 0.08 = 5100 × 10.16064
    const froude = s.details.find((d) => d.label === "Walk-run transition speed");
    expect(froude?.value).toBeCloseTo(0.8538, 4);
  });

  it("Mars: 78.4 × 3.71 = 290.864 N, peak 2.5 × that = 727.16 N, ASSUMPTION", () => {
    const s = treadmillRun(person, ENVS.MARS);
    expect(s.peakLoad.value).toBeCloseTo(727.16, 9);
    expect(s.peakLoad.tag).toBe("ASSUMPTION");
  });

  it("TRANSIT: no weight and no harness, so no session and a reason", () => {
    const s = treadmillRun(person, ENVS.TRANSIT);
    expect(s.energy.value).toBeNull();
    expect(s.energy.note.length).toBeGreaterThan(10);
    expect(s.peakLoad.value).toBeNull();
    expect(s.bout).toBeNull();
  });

  it("the ISS with the harness off is not a session either", () => {
    const s = treadmillRun(person, ENVS.ISS, { ...TREADMILL_DEFAULTS, supportFraction: 0 });
    expect(s.energy.value).toBeNull();
  });

  it("the harness fraction is not applied outside the ISS", () => {
    const a = treadmillRun(person, ENVS.EARTH, { ...TREADMILL_DEFAULTS, supportFraction: 0 });
    const b = treadmillRun(person, ENVS.EARTH, { ...TREADMILL_DEFAULTS, supportFraction: 1 });
    expect(a.energy.value).toBe(b.energy.value);
  });
});

describe("camera set", () => {
  it("is ESTIMATE until validated, carries a bout of the rep count at the largest peak force, and keeps its details", () => {
    const s = cameraSession({
      id: "camera-1",
      title: "Camera set",
      reps: 3,
      totalPositiveWorkJ: 147.15,
      maxPeakForceN: 127,
      inputs: [],
      details: [{ label: "Scale", value: 0.4, unit: "m per frame height", tag: "ESTIMATE", note: "n" }],
    });
    expect(s.energy).toMatchObject({ value: 147.15, unit: "J", tag: "ESTIMATE" }); // F2: was MEASURED
    expect(s.peakLoad).toMatchObject({ value: 127, unit: "N", tag: "ESTIMATE" }); // F2: was MEASURED
    expect(s.bout).toEqual({ cycles: 3, peakLoad: 127 });
    expect(s.details).toHaveLength(1);
  });

  it("with no reps there is no bout", () => {
    expect(cameraSession({ id: "c", title: "c", reps: 0, totalPositiveWorkJ: 0, maxPeakForceN: 0, inputs: [], details: [] }).bout).toBeNull();
  });
});

describe("provenance", () => {
  it("weakestTag picks the most assumed tag, and MODEL for nothing", () => {
    expect(weakestTag(["MEASURED", "MODEL"])).toBe("MODEL");
    expect(weakestTag(["MODEL", "ASSUMPTION", "MEASURED"])).toBe("ASSUMPTION");
    expect(weakestTag(["MANUAL", "ESTIMATE"])).toBe("ESTIMATE");
    expect(weakestTag([])).toBe("MODEL");
  });

  it("every Quantity of every preset in every environment has a note and a tag from the union", () => {
    for (const env of Object.values(ENVS)) {
      for (const s of [treadmillRun(person, env), resistiveSquats(person, env), cycleErgometer(person, env)]) {
        for (const q of allQuantities(s)) {
          expect(q.note.trim().length).toBeGreaterThan(0);
          expect(TAGS).toContain(q.tag);
          expect(q.value === null || Number.isFinite(q.value)).toBe(true);
        }
      }
    }
  });

  it("rejects a person that cannot exist", () => {
    expect(() => treadmillRun({ massKg: 0, legLengthM: 0.9 }, ENVS.EARTH)).toThrow(RangeError);
    expect(() => resistiveSquats({ massKg: 78.4, legLengthM: Number.NaN }, ENVS.EARTH)).toThrow(RangeError);
  });
});

describe("peak load in body weights", () => {
  /*
   * Earth treadmill: 1922.76 / 769.104 = 2.5 (the assumed multiple, by construction).
   * Squats on Earth: (1000 + 769.104) / 769.104 = 1 + 1000 / 769.104 = 1 + 1.300214 = 2.300214.
   * Squats on the ISS: 1000 / 769.104 = 1.300214 (769.104 × 1.3 = 999.835; the rest, 0.165, is 0.000214 of 769.104).
   */
  it("divides by the Earth body weight, so the ISS reads below one body weight only if the device is below it", () => {
    expect(peakInBodyWeights(treadmillRun(person, ENVS.EARTH), person).value).toBeCloseTo(2.5, 12);
    expect(peakInBodyWeights(resistiveSquats(person, ENVS.EARTH), person).value).toBeCloseTo(2.300214, 6);
    const iss = peakInBodyWeights(resistiveSquats(person, ENVS.ISS), person);
    expect(iss.value).toBeCloseTo(1.300214, 6);
    expect(iss.unit).toBe("× Earth body weight");
    expect(iss.tag).toBe("MODEL");
  });

  it("keeps the tag of the peak load and passes a missing peak load on with a reason", () => {
    expect(peakInBodyWeights(treadmillRun(person, ENVS.MOON), person).tag).toBe("ASSUMPTION");
    const none = peakInBodyWeights(cycleErgometer(person, ENVS.EARTH), person);
    expect(none.value).toBeNull();
    expect(none.note).toMatch(/no skeletal load term/i);
  });
});
