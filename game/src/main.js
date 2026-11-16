// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer paints
// what is there. The game moves between five screens: title, play, upgrade, paused
// and game over. Between waves the player picks one of three boons, then the next
// wave begins.
//
// ?seed=N fixes the spawning pattern. ?shot=start|play|upgrade|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot. ?debug=1 shows a live state readout.
import { BEST_KEY, LAMP, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_HIT, EVENT_KILL, EVENT_OVER, EVENT_PULSE, EVENT_SHOCK, EVENT_WAVE_CLEAR } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_PICK_1, ACTION_PICK_2, ACTION_PICK_3, ACTION_RESTART, ACTION_SHOCK, createInput } from './input.js';
import { createAudio } from './audio.js';
import { cardAt, createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const BANNER_SECONDS = 2.2;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const debug = params.has('debug');

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const debugElement = document.getElementById('debug');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  if (debug) {
    debugElement.classList.add('on');
    debugElement.textContent = JSON.stringify({ shot: name, screen: scene.screen, ...scene.info }, null, 1);
  }
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { best: scene.best, upgrades: scene.upgrades, banner: null, muted: false, aim: null, newBest: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let newBest = false;
  let upgrades = [];
  let banner = null;
  let shockQueued = false;
  let aimAngle = Math.PI / 2;
  let aimPoint = null;
  let accumulator = 0;
  let last = performance.now();
  let debugTimer = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function showBanner(text) {
    banner = { text, age: 0, duration: BANNER_SECONDS };
  }

  function startRun() {
    audio.unlock();
    world.reset();
    world.startWave(1);
    screen = SCREEN_PLAY;
    newBest = false;
    showBanner('WAVE 1');
    audio.startAmbient();
    announce('Playing. Hold the light. Wave 1.');
  }

  function endRun() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      newBest = true;
      saveBest(best);
    }
    audio.stopAmbient();
    announce(`The light goes out. Score ${world.state.score}. Best ${best}.`);
  }

  function chooseUpgrade(index) {
    const upgrade = upgrades[index];
    if (!upgrade) return;
    audio.unlock();
    audio.upgrade();
    world.applyUpgrade(upgrade.id);
    const nextWave = world.state.wave + 1;
    world.startWave(nextWave);
    screen = SCREEN_PLAY;
    showBanner(`WAVE ${nextWave}`);
    announce(`You chose ${upgrade.name}. Wave ${nextWave}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    const click = input.takeClick();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        audio.click();
        startRun();
      }
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & (ACTION_CONFIRM | ACTION_RESTART)) {
        audio.click();
        startRun();
      }
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (actions & ACTION_RESTART) {
        startRun();
      } else if (actions & ACTION_SHOCK) {
        shockQueued = true;
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (actions & ACTION_RESTART) {
        startRun();
      }
      return;
    }
    if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_PICK_1) chooseUpgrade(0);
      else if (actions & ACTION_PICK_2) chooseUpgrade(1);
      else if (actions & ACTION_PICK_3) chooseUpgrade(2);
      else if (click) {
        const point = renderer.toLogical(click.x, click.y);
        if (point) {
          const index = cardAt(point.x, point.y);
          if (index !== -1) chooseUpgrade(index);
        }
      }
    }
  }

  function trackAim() {
    const mouse = input.mouse();
    const point = renderer.toLogical(mouse.x, mouse.y);
    if (point) {
      aimPoint = point;
      aimAngle = Math.atan2(point.y - LAMP.y, point.x - LAMP.x);
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { aimAngle: Math.PI / 2, pulseHeld: false, shock: false }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, { aimAngle, pulseHeld: input.held(), shock: shockQueued }, false);
    shockQueued = false;
    if (banner) banner.age += STEP;
    if (events & EVENT_KILL) audio.kill();
    if (events & EVENT_PULSE) audio.pulse();
    if (events & EVENT_SHOCK) audio.shock();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_WAVE_CLEAR) {
      audio.waveClear();
      upgrades = world.rollUpgrades();
      screen = SCREEN_UPGRADE;
      announce(`Wave ${world.state.wave} cleared. Choose a boon.`);
    }
    if (events & EVENT_OVER) endRun();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    trackAim();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, {
      best,
      upgrades,
      banner,
      muted: audio.isMuted(),
      aim: screen === SCREEN_PLAY ? aimPoint : null,
      newBest,
    });
    if (debug) {
      debugTimer += 1;
      if (debugTimer % 30 === 0) {
        debugElement.classList.add('on');
        debugElement.textContent = JSON.stringify(
          { screen, wave: world.state.wave, score: world.state.score, integrity: world.state.integrity, energy: Math.round(world.state.energy), foes: world.state.foesLeft },
          null,
          1,
        );
      }
    }
  }

  // Leaving the tab pauses a running game rather than letting the tide advance unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Beacon, the Last Lighthouse. Click or press Enter to light the lamp.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

// With ?debug=1, expose the world for automated play-testing (never in normal play).
if (debug) window.__beacon = { world, renderer };
