import { describe, expect, it } from "vitest";
import { G_ENV_MS2, metabolicRange, trajectoryWork, type Sample } from "../src/index";

const MASS_KG = 10;
const HEIGHT_M = 0.5;
const DURATION_S = 1;

/** y = (h/2)(1 − cos(π t / T)) sampled at `hz` over [0, T]: a lift that starts and ends at rest. */
function cosineLift(heightM: number, durationS: number, hz: number): Sample[] {
  const n = Math.round(durationS * hz);
  const samples: Sample[] = [];
  for (let i = 0; i <= n; i++) {
    const tS = i / hz;
    samples.push({ tS, yM: (heightM / 2) * (1 - Math.cos((Math.PI * tS) / durationS)) });
  }
  return samples;
}

/** The lift followed by its mirror image (the lowering), sharing the top sample. */
function cosineRep(heightM: number, durationS: number, hz: number): Sample[] {
  const lift = cosineLift(heightM, durationS, hz);
  const lowering: Sample[] = [];
  for (let i = lift.length - 2; i >= 0; i--) {
    const s = lift[i]!;
    lowering.push({ tS: durationS + (lift.length - 1 - i) / hz, yM: s.yM });
  }
  return [...lift, ...lowering];
}

/**
 * The same lift sampled at deterministically jittered times: each interior
 * sample is shifted by 3 ms * sin(1.7 i) (a fixed formula, never Math.random).
 * The first and last samples keep their exact times so the lift still spans [0, T].
 */
function jitteredCosineLift(heightM: number, durationS: number, hz: number): Sample[] {
  const n = Math.round(durationS * hz);
  const samples: Sample[] = [];
  for (let i = 0; i <= n; i++) {
    const jitter = i === 0 || i === n ? 0 : 0.003 * Math.sin(1.7 * i);
    const tS = i / hz + jitter;
    samples.push({ tS, yM: (heightM / 2) * (1 - Math.cos((Math.PI * tS) / durationS)) });
  }
  return samples;
}

const earthWorkJ = MASS_KG * G_ENV_MS2.EARTH * HEIGHT_M; // 49.05
const withinRel = (actual: number, expected: number, rel: number) =>
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThan(rel);

