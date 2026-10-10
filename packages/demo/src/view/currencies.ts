/**
 * The two-currencies view. DOM only: every number comes from computeDay and its siblings, and is
 * formatted by format.ts. The structure is built once; `update()` rewrites the text and the chips,
 * so an input being typed in keeps its focus. One plain state object.
 */

import { LOAD_RESTS_ON, computeDay, deficitOverMission, missingEarthDays, partialGravityCaveat, runSession, type DayResult, type SessionSpec } from "../model/day";
import {
  CAMERA_PEAK_SCOPE,
  CYCLE_DEFAULTS,
  DEFAULT_PERSON,
  ENVS,
  PARAM_FIELDS,
  SQUAT_DEFAULTS,
  TREADMILL_DEFAULTS,
  peakInBodyWeights,
  type CycleParams,
  type Detail,
  type Env,
  type ParamField,
  type Person,
  type PresetKind,
  type Quantity,
  type SessionResult,
  type SquatParams,
  type Tag,
  type TreadmillParams,
} from "../model/scenarios";
import { h, replace, tagChip, TAG_MEANING } from "./dom";
import { DASH, formatDays, formatEnergy, formatForce, formatMultiple, formatPercent, formatQuantity } from "./format";
import type { Body } from "@ground-truth/physics";

const SELECTOR_ENVS: readonly { body: Body; label: string; gravity: string }[] = [
  { body: "EARTH", label: "Earth", gravity: "9.81 m/s²" },
  { body: "MOON", label: "Moon", gravity: "1.62 m/s²" },
  { body: "MARS", label: "Mars", gravity: "3.71 m/s²" },
  { body: "ISS", label: "ISS", gravity: "≈ 0 (free fall)" },
];

const PERSON_LIMITS = {
  massKg: { min: 30, max: 200, step: 0.1 },
  legLengthM: { min: 0.5, max: 1.3, step: 0.01 },
} as const;

const HORIZON = { min: 30, max: 1095, step: 1, iss: 180, mars: 1095 } as const;

interface PresetEntry {
  kind: PresetKind;
  title: string;
  included: boolean;
}

interface State {
  body: Body;
  massKg: number;
  legLengthM: number;
  days: number;
  presets: PresetEntry[];
  params: { treadmill: TreadmillParams; squats: SquatParams; cycle: CycleParams };
  camera: { session: SessionResult; included: boolean }[];
}

export interface CurrenciesView {
  /** Put a measured set into today's list. */
  addSession(session: SessionResult): void;
}

interface CardRefs {
  root: HTMLElement;
  energy: HTMLElement;
  peak: HTMLElement;
  detailList: HTMLElement;
  includeBox: HTMLInputElement;
}

