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

  it("maps rendered task checkboxes past task-like fenced code", async () => {
    const html = await renderMarkdown("```md\n- [ ] example\n```\n\n- [ ] real task");
    const document = new DOMParser().parseFromString(html, "text/html");
    const checkboxes = document.querySelectorAll('.task-list-item input[type="checkbox"]');

    expect(checkboxes).toHaveLength(1);
    expect(checkboxes[0].getAttribute("data-line")).toBe("4");
  });

  it("skips standalone indented code and keeps nested task line mappings", async () => {
    const indentedCode = await renderMarkdown("    - [ ] example\n\n- [ ] real task");
    const codeDocument = new DOMParser().parseFromString(indentedCode, "text/html");
    const codeCheckboxes = codeDocument.querySelectorAll('.task-list-item input[type="checkbox"]');

    expect(codeCheckboxes).toHaveLength(1);
    expect(codeCheckboxes[0].getAttribute("data-line")).toBe("2");

    const nestedList = await renderMarkdown("- [ ] parent\n    - [ ] nested\n- [ ] next");
    const nestedDocument = new DOMParser().parseFromString(nestedList, "text/html");
    const nestedCheckboxes = Array.from(
      nestedDocument.querySelectorAll('.task-list-item input[type="checkbox"]')
    );

    expect(nestedCheckboxes.map((checkbox) => checkbox.getAttribute("data-line"))).toEqual([
      "0",
      "1",
      "2"
    ]);

    const nestedCode = await renderMarkdown(
      "- parent\n    ```md\n    - [ ] example\n    ```\n- [ ] real task"
    );
    const nestedCodeDocument = new DOMParser().parseFromString(nestedCode, "text/html");
    const nestedCodeCheckboxes = nestedCodeDocument.querySelectorAll(
      '.task-list-item input[type="checkbox"]'
    );

    expect(nestedCodeCheckboxes).toHaveLength(1);
    expect(nestedCodeCheckboxes[0].getAttribute("data-line")).toBe("4");
  });

  it("does not let tab-indented code shift a real task checkbox mapping", async () => {
    const html = await renderMarkdown("\t- [ ] code example\n\n- [ ] real task");
    const document = new DOMParser().parseFromString(html, "text/html");
    const checkboxes = document.querySelectorAll('.task-list-item input[type="checkbox"]');

    expect(checkboxes).toHaveLength(1);
    expect(checkboxes[0].getAttribute("data-line")).toBe("2");
  });

  it("maps ordered-list task checkboxes to their source lines", async () => {
    const html = await renderMarkdown("# Tasks\n\n1. [ ] first\n2. [x] second\n\n- [ ] final");
    const document = new DOMParser().parseFromString(html, "text/html");
    const checkboxes = Array.from(
      document.querySelectorAll('.task-list-item input[type="checkbox"]')
    );

    expect(checkboxes.map((checkbox) => checkbox.getAttribute("data-line"))).toEqual([
      "2",
      "3",
      "5"
    ]);
  });

  it("parses wikilink targets, aliases, headings, and block references", async () => {
    const html = await renderMarkdown(
      "[[Page]] [[Page|Alias]] [[Page#Heading]] [[Page^block]] [[Page#Heading^block|Heading alias]]"
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const links = Array.from(document.querySelectorAll("a.wikilink"));

    expect(links.map((link) => link.textContent)).toEqual([
      "Page",
      "Alias",
      "Page",
      "Page",
      "Heading alias"
    ]);
    expect(links[2].getAttribute("data-heading")).toBe("Heading");
    expect(links[3].getAttribute("data-block")).toBe("block");
    expect(links[4].getAttribute("data-heading")).toBe("Heading");
    expect(links[4].getAttribute("data-block")).toBe("block");
  });

  it("renders inline and block math through KaTeX", async () => {
    const html = await renderMarkdown("Inline $x^2$\n\n$$\ny = x^2\n$$");
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.querySelector(".math-inline .katex")).not.toBeNull();
    expect(document.querySelector(".math-block .katex")).not.toBeNull();
  });

  it("contains malformed and untrusted math input", async () => {
    const html = await renderMarkdown(
      "$\\notacommand$ and $\\href{javascript:alert(1)}{click}$"
    );
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.querySelector(".math-inline .katex")?.textContent).toContain("\\notacommand");
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it("renders single source newlines as visible paragraph breaks", async () => {
    const html = await renderMarkdown("First line\nSecond line");
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.querySelector("p")?.innerHTML).toBe("First line<br>Second line");
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

  it("preserves disabled task checkboxes while removing active raw inputs", async () => {
    const html = await renderMarkdown(
      '- [x] done\n\n<input type="text"><input type="image" src="https://example.com/tracker.png">'
    );
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.querySelector('.task-list-item input[type="checkbox"][disabled]')).not.toBeNull();
    expect(document.querySelector('input[type="text"]')).toBeNull();
    expect(document.querySelector('input[type="image"]')).toBeNull();
    expect(document.querySelectorAll("input")).toHaveLength(1);
  });

  it("renders inline code inside links", async () => {
    const html = await renderMarkdown(
      "[PostgreSQL `SELECT` / `SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html)"
    );

    expect(html).toContain(
      '<a href="https://www.postgresql.org/docs/current/sql-select.html" rel="noreferrer">PostgreSQL <code>SELECT</code> / <code>SKIP LOCKED</code></a>'
    );
  });

  it.each([
    "`outside` and [ordinary `inside`](https://example.com/docs)",
    "[reference `inside`][docs] and `outside`\n\n[docs]: https://example.com/docs",
    "[*emphasis `one`* and **strong `two`**](https://example.com/docs)",
    "## [heading `code`](https://example.com/docs)\n\n- [list `code`](https://example.com/docs)",
    "| [cell `code`](https://example.com/docs) | `other` |\n| --- | --- |",
    "[first](https://one.example), [second `code`](https://two.example)!",
    "<https://example.com> and [label `code`](https://example.com/docs)",
    "[PostgreSQL `SELECT` / `SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html)",
    "[punctuation `C++ / foo.bar()` and `x/y`](https://example.com/docs)",
    "# PRD\n\n[API `GET /v1/items` and `200 OK`](https://example.com/api)\n\n- [SQL `SELECT` / `SKIP LOCKED`](https://example.com/sql)"
  ])("renders valid nested inline Markdown without a Marked token error", async (markdown) => {
    const html = await renderMarkdown(markdown);
    expect(html).not.toContain("Token with");
    expect(html).toContain("<code>");
  });

  it("renders escaped backticks around links without a Marked token error", async () => {
    const html = await renderMarkdown("\\`literal\\` and [ordinary link](https://example.com/docs)");
    expect(html).not.toContain("Token with");
    expect(html).toContain("ordinary link");
  });

  it("blocks remote image requests by default while preserving local images", async () => {
    const html = await renderMarkdown(
      "![Remote](https://example.com/tracker.png)\n\n![Local](images/diagram.png)\n\n![Protocol relative](//example.com/tracker.png)"
    );
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.querySelector('img[alt="Remote"]')?.getAttribute("src")).toBeNull();
    expect(document.querySelector('img[alt="Remote"]')?.classList.contains("blocked-image-source")).toBe(true);
    expect(document.querySelector('img[alt="Protocol relative"]')?.getAttribute("src")).toBeNull();
    expect(document.querySelector('img[alt="Local"]')?.getAttribute("src")).toBe("images/diagram.png");
  });

  it("normalizes whitespace before applying the remote image policy", async () => {
    const html = await renderMarkdown('<img alt="Spaced" src="  //example.com/tracker.png  ">');
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.querySelector('img[alt="Spaced"]')?.getAttribute("src")).toBeNull();
  });

  it("applies the same image policy to raw HTML and unsupported URI schemes", async () => {
    const html = await renderMarkdown(
      '<img alt="Raw remote" src="https://example.com/pixel.png">' +
        '<img alt="File" src="file:///home/user/private.png">' +
        '<img alt="Asset" src="asset://localhost/private.png">' +
        '<img alt="Tauri" src="tauri://localhost/private.png">' +
        '<img alt="Data image" src="data:image/png;base64,AAAA">' +
        '<img alt="Data svg" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E">' +
        '<img alt="Data html" src="data:text/html;base64,AAAA">'
    );
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.querySelector('img[alt="Raw remote"]')?.getAttribute("src")).toBeNull();
    expect(document.querySelector('img[alt="File"]')?.getAttribute("src")).toBeNull();
    expect(document.querySelector('img[alt="Asset"]')?.getAttribute("src")).toBeNull();
    expect(document.querySelector('img[alt="Tauri"]')?.getAttribute("src")).toBeNull();
    expect(document.querySelector('img[alt="Data image"]')?.getAttribute("src")).toBe(
      "data:image/png;base64,AAAA"
    );
    expect(document.querySelector('img[alt="Data svg"]')?.getAttribute("src")).toBeNull();
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

  it("sanitizes Mermaid SVG before insertion and applies the image policy", () => {
    const svg = sanitizeMermaidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><g onload="alert(1)"><a href="javascript:alert(1)">x</a><image href="https://example.com/tracker.png"/><image href="asset://localhost/private.png"/><image href="data:image/svg+xml,%3Csvg%3E%3C/svg%3E"/><image href="data:image/png;base64,AAAA"/></g></svg>'
    );

    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("foreignObject");
    expect(svg).not.toContain("onload=");
    expect(svg).not.toContain("javascript:alert");
    expect(svg).not.toContain("https://example.com/tracker.png");
    expect(svg).not.toContain("asset://localhost/private.png");
    expect(svg).not.toContain("data:image/svg+xml");
    expect(svg).toContain("data:image/png;base64,AAAA");
  });

  it("blocks CSS-escaped remote resources in Mermaid SVG while retaining local styling", () => {
    const svg = sanitizeMermaidSvg(String.raw`<svg xmlns="http://www.w3.org/2000/svg"><style>.node { background-image: url(h\74tps://example.com/pixel.png); }</style><rect style="fill: blue; filter: url(//example.com/filter.svg#filter)"/><circle style="fill: red"/></svg>`);

    expect(svg).not.toContain("<style");
    expect(svg).toContain("<rect");
    expect(svg).not.toContain("filter:");
    expect(svg).toContain('style="fill: red"');
    expect(svg).not.toContain("example.com");
  });

  it("blocks remote styles on the Mermaid SVG root", () => {
    const svg = sanitizeMermaidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" style="background-image: url(https:example.com/pixel.png)"><circle style="fill: red"/></svg>'
    );

    expect(svg).not.toContain("example.com");
    expect(svg).not.toContain("background-image");
    expect(svg).toContain('style="fill: red"');
  });

  it.each([
    "h/**/ttps://example.com/pixel.png",
    "/**///example.com/pixel.png",
    "https:example.com/pixel.png",
    String.raw`https:\\example.com/pixel.png`
  ])("blocks remote Mermaid CSS resources: %s", (remoteUrl) => {
    const svg = sanitizeMermaidSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>.node { background-image: url(${remoteUrl}); }</style><circle style="fill: red"/></svg>`
    );

    expect(svg).not.toContain("<style");
    expect(svg).not.toContain("example.com");
    expect(svg).toContain('style="fill: red"');
  });

  it.each([
    "https:example.com/pixel.png",
    String.raw`https:\\example.com/pixel.png`
  ])("blocks protocol-bearing remote SVG attributes: %s", (remoteUrl) => {
    const svg = sanitizeMermaidSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><a href="${remoteUrl}">remote</a><image href="${remoteUrl}"/><image src="${remoteUrl}"/><circle style="fill: red"/></svg>`
    );

    expect(svg).not.toContain("example.com");
    expect(svg).not.toContain("href=");
    expect(svg).not.toContain("src=");
    expect(svg).toContain('style="fill: red"');
  });

  it.each([
    "h\\74\r\ntps://example.com/pixel.png",
    "h\\\r\nttps://example.com/pixel.png"
  ])("blocks a Mermaid CSS remote scheme across a CRLF escape: %s", (remoteUrl) => {
    const svg = sanitizeMermaidSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>.node { background-image: url(${remoteUrl}); }</style><circle style="fill: red"/></svg>`
    );

    expect(svg).not.toContain("<style");
    expect(svg).not.toContain("example.com");
    expect(svg).toContain('style="fill: red"');
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
