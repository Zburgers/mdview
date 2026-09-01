import DOMPurify from "dompurify";
import { Marked } from "marked";

const markdownExtensions = new Set(["md", "markdown", "mdown", "mkd", "txt", "text"]);
const remoteResourcePattern = /(?:https?|ftps?|wss?):\/\/|(?:^|[\s("'=])\/\/[a-z0-9]/i;
const allowedDataImagePattern =
  /^data:image\/(?:avif|bmp|gif|jpe?g|png|webp|x-icon|vnd\.microsoft\.icon)(?:;|,)/i;

const markedParser = new Marked({
  async: false,
  breaks: false,
  gfm: true
});

// Obsidian-style callouts: > [!NOTE] Title
markedParser.use({
  extensions: [
    {
      name: "callout",
      level: "block" as const,
      start(src: string) {
        const idx = src.indexOf("> [!");
        return idx >= 0 ? idx : undefined;
      },
      tokenizer(src: string) {
        const rule = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]([+-]?)\s*(.*)\n((?:>.*\n?)*)/;
        const match = rule.exec(src);
        if (!match) return undefined;
        const full = match[0];
        const calloutType = match[1].toLowerCase();
        const fold = match[2] || "";
        const title = match[3]?.trim() || calloutType;
        const bodyRaw = match[4] || "";
        const body = bodyRaw.replace(/^>\s?/gm, "").trim();
        const bodyTokens = body ? (this as unknown as { lexer: { blockTokens: (s: string) => unknown[] } }).lexer.blockTokens(body) : [];
        return {
          type: "callout",
          raw: full,
          calloutType,
          fold,
          title,
          body,
          tokens: bodyTokens as never[],
        };
      },
      renderer(token: unknown) {
        const t = token as { calloutType: string; fold: string; title: string; body: string; tokens: unknown[] };
        const bodyHtml = t.tokens?.length
          ? (this as unknown as { parser: { parse: (toks: unknown[]) => string } }).parser.parse(t.tokens as never[])
          : "";
        return `<div class="callout callout-${escapeAttribute(t.calloutType)}" data-callout="${escapeAttribute(t.calloutType)}" data-fold="${escapeAttribute(t.fold)}"><div class="callout-title">${escapeAttribute(t.title)}</div><div class="callout-body">${bodyHtml}</div></div>\n`;
      },
    },
    {
      name: "wikilink",
      level: "inline" as const,
      start(src: string) {
        const idx = src.indexOf("[[");
        return idx >= 0 ? idx : undefined;
      },
      tokenizer(src: string) {
        const rule = /^\[\[([^\]|#^]+)(?:\|([^\]]+))?(?:#([^\]|^]+))?(?:\^([^\]]+))?\]\]/;
        const match = rule.exec(src);
        if (!match) return undefined;
        const target = match[1].trim();
        const alias = match[2]?.trim() || target;
        const heading = match[3]?.trim() || "";
        const block = match[4]?.trim() || "";
        return {
          type: "wikilink",
          raw: match[0],
          target,
          alias,
          heading,
          block,
        };
      },
      renderer(token: unknown) {
        const t = token as { target: string; alias: string; heading: string; block: string };
        const slug = slugifyWikilink(t.target);
        const headingAttr = t.heading ? ` data-heading="${escapeAttribute(t.heading)}"` : "";
        const blockAttr = t.block ? ` data-block="${escapeAttribute(t.block)}"` : "";
        return `<a class="wikilink" data-wikilink="${escapeAttribute(t.target)}"${headingAttr}${blockAttr} href="#wikilink-${escapeAttribute(slug)}">${escapeAttribute(t.alias)}</a>`;
      },
    },
    {
      name: "mathInline",
      level: "inline" as const,
      start(src: string) {
        const idx = src.indexOf("$");
        return idx >= 0 ? idx : undefined;
      },
      tokenizer(src: string) {
        // avoid matching $$ block start
        if (src.startsWith("$$")) return undefined;
        const rule = /^\$([^$\n]+?)\$/;
        const match = rule.exec(src);
        if (!match) return undefined;
        // skip if contains only spaces
        if (!match[1].trim()) return undefined;
        return {
          type: "mathInline",
          raw: match[0],
          math: match[1],
        };
      },
      renderer(token: unknown) {
        const t = token as { math: string };
        return `<span class="math-inline" data-math="${escapeAttribute(t.math)}">${escapeAttribute(t.math)}</span>`;
      },
    },
    {
      name: "mathBlock",
      level: "block" as const,
      start(src: string) {
        const idx = src.indexOf("$$");
        return idx >= 0 ? idx : undefined;
      },
      tokenizer(src: string) {
        const rule = /^\$\$([\s\S]+?)\$\$/;
        const match = rule.exec(src);
        if (!match) return undefined;
        return {
          type: "mathBlock",
          raw: match[0],
          math: match[1].trim(),
        };
      },
      renderer(token: unknown) {
        const t = token as { math: string };
        return `<div class="math-block" data-math="${escapeAttribute(t.math)}"><code>${escapeAttribute(t.math)}</code></div>\n`;
      },
    },
  ],
});

function slugifyWikilink(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export type NormalizedMarkdown = {
  text: string;
  warning: string | null;
};

export type MarkdownRenderOptions = {
  allowRemoteImages?: boolean;
};

export function isMarkdownLikePath(path: string): boolean {
  const extension = path.split(/[./\\]/).pop()?.toLowerCase() ?? "";
  return markdownExtensions.has(extension);
}

export function normalizeMarkdownText(text: string): NormalizedMarkdown {
  if (text.includes("\uFFFD")) {
    return {
      text,
      warning: "The file contained invalid encoding bytes and was decoded lossily."
    };
  }

  return { text, warning: null };
}

export function getMarkdownFileName(path: string | null): string {
  if (!path) {
    return "Untitled";
  }

  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function getTaskLineMap(markdown: string): number[] {
  const lines = markdown.split("\n");
  const map: number[] = [];
  lines.forEach((line, idx) => {
    if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) {
      map.push(idx);
    }
  });
  return map;
}
export async function renderMarkdown(
  markdown: string,
  { allowRemoteImages = false }: MarkdownRenderOptions = {}
): Promise<string> {
  const html = addTaskListClasses(
    await markedParser.parse(promoteStandaloneMermaid(markdown)),
    getTaskLineMap(markdown)
  );
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "a",
      "blockquote",
      "br",
      "code",
      "del",
      "details",
      "div",
      "em",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "img",
      "input",
      "li",
      "ol",
      "p",
      "pre",
      "span",
      "strong",
      "summary",
      "table",
      "tbody",
      "td",
      "th",
      "thead",
      "tr",
      "ul"
    ],
    ALLOWED_ATTR: [
      "alt",
      "checked",
      "class",
      "data-block",
      "data-callout",
      "data-fold",
      "data-heading",
      "data-line",
      "data-math",
      "data-wikilink",
      "disabled",
      "href",
      "rel",
      "src",
      "title",
      "type"
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "audio", "video", "source"],
    ADD_ATTR: ["target"]
  });

  return applyPreviewElementPolicy(sanitized, allowRemoteImages);
}

export function promoteStandaloneMermaid(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let inFence = false;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      output.push(line);
      index += 1;
      continue;
    }

    if (!inFence && isMermaidStart(line) && startsAtBlockBoundary(output)) {
      const block: string[] = [];
      while (index < lines.length && lines[index].trim() !== "") {
        block.push(lines[index]);
        index += 1;
      }
      output.push("```mermaid", ...block, "```");
      continue;
    }

    output.push(line);
    index += 1;
  }

  return output.join("\n");
}

export function containsRemoteResourceReference(value: string): boolean {
  return remoteResourcePattern.test(value);
}

export function sanitizeMermaidSvg(
  svg: string,
  { allowRemoteImages = false }: MarkdownRenderOptions = {}
): string {
  const sanitized = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed"]
  });
  const document = new DOMParser().parseFromString(sanitized, "image/svg+xml");
  const root = document.documentElement;

  if (root.nodeName.toLowerCase() === "parsererror") {
    return "";
  }

  root.querySelectorAll("image").forEach((image) => {
    ["href", "xlink:href", "src"].forEach((attribute) => {
      const originalValue = image.getAttribute(attribute);
      if (!originalValue) {
        return;
      }

      const value = originalValue.trim();
      if (!isAllowedImageSource(value, allowRemoteImages, false)) {
        image.removeAttribute(attribute);
      } else if (value !== originalValue) {
        image.setAttribute(attribute, value);
      }
    });
  });

  if (!allowRemoteImages) {
    root.querySelectorAll("*").forEach((element) => {
      if (element.nodeName.toLowerCase() !== "image") {
        ["href", "xlink:href", "src"].forEach((attribute) => {
          const value = element.getAttribute(attribute);
          if (value && containsRemoteResourceReference(value)) {
            element.removeAttribute(attribute);
          }
        });
      }

      const style = element.getAttribute("style");
      if (style && containsRemoteResourceReference(style)) {
        element.removeAttribute("style");
      }
    });

    root.querySelectorAll("style").forEach((style) => {
      if (containsRemoteResourceReference(style.textContent ?? "")) {
        style.remove();
      }
    });
  }

  return new XMLSerializer().serializeToString(root);
}

