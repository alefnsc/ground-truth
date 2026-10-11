/** Tiny DOM helpers shared by the views. No state, no arithmetic. */

import type { Tag } from "../model/scenarios";

export type Child = Node | string | null | undefined | false;
export type Props = Record<string, string | number | boolean | EventListener | null | undefined>;

/** Create an element. `class` sets the class, `onX` functions are event listeners, true is a bare attribute, false/null/undefined skip it. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

/** Create an SVG element. Attributes are set as given. */
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Record<string, string | number> | null, ...children: SVGElement[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs ?? {})) el.setAttribute(key, String(value));
  el.append(...children);
  return el;
}

export function append(el: Element, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
}

export function replace(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}

export const TAG_MEANING: Readonly<Record<Tag, string>> = {
  MEASURED: "Measured directly, for example the frame rate of a recording.",
  MANUAL: "Entered by the user, or a device setting.",
  MODEL: "A published formula with stated parameters.",
  ASSUMPTION: "A parameter this demo chose; not a published value.",
  CALIBRATED: "Fitted to one anchor point; not published.",
  ESTIMATE: "A range or an estimate, never a single exact figure. Also a number from the camera path, which has not been validated on real video.",
};

/** A provenance chip. The tag is its text, so colour is never the only signal. */
export function tagChip(tag: Tag): HTMLElement {
  return h("span", { class: `chip chip-${tag.toLowerCase()}`, title: TAG_MEANING[tag] }, tag);
}
