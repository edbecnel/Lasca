# Lasca – Local Run

A minimal setup to run the static Lasca board locally in your browser.

## Prerequisites

- Node.js 18+ recommended

## Quick Start

```bash
npm install
npm run dev
```

Then open http://localhost:8080/lasca.html

This serves the `src/` folder and disables caching.

## Build

Produces a bundled `dist/` for static hosting:

```bash
npm run build
```

Outputs `dist/main.js`, sourcemap, and copies `src/lasca.html` to `dist/`.

## Preview

Serve the production build locally (tests the `dist/` output):

```bash
npm run preview
```

Open http://localhost:8080/lasca.html

## Live Reload

For auto-reload while editing:

```bash
npm run watch
```

This starts live-reload on http://localhost:8080 and opens `src/lasca.html` automatically.

## Notes

- The entry HTML is `src/lasca.html`, which loads `src/main.js`.
- If you prefer, you can also open `src/lasca.html` directly in a browser, but using a local server avoids potential file URL quirks.
