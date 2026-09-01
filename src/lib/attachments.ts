const imageExts = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "svg",
  "bmp",
  "tiff",
  "ico",
]);

export type AttachmentKind = "image" | "file";

export function classifyAttachment(name: string): AttachmentKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return imageExts.has(ext) ? "image" : "file";
}

export function relativePosix(fromFile: string, toFile: string): string {
  const fromDir = fromFile.split(/[\\/]/).slice(0, -1).join("/");
  if (!fromDir) {
    return toFile.split(/[\\/]/).pop() ?? toFile;
  }
  const normalizedFrom = fromDir.replaceAll("\\", "/");
  const normalizedTo = toFile.replaceAll("\\", "/");
  if (normalizedTo.startsWith(normalizedFrom + "/")) {
    return normalizedTo.slice(normalizedFrom.length + 1);
  }
  return normalizedTo;
}

export function markdownForAttachment(
  kind: AttachmentKind,
  relPath: string,
  name: string
): string {
  if (kind === "image") {
    return `![${name}](${relPath})`;
  }
  return `[${name}](${relPath})`;
}

export function sanitizeAttachmentName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "attachment";
}
