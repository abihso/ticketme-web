// JPG and JPEG use the same standard MIME type. Some pickers omit the type.
export function coverImageType(type: string | null | undefined, name: string): string {
  const normalized = type?.toLowerCase();
  if (normalized === "image/jpg") return "image/jpeg";
  if (normalized && normalized !== "application/octet-stream") return normalized;
  const extension = name.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<string, string>)[extension ?? ""] ?? "";
}
