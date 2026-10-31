# Builder

**Learn · Wire · Code.** Builder is a free, in-browser electronics workbench. Wire up real parts on a 3D desk, write C++ sketches, and watch them run on a simulated microcontroller board — no hardware needed.

## Features

- **3D workbench** — a Builder One board, breadboard and 30 parts (LEDs, sensors, displays, motors, keypad, relay…) on a cutting mat, with glowing LEDs, light spill and soft shadows.
- **Real wiring** — drag wires between part legs, board sockets and breadboard holes. Power, ground, shorts and pin conflicts are all checked.
- **Runs real code** — an in-browser interpreter for the C++ sketch language: `setup()`/`loop()`, arrays (incl. 2D), references, `String`, interrupts, and libraries for servos, LCD/OLED screens, NeoPixels, DHT sensors, steppers and keypads.
- **30 lessons** — from Blink to a code lock, each with live goal checks, a quiz and a solution.
- **Debugging tools** — Serial Monitor, Serial Plotter, a logic-analyzer Pins view, live Variables, Pause and Step.
- **Sandbox** — multiple saved projects, undo/redo, share-by-link, import/export, and a printable "Build it for real" sheet with a shopping list and wiring steps.
- **Extras** — achievement badges, light/dark themes, graphics quality settings and a phone-friendly layout.
- **Works offline** — installable as an app; after the first visit it runs without a connection.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints. `npm run build` produces a static site in `dist/` that can be hosted anywhere for free.

```bash
npm test
```

runs the test suite (interpreter, circuit solver, and every lesson's starter code, solution and quiz).

## Deploy

Every push to `main` is tested and built by GitHub Actions. To publish it on GitHub Pages, open the repo's **Settings → Pages** and set **Source** to **GitHub Actions** once; after that each push to `main` deploys automatically to `https://<user>.github.io/<repo>/`.

## Project layout

| Path | What it does |
| --- | --- |
| `src/interp/` | Lexer, parser and interpreter for sketches |
| `src/sim/` | Simulated board, circuit solver and all parts (models + behaviour) |
| `src/scene/` | The Three.js workbench: rendering, picking, wiring |
| `src/ui/` | Code editor, docs, plotter, pin timeline, tour, build sheet |
| `src/lessons.ts`, `src/quizzes.ts`, `src/badges.ts` | Course content |
| `src/main.ts` | App shell tying it all together |
| `src/test/` | Vitest test suite |
| `public/` | App icons, web manifest and offline service worker |

### Realistic instructor art

Nova is drawn in SVG by default. To use realistic renders instead, add images to `public/nova/`: `happy` (required), plus `talk`, `think` and `concern` (optional), each as `.png`, `.jpg` or `.webp`. Any background works; they're shown in a rounded portrait tile and swapped by mood.
