export type ClassifiedHref =
  | { kind: "anchor"; href: string }
  | { kind: "external"; href: string }
  | { kind: "local"; href: string; path: string; heading?: string }
  | { kind: "file"; href: string }
  | { kind: "blocked"; href: string };

const allowedExternalProtocols = new Set(["http:", "https:"]);
const markdownLikeExtension = /\.(?:md|markdown|mdown|mkd|txt|text)$/i;

export function classifyHref(href: string): ClassifiedHref {
  const trimmed = href.trim();
  if (!trimmed) return { kind: "blocked", href };
  if (trimmed.startsWith("#")) return { kind: "anchor", href: trimmed };

  try {
    const parsed = new URL(trimmed);
    if (allowedExternalProtocols.has(parsed.protocol)) return { kind: "external", href: parsed.toString() };
    if (parsed.protocol === "file:") return { kind: "file", href: parsed.toString() };
    return { kind: "blocked", href: trimmed };
  } catch {
    // Relative document links are sent to Rust only after an explicit click.
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
    return /^file:/i.test(trimmed)
      ? { kind: "file", href: trimmed }
      : { kind: "blocked", href: trimmed };
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("\\") || trimmed.startsWith("//") || trimmed.includes("?")) {
    return { kind: "blocked", href: trimmed };
  }

  const fragmentIndex = trimmed.indexOf("#");
  const path = fragmentIndex < 0 ? trimmed : trimmed.slice(0, fragmentIndex);
  const rawHeading = fragmentIndex < 0 ? undefined : trimmed.slice(fragmentIndex + 1);
  if (!path || !markdownLikeExtension.test(path)) return { kind: "blocked", href: trimmed };
  return { kind: "local", href: trimmed, path, heading: rawHeading };
}
