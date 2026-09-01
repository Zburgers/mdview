import { describe, expect, it } from "vitest";
import {
  classifyAttachment,
  markdownForAttachment,
  relativePosix,
  sanitizeAttachmentName,
} from "../../../src/lib/attachments";

describe("attachments", () => {
  it("classifies images vs files", () => {
    expect(classifyAttachment("photo.png")).toBe("image");
    expect(classifyAttachment("PHOTO.JPG")).toBe("image");
    expect(classifyAttachment("diagram.svg")).toBe("image");
    expect(classifyAttachment("doc.pdf")).toBe("file");
    expect(classifyAttachment("notes.md")).toBe("file");
    expect(classifyAttachment("noext")).toBe("file");
  });

  it("builds relative posix path from markdown file to dest", () => {
    expect(relativePosix("/a/b/c.md", "/a/b/assets/x.png")).toBe("assets/x.png");
    expect(relativePosix("/a/b/c.md", "/a/b/c.md")).toBe("c.md");
    expect(relativePosix("C:\\Users\\Ada\\notes.md", "C:\\Users\\Ada\\assets\\img.png")).toBe("assets/img.png");
    expect(relativePosix("/a/b/c.md", "/other/path.png")).toBe("/other/path.png");
  });

  it("builds markdown strings for attachments", () => {
    expect(markdownForAttachment("image", "assets/x.png", "x.png")).toBe("![x.png](assets/x.png)");
    expect(markdownForAttachment("file", "assets/doc.pdf", "doc.pdf")).toBe("[doc.pdf](assets/doc.pdf)");
  });

  it("sanitizes attachment names", () => {
    expect(sanitizeAttachmentName('a:b/c*d?.png')).toBe("a_b_c_d_.png");
    expect(sanitizeAttachmentName("  ")).toBe("attachment");
  });
});
