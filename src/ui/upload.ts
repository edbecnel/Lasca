// Small helper for selecting a JSON file and reading it.
// Safe to import in workers (no DOM access at module load time).

export function uploadJsonFile(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("File upload not available in this environment"));
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        reject(new Error("No file selected"));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result ?? "");
          const json = JSON.parse(text);
          resolve(json);
        } catch (err) {
          reject(err);
        } finally {
          cleanup();
        }
      };
      reader.onerror = () => {
        cleanup();
        reject(reader.error ?? new Error("Failed to read file"));
      };
      reader.readAsText(file);
    });

    document.body.appendChild(input);
    input.click();
  });
}