function applyPreviewElementPolicy(html: string, allowRemoteImages: boolean): string {
  const document = new DOMParser().parseFromString(html, "text/html");

  document.querySelectorAll("a[href]").forEach((anchor) => {
    anchor.setAttribute("rel", "noreferrer");
  });

  document.querySelectorAll("input").forEach((input) => {
    const isDisabledCheckbox =
      input.getAttribute("type")?.toLowerCase() === "checkbox" && input.hasAttribute("disabled");
    if (!isDisabledCheckbox) {
      input.remove();
    }
  });

  document.querySelectorAll("img[src]").forEach((image) => {
    const originalSrc = image.getAttribute("src");
    if (!originalSrc) {
      return;
    }

    const src = originalSrc.trim();
    if (!src) {
      markImageSourceBlocked(image);
      return;
    }

    if (src !== originalSrc) {
      image.setAttribute("src", src);
    }

    if (src.startsWith("//")) {
      if (allowRemoteImages) {
        image.setAttribute("src", `https:${src}`);
      } else {
        markImageSourceBlocked(image);
      }
      return;
    }

    if (!isAllowedImageSource(src, allowRemoteImages, true)) {
      markImageSourceBlocked(image);
    }
  });

  return document.body.innerHTML;
}

function isAllowedImageSource(
  src: string,
  allowRemoteImages: boolean,
  allowRelative: boolean
): boolean {
  if (!src) {
    return false;
  }

  try {
    const url = new URL(src);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return allowRemoteImages;
    }
    if (url.protocol === "data:") {
      return allowedDataImagePattern.test(src);
    }
    return url.protocol === "blob:";
  } catch {
    return allowRelative;
  }
}

function markImageSourceBlocked(image: Element): void {
  image.removeAttribute("src");
  image.classList.add("blocked-image-source");
  image.setAttribute("title", "Image source blocked by mdview");
}

function addTaskListClasses(html: string, lineMap?: number[]): string {
  let idx = 0;
  return html.replaceAll(
    /<li>(<input (?:checked="" )?disabled="" type="checkbox">)/g,
    (_match: string, input: string) => {
      const line = lineMap?.[idx] ?? idx;
      idx += 1;
      const withLine = input.replace(
        'type="checkbox"',
        `type="checkbox" data-line="${line}"`
      );
      return `<li class="task-list-item">${withLine}`;
    }
  );
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function isMermaidStart(line: string): boolean {
  return /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph)\b/.test(
    line
  );
}

function startsAtBlockBoundary(output: string[]): boolean {
  const previous = output[output.length - 1];
  return previous === undefined || previous.trim() === "";
}
