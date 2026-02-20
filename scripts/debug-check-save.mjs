import fs from "node:fs";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node scripts/debug-check-save.mjs <path-to-save.json>");
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

function stable(serializedState) {
  const board = Array.isArray(serializedState?.board) ? serializedState.board : [];
  const entries = board
    .map(([k, stack]) => {
      const pieces = Array.isArray(stack) ? stack : [];
      const s = pieces.map((p) => `${p?.owner ?? "?"}${p?.rank ?? "?"}`).join(",");
      return [String(k), s];
    })
    .sort((a, b) => a[0].localeCompare(b[0]));

  return JSON.stringify({ toMove: serializedState?.toMove ?? null, board: entries });
}

function boardMap(serializedState) {
  const out = new Map();
  const board = Array.isArray(serializedState?.board) ? serializedState.board : [];
  for (const entry of board) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const k = String(entry[0]);
    const stack = Array.isArray(entry[1]) ? entry[1] : [];
    const s = stack.map((p) => `${p?.owner ?? "?"}${p?.rank ?? "?"}`).join(",");
    out.set(k, s);
  }
  return out;
}

function diffBoards(aState, bState, limit = 30) {
  const a = boardMap(aState);
  const b = boardMap(bState);
  const keys = new Set([...a.keys(), ...b.keys()]);
  const diffs = [];
  for (const k of Array.from(keys).sort((x, y) => x.localeCompare(y))) {
    const av = a.get(k) ?? "";
    const bv = b.get(k) ?? "";
    if (av !== bv) diffs.push({ square: k, a: av, b: bv });
    if (diffs.length >= limit) break;
  }
  return { aCount: a.size, bCount: b.size, diffs, truncated: diffs.length >= limit };
}

function diffCount(aState, bState) {
  const a = boardMap(aState);
  const b = boardMap(bState);
  const keys = new Set([...a.keys(), ...b.keys()]);
  let n = 0;
  for (const k of keys) {
    if ((a.get(k) ?? "") !== (b.get(k) ?? "")) n++;
  }
  return n;
}

console.log("meta", {
  saveVersion: data?.saveVersion ?? null,
  variantId: data?.variantId ?? null,
  rulesetId: data?.rulesetId ?? null,
  boardSize: data?.boardSize ?? null,
});

const hist = data?.history;
if (!hist) {
  console.log("noHistory", true);
  process.exit(0);
}

const states = Array.isArray(hist?.states) ? hist.states : [];
const idx = Number.isInteger(hist?.currentIndex) ? hist.currentIndex : null;
const notationLen = Array.isArray(hist?.notation) ? hist.notation.length : 0;

console.log("history", { statesLen: states.length, notationLen, currentIndex: idx });

const inRange = typeof idx === "number" && idx >= 0 && idx < states.length;
console.log("indexInRange", inRange);

const cur = data?.current;
const curSig = stable(cur);

if (inRange) {
  console.log("currentEqHistoryCurrent", curSig === stable(states[idx]));
  if (curSig !== stable(states[idx])) {
    const d = diffBoards(cur, states[idx], 40);
    console.log("diffCurrentVsHistoryCurrent", d);
  }
}

let match = -1;
for (let i = 0; i < states.length; i++) {
  if (stable(states[i]) === curSig) {
    match = i;
    break;
  }
}
console.log("firstMatchingHistoryIndex", match);

if (match >= 0 && idx !== match) {
  console.log("note", "saved currentIndex does not point at current snapshot");
}

// Heuristic: find the closest history snapshot by minimal board diffs.
let best = { index: -1, diffs: Infinity };
for (let i = 0; i < states.length; i++) {
  const n = diffCount(cur, states[i]);
  if (n < best.diffs) best = { index: i, diffs: n };
  if (best.diffs === 0) break;
}

console.log("closestHistorySnapshot", best);
if (best.index >= 0 && best.diffs > 0) {
  console.log("diffCurrentVsClosest", diffBoards(cur, states[best.index], 20));
}
