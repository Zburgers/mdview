export function enhanceTables(root: HTMLElement): void {
  root.querySelectorAll<HTMLTableElement>("table").forEach((table) => {
    if (table.parentElement?.classList.contains("table-scroll")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "table-scroll";
    table.replaceWith(wrapper);
    wrapper.append(table);
  });
}
