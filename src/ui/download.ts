// Small helper for downloading a blob as a file.
// (Used by save/load. Kept dependency-free and safe to import in non-DOM contexts.)

export function downloadBlob(filename: string, blob: Blob): void {
  // In environments without a DOM (e.g. workers), just no-op.
  if (typeof document === "undefined") return;

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
