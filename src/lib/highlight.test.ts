import { describe, expect, it } from "vitest";
import { highlightText } from "./highlight";

describe("highlightText", () => {
  it("highlights text nodes without changing attributes or tags", () => {
    const root = document.createElement("article");
    root.innerHTML = '<a href="https://example.com/search">Search result</a>';

    highlightText(root, "search");

    expect(root.querySelector("a")?.href).toBe("https://example.com/search");
    expect(root.querySelectorAll("mark")).toHaveLength(1);
    expect(root.innerHTML).toContain("<mark>Search</mark> result");
  });

  it("clears old highlights when the query is empty", () => {
    const root = document.createElement("article");
    root.innerHTML = "Hello <mark>world</mark>";

    highlightText(root, "");

    expect(root.querySelector("mark")).toBeNull();
    expect(root.textContent).toBe("Hello world");
  });
});
