import { describe, expect, it } from "vitest";
import { DASH, formatDays, formatEnergy, formatForce, formatMultiple, formatPercent, formatQuantity } from "../src/view/format";

describe("formatEnergy", () => {
  it("null is a dash", () => {
    expect(formatEnergy(null)).toBe(DASH);
    expect(DASH).toBe("—");
  });
  it("kilojoules from 1000 J, one decimal under 100 kJ and none above", () => {
    expect(formatEnergy(31843.872)).toBe("31.8 kJ");
    expect(formatEnergy(365040)).toBe("365 kJ");
    expect(formatEnergy(710678.304)).toBe("711 kJ");
    expect(formatEnergy(1825200)).toBe("1,825 kJ");
    expect(formatEnergy(1000)).toBe("1.00 kJ");
  });
  it("joules below that", () => {
    expect(formatEnergy(147.15)).toBe("147 J");
    expect(formatEnergy(0)).toBe("0 J");
    expect(formatEnergy(12.34)).toBe("12.3 J");
  });
  it("does not print 1000 J: a value that rounds to it is in kilojoules", () => {
    expect(formatEnergy(999.6)).toBe("1.00 kJ");
  });
});

describe("formatForce", () => {
  it("null is a dash", () => expect(formatForce(null)).toBe(DASH));
  it("three significant figures, thousands grouped", () => {
    expect(formatForce(1769.104)).toBe("1,769 N");
    expect(formatForce(480.69)).toBe("481 N");
    expect(formatForce(38.24)).toBe("38.2 N");
    expect(formatForce(5.1)).toBe("5.10 N");
    expect(formatForce(0)).toBe("0 N");
  });
  it("does not print 100.0", () => {
    expect(formatForce(99.97)).toBe("100 N");
  });
});

describe("formatPercent", () => {
  it("null is a dash", () => expect(formatPercent(null)).toBe(DASH));
  it("a ratio as a percentage", () => {
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0.25)).toBe("25.0%");
    expect(formatPercent(0.56526)).toBe("56.5%");
    expect(formatPercent(0.0526)).toBe("5.26%");
    expect(formatPercent(0)).toBe("0%");
  });
});

describe("formatMultiple", () => {
  it("null is a dash", () => expect(formatMultiple(null)).toBe(DASH));
  it("a multiple with a times sign", () => {
    expect(formatMultiple(256)).toBe("256×");
    expect(formatMultiple(9.7952)).toBe("9.80×");
    expect(formatMultiple(2.5)).toBe("2.50×");
    expect(formatMultiple(12.34)).toBe("12.3×");
    expect(formatMultiple(1234.5)).toBe("1,235×");
  });
});

describe("formatDays", () => {
  it("null is a dash, otherwise a grouped whole number", () => {
    expect(formatDays(null)).toBe(DASH);
    expect(formatDays(1844564.4)).toBe("1,844,564");
    expect(formatDays(0)).toBe("0");
  });
});

describe("formatQuantity", () => {
  const base = { tag: "MODEL" as const, note: "n" };
  it("null is a dash whatever the unit", () => {
    expect(formatQuantity({ ...base, value: null, unit: "N" })).toBe(DASH);
  });
  it("joules and newtons use their formatters", () => {
    expect(formatQuantity({ ...base, value: 365040, unit: "J" })).toBe("365 kJ");
    expect(formatQuantity({ ...base, value: 1769.104, unit: "N" })).toBe("1,769 N");
  });
  it("other units follow the number", () => {
    expect(formatQuantity({ ...base, value: 1.7579, unit: "m/s" })).toBe("1.76 m/s");
    expect(formatQuantity({ ...base, value: 5100, unit: "steps" })).toBe("5,100 steps");
    expect(formatQuantity({ ...base, value: 0.08, unit: "m" })).toBe("0.08 m");
  });
  it("a multiple unit puts the sign after the number", () => {
    expect(formatQuantity({ ...base, value: 2.5, unit: "× body weight" })).toBe("2.50× body weight");
  });
  it("a unit-less count has no trailing space, and a whole number has no decimals", () => {
    expect(formatQuantity({ ...base, value: 3, unit: "" })).toBe("3");
    expect(formatQuantity({ ...base, value: 1800, unit: "s" })).toBe("1,800 s");
  });
  it("never prints a negative zero", () => {
    expect(formatQuantity({ ...base, value: -0, unit: "m" })).toBe("0 m");
  });
});
