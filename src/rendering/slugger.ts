export class Slugger {
  private readonly seen = new Set<string>();

  slug(value: string): string {
    const base = value
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, "")
      .trim()
      .replace(/[\s-]+/g, "-") || "section";
    let candidate = base;
    let suffix = 0;
    while (this.seen.has(candidate)) candidate = `${base}-${++suffix}`;
    this.seen.add(candidate);
    return candidate;
  }
}
