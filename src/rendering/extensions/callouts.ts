import type { Token } from "marked";

const calloutTypes: Record<string, string> = {
  note: "note",
  abstract: "abstract", summary: "abstract", tldr: "abstract",
  info: "info",
  todo: "todo",
  tip: "tip", hint: "tip", important: "tip",
  success: "success", check: "success", done: "success",
  question: "question", help: "question", faq: "question",
  warning: "warning", caution: "warning", attention: "warning",
  failure: "failure", fail: "failure", missing: "failure",
  danger: "danger", error: "danger",
  bug: "bug",
  example: "example",
  quote: "quote", cite: "quote"
};

type CalloutToken = Token & {
  calloutType: string;
  fold: string;
  title: string;
  tokens: Token[];
};

export function createCalloutExtension(escapeAttribute: (value: string) => string) {
  return {
    name: "callout",
    level: "block" as const,
    start(src: string) {
      const idx = src.indexOf("> [!");
      return idx >= 0 ? idx : undefined;
    },
    tokenizer(src: string) {
      const match = /^>[\t ]?\[!([^\]\r\n]+)\]([+-]?)(?:[\t ]+(.*))?[\t ]*(?:\r?\n((?:>[\t ]?[^\r\n]*(?:\r?\n|$))*))?/.exec(src);
      if (!match) return undefined;
      const originalType = match[1].trim().toLowerCase();
      if (!originalType) return undefined;
      const calloutType = calloutTypes[originalType] ?? "note";
      const body = (match[4] ?? "").replace(/^>[\t ]?/gm, "");
      const bodyTokens = body
        ? (this as unknown as { lexer: { blockTokens: (value: string) => Token[] } }).lexer.blockTokens(body)
        : [];
      return {
        type: "callout",
        raw: match[0],
        calloutType,
        fold: match[2] || "",
        title: match[3]?.trim() || originalType,
        tokens: bodyTokens
      };
    },
    renderer(this: { parser: { parse: (tokens: Token[]) => string } }, token: unknown) {
      const t = token as CalloutToken;
      const bodyHtml = t.tokens?.length ? this.parser.parse(t.tokens) : "";
      const type = escapeAttribute(t.calloutType);
      const title = escapeAttribute(t.title);
      if (t.fold === "+" || t.fold === "-") {
        const open = t.fold === "+" ? " open" : "";
        return `<details class="callout callout-${type}" data-callout="${type}" data-fold="${t.fold}"${open}><summary class="callout-title">${title}</summary><div class="callout-body">${bodyHtml}</div></details>\n`;
      }
      return `<div class="callout callout-${type}" data-callout="${type}" data-fold=""><div class="callout-title">${title}</div><div class="callout-body">${bodyHtml}</div></div>\n`;
    }
  };
}
