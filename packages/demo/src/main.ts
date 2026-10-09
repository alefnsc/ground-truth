import "./styles.css";
import { mountCurrencies } from "./view/currencies";

/**
 * Tabs: role=tablist / tab / tabpanel, one tab in the tab order at a time, arrow keys
 * (and Home / End) move between them and activate, as in the WAI-ARIA tabs pattern.
 */
function wireTabs(tablist: HTMLElement): void {
  const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

  function select(selected: HTMLButtonElement, focus: boolean): void {
    for (const tab of tabs) {
      const isSelected = tab === selected;
      tab.setAttribute("aria-selected", String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
      if (panel) panel.hidden = !isSelected;
    }
    if (focus) selected.focus();
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => select(tab, false));
    tab.addEventListener("keydown", (event) => {
      const at = tabs.indexOf(tab);
      let next: number | null = null;
      if (event.key === "ArrowRight") next = (at + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (at - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      if (next === null) return;
      event.preventDefault();
      const target = tabs[next];
      if (target) select(target, true);
    });
  }
}

const tablist = document.querySelector<HTMLElement>('[role="tablist"]');
if (tablist) wireTabs(tablist);

const currenciesPanel = document.getElementById("panel-currencies");
if (currenciesPanel) mountCurrencies(currenciesPanel);
