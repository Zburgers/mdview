import { describe, expect, it } from "vitest";
import { renderMarkdownDocument } from "../../../src/rendering/render";

describe("callouts", () => {
  it.each([
    ["NOTE", "note"], ["abstract", "abstract"], ["summary", "abstract"], ["tldr", "abstract"],
    ["info", "info"], ["todo", "todo"], ["tip", "tip"], ["hint", "tip"], ["important", "tip"],
    ["success", "success"], ["check", "success"], ["done", "success"],
    ["question", "question"], ["help", "question"], ["faq", "question"],
    ["warning", "warning"], ["caution", "warning"], ["attention", "warning"],
    ["failure", "failure"], ["fail", "failure"], ["missing", "failure"],
    ["danger", "danger"], ["error", "danger"], ["bug", "bug"], ["example", "example"],
    ["quote", "quote"], ["cite", "quote"]
  ])("normalizes %s into %s", async (sourceType, normalizedType) => {
    const result = await renderMarkdownDocument(`> [!${sourceType}]\n> body`);
    const callout = new DOMParser().parseFromString(result.html, "text/html").querySelector(".callout");
    expect(callout?.getAttribute("data-callout")).toBe(normalizedType);
  });

  it("keeps custom titles, folding, nested Markdown and nested callouts", async () => {
    const result = await renderMarkdownDocument(
      "> [!TIP]+ Custom title\n> **bold**\n>\n> > [!WARNING]- Inner\n> > body"
    );
    const document = new DOMParser().parseFromString(result.html, "text/html");
    const outer = document.querySelector("details.callout");
    const inner = document.querySelectorAll("details.callout")[1];

    expect(outer?.hasAttribute("open")).toBe(true);
    expect(outer?.querySelector("summary")?.textContent).toBe("Custom title");
    expect(outer?.querySelector("strong")?.textContent).toBe("bold");
    expect(inner?.hasAttribute("open")).toBe(false);
    expect(inner?.querySelector("summary")?.textContent).toBe("Inner");
  });

  it("falls back to note styling for unknown types and strips hostile raw HTML attributes", async () => {
    const result = await renderMarkdownDocument('> [!made-up] Custom\n> <img src="x" onerror="alert(1)">');
    const document = new DOMParser().parseFromString(result.html, "text/html");
    const callout = document.querySelector(".callout");

    expect(callout?.getAttribute("data-callout")).toBe("note");
    expect(callout?.querySelector(".callout-title")?.textContent).toBe("Custom");
    expect(document.querySelector("img")?.hasAttribute("onerror")).toBe(false);
  });
});
