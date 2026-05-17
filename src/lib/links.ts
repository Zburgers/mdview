export type ClassifiedHref =
  | { kind: "anchor"; href: string }
  | { kind: "external"; href: string }
  | { kind: "file"; href: string }
  | { kind: "blocked"; href: string };

const allowedExternalProtocols = new Set(["http:", "https:", "mailto:"]);

export function classifyHref(href: string): ClassifiedHref {
  const trimmed = href.trim();

  if (!trimmed) {
    return { kind: "blocked", href };
  }

  if (trimmed.startsWith("#")) {
    return { kind: "anchor", href: trimmed };
  }

  try {
    const parsed = new URL(trimmed);
    if (allowedExternalProtocols.has(parsed.protocol)) {
      return { kind: "external", href: parsed.toString() };
    }
    if (parsed.protocol === "file:") {
      return { kind: "file", href: parsed.toString() };
    }
  } catch {
    if (!trimmed.includes(":")) {
      return { kind: "file", href: trimmed };
    }
  }

  return { kind: "blocked", href: trimmed };
}
