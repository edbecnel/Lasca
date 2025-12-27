# Lasca

A browser-based implementation of Lasca (also known as Laska), the strategic board game invented by World Chess Champion Emanuel Lasker in 1911.

## About Lasca

Lasca is a two-player checkers variant played on a 7×7 board with unique stacking mechanics. When a piece captures an opponent's piece, it forms a stack (called a "column") with the captured piece underneath. The top piece controls the stack, and captured pieces can be liberated when their stack is captured.

## Features

- ✨ Interactive board with drag-free click-to-move gameplay
- 🎯 Move hints showing capture targets and landing positions
- ⏮️ Full undo/redo with move history tracking
- 💾 Save and load games (JSON format)
- 🎨 Multiple themes (Classic and High Contrast)
- 📊 Stack inspector showing piece composition
- 🎮 Game over detection with win conditions
- 🔄 Multi-capture sequences with anti-loop protection
- 🏳️ Resign option with confirmation dialog
- 🆕 New Game button to start fresh
- ♾️ Threefold repetition draw detection (toggleable)
- 🎬 Smooth piece animations with toggle control
- 📝 Move notation display (r0c0 → r1c1 format)
- 💾 Export move history to JSON format

## How to Play

### Starting the Game

1. Open `src/lasca.html` in a browser (or run the dev server with `npm start`)
2. White moves first from the bottom of the board
3. Click a piece to select it, then click a valid destination to move

### Basic Rules

- **Movement**: Soldiers move forward diagonally one square. Officers move diagonally in any direction.
- **Captures**: Pieces jump over enemy pieces diagonally, landing two squares away. Captured pieces go under the capturing piece.
- **Promotion**: Soldiers reaching the opposite end promote to Officers (marked with a star).
- **Multi-captures**: If more captures are available, you must continue capturing.
- **Mandatory Capture**: If captures are available, you must capture.
- **Anti-loop Rule**: During multi-capture, you cannot jump over the same square twice.

### Winning

You win when your opponent has:

- No pieces on top of any stacks, OR
- No legal moves available

For detailed rules and strategy tips, see [Help](src/help.html).

### Move Notation and Export

#### Move History Display

The Move History section (in the Game Panel) shows each move in algebraic notation:

- **Quiet moves**: `1. ⚪ r4c2 → r3c3` (start → destination)
- **Captures**: `1. ⚫ r2c4 × r3c3` (using × symbol)
- **Multi-captures**: `2. ⚪ r5c5 × r4c4 × r3c3` (showing full path without repeated nodes)

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
      "notation": "r4c2 → r3c3"
    },
    {
      "moveNumber": 1,
      "player": "Black",
      "notation": "r2c4 × r3c3"
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

### Prerequisites

- Node.js 18+
- npm or pnpm

### Setup

```bash
npm install
```

### Commands

- `npm start` - Start development server with hot reload
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

For example: Change --themeMenuBg to try different backgrounds.

## Notes

- The entry HTML is `src/lasca.html`, which loads `src/main.ts`.
- If you prefer, you can also open `src/lasca.html` directly in a browser, but using a local server avoids potential file URL quirks.