describe("trajectoryWork", () => {
  it("lift on Earth: all work is positive and equals m·g·h", () => {
    const r = trajectoryWork(cosineLift(HEIGHT_M, DURATION_S, 60), MASS_KG, G_ENV_MS2.EARTH);
    withinRel(r.positiveWorkJ, 49.05, 0.01);
    expect(Math.abs(r.negativeWorkJ)).toBeLessThan(0.5);
    withinRel(r.netWorkJ, 49.05, 0.01);
    expect(r.displacementM).toBeCloseTo(0.5, 6);
    expect(r.netWorkJ).toBeCloseTo(r.positiveWorkJ + r.negativeWorkJ, 9);
  });

  it("lift on Earth: peak force is m(g + a_max)", () => {
    const r = trajectoryWork(cosineLift(HEIGHT_M, DURATION_S, 60), MASS_KG, G_ENV_MS2.EARTH);
    // 10 × (9.81 + 0.25 π²)
    withinRel(r.peakForceN, 122.77, 0.02);
  });

  it("lift then lower on Earth: the lowering gives the work back", () => {
    const r = trajectoryWork(cosineRep(HEIGHT_M, DURATION_S, 60), MASS_KG, G_ENV_MS2.EARTH);
    withinRel(r.positiveWorkJ, 49.05, 0.01);
    withinRel(r.negativeWorkJ, -49.05, 0.01);
    expect(Math.abs(r.netWorkJ)).toBeLessThan(0.5);
  });

  it("the same lift on the ISS: accelerating costs ½mv², stopping gives it back", () => {
    const r = trajectoryWork(cosineLift(HEIGHT_M, DURATION_S, 60), MASS_KG, G_ENV_MS2.ISS);
    // ½ · m · v_max², v_max = (h/2)(π/T)
    withinRel(r.positiveWorkJ, 3.084, 0.03);
    withinRel(r.negativeWorkJ, -3.084, 0.03);
    expect(Math.abs(r.netWorkJ)).toBeLessThan(0.1);
  });

  it("the same lift on the Moon: net work is m·g_moon·h", () => {
    const r = trajectoryWork(cosineLift(HEIGHT_M, DURATION_S, 60), MASS_KG, G_ENV_MS2.MOON);
    // 10 × 1.62 × 0.5
    withinRel(r.netWorkJ, 8.1, 0.01);
  });

  it("sampling at 30 Hz still gives the Earth lift within 1 %", () => {
    const r = trajectoryWork(cosineLift(HEIGHT_M, DURATION_S, 30), MASS_KG, G_ENV_MS2.EARTH);
    withinRel(r.netWorkJ, earthWorkJ, 0.01);
  });

  it("non-uniform time steps (deterministic jitter) stay within 2 %", () => {
    const samples = jitteredCosineLift(HEIGHT_M, DURATION_S, 60);
    // Guard the test itself: the time steps really are non-uniform.
    const steps = samples.slice(1).map((s, i) => s.tS - samples[i]!.tS);
    expect(Math.max(...steps) - Math.min(...steps)).toBeGreaterThan(0.004);
    const r = trajectoryWork(samples, MASS_KG, G_ENV_MS2.EARTH);
    withinRel(r.netWorkJ, earthWorkJ, 0.02);
  });

  describe("invalid input", () => {
    const ok = cosineLift(HEIGHT_M, DURATION_S, 60);

    it("rejects fewer than 3 samples", () => {
      expect(() => trajectoryWork(ok.slice(0, 2), MASS_KG, 9.81)).toThrow(RangeError);
      expect(() => trajectoryWork(ok.slice(0, 2), MASS_KG, 9.81)).toThrow(/samples/);
    });

    it("rejects non-increasing time", () => {
      const repeated = [{ tS: 0, yM: 0 }, { tS: 0.1, yM: 0.1 }, { tS: 0.1, yM: 0.2 }];
      const backwards = [{ tS: 0, yM: 0 }, { tS: 0.2, yM: 0.1 }, { tS: 0.1, yM: 0.2 }];
      expect(() => trajectoryWork(repeated, MASS_KG, 9.81)).toThrow(RangeError);
      expect(() => trajectoryWork(backwards, MASS_KG, 9.81)).toThrow(/tS/);
    });

    it("rejects negative mass", () => {
      expect(() => trajectoryWork(ok, -1, 9.81)).toThrow(RangeError);
      expect(() => trajectoryWork(ok, -1, 9.81)).toThrow(/massKg/);
    });

    it("rejects NaN in a sample", () => {
      const nanY = [{ tS: 0, yM: 0 }, { tS: 0.1, yM: Number.NaN }, { tS: 0.2, yM: 0.2 }];
      const nanT = [{ tS: 0, yM: 0 }, { tS: Number.NaN, yM: 0.1 }, { tS: 0.2, yM: 0.2 }];
      expect(() => trajectoryWork(nanY, MASS_KG, 9.81)).toThrow(RangeError);
      expect(() => trajectoryWork(nanY, MASS_KG, 9.81)).toThrow(/yM/);
      expect(() => trajectoryWork(nanT, MASS_KG, 9.81)).toThrow(RangeError);
    });

    it("rejects a non-finite gravity", () => {
      expect(() => trajectoryWork(ok, MASS_KG, Number.POSITIVE_INFINITY)).toThrow(/gEnvMs2/);
    });
  });
});

describe("metabolicRange", () => {
  it("returns a labelled range from gross efficiency 0.20–0.25", () => {
    const r = metabolicRange(49.05);
    expect(r.lowJ).toBeCloseTo(196.2, 6);
    expect(r.highJ).toBeCloseTo(245.25, 6);
    expect(r.kind).toBe("ESTIMATE");
    expect(r.basis).toContain("0.20");
    expect(r.basis).toContain("0.25");
  });

  it("rejects negative or non-finite work", () => {
    expect(() => metabolicRange(-1)).toThrow(RangeError);
    expect(() => metabolicRange(-1)).toThrow(/positiveWorkJ/);
    expect(() => metabolicRange(Number.NaN)).toThrow(RangeError);
  });
});
