import { describe, expect, it } from "vitest";
import { renderMarkdownDocument } from "../../../src/rendering/render";
import { promoteStandaloneMermaid } from "../../../src/rendering/parser";

async function documentFor(markdown: string) {
  const { html } = await renderMarkdownDocument(markdown);
  return new DOMParser().parseFromString(html, "text/html");
}

describe("source whitespace in the preview", () => {
  it.each(["first", "# first", "## first", "![first](local.png)"])(
    "keeps deliberate blank rows after %s instead of collapsing them",
    async (first) => {
      const document = await documentFor(`${first}\n\n\n\n\nsecond`);
      expect(document.querySelectorAll(".markdown-blank-line")).toHaveLength(4);
      expect([...document.querySelectorAll("[data-source-line]")].map((element) => element.getAttribute("data-source-line")))
        .toContain("5");
    }
  );

  it("renders one blank source row between normal Markdown paragraphs", async () => {
    const document = await documentFor("first\n\nsecond");
    expect(document.querySelectorAll("p")).toHaveLength(2);
    expect(document.querySelectorAll(".markdown-blank-line")).toHaveLength(1);
  });

  it("preserves leading, trailing, whitespace-only, and CRLF blank rows", async () => {
    const document = await documentFor("\r\n\r\n# first\r\n \r\n\t\r\nsecond\r\n\r\n\r\n");
    expect(document.querySelectorAll(".markdown-blank-line")).toHaveLength(6);
    expect(document.querySelector("h1")?.textContent).toBe("first");
    const blank = await documentFor("\n\n\n");
    expect(blank.querySelectorAll(".markdown-blank-line")).toHaveLength(3);
  });

  it("keeps blanks inside fenced code as code and keeps task source lines unchanged", async () => {
    const document = await documentFor("```text\nfirst\n\n\nsecond\n```\n\n\n- [ ] task");
    expect(document.querySelector("pre code")?.textContent).toBe("first\n\n\nsecond");
    expect(document.querySelectorAll(".markdown-blank-line")).toHaveLength(2);
    expect(document.querySelector("input")?.getAttribute("data-line")).toBe("8");
  });

  it("keeps reference links and original line mappings after standalone Mermaid promotion", async () => {
    const document = await documentFor("flowchart LR\nA --> B\n\n\n# after\n\n[guide][ref]\n\n[ref]: ./guide.md");
    expect(document.querySelector("a")?.getAttribute("href")).toBe("./guide.md");
    expect(document.querySelector("h1")?.previousElementSibling?.getAttribute("data-source-line")).toBe("4");
    expect(document.querySelectorAll(".markdown-blank-line")).toHaveLength(4);
  });

  it("does not accept forged source positions from raw HTML", async () => {
    const document = await documentFor('<span class="__MDVIEW_SOURCE_99" data-source-line="99">text</span>\n\n# after');
    expect(document.querySelector('[data-source-line="99"]')).toBeNull();
    expect(document.querySelector("h1")?.previousElementSibling?.getAttribute("data-source-line")).toBe("2");
  });

  it("keeps blank rows in loose task lists and maps every checkbox to its original row", async () => {
    const document = await documentFor("- [ ] first\n\n\n- [x] second\n\n# end");
    expect(document.querySelectorAll("li:first-child .markdown-blank-line")).toHaveLength(2);
    expect([...document.querySelectorAll("li.task-list-item input")].map((input) => input.getAttribute("data-line")))
      .toEqual(["0", "3"]);
    expect([...document.querySelectorAll("li[data-source-line]")].map((item) => item.getAttribute("data-source-line")))
      .toEqual(["0", "3"]);
  });

  it("keeps nested task mappings across blank rows", async () => {
    const document = await documentFor("- [ ] parent\n    - [ ] child\n\n\n    - [ ] next\n- [ ] last");
    expect([...document.querySelectorAll("li.task-list-item input")].map((input) => input.getAttribute("data-line")))
      .toEqual(["0", "1", "4", "5"]);
  });

  it.each(["> first\n>\n>\n> second", "> [!NOTE]\n> first\n>\n>\n> second"])(
    "keeps blank rows inside quotes and callouts",
    async (markdown) => {
      const document = await documentFor(markdown);
      expect(document.querySelectorAll(".markdown-blank-line")).toHaveLength(2);
      expect(document.body.textContent).toContain("second");
    }
  );

  it.each([
    "~~~text\n\nflowchart LR\nA --> B\n~~~",
    "````text\n```\n\nflowchart LR\nA --> B\n````",
    "    flowchart LR\n    A --> B"
  ])("does not rewrite diagram-looking text inside literal code", async (markdown) => {
    expect(promoteStandaloneMermaid(markdown)).toBe(markdown);
    const document = await documentFor(markdown);
    expect(document.querySelector("code.language-mermaid")).toBeNull();
    expect(document.querySelector("pre code")?.textContent).toContain("flowchart LR");
    expect(document.querySelectorAll("pre .markdown-blank-line")).toHaveLength(0);
  });
});
