import { describe, expect, it } from "vitest";
import {
  containsRemoteResourceReference,
  getMarkdownFileName,
  isMarkdownLikePath,
  normalizeMarkdownText,
  promoteStandaloneMermaid,
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

  it("keeps the preview allowlist narrow for raw HTML", async () => {
    const html = await renderMarkdown(
      "<details><summary>Allowed</summary><p>Text</p></details>" +
        '<iframe src="https://example.com"></iframe>' +
        '<video src="https://example.com/video.mp4"></video>' +
        '<style>body { display: none }</style>' +
        '<svg><script>alert(1)</script></svg>'
    );

    expect(html).toContain("<details>");
    expect(html).toContain("<summary>Allowed</summary>");
    expect(html).not.toContain("iframe");
    expect(html).not.toContain("video");
    expect(html).not.toContain("<style");
    expect(html).not.toContain("<svg");
  });

  it("renders inline code inside links", async () => {
    const html = await renderMarkdown(
      "[PostgreSQL `SELECT` / `SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html)"
    );

    expect(html).toContain(
      '<a href="https://www.postgresql.org/docs/current/sql-select.html" rel="noreferrer">PostgreSQL <code>SELECT</code> / <code>SKIP LOCKED</code></a>'
    );
  });

  it("blocks remote image requests by default while preserving local images", async () => {
    const html = await renderMarkdown(
      "![Remote](https://example.com/tracker.png)\n\n![Local](images/diagram.png)\n\n![Protocol relative](//example.com/tracker.png)"
    );
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.querySelector('img[alt="Remote"]')?.getAttribute("src")).toBeNull();
    expect(document.querySelector('img[alt="Remote"]')).toHaveClass("blocked-image-source");
    expect(document.querySelector('img[alt="Protocol relative"]')?.getAttribute("src")).toBeNull();
    expect(document.querySelector('img[alt="Local"]')?.getAttribute("src")).toBe("images/diagram.png");
  });

  it("applies the same image policy to raw HTML and unsupported URI schemes", async () => {
    const html = await renderMarkdown(
      '<img alt="Raw remote" src="https://example.com/pixel.png">' +
        '<img alt="File" src="file:///home/user/private.png">' +
        '<img alt="Data image" src="data:image/png;base64,AAAA">' +
        '<img alt="Data html" src="data:text/html;base64,AAAA">'
    );
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.querySelector('img[alt="Raw remote"]')?.getAttribute("src")).toBeNull();
    expect(document.querySelector('img[alt="File"]')?.getAttribute("src")).toBeNull();
    expect(document.querySelector('img[alt="Data image"]')?.getAttribute("src")).toBe(
      "data:image/png;base64,AAAA"
    );
    expect(document.querySelector('img[alt="Data html"]')?.getAttribute("src")).toBeNull();
  });

  it("allows remote images only when explicitly enabled", async () => {
    const html = await renderMarkdown(
      "![Remote](https://example.com/image.png)\n\n![Protocol relative](//example.com/image.png)",
      { allowRemoteImages: true }
    );
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.querySelector('img[alt="Remote"]')?.getAttribute("src")).toBe(
      "https://example.com/image.png"
    );
    expect(document.querySelector('img[alt="Protocol relative"]')?.getAttribute("src")).toBe(
      "https://example.com/image.png"
    );
  });

  it("detects network resources in Mermaid source before rendering", () => {
    expect(
      containsRemoteResourceReference(
        'flowchart LR\n  tracker@{ img: "https://example.com/tracker.png", label: "Node" }'
      )
    ).toBe(true);
    expect(containsRemoteResourceReference("click A https://example.com/docs")).toBe(true);
    expect(containsRemoteResourceReference("flowchart LR\nA --> B")).toBe(false);
  });

  it("sanitizes Mermaid SVG before insertion and strips remote resources", () => {
    const svg = sanitizeMermaidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><g onload="alert(1)"><a href="javascript:alert(1)">x</a><image href="https://example.com/tracker.png"/><image href="data:image/png;base64,AAAA"/></g></svg>'
    );

    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("foreignObject");
    expect(svg).not.toContain("onload=");
    expect(svg).not.toContain("javascript:alert");
    expect(svg).not.toContain("https://example.com/tracker.png");
    expect(svg).toContain("data:image/png;base64,AAAA");
  });

  it("preserves a Mermaid remote image only when the setting is enabled", () => {
    const svg = sanitizeMermaidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/diagram.png"/></svg>',
      { allowRemoteImages: true }
    );

    expect(svg).toContain("https://example.com/diagram.png");
  });

  it("promotes standalone mermaid flowcharts into fenced mermaid blocks", () => {
    const promoted = promoteStandaloneMermaid(
      "## Endpoints\n\n" +
        "graph TD\n" +
        "  A[Start] --> B{Is it raining?}\n" +
        "  B -- Yes --> C[Bring an umbrella]\n" +
        "  B -- No --> D[Enjoy your day]\n"
    );

    expect(promoted).toContain("```mermaid\ngraph TD\n  A[Start] --> B{Is it raining?}");
  });
});
