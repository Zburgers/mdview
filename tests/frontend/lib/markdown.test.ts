import { describe, expect, it } from "vitest";
import {
  getMarkdownFileName,
  isMarkdownLikePath,
  normalizeMarkdownText,
  renderMarkdown,
  sanitizeMermaidSvg
} from "../../../src/lib/markdown";

describe("markdown helpers", () => {
  it("accepts markdown and text-like file names", () => {
    expect(isMarkdownLikePath("/tmp/README.md")).toBe(true);
    expect(isMarkdownLikePath("/tmp/notes.markdown")).toBe(true);
    expect(isMarkdownLikePath("/tmp/agent-output.txt")).toBe(true);
    expect(isMarkdownLikePath("/tmp/image.png")).toBe(false);
  });

  it("normalizes invalid replacement characters into a visible warning", () => {
    const result = normalizeMarkdownText("hello\uFFFDworld");
    expect(result.text).toContain("hello");
    expect(result.warning).toMatch(/encoding/i);
  });

  it("extracts a user-facing file name", () => {
    expect(getMarkdownFileName("/home/user/docs/README.md")).toBe("README.md");
    expect(getMarkdownFileName("C:\\Users\\Ada\\notes.md")).toBe("notes.md");
  });

  it("renders GitHub-flavored Markdown without allowing raw script html", async () => {
    const html = await renderMarkdown("# Title\n\n- [x] done\n\n<script>alert(1)</script>");
    expect(html).toContain("<h1");
    expect(html).toContain("task-list-item");
    expect(html).not.toContain("<script");
  });

  it("sanitizes mermaid svg before insertion", () => {
    const svg = sanitizeMermaidSvg(
      '<svg><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><g onload="alert(1)"><a href="javascript:alert(1)">x</a></g></svg>'
    );

    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("foreignObject");
    expect(svg).not.toContain("onload=");
    expect(svg).not.toContain("javascript:alert");
  });
});
