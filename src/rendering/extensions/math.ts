import katex from "katex";
import { sanitizeKaTeXHtml } from "../security";
import type { RenderSession } from "../parser";

const MAX_MATH_SIZE = 100;
const MAX_MATH_EXPAND = 500;

export function createMathExtensions(
  session: RenderSession,
  escapeAttribute: (value: string) => string
) {
  const renderMath = (math: string, displayMode: boolean) => {
    const placeholder = `${session.mathPrefix}${session.nextMathIndex++}__`;
    const rendered = katex.renderToString(math, {
      displayMode,
      output: "html",
      throwOnError: false,
      trust: false,
      maxSize: MAX_MATH_SIZE,
      maxExpand: MAX_MATH_EXPAND
    });
    session.math.set(placeholder, sanitizeKaTeXHtml(rendered));
    return placeholder;
  };

  return [
    {
      name: "mathInline",
      level: "inline" as const,
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
        return `<span class="math-inline" data-math="${escapeAttribute(math)}">${renderMath(math, false)}</span>`;
      }
    },
    {
      name: "mathBlock",
      level: "block" as const,
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
        return `<div class="math-block" data-math="${escapeAttribute(math)}">${renderMath(math, true)}</div>\n`;
      }
    }
  ];
}
