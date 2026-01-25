# Lasca

A browser-based implementation of Lasca (also known as Laska), the strategic board game invented by World Chess Champion Emanuel Lasker in 1911.

## About

This project implements three checkers variants:

### Lasca (7×7 and 8×8)

Lasca is a two-player checkers variant with unique stacking mechanics. When a piece captures an opponent's piece, it forms a stack (called a "column") with the captured piece underneath. The top piece controls the stack, and captured pieces can be liberated when their stack is captured.

- Play on classic 7×7 board or Lasca 8×8 variant
- Soldiers move forward; Officers move diagonally any direction
- Captured pieces form stacks rather than leaving the board

### Dama (8×8)

Traditional checkers/draughts with two rule variants:

- **Standard**: Captured pieces removed immediately during multi-capture sequences
- **International**: Captured pieces remain on board until sequence completes
- Men move forward diagonally; Kings have "flying" movement (any distance diagonally)
- Save files are compatible between Standard and International variants
- Mandatory capture with maximum-capture rule (must take the longest capture sequence)

### Damasca (8×8)

Damasca combines Dama-style movement with Lasca-style stacking captures:

- Dama-style movement (including flying Officers)
- Lasca-style stacking captures (jump takes top piece only and adds it to the bottom of the capturing stack)
- Mandatory capture + multi-capture + maximum-capture priority
- Promotion is applied at end of turn / end of capture chain (no mid-chain king powers)

## Features

- ✨ Interactive board with drag-free click-to-move gameplay
- 🎯 Move hints showing capture targets and landing positions
- ⏮️ Full undo/redo with move history tracking
- 💾 Save and load games (JSON format)
  - Multiple themes (Classic, Wooden, and others)
- 📊 Stack inspector showing piece composition
- 🎮 Game over detection with win conditions
- 🔄 Multi-capture sequences with anti-loop protection
- 🏳️ Resign option with confirmation dialog
- 🆕 New Game button to start fresh
- ♾️ Threefold repetition draw detection (toggleable)
- 🎬 Smooth piece animations with toggle control
- 📝 Move notation display (r0c0 → r1c1 format)
- 💾 Export move history to JSON format
- 🤖 Optional AI opponents (Beginner / Intermediate / Expert per color)
- ⚖ Evaluation indicators (advantage / controlled stacks / material)
- 🧭 Start Page launcher to configure options before playing
- 🌐 Online multiplayer (2 players) via Start Page (Create/Join rooms)
- 📋 Lobby list of open rooms (one-click Join)
- 🆔 Room ID shown in-game (Info → Online) with one-click copy
- 📱 Mobile board-height adjust button (tap to toggle; touch-hold + drag to move)

## How to Play

### Starting the Game

1. Run the dev server with `npm start` (it opens the Start Page at `src/index.html`)
2. Choose options (theme, startup toggles, AI), then click **Launch**

#### Online multiplayer (Create / Join)

1. Start the online dev server + client with `npm run online:dev`

- Client: `http://localhost:8080/`
- Server: `http://localhost:8788/`

Note: if `8080` is already in use, Vite will pick another port (often `8081`). Use the URL printed in your terminal.

2. On the Start Page, set **Play mode** to **Online**.
3. Player 1 chooses **Create** and clicks **Launch**.
4. In-game, copy the **Room ID** from **Info → Online** (copy button next to “Room ID”).
5. Player 2 goes to the Start Page, chooses **Join**, pastes the Room ID, and clicks **Launch**.

Note: when joining, the Start Page will auto-open the correct variant page for that room.

Alternative: use the Start Page **Lobby** section to see open rooms and click **Join** on a row (auto-fills the Room ID and launches).

##### Leaving an online game

- If you want to leave cleanly and release your seat, use the in-game **Leave room (forfeit)** button. It confirms first, then ends the game immediately (counts as resign) and returns you to the Start Page.
- If you simply close the tab, the server starts a short disconnect grace period. If you don’t return in time, the server will end the game by disconnect timeout.

##### Online troubleshooting

- **Ports already in use**: the online client uses `8080` and the online server uses `8788`. If `npm run online:dev` fails to start, stop anything else listening on those ports.
  - Windows PowerShell example:
    - `Get-NetTCPConnection -LocalPort 8788,8080 | Select-Object -ExpandProperty OwningProcess -Unique`
    - `Stop-Process -Id <PID> -Force`
- **Client is on 8081 (or similar)**: Vite will automatically choose a new port if `8080` is busy. Check the terminal output for the actual client URL.
- **Changes not taking effect**: make sure you restarted the online server (and client) after pulling new code; stale node processes can keep old behavior running.
- **Room ID copy doesn’t work**: clipboard writes usually require a secure context (HTTPS or `http://localhost`) and may prompt for permission. If the button fails, you can still select/copy the Room ID text manually.
- **Joined the wrong variant**: always join from the Start Page’s **Online → Join** flow. Opening a variant page directly (e.g. `src/lasca.html`) and then trying to “join” a room from another variant can cause confusing behavior.
- **Opponent’s moves don’t show up**: refresh the page and confirm both players are pointing at the same **Server URL** on the Start Page. Some networks/extensions can interfere with Server-Sent Events (SSE).

Alternatively, you can open `src/lasca.html` directly to jump straight into the game.

### Basic Rules

- **Movement**: Soldiers move forward diagonally one square. Officers move diagonally in any direction.
- **Captures**: Pieces jump over enemy pieces diagonally, landing two squares away. (In Lasca/Damasca, captured pieces stack under the capturer; in Dama, captured pieces are removed.)
- **Promotion**: Soldiers promote to Officers at the end of the turn. During capture chains, the piece continues as a Soldier; if it reaches the far edge at any point in the chain, it promotes when the chain ends.
- **Multi-captures**: If more captures are available, you must continue capturing.
- **Mandatory Capture**: If captures are available, you must capture.
- **Anti-loop Rule**: During multi-capture, you cannot jump over the same square twice.

