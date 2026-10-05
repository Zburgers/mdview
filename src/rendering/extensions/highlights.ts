import type { Token } from "marked";

export const highlightExtension = {
  name: "highlight",
  level: "inline" as const,
  start(src: string) {
    const idx = src.indexOf("==");
    return idx >= 0 ? idx : undefined;
  },
  tokenizer(this: { lexer: { inlineTokens: (value: string) => Token[] } }, src: string) {
    const match = /^==([^=\n](?:[\s\S]*?[^=\n])?)==/.exec(src);
    if (!match || !match[1].trim()) return undefined;
    return {
      type: "highlight",
      raw: match[0],
      tokens: this.lexer.inlineTokens(match[1])
    };
  },
  renderer(this: { parser: { parseInline: (tokens: Token[]) => string } }, token: unknown) {
    const t = token as { tokens: Token[] };
    return `<mark>${this.parser.parseInline(t.tokens)}</mark>`;
  }
};
