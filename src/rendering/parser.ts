import { Marked, Renderer, type Token } from "marked";
import markedFootnote from "marked-footnote";
import { createCalloutExtension } from "./extensions/callouts";
import { createCodeRenderer } from "./extensions/code";
import { highlightExtension } from "./extensions/highlights";
import { createMathExtensions } from "./extensions/math";
import { Slugger } from "./slugger";
import { preserveSourceLayout, sourceLayoutExtensions } from "./sourceLayout";
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
  sourceMarkerPrefix: string;
  sourceLines: number[];
};

export function createRenderSession(markdown: string): RenderSession {
  let mathPrefix = "__MDVIEW_KATEX_";
  while (markdown.includes(mathPrefix)) mathPrefix += "_";
  let headingMarkerPrefix = "__MDVIEW_HEADING_";
  while (markdown.includes(headingMarkerPrefix)) headingMarkerPrefix += "_";
  let sourceMarkerPrefix = "__MDVIEW_SOURCE_";
  while (markdown.includes(sourceMarkerPrefix)) sourceMarkerPrefix += "_";
  return {
    markdown,
    headings: [],
    resources: [],
    diagnostics: [],
    math: new Map(),
    slugger: new Slugger(),
    mathPrefix,
    nextMathIndex: 0,
    headingMarkerPrefix,
    sourceMarkerPrefix,
    sourceLines: []
  };
}

export function createRenderParser(session: RenderSession): Marked {
  const parser = new Marked({ async: false, breaks: true, gfm: true });
  parser.use({
    hooks: { processAllTokens: (tokens) => preserveSourceLayout(tokens, session.sourceLines) },
    renderer: {
      ...createCodeRenderer(escapeAttribute),
      listitem(token) {
        const line = (token as typeof token & { sourceLine?: number }).sourceLine;
        const html = Renderer.prototype.listitem.call(this, token);
        if (line === undefined) return html;
        const task = token.task ? ` ${session.sourceMarkerPrefix}TASK` : "";
        return html.replace(/^<li>/, `<li class="${session.sourceMarkerPrefix}${line}${task}">`);
      },
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
      ...sourceLayoutExtensions(session.sourceMarkerPrefix),
      createCalloutExtension(escapeAttribute),
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
      highlightExtension,
      ...createMathExtensions(session, escapeAttribute)
    ]
  });
  parser.use(markedFootnote());
  return parser;
}

export function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function promoteStandaloneMermaid(markdown: string, sourceLines?: number[]): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let fence: { marker: string; length: number } | null = null;
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const fenceMarker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence || fenceMarker) {
      if (fence) {
        if (fenceMarker && fenceMarker[1][0] === fence.marker &&
            fenceMarker[1].length >= fence.length && !fenceMarker[2].trim()) fence = null;
      } else if (fenceMarker && (fenceMarker[1][0] !== "`" || !fenceMarker[2].includes("`"))) {
        fence = { marker: fenceMarker[1][0], length: fenceMarker[1].length };
      }
      output.push(line);
      sourceLines?.push(index);
      index += 1;
      continue;
    }
    if (isMermaidStart(line) && startsAtBlockBoundary(output)) {
      const block: string[] = [];
      const start = index;
      while (index < lines.length && lines[index].trim() !== "") block.push(lines[index++]);
      output.push("```mermaid");
      sourceLines?.push(start);
      block.forEach((line, offset) => {
        output.push(line);
        sourceLines?.push(start + offset);
      });
      output.push("```");
      sourceLines?.push(index - 1);
      continue;
    }
    output.push(line);
    sourceLines?.push(index);
    index += 1;
  }
  return output.join("\n");
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
  return /^ {0,3}(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph)\b/.test(line);
}

function startsAtBlockBoundary(output: string[]): boolean {
  const previous = output[output.length - 1];
  return previous === undefined || previous.trim() === "";
}
