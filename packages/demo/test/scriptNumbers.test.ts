import { describe, expect, it } from "vitest";
import script from "../../../docs/demo-script.md?raw";
import { renderScriptNumbers } from "../src/model/scriptNumbers";

const START = "<!-- numbers:start -->";
const END = "<!-- numbers:end -->";

function block(text: string): string {
  const a = text.indexOf(START);
  const b = text.indexOf(END);
  if (a < 0 || b < a) throw new Error("docs/demo-script.md has no numbers block between its markers");
  return text.slice(a + START.length, b).trim();
}

describe("the demo script's numbers", () => {
  it("are the numbers the model computes: the block between the markers equals the generated table exactly", () => {
    // If this fails a parameter or a formula changed. Regenerate the block: put the output of renderScriptNumbers()
    // between the markers in docs/demo-script.md, then re-read the narration against it.
    expect(block(script)).toBe(renderScriptNumbers().trim());
  });

  it("the generated table is a real table with every environment and session", () => {
    const t = renderScriptNumbers();
    for (const word of ["Earth", "Moon", "Mars", "ISS", "Treadmill run", "Resistive squats", "Cycle ergometer", "Run only", "Squats only", "Cycle only"]) {
      expect(t).toContain(word);
    }
    expect(t.split("\n").filter((l) => l.startsWith("|")).length).toBeGreaterThan(20);
  });
});

/*
 * The narration may only quote figures that are in the table, or figures from the brief or its cited sources, each of which
 * is listed here with where it comes from.
 */
const ALLOWED: [figure: string, source: string][] = [
  ["75%", "Genc 2010, in-shoe peak load decrement for running on orbit (docs/strategy.md §2, calibration anchor)"],
  ["65%", "Genc 2010, decrement for squats (docs/strategy.md §2, calibration anchor)"],
  ["70%", "the treadmill's subject load device set at 70 % of body weight (docs/strategy.md §2 and §10, beat 2)"],
  ["180days", "the six-month ISS increment (docs/strategy.md §10, beat 4)"],
  ["1095days", "the three-year Mars round trip (docs/strategy.md §10, beat 4)"],
];

type Figure = { value: number; unit: string };

const FIGURE = /(\d[\d ]*(?:\.\d+)?)\s?(kJ|N|%|Earth-days|days|×|x)(?![A-Za-z])/g;

function figuresIn(text: string): Figure[] {
  return [...text.matchAll(FIGURE)].map((m) => ({
    value: Number((m[1] as string).replace(/ /g, "")),
    unit: (m[2] === "Earth-days" ? "days" : m[2] === "x" ? "×" : m[2]) as string,
  }));
}

const ofPairs = (text: string): string[] => [...text.matchAll(/(\d+) of (\d+)/g)].map((m) => `${m[1]} of ${m[2]}`);

describe("the narration quotes only figures from the table or the brief", () => {
  const outside = script.replace(block(script), "").replace(START, "").replace(END, "");
  const tableFigures = figuresIn(renderScriptNumbers());
  const allowed = ALLOWED.flatMap(([f]) => figuresIn(f));

  it("every figure (a number with kJ, N, %, days or ×) outside the table is in the table or in the allowlist", () => {
    const unknown = figuresIn(outside).filter(
      (f) => ![...tableFigures, ...allowed].some((t) => t.unit === f.unit && Math.abs(t.value - f.value) < 1e-9),
    );
    expect(unknown).toEqual([]);
  });

  it("every 'N of M' in the narration is in the table", () => {
    const pairs = new Set(ofPairs(renderScriptNumbers()));
    for (const p of ofPairs(outside)) expect(pairs.has(p)).toBe(true);
  });

  it("the narration quotes some table figures at all (the scan is not vacuous)", () => {
    expect(figuresIn(outside).length).toBeGreaterThan(10);
  });

  it("the scan catches a figure that is in neither place", () => {
    const fake = "The run falls by 99.9% on the ISS.";
    expect(figuresIn(fake).filter((f) => ![...tableFigures, ...allowed].some((t) => t.unit === f.unit && t.value === f.value))).toHaveLength(1);
  });
});
