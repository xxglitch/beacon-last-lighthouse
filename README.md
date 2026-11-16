[![make.fun](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![rank](https://make.fun/badge/best-game-01/xxglitch/beacon-last-lighthouse/rank.svg)](https://make.fun/bounty/best-game-01)
[![reward](https://make.fun/badge/best-game-01/xxglitch/beacon-last-lighthouse/reward.svg)](https://make.fun/bounty/best-game-01)

# Beacon — The Last Lighthouse

An entry for the [make.fun "Make the best game" bounty](https://make.fun/bounty/best-game-01).

The dark tide rises, and one lighthouse still stands. You are its keeper. Aim the
lamp with the mouse and burn the creatures out of the black sea, wave after wave.
Between waves, choose a boon to strengthen the light. If the tide reaches the
rocks, the tower takes the blow — hold it as long as you can.

## How to play

- **Mouse** — aim the beam. It burns whatever it touches.
- **Hold click** — fire a focused pulse (costs energy, which recharges).
- **Space** — unleash a shockwave (limited charges, +1 every wave cleared).
- **1 / 2 / 3 or click** — pick a boon between waves.
- **P** — pause. **M** — mute. **R** — restart.

Three creatures come out of the sea: wisps (quick, frail), crawlers (slow,
tough) and brutes (huge, from wave 3). Every wave is bigger than the last.
Score for every kill, plus a bonus for clearing a wave. Your best score is
kept in the browser.

## Run it

No build step, no network, no libraries — plain static files under `game/`:

```sh
node serve.ts
# then open http://localhost:8080
```

Any static file server works. Node 22.18+ is needed for `main.ts` and `serve.ts`.

## Layout

- `game/index.html` — the page: one canvas, one module script.
- `game/src/main.js` — boot, the fixed-step loop, the five screens.
- `game/src/world.js` — the rules: beam, pulse, shockwave, waves, upgrades.
- `game/src/render.js` — all drawing: night sea, lighthouse, beam, HUD, panels.
- `game/src/input.js` — mouse aim, click, and keyboard.
- `game/src/audio.js` — every sound synthesized with WebAudio.
- `game/src/shots.js` — the staged screenshot scenes (`?shot=start|play|upgrade|end`).
- `game/src/config.js` — tuning, palette, enemies, upgrades.
- `game/src/random.js` — the seeded random number generator.
- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to the output
  and writes `dossier.json` (`MAKEFUN_OUTPUT_DIR=out node main.ts` to try it).
- `screenshots/` — four real renders of the game, taken in Chrome (see `shots.json`).

## Screenshots

The four shots are reproducible renders of the game's own code, staged by
`game/src/shots.js` with a fixed seed — the same seed always gives the same
frame. Serve the game, then capture each query from `shots.json` in a desktop
browser at 1280×720, e.g. with headless Chrome:

```sh
google-chrome-stable --headless=new --disable-gpu --no-sandbox \
  --window-size=1280,720 --hide-scrollbars --virtual-time-budget=8000 \
  --screenshot=1-start.png "http://localhost:8080/?shot=start&seed=7"
```

## License

MIT — see [LICENSE](LICENSE).
