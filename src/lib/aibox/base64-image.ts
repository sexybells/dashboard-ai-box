const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif"
};

export function stripImageDataUri(value: string): string {
  return value.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
}

export function getImageContentType(extension: string): string {
  return CONTENT_TYPES[extension.toLowerCase()] || "application/octet-stream";
}
