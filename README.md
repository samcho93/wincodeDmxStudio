# Wincode DMX Studio

A lighting console that runs in the browser: patch fixtures, build looks in a programmer, store them as groups, palettes
and cues, add effects, and play it all back from faders — over a Virtual DMX cable to the
[Wincode moving-head simulator](https://github.com/samcho93/wincodeMovingHead), or to real fixtures through Art-Net, sACN
or a DMX USB Pro widget.

**Live:** https://samcho93.github.io/wincodeDmxStudio/ · 3D stage it drives: https://samcho93.github.io/wincodeMovingHead/stage.html

**User manual:** [English](https://samcho93.github.io/wincodeDmxStudio/manual/en.html) · [한국어](https://samcho93.github.io/wincodeDmxStudio/manual/ko.html) (`web/manual/`, with screenshots)

No build step: `web/` is the whole application (ES modules). The Node server is only needed for Art-Net / sACN.

## Working method

The studio follows the way professional consoles (grandMA, ChamSys MagicQ, Avolites Titan, ETC Eos, Onyx) are operated:

| Step | Where | What |
|---|---|---|
| Patch | **Patch** | Fixtures with a fixture number, mode, universe and address. Auto-addressing; overlaps are marked. |
| Select | fixture tiles, groups, command line | Click / Ctrl-click, `1 thru 6`, `group 2`, `1 + 3 + 5`; All / Odd / Even / Invert / previous / next. |
| Set | **Programmer** | Attributes in groups — Intensity, Position, Colour, Beam, Control — with an XY pad for pan / tilt, a colour picker that mixes RGB or CMY as the fixture needs, and each channel's function table. **Fan** spreads a value across the selection. **Highlight** for focusing. The programmer always wins over playback. |
| Record | pools | **Groups**, **palettes** (intensity / position / colour / beam; a palette applies to any fixture of the same type), **cues**. |
| Cue lists | **Cue lists** | Fade and delay per cue, GO / follow / wait triggers, **tracking** (a cue keeps what earlier cues set), loop, timecode with an audio file, an effect per cue. Load a cue back into the programmer, update it. |
| Effects | **Effects** | Dimmer, pan, tilt, zoom, focus waves (sine, triangle, ramps, square, pulse, chase, random), pan / tilt circle and figure 8, colour rainbow; rate, size, phase spread, direction, tap tempo. |
| Play | faders at the bottom | 4 pages × 10 playbacks: a cue list, an effect or a group master each, with GO / Back / Off / Flash and a level fader. Intensity merges highest-takes-precedence between playbacks; everything else is latest-takes-precedence. Grand master and blackout. |
| Check | **DMX output** | Every channel on the wire, per universe, with its fixture and function. |

Also: undo / redo, show files (`.wdx.json`), autosave in the browser, keyboard shortcuts, MIDI control of the playbacks
(Web MIDI), 16-bit channels (the fine channel follows by itself).

## Channels and lines

A show starts with one universe of 512 channels and grows to **64 universes (32 768 channels)**. Each universe goes to its
own line (**Setup → Universes**):

| Line | How |
|---|---|
| Virtual DMX cable | A `BroadcastChannel` every page of the same site can read. The Wincode simulator listens on it — no server. |
| Art-Net 4 | Through a bridge (a browser cannot send UDP): this project's server, or the simulator's. |
| sACN / E1.31 | Through the same bridge; unicast or multicast. |
| DMX USB Pro | ENTTEC-compatible widget straight from the page with Web Serial (Chrome / Edge). |

The lines are modules of one small interface (`web/js/outputs.js`, `server/index.js`), so further transports are added
there without touching the console.

## The link to the 3D simulator

- **GitHub Pages:** both programs are served from `samcho93.github.io`, so they share one origin. Press **🎭 3D Stage**:
  the studio hands its patch to the simulator's stage page and opens it; the fixtures there follow the Virtual DMX cable.
  The simulator has a **🎚 DMX Studio** button back.
- **Local:** start the simulator (`npm start` in `wincodeMovingHead`) and open `http://127.0.0.1:7740/studio/` — its server
  serves this project from the folder next to it, which gives the same single origin.
- **Anywhere else:** set a universe to Art-Net with host `127.0.0.1` (or the node's address) and use the bridge; the stage
  file can be downloaded in Setup and opened on the stage page.

## Fixtures and examples

Profiles are data (`web/fixtures/wincode.json`): channels per mode, attribute group, resting value (shutter open, pan and
tilt centred) and a function table per channel. They are generated from the simulator's model definitions:

```bash
npm run import-wincode
```

Included: Wincode 250W BSW, 500W Frame, ApexPointe 420, Mega480 BSW, AquaVortex TB5 (all their channel modes), and generic
dimmers, RGB / RGBW / RGBAW + UV, moving head spot / wash / CMY, scanner and dimmer packs.

Examples (top bar → Load) are built from the profiles, with groups, palettes, three cue lists, five effects and a page
of playbacks each: the showcase with all five models (the patch of the simulator's "All models" stage), four of each
moving head, two TB5 bars, and a 48-fixture rig across five universes.

## Run locally

```bash
npm install
npm start
```

Then open http://127.0.0.1:7750 (bridge: `ws://127.0.0.1:7750/ws`).

## Command line and keys

`1 thru 6 @ 80` · `group 2 @ full` · `1 + 3 + 5` · `go 1` · `back 1` · `off 1` · `clear`

Esc clear · H highlight · F full · R record cue · B blackout · Space GO on playback 1 · 1–0 GO on playbacks 1–10 ·
← → previous / next fixture · Ctrl+A all · Ctrl+Z / Ctrl+Y undo / redo · Enter command line.

MIDI: control change 1–10 faders, 11 grand master; notes 36–45 GO, 46–55 flash.

## Not there yet

Art-Net / sACN input, RDM, a 2D plan view, pixel mapping, per-attribute fade times, and reading other consoles' fixture
libraries. The simulator's built-in DMX editor (QLC+ style) is a separate, simpler program and stays as it is.
