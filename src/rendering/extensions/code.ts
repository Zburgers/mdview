import hljs from "highlight.js/lib/common";
import type { Tokens } from "marked";

export function createCodeRenderer(escapeAttribute: (value: string) => string) {
  return {
    code(token: Tokens.Code): string {
      const rawLanguage = token.lang?.trim().split(/\s+/, 1)[0] ?? "";
      const language = rawLanguage.toLowerCase();
      const grammar = language ? hljs.getLanguage(language) : undefined;
      const safeLanguage = grammar || language === "mermaid" ? language : "plaintext";
      const source = token.text;
      const content = grammar
        ? hljs.highlight(source, { language, ignoreIllegals: true }).value
        : escapeText(source);
      const dataLanguage = rawLanguage
        ? ` data-language="${escapeAttribute(rawLanguage)}"`
        : "";
      return `<pre><code class="hljs language-${safeLanguage}"${dataLanguage}>${content}</code></pre>\n`;
    }
  };
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
