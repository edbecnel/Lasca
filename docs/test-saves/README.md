# Test Save Files

These JSON saves are designed to be loaded in the **Damasca** page: `damasca.html`.

## damasca-promotion-delayed-until-chain-ends.json

Demonstrates that a soldier does **not** promote until the capture chain ends.

- Side to move: **Dark**
- Expected: Dark has a forced 3-step capture chain `B5 -> D3 -> F1 -> H3`.
- During the chain, the moving piece remains a **soldier** after landing on the last rank (`F1`); it promotes only after the chain finishes.

## dama-promotion-delayed-until-chain-ends.json

Same idea as the Damasca test, but for the **Dama** page (`dama.html`).

- Side to move: **Dark**
- Expected forced chain: `B5 -> D3 -> F1 -> H3`
- Expected: after landing on `F1` mid-chain, Dark still must continue capturing; promotion should occur after the chain ends.

## How to load

- Open the Damasca page.
- Use the **Upload/Load** control (JSON file upload) and select one of the files below.

## Scenarios

### `damasca-zigzag-multicapture.json`

Purpose: verify **multi-capture continuation** and the **Officer zigzag restriction**.

Expected:

1. It is **Dark to move**.
2. Make the first capture with the Dark Officer:
   - `r2c2` over `r3c3` to `r4c4`
3. The game should force you to continue capturing.
4. From `r4c4`, you should **only** be offered the zigzag continuation:
   - Allowed: over `r5c3` to `r6c2` (direction changes)
   - Disallowed (should NOT appear): over `r5c5` to `r6c6` (same diagonal direction as the previous capture)

Notes:

- There is also a Light piece at **B7** (`r1c1`), so the starting position has a second possible capture line,
  but it is shorter; the **max-capture** rule should force the `r2c2 → r4c4` line.

### `damasca-no-rejump-square.json`

Purpose: verify **anti-loop**: you cannot jump the **same jumped square** twice in one capture chain.

Expected:

1. It is **Dark to move**.
2. Make the capture with the Dark Soldier:
   - `r2c2` over `r3c3` to `r4c4`
3. After landing on `r4c4`, note there is still a Light piece remaining on `r3c3`.
4. A backward recapture over `r3c3` back to `r2c2` would normally be possible, but it must be **disallowed** because `r3c3` was already jumped this turn.

If you want a save that also tests **max-capture choice** (two different capture lines with different totals), say so and I’ll add one.
