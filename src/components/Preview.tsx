import mermaid from "mermaid";
import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ask } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { highlightText } from "../lib/highlight";
import { classifyHref } from "../lib/links";
import { renderMarkdown, sanitizeMermaidSvg } from "../lib/markdown";

type PreviewProps = {
  markdown: string;
  filePath: string | null;
  theme: "light" | "dark";
  searchQuery: string;
  allowRemoteImages?: boolean;
};

export function Preview({ markdown, filePath, theme, searchQuery, allowRemoteImages = false }: PreviewProps) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    renderMarkdown(markdown, { allowRemoteImages })
      .then((nextHtml) => {
        if (!cancelled) {
          setHtml(nextHtml);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Markdown rendering failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [allowRemoteImages, markdown]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) {
      return;
    }

    root.querySelectorAll("img[src]").forEach((image) => {
      const element = image as HTMLImageElement;
      const src = element.getAttribute("src");
      if (!src || !filePath || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("/")) {
        return;
      }

      const base = filePath.split(/[\\/]/).slice(0, -1).join("/");
      const normalized = `${base}/${src}`;
      element.src = convertFileSrc(normalized);
    });

    root.querySelectorAll("pre code.language-mermaid").forEach((node, index) => {
      const code = node.textContent ?? "";
      const host = document.createElement("div");
      host.className = "mermaid-host";
      host.textContent = code;
      node.parentElement?.replaceWith(host);

      mermaid
        .render(`mdview-mermaid-${index}-${Date.now()}`, code)
        .then(({ svg }) => {
          host.innerHTML = sanitizeMermaidSvg(svg);
        })
        .catch((cause: unknown) => {
          host.className = "mermaid-error";
          host.textContent = cause instanceof Error ? cause.message : "Mermaid diagram failed";
        });
    });
    highlightText(root, searchQuery);
  }, [html, filePath, theme, searchQuery]);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: theme === "dark" ? "dark" : "default"
    });
  }, [theme]);

  async function onClick(event: React.MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as Element).closest("a[href]");
    if (!anchor) {
      return;
    }
    event.preventDefault();

    const href = anchor.getAttribute("href") ?? "";
    const classified = classifyHref(href);
    if (classified.kind === "external") {
      const confirmed = await ask(`Open this external link?\n\n${classified.href}`, {
        title: "Open external link?",
        kind: "warning"
      });

      if (confirmed) {
        await openUrl(classified.href);
      }
    } else if (classified.kind === "anchor") {
      document.querySelector(classified.href)?.scrollIntoView({ block: "start" });
    }
  }

  if (error) {
    return <pre className="render-error">{error}</pre>;
  }

  return (
    <article
      className="preview markdown-body"
      ref={containerRef}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
