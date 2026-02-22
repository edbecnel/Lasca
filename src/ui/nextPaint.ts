export async function nextPaint(frames: number = 2): Promise<void> {
  const n = Math.max(1, Math.floor(frames));
  for (let i = 0; i < n; i++) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}