### Winning

You win when your opponent has:

- No pieces on top of any stacks, OR
- No legal moves available

For detailed rules and strategy tips, see [Help](src/help.html).

If you want help using the Start Page itself (launcher UI), see [Start Page Help](src/start-help.html).

### AI and Evaluation

- **AI (Game Panel → AI):** Set White and/or Black to an AI difficulty. If both sides are AI, the game can auto-play.
- **Speed:** Adjusts the pause between AI moves.
- **Pause / Step:** Pause AI play, or step a single move when both sides are AI.
- **Evaluation (Info panel → Evaluation):** Choose what to display using the icon buttons (hover for tooltips):
  - ⚖ Advantage (estimate)
  - ▦ Controlled stacks
  - ⛀ Material (all pieces)

### Move Notation and Export

#### Move History Display

The Move History section (in the Info panel, below the Lasca Stack Inspector) shows each move in algebraic notation.

- Click any entry (including "Start") to jump to that point in the game.
- When you Undo/Redo or jump, the list scrolls to keep the current entry visible.
- When you play moves normally, it auto-scrolls so the latest move stays visible.

- **Quiet moves**: `1. ⚪ D3 → E4` (start → destination)
- **Captures**: `1. ⚫ F6 × E5` (using × symbol)
- **Multi-captures**: `2. ⚪ D3 × F5 × H7` (full path when available)

Move numbers follow chess convention: each full turn (White + Black) is one move number.

#### Export Move History

Click "Export Move History" to download a JSON file containing all moves:

```json
{
  "game": "Lasca",
  "date": "2025-12-24T10:30:00.000Z",
  "moves": [
    {
      "moveNumber": 1,
      "player": "White",
      "notation": "D3 → E4"
    },
    {
      "moveNumber": 1,
      "player": "Black",
      "notation": "F6 × E5"
    }
  ]
}
```

This format is useful for:

- Recording games for publication
- Analyzing game patterns
- Sharing games with other players
- Potential import into other Lasca game engines

## Development

### Multiplayer checklist

For the current online-multiplayer implementation status and next milestones, see [docs/multiplayer-checklist.md](docs/multiplayer-checklist.md).

### Prerequisites

- Node.js 18+
- npm or pnpm

### Setup

```bash
npm install
```

### Commands

- `npm start` - Start development server with hot reload
- `npm run online:dev` - Start online server + client (2-player online play)
- `npm run build` - Build for production
- `npm test` - Run test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run preview` - Preview production build
- `npm run deploy` - Deploy to GitHub Pages

### Project Structure

```
src/
├── game/           # Game logic (rules, moves, state)
├── render/         # SVG rendering and animations
├── controller/     # Game controller and interaction
├── ui/             # UI components (inspector, theme selector)
├── theme/          # Theme management
└── assets/         # SVG board and piece definitions
```

## Technology Stack

- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server
- **Vitest** - Unit testing framework
- **SVG** - Vector graphics for scalable rendering

## Testing

The project includes comprehensive unit tests covering:

- Move generation (captures, quiet moves)
- Move application and state transitions
- Promotion logic
- Game over detection
- Stack mechanics
- Save/load functionality

Run tests with:

```bash
npm test
```

## Browser Compatibility

Modern browsers with ES2020+ support:

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Customization

### Theme Colors

In `src/lasca.html`, adjust CSS variables in `:root`:

```css
--themeMenuBg: rgba(0, 0, 0, 0.88);
--themeMenuHoverBg: rgba(255, 255, 255, 0.1);
--themeMenuSelectedBg: rgba(255, 255, 255, 0.16);
--themeMenuText: rgba(255, 255, 255, 0.92);
--themeMenuBorder: rgba(255, 255, 255, 0.18);
```

## License

MIT

## Changelog

### Version 1.0 (2025-12-24)

#### Initial Release

- Complete Lasca game implementation
- Interactive board with click-to-move
- Move hints with capture visualization
- Undo/redo with move history
- Save/load game functionality with clean session behavior
- Multiple themes
- Stack inspector
- Game over detection
- Anti-loop capture rule
- Full test coverage

#### Recent Updates

- Added **Resign** button with confirmation dialog
- Added **New Game** button to restart with fresh state
- Implemented **threefold repetition draw** detection
  - Same board position occurring 3 times results in a draw
  - Toggleable via the Options section in the Game Panel
  - Prevents infinite game loops
- Added **smooth piece animations** using Web Animations API
  - Animates all moves including captures and multi-capture chains
  - Toggleable via the Options section in the Game Panel (default: on)
- Implemented **move notation display** in Move History
  - Shows algebraic notation with → for moves, × for captures
  - Clean display for multi-capture chains (no repeated nodes)
- Added **Export Move History** feature
  - Downloads JSON file with game metadata and all moves
  - Includes move number, player, and notation for each move
- Improved save/load behavior to reset game state properly
- Enhanced deployment configuration for GitHub Pages
- Fixed Help link to open in new tab (preserves game state)
- Added a **Start Page** launcher (`src/index.html`) for configuring theme / options / AI before launching
- Added **Start Page Help** (`src/start-help.html`) and context-aware navigation between help pages

For example: Change --themeMenuBg to try different backgrounds.

## Notes

- The default entry HTML is `src/index.html` (Start Page), which loads `src/indexMain.ts`.
- The Lasca game page is `src/lasca.html`, which loads `src/main.ts`.
- If you prefer, you can also open `src/lasca.html` directly in a browser, but using a local server avoids potential file URL quirks.
