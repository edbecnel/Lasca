# Lasca – Local Run

A minimal setup to run the static Lasca board locally in your browser.

## Prerequisites

- Node.js 18+ recommended

## Quick Start

```bash
npm install
npm run dev
```

Then open http://localhost:8080/lasca.html (Vite serves from `src/`).

## Build

Produces a bundled `dist/` for static hosting:

```bash
npm run build
```

Outputs the built site to `dist/` (including `lasca.html` and bundled assets).

## Preview

Serve the production build locally (tests the `dist/` output):

```bash
npm run preview
```

Open http://localhost:8080/lasca.html

## Live Reload

`npm run dev` already provides fast HMR via Vite. No separate `watch` script.

## How to tweak the dropdown popup colors (now fully controllable)

In src/lasca.html, look in :root for these variables:

--themeMenuBg: rgba(0,0,0,0.88);
--themeMenuHoverBg: rgba(255,255,255,0.10);
--themeMenuSelectedBg: rgba(255,255,255,0.16);
--themeMenuText: rgba(255,255,255,0.92);
--themeMenuBorder: rgba(255,255,255,0.18);

For example: Change --themeMenuBg to try different backgrounds.

## Notes

- The entry HTML is `src/lasca.html`, which loads `src/main.ts`.
- If you prefer, you can also open `src/lasca.html` directly in a browser, but using a local server avoids potential file URL quirks.
