export function enhanceCodeBlocks(root: HTMLElement): () => void {
  const listeners: Array<[HTMLElement, EventListener]> = [];

  root.querySelectorAll<HTMLElement>("pre > code:not(.language-mermaid):not([data-language=\"mermaid\"])").forEach((code) => {
    const pre = code.parentElement;
    if (!pre || pre.parentElement?.classList.contains("code-frame")) return;

    const language = Array.from(code.classList)
      .find((name) => name.startsWith("language-"))
      ?.slice("language-".length) || "Text";
    const frame = document.createElement("div");
    const toolbar = document.createElement("div");
    const badge = document.createElement("span");
    const copy = document.createElement("button");
    const status = document.createElement("span");
    frame.className = "code-frame";
    toolbar.className = "code-toolbar";
    badge.className = "code-language";
    badge.textContent = language;
    copy.className = "code-copy";
    copy.type = "button";
    copy.textContent = "Copy";
    copy.setAttribute("aria-label", `Copy ${language} code`);
    status.className = "code-copy-status";
    status.setAttribute("aria-live", "polite");
    toolbar.append(badge, copy, status);
    pre.replaceWith(frame);
    frame.append(toolbar, pre);

    const onCopy = () => {
      void copyCode(code.textContent ?? "").then((copied) => {
        if (!root.contains(copy)) return;
        status.textContent = copied ? "Copied." : "Could not copy code.";
      });
    };
    copy.addEventListener("click", onCopy);
    listeners.push([copy, onCopy]);
  });

  return () => listeners.forEach(([button, listener]) => button.removeEventListener("click", listener));
}

async function copyCode(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Try the WebView's synchronous clipboard fallback below.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
