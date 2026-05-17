import { describe, expect, it } from "vitest";
import {
  getMarkdownFileName,
  isMarkdownLikePath,
  normalizeMarkdownText,
  renderMarkdown
} from "./markdown";

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
});