export function mountCurrencies(root: HTMLElement): CurrenciesView {
  const state: State = {
    body: "EARTH",
    massKg: DEFAULT_PERSON.massKg,
    legLengthM: DEFAULT_PERSON.legLengthM,
    days: HORIZON.iss,
    presets: [
      { kind: "treadmill", title: "Treadmill run", included: true },
      { kind: "squats", title: "Resistive squats", included: true },
      { kind: "cycle", title: "Cycle ergometer", included: true },
    ],
    params: { treadmill: { ...TREADMILL_DEFAULTS }, squats: { ...SQUAT_DEFAULTS }, cycle: { ...CYCLE_DEFAULTS } },
    camera: [],
  };

  // ---- derived inputs ------------------------------------------------------------------------

  const person = (): Person => ({ massKg: state.massKg, legLengthM: state.legLengthM });
  const env = (): Env => ENVS[state.body];

  function specOf(entry: PresetEntry): SessionSpec {
    return { kind: entry.kind, params: state.params[entry.kind] } as SessionSpec;
  }

  function includedSpecs(): SessionSpec[] {
    return [
      ...state.presets.filter((p) => p.included).map(specOf),
      ...state.camera.filter((c) => c.included).map((c): SessionSpec => ({ kind: "camera", session: c.session })),
    ];
  }

  // ---- 1. environment and person -------------------------------------------------------------

  const radioButtons: HTMLButtonElement[] = SELECTOR_ENVS.map((e) =>
    h(
      "button",
      { type: "button", role: "radio", class: "env-option", "data-body": e.body, "aria-checked": String(e.body === state.body), tabindex: e.body === state.body ? 0 : -1 },
      h("span", { class: "env-name" }, e.label),
      h("span", { class: "env-g" }, e.gravity),
    ),
  );

  function chooseEnv(button: HTMLButtonElement, focus: boolean): void {
    state.body = button.dataset.body as Body;
    for (const b of radioButtons) {
      const on = b === button;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    if (focus) button.focus();
    update();
    if (lastDay) {
      replace(announcer, `${button.querySelector(".env-name")?.textContent ?? ""}: energy ${formatEnergy(lastDay.totalEnergy.value)}, load ${formatPercent(lastDay.stimulusRatio.value)} of the same day on Earth.`);
    }
  }

  radioButtons.forEach((button, at) => {
    button.addEventListener("click", () => chooseEnv(button, false));
    button.addEventListener("keydown", (event) => {
      let next: number | null = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (at + 1) % radioButtons.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (at - 1 + radioButtons.length) % radioButtons.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = radioButtons.length - 1;
      if (next === null) return;
      event.preventDefault();
      const target = radioButtons[next];
      if (target) chooseEnv(target, true);
    });
  });

  function numberField(opts: {
    id: string;
    label: string;
    unit: string;
    min: number;
    max: number;
    step: number;
    value: number;
    whole?: boolean;
    onValid: (value: number) => void;
  }): HTMLElement {
    const error = h("span", { class: "field-error", id: `${opts.id}-error`, hidden: true }, `Enter ${opts.whole ? "a whole number" : "a number"} from ${opts.min} to ${opts.max} ${opts.unit}.`.trim());
    const input = h("input", {
      id: opts.id,
      type: "number",
      inputmode: "decimal",
      min: opts.min,
      max: opts.max,
      step: opts.step,
      value: opts.value,
      "aria-describedby": `${opts.id}-error`,
    });
    input.addEventListener("input", () => {
      const v = input.valueAsNumber;
      const ok = Number.isFinite(v) && v >= opts.min && v <= opts.max && (!opts.whole || Number.isInteger(v));
      input.setAttribute("aria-invalid", String(!ok));
      error.hidden = ok;
      if (ok) opts.onValid(v);
    });
    return h("div", { class: "field" }, h("label", { for: opts.id }, opts.label, opts.unit ? h("span", { class: "unit" }, ` (${opts.unit})`) : null), input, error);
  }

  const controls = h(
    "section",
    { class: "block", "aria-labelledby": "h-env" },
    h("h2", { id: "h-env" }, "Environment"),
    h("div", { class: "env-group", role: "radiogroup", "aria-label": "Environment" }, ...radioButtons),
    h(
      "div",
      { class: "person" },
      numberField({ id: "mass", label: "Body mass", unit: "kg", ...PERSON_LIMITS.massKg, value: state.massKg, onValid: (v) => ((state.massKg = v), update()) }),
      numberField({ id: "leg", label: "Leg length", unit: "m", ...PERSON_LIMITS.legLengthM, value: state.legLengthM, onValid: (v) => ((state.legLengthM = v), update()) }),
    ),
  );

  // ---- 2. the two numbers --------------------------------------------------------------------

  const energyValue = h("p", { class: "big-value" });
  const energyChip = h("span", { class: "chip-slot" });
  const energyNote = h("p", { class: "note" });
  const loadValue = h("p", { class: "big-value" });
  const loadChip = h("span", { class: "chip-slot" });
  const loadNote = h("p", { class: "note" });

  // Announced only when the environment changes, not on every keystroke in a field.
  const announcer = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });
  let lastDay: DayResult | null = null;

  const restsOn = h("p", { class: "note rests-on" }, LOAD_RESTS_ON);
  const caveat = h("p", { class: "caveat", hidden: true });

  const legend = h(
    "details",
    { class: "legend" },
    h("summary", null, "What the source tags mean"),
    h("ul", null, ...(Object.keys(TAG_MEANING) as Tag[]).map((tag) => h("li", null, tagChip(tag), " ", TAG_MEANING[tag]))),
  );

  const numbers = h(
    "section",
    { class: "block", "aria-labelledby": "h-numbers" },
    h("h2", { id: "h-numbers" }, "Today"),
    announcer,
    h(
      "div",
      { class: "numbers" },
      h(
        "div",
        { class: "big" },
        h("h3", null, "Energy"),
        energyValue,
        energyChip,
        h("p", { class: "explain" }, "Mechanical work done over the included sessions. It is not metabolic energy and not a calorie count."),
        energyNote,
      ),
      h(
        "div",
        { class: "big" },
        h("h3", null, "Load"),
        loadValue,
        loadChip,
        h("p", { class: "explain" }, "Daily load stimulus as a percentage of the same day on Earth. It is load accounting, not a measurement or prediction of bone."),
        loadNote,
      ),
    ),
    restsOn,
    legend,
  );

  // ---- 3. sessions ---------------------------------------------------------------------------

  const cardList = h("ul", { class: "cards" });

  function paramInput(kind: PresetKind, field: ParamField): HTMLElement {
    const bag = state.params[kind] as unknown as Record<string, number | boolean>;
    const id = `p-${kind}-${field.key}`;
    if (field.kind === "boolean") {
      const box = h("input", { id, type: "checkbox", checked: bag[field.key] === true });
      box.addEventListener("change", () => {
        bag[field.key] = box.checked;
        update();
      });
      return h("div", { class: "field field-check" }, box, h("label", { for: id }, field.label));
    }
    return numberField({
      id,
      label: field.label,
      unit: field.unit,
      min: field.min,
      max: field.max,
      step: field.step,
      value: bag[field.key] as number,
      ...(field.whole ? { whole: true } : {}),
      onValid: (v) => {
        bag[field.key] = v;
        update();
      },
    });
  }

  function buildCard(id: string, title: string, kind: PresetKind | "camera", onInclude: (on: boolean) => void, onRemove: (() => void) | null): CardRefs {
    const includeBox = h("input", { id: `inc-${id}`, type: "checkbox", checked: true });
    includeBox.addEventListener("change", () => onInclude(includeBox.checked));
    const energy = h("div", { class: "metric" });
    const peak = h("div", { class: "metric" });
    const detailList = h("dl", { class: "detail-list" });
    const editors = kind === "camera" ? null : h("div", { class: "params" }, h("h4", null, "Parameters"), ...PARAM_FIELDS[kind].map((f) => paramInput(kind, f)));
    const root = h(
      "li",
      { class: "card", "data-id": id },
      h(
        "div",
        { class: "card-head" },
        h("h3", null, title),
        h("div", { class: "field field-check" }, includeBox, h("label", { for: `inc-${id}` }, "Include in today")),
        onRemove ? h("button", { type: "button", class: "link-button", onclick: onRemove as EventListener }, "Remove") : null,
      ),
      h("div", { class: "metrics" }, energy, peak),
      kind === "camera" ? h("p", { class: "note" }, CAMERA_PEAK_SCOPE) : null,
      h("details", { class: "card-more" }, h("summary", null, "Details, sources and parameters"), detailList, editors),
    );
    return { root, energy, peak, detailList, includeBox };
  }

  type Card = { kind: PresetKind | "camera"; refs: CardRefs; result: () => SessionResult };

  // The preset cards are built once, so an open <details> or a focused input survives "Add to today".
  const presetCards: Card[] = state.presets.map((entry) => ({
    kind: entry.kind,
    refs: buildCard(entry.kind, entry.title, entry.kind, (on) => ((entry.included = on), update()), null),
    result: () => runSession(specOf(entry), person(), env()),
  }));
  let cameraCards: Card[] = [];
  const allCards = (): Card[] => [...presetCards, ...cameraCards];

  function rebuildCameraCards(): void {
    cameraCards = state.camera.map((c, index) => {
      const refs = buildCard(`${c.session.id}-${index}`, c.session.title, "camera", (on) => ((c.included = on), update()), () => {
        state.camera.splice(state.camera.indexOf(c), 1);
        rebuildCameraCards();
        update();
      });
      refs.includeBox.checked = c.included;
      return { kind: "camera" as const, refs, result: () => c.session };
    });
    replace(cardList, ...allCards().map((c) => c.refs.root));
  }

  const sessions = h("section", { class: "block", "aria-labelledby": "h-sessions" }, h("h2", { id: "h-sessions" }, "Sessions"), caveat, cardList);

  // ---- 4. mission horizon --------------------------------------------------------------------

  const horizonInput = h("input", {
    id: "horizon",
    type: "range",
    min: HORIZON.min,
    max: HORIZON.max,
    step: HORIZON.step,
    value: state.days,
    list: "horizon-marks",
  });
  const horizonOut = h("output", { for: "horizon", class: "horizon-out" });
  const deficitValue = h("p", { class: "big-value" });
  const deficitChip = h("span", { class: "chip-slot" });
  const deficitRaw = h("p", { class: "note" });
  const deficitNote = h("p", { class: "note" });
  const cyclesLine = h("p", { class: "cycles" });
  const cyclesChip = h("span", { class: "chip-slot" });
  const cyclesNote = h("p", { class: "note" });

  horizonInput.addEventListener("input", () => {
    state.days = horizonInput.valueAsNumber;
    update();
  });
  function setHorizon(days: number): void {
    state.days = days;
    horizonInput.value = String(days);
    update();
  }

  const mission = h(
    "section",
    { class: "block", "aria-labelledby": "h-mission" },
    h("h2", { id: "h-mission" }, "Mission horizon"),
    h(
      "div",
      { class: "field" },
      h("label", { for: "horizon" }, "Days, with today's sessions repeated every day"),
      horizonInput,
      h("datalist", { id: "horizon-marks" }, h("option", { value: HORIZON.iss, label: "180" }), h("option", { value: HORIZON.mars, label: "1095" })),
      h(
        "div",
        { class: "marks" },
        h("button", { type: "button", class: "mark-button", onclick: (() => setHorizon(HORIZON.iss)) as EventListener }, "180 days: an ISS increment"),
        h("button", { type: "button", class: "mark-button", onclick: (() => setHorizon(HORIZON.mars)) as EventListener }, "1095 days: a Mars round trip"),
      ),
      horizonOut,
    ),
    h("div", { class: "big" }, h("h3", null, "Loading missing"), deficitValue, deficitChip, deficitNote, deficitRaw),
    h("div", { class: "big" }, h("h3", null, "Cycles to match"), cyclesLine, cyclesChip, cyclesNote),
    h("p", { class: "explain" }, "The deficit is one number for the whole skeleton. Per-compartment divergence (trabecular against cortical) is not modelled."),
  );

  // ---- rendering -----------------------------------------------------------------------------

  /** A value, its tag and, when there is no value, the reason. */
  function showQuantity(valueEl: HTMLElement, chipEl: HTMLElement, noteEl: HTMLElement, text: string, q: Quantity): void {
    replace(valueEl, text);
    replace(chipEl, tagChip(q.tag));
    replace(noteEl, q.value === null ? `${DASH} ${q.note}` : q.note);
  }

  function renderMetric(into: HTMLElement, label: string, text: string, q: Quantity, extra?: string): void {
    replace(
      into,
      h("span", { class: "metric-label" }, label),
      h("span", { class: "metric-value" }, text),
      extra ? h("span", { class: "metric-extra" }, extra) : null,
      tagChip(q.tag),
      q.value === null ? h("span", { class: "metric-reason" }, q.note) : null,
    );
  }

  function detailItems(session: SessionResult): Node[] {
    const rows: Detail[] = [
      { label: "Energy", ...session.energy },
      { label: "Peak load", ...session.peakLoad },
      ...session.details,
    ];
    return rows.flatMap((d) => [
      h("dt", null, d.label),
      h("dd", null, h("span", { class: "detail-value" }, formatQuantity(d)), " ", tagChip(d.tag), h("span", { class: "detail-note" }, d.value === null ? `${DASH} ${d.note}` : d.note)),
    ]);
  }

  function renderCards(): void {
    for (const card of allCards()) {
      const result = card.result();
      const bodyWeights = peakInBodyWeights(result, person());
      renderMetric(card.refs.energy, "Energy", formatEnergy(result.energy.value), result.energy);
      renderMetric(card.refs.peak, "Peak load", formatForce(result.peakLoad.value), result.peakLoad, result.peakLoad.value === null || card.kind === "camera" ? undefined : `${formatMultiple(bodyWeights.value)} Earth body weight`);
      replace(card.refs.detailList, ...detailItems(result));
      card.refs.root.classList.toggle("excluded", !card.refs.includeBox.checked);
    }
  }

  function renderDay(day: DayResult): void {
    showQuantity(energyValue, energyChip, energyNote, formatEnergy(day.totalEnergy.value), day.totalEnergy);
    showQuantity(loadValue, loadChip, loadNote, formatPercent(day.stimulusRatio.value), day.stimulusRatio);

    const deficit = deficitOverMission(day, state.days);
    const missing = missingEarthDays(day, state.days);
    replace(horizonOut, `${state.days} days`);
    showQuantity(deficitValue, deficitChip, deficitNote, missing.value === null ? DASH : `${formatQuantity({ ...missing, unit: "" })} of ${state.days}`, missing);
    if (missing.value !== null) deficitValue.append(h("span", { class: "unit" }, ` ${missing.unit}`));
    replace(deficitRaw, deficit.value === null ? "" : `Raw figure: ${formatDays(deficit.value)} ${deficit.unit}. It scales with body mass.`);

    const cycles = day.cyclesToMatch;
    replace(
      cyclesLine,
      cycles.value === null
        ? DASH
        : `About ${formatMultiple(cycles.value)} the daily loading cycles of the ${day.cyclesToMatchBout ?? "dominant bout"} would be needed at this peak load to match its Earth stimulus. That is not achievable by adding volume.`,
    );
    replace(cyclesChip, tagChip(cycles.tag));
    replace(cyclesNote, cycles.value === null ? `${DASH} ${cycles.note}` : cycles.note);
  }

  function update(): void {
    const text = partialGravityCaveat(state.body);
    caveat.hidden = text === null;
    replace(caveat, text ?? "");
    lastDay = computeDay(person(), env(), includedSpecs());
    renderDay(lastDay);
    renderCards();
  }

  // ---- mount ---------------------------------------------------------------------------------

  rebuildCameraCards();
  replace(root, controls, numbers, sessions, mission);
  update();

  return {
    addSession(session: SessionResult): void {
      state.camera.push({ session, included: true });
      rebuildCameraCards();
      update();
    },
  };
}
