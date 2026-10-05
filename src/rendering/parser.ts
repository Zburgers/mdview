import katex from "katex";
import { Marked, type Token } from "marked";
import { sanitizeKaTeXHtml } from "./security";
import { Slugger } from "./slugger";
import type { HeadingEntry, RenderDiagnostic, RenderResource } from "./types";

export type RenderSession = {
  markdown: string;
  headings: HeadingEntry[];
  resources: RenderResource[];
  diagnostics: RenderDiagnostic[];
  math: Map<string, string>;
  slugger: Slugger;
  mathPrefix: string;
  nextMathIndex: number;
  headingMarkerPrefix: string;
};

export function createRenderSession(markdown: string): RenderSession {
  let mathPrefix = "__MDVIEW_KATEX_";
  while (markdown.includes(mathPrefix)) mathPrefix += "_";
  let headingMarkerPrefix = "__MDVIEW_HEADING_";
  while (markdown.includes(headingMarkerPrefix)) headingMarkerPrefix += "_";
  return {
    markdown,
    headings: [],
    resources: [],
    diagnostics: [],
    math: new Map(),
    slugger: new Slugger(),
    mathPrefix,
    nextMathIndex: 0,
    headingMarkerPrefix
  };
}

export function createRenderParser(session: RenderSession): Marked {
  const parser = new Marked({ async: false, breaks: true, gfm: true });
  parser.use({
    renderer: {
      heading(token) {
        const level = token.depth as HeadingEntry["level"];
        const rendered = this.parser.parseInline(token.tokens);
        const text = inlineTokenText(rendered);
        const id = session.slugger.slug(text);
        const ordinal = session.headings.length;
        session.headings.push({ id, text, level, ordinal });
        return `<h${level} class="${session.headingMarkerPrefix}${ordinal}">${rendered}</h${level}>\n`;
      }
    },
    walkTokens(token: Token) {
      if ((token.type === "image" || token.type === "link") && "href" in token) {
        const raw = token.href;
        session.resources.push({
          kind: token.type === "image" ? "image" : /^https?:\/\//i.test(raw) ? "remote-link" : "local-link",
          raw
        });
      }
    },
    extensions: [
      {
        name: "callout",
        level: "block",
        start(src: string) {
          const idx = src.indexOf("> [!");
          return idx >= 0 ? idx : undefined;
        },
        tokenizer(src: string) {
          const match = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]([+-]?)\s*(.*)\n((?:>.*\n?)*)/.exec(src);
          if (!match) return undefined;
          const calloutType = match[1].toLowerCase();
          const body = (match[4] || "").replace(/^>\s?/gm, "").trim();
          const bodyTokens = body
            ? (this as unknown as { lexer: { blockTokens: (value: string) => Token[] } }).lexer.blockTokens(body)
            : [];
          return {
            type: "callout",
            raw: match[0],
            calloutType,
            fold: match[2] || "",
            title: match[3]?.trim() || calloutType,
            tokens: bodyTokens
          };
        },
        renderer(token: unknown) {
          const t = token as { calloutType: string; fold: string; title: string; tokens: Token[] };
          const bodyHtml = t.tokens?.length ? this.parser.parse(t.tokens) : "";
          if (t.fold === "+" || t.fold === "-") {
            const open = t.fold === "+" ? " open" : "";
            return `<details class="callout callout-${escapeAttribute(t.calloutType)}" data-callout="${escapeAttribute(t.calloutType)}" data-fold="${escapeAttribute(t.fold)}"${open}><summary class="callout-title">${escapeAttribute(t.title)}</summary><div class="callout-body">${bodyHtml}</div></details>\n`;
          }
          return `<div class="callout callout-${escapeAttribute(t.calloutType)}" data-callout="${escapeAttribute(t.calloutType)}" data-fold=""><div class="callout-title">${escapeAttribute(t.title)}</div><div class="callout-body">${bodyHtml}</div></div>\n`;
        }
      },
      {
        name: "wikilink",
        level: "inline",
        start(src: string) {
          const idx = src.indexOf("[[");
          return idx >= 0 ? idx : undefined;
        },
        tokenizer(src: string) {
          const match = /^\[\[([^\]]+)\]\]/.exec(src);
          if (!match) return undefined;
          const [linkTarget, aliasText] = match[1].split("|", 2);
          const targetEnd = linkTarget.search(/[#^]/);
          const target = (targetEnd < 0 ? linkTarget : linkTarget.slice(0, targetEnd)).trim();
          if (!target) return undefined;
          const fragment = targetEnd < 0 ? "" : linkTarget.slice(targetEnd);
          const headingStart = fragment.startsWith("#") ? 1 : 0;
          const blockStart = fragment.indexOf("^");
          return {
            type: "wikilink",
            raw: match[0],
            target,
            alias: aliasText?.trim() || target,
            heading: headingStart ? fragment.slice(headingStart, blockStart < 0 ? undefined : blockStart).trim() : "",
            block: blockStart < 0 ? "" : fragment.slice(blockStart + 1).trim()
          };
        },
        renderer(token: unknown) {
          const t = token as { target: string; alias: string; heading: string; block: string };
          const slug = slugifyWikilink(t.target);
          const headingAttr = t.heading ? ` data-heading="${escapeAttribute(t.heading)}"` : "";
          const blockAttr = t.block ? ` data-block="${escapeAttribute(t.block)}"` : "";
          return `<a class="wikilink" data-wikilink="${escapeAttribute(t.target)}"${headingAttr}${blockAttr} href="#wikilink-${escapeAttribute(slug)}">${escapeAttribute(t.alias)}</a>`;
        }
      },
      {
        name: "mathInline",
        level: "inline",
        start(src: string) {
          const idx = src.indexOf("$");
          return idx >= 0 ? idx : undefined;
        },
        tokenizer(src: string) {
          if (src.startsWith("$$")) return undefined;
          const match = /^\$([^$\n]+?)\$/.exec(src);
          if (!match || !match[1].trim()) return undefined;
          return { type: "mathInline", raw: match[0], math: match[1] };
        },
        renderer(token: unknown) {
          const math = (token as { math: string }).math;
          return `<span class="math-inline" data-math="${escapeAttribute(math)}">${renderMathPlaceholder(session, math, false)}</span>`;
        }
      },
      {
        name: "mathBlock",
        level: "block",
        start(src: string) {
          const idx = src.indexOf("$$");
          return idx >= 0 ? idx : undefined;
        },
        tokenizer(src: string) {
          const match = /^\$\$([\s\S]+?)\$\$/.exec(src);
          return match ? { type: "mathBlock", raw: match[0], math: match[1].trim() } : undefined;
        },
        renderer(token: unknown) {
          const math = (token as { math: string }).math;
          return `<div class="math-block" data-math="${escapeAttribute(math)}">${renderMathPlaceholder(session, math, true)}</div>\n`;
        }
      }
    ]
  });
  return parser;
}

export function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function promoteStandaloneMermaid(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let inFence = false;
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      output.push(line);
      index += 1;
      continue;
    }
    if (!inFence && isMermaidStart(line) && startsAtBlockBoundary(output)) {
      const block: string[] = [];
      while (index < lines.length && lines[index].trim() !== "") block.push(lines[index++]);
      output.push("```mermaid", ...block, "```");
      continue;
    }
    output.push(line);
    index += 1;
  }
  return output.join("\n");
}

function renderMathPlaceholder(session: RenderSession, math: string, displayMode: boolean): string {
  const placeholder = `${session.mathPrefix}${session.nextMathIndex++}__`;
  const rendered = katex.renderToString(math, { displayMode, output: "html", throwOnError: false, trust: false });
  session.math.set(placeholder, sanitizeKaTeXHtml(rendered));
  return placeholder;
}

function inlineTokenText(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script, style").forEach((element) => element.remove());
  return document.body.textContent ?? "";
}

function slugifyWikilink(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isMermaidStart(line: string): boolean {
  return /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph)\b/.test(line);
}

function startsAtBlockBoundary(output: string[]): boolean {
  const previous = output[output.length - 1];
  return previous === undefined || previous.trim() === "";
}
