import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "public", "pieces", "raster3d", "source.png");
const OUT_DIR = path.join(ROOT, "public", "pieces", "raster3d");

// Sprite layout (8 columns x 2 rows):
// Top row: black pieces; bottom row: white pieces.
// Columns (0..7):
//   0 = short pawn, 1 = tall pawn, 2 = knight, 3 = bishop, 4 = rook,
//   5 = short queen, 6 = tall queen, 7 = king
// Requested:
//  - Use tall pawn (col 1)
//  - Use tall queen (col 6)
const PIECES = [
  // Chess
  { out: "B_P.png", row: 0, col: 1 },
  { out: "B_N.png", row: 0, col: 2 },
  { out: "B_B.png", row: 0, col: 3 },
  { out: "B_R.png", row: 0, col: 4 },
  { out: "B_Q.png", row: 0, col: 6 },
  { out: "B_K.png", row: 0, col: 7 },

  { out: "W_P.png", row: 1, col: 1 },
  { out: "W_N.png", row: 1, col: 2 },
  { out: "W_B.png", row: 1, col: 3 },
  { out: "W_R.png", row: 1, col: 4 },
  { out: "W_Q.png", row: 1, col: 6 },
  { out: "W_K.png", row: 1, col: 7 },
];

function usageAndExit(msg) {
  if (msg) console.error(msg);
  console.error("\nUsage:\n  1) Save the provided sprite as: public/pieces/raster3d/source.png\n  2) Run: npm run pieces:raster3d\n\nThis will write: W_*.png and B_*.png into public/pieces/raster3d/");
  process.exit(1);
}

const exists = async (p) => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

if (!(await exists(SRC))) {
  usageAndExit(`Missing sprite: ${SRC}`);
}

await fs.mkdir(OUT_DIR, { recursive: true });

const input = sharp(SRC, { failOn: "none" });
const meta = await input.metadata();

if (!meta.width || !meta.height) {
  usageAndExit("Could not read sprite dimensions.");
}

const cols = 8;
const rows = 2;

const cellW = Math.floor(meta.width / cols);
const cellH = Math.floor(meta.height / rows);

if (cellW <= 0 || cellH <= 0) {
  usageAndExit(`Invalid cell size computed: ${cellW}x${cellH}`);
}

// Output size: keep it reasonably high-res for crisp scaling in SVG.
const OUT_SIZE = 256;

const tasks = PIECES.map(async (p) => {
  const left = p.col * cellW;
  const top = p.row * cellH;

  const outPath = path.join(OUT_DIR, p.out);

  await sharp(SRC, { failOn: "none" })
    .extract({ left, top, width: cellW, height: cellH })
    .resize(OUT_SIZE, OUT_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);

  return outPath;
});

const written = await Promise.all(tasks);

console.log("Wrote raster3d piece files:");
for (const f of written) console.log("-", path.relative(ROOT, f));
console.log("\nNote: W_S/B_S/W_O/B_O are still optional and will fall back to vector discs if missing.");
