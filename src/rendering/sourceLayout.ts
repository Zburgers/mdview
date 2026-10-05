import type { Token, Tokens, TokensList } from "marked";

type LayoutToken = { type: "sourceAnchor"; raw: string; line: number } | { type: "blankLine"; raw: string };

// Work on block tokens after lexing: inserting text before lexing would change
// lists, fenced code, tables, and the original task-checkbox line numbers.
export function preserveSourceLayout(
  tokens: Token[] | TokensList,
  sourceLines: readonly number[] = [],
  startLine = 0,
  anchors = true,
  trailingNewlines?: number
): Token[] | TokensList {
  const output: (Token | LayoutToken)[] = [];
  let line = startLine;
  let pendingNewlines = 0;
  let firstBlankLine = 0;
  let hasContent = false;
  const sourceLine = (line: number) => sourceLines[line] ?? sourceLines.at(-1) ?? line;

  function addBlankLines() {
    const skipped = hasContent ? 1 : 0;
    const count = Math.max(0, pendingNewlines - skipped);
    const start = hasContent ? firstBlankLine : startLine;
    for (let index = 0; index < count; index++) {
      if (anchors) output.push({ type: "sourceAnchor", raw: "", line: sourceLine(start + index) });
      output.push({ type: "blankLine", raw: "" });
    }
    pendingNewlines = 0;
  }

  for (const token of tokens) {
    // marked-footnote prepends a synthetic token whose raw value is not source.
    if (token.type === "footnotes") {
      output.push(token);
      continue;
    }
    const newlines = (token.raw.match(/\n/g) ?? []).length;
    if (token.type === "space") {
      if (pendingNewlines === 0) firstBlankLine = hasContent ? line + 1 : line;
      pendingNewlines += newlines;
      line += newlines;
      continue;
    }
    addBlankLines();
    if (anchors) output.push({ type: "sourceAnchor", raw: "", line: sourceLine(line) });
    if (token.type === "list") {
      let itemLine = line;
      const list = token as Tokens.List;
      list.items.forEach((item, index) => {
        Object.assign(item, { sourceLine: sourceLine(itemLine) });
        const tail = item.raw.match(/(?:\n[\t ]*)+$/)?.[0] ?? "";
        const trailing = index < list.items.length - 1 ? (tail.match(/\n/g) ?? []).length : 0;
        preserveSourceLayout(item.tokens, sourceLines, itemLine, false, trailing);
        itemLine += (item.raw.match(/\n/g) ?? []).length;
      });
    } else if (token.type === "blockquote" || token.type === "callout") {
      preserveSourceLayout(token.tokens as Token[], sourceLines, line + (token.type === "callout" ? 1 : 0));
    }
    output.push(token);
    hasContent = true;
    line += newlines;
    const tail = token.raw.match(/(?:\n[\t ]*)+$/)?.[0] ?? "";
    pendingNewlines = (tail.match(/\n/g) ?? []).length;
    firstBlankLine = line - pendingNewlines + 1;
  }
  if (trailingNewlines !== undefined) pendingNewlines = trailingNewlines;
  addBlankLines();
  if (anchors) output.push({ type: "sourceAnchor", raw: "", line: sourceLine(line) });
  // Keep the lexer's links property, used by reference links and footnotes.
  tokens.length = 0;
  for (const token of output) tokens.push(token as Token);
  return tokens;
}

export function sourceLayoutExtensions(markerPrefix: string) {
  return [
    {
      name: "sourceAnchor",
      renderer(token: unknown) {
        return `<span class="${markerPrefix}${(token as { line: number }).line}"></span>`;
      }
    },
    {
      name: "blankLine",
      renderer() {
        return '<div class="markdown-blank-line"></div>';
      }
    }
  ];
}

export function assignSourceAnchors(html: string, markerPrefix: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("[class]").forEach((element) => {
    for (const className of Array.from(element.classList)) {
      if (!className.startsWith(markerPrefix)) continue;
      const line = Number(className.slice(markerPrefix.length));
      if (!Number.isInteger(line) || line < 0) continue;
      element.classList.remove(className);
      element.classList.add(element.tagName === "SPAN" ? "source-anchor" : "source-block");
      element.setAttribute("data-source-line", String(line));
    }
  });
  return document.body.innerHTML;
}
