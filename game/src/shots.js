// The screenshot scenes behind ?shot=start|play|upgrade|end. Each one plays the real
// rules forward from a fresh world, steered by a simple autopilot (aim at the nearest
// creature, pulse when charged, shock when the shore crowds), so the frame is what a
// real game looks like and the same seed always gives the same frame. The end scene's
// pilot is deliberately half asleep: it sweeps the beam slowly and never pulses or
// shocks, so the tide takes the tower as it would a hurried player.

import { BEAM, LAMP, STEP } from './config.js';
import { EVENT_OVER, EVENT_WAVE_CLEAR } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';

const START_SECONDS = 6;
const PLAY_MAX_SECONDS = 120;
const END_MAX_SECONDS = 600;
const PLAY_MIN_WAVE = 3;
const PLAY_MIN_FOES = 6;

/** The angle from the lamp to the nearest creature, or straight down when the sea is empty. */
function aimAtNearest(state) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const enemy of state.enemies) {
    if (!enemy.active) continue;
    const distance = Math.hypot(enemy.x - LAMP.x, enemy.y - LAMP.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = enemy;
    }
  }
  if (!nearest) return Math.PI / 2;
  return Math.atan2(nearest.y - LAMP.y, nearest.x - LAMP.x);
}

function countNear(state, radius) {
  let count = 0;
  for (const enemy of state.enemies) {
    if (enemy.active && Math.hypot(enemy.x - LAMP.x, enemy.y - LAMP.y) < radius) count += 1;
  }
  return count;
}

function countActive(state) {
  let count = 0;
  for (const enemy of state.enemies) if (enemy.active) count += 1;
  return count;
}

/** A capable pilot: aims at the nearest creature, pulses whenever it can, shocks a crowd. */
function pilot(state) {
  return {
    aimAngle: aimAtNearest(state),
    pulseHeld: state.energy >= BEAM.pulseCost && countActive(state) > 0,
    shock: state.shockCharges > 0 && countNear(state, 340) >= 6,
  };
}

/**
 * A casual pilot, for the play portrait: it chases the second-nearest creature,
 * pulses only on a near-full charge and never shocks, so the tide gets close
 * enough to fill the frame — a real game, played like a person plays it.
 */
function casualPilot(state) {
  const foes = [];
  for (const enemy of state.enemies) {
    if (enemy.active) foes.push(enemy);
  }
  foes.sort((a, b) => Math.hypot(a.x - LAMP.x, a.y - LAMP.y) - Math.hypot(b.x - LAMP.x, b.y - LAMP.y));
  const target = foes[1] || foes[0];
  return {
    aimAngle: target ? Math.atan2(target.y - LAMP.y, target.x - LAMP.x) : Math.PI / 2,
    pulseHeld: state.energy >= 60 && foes.length > 0,
    shock: false,
  };
}

/** A dozing pilot: sweeps the beam and never spends energy or a charge. */
function dozingPilot(state) {
  return {
    aimAngle: Math.PI / 2 + Math.sin(state.elapsed * 0.5) * 1.1,
    pulseHeld: false,
    shock: false,
  };
}

function info(world) {
  const state = world.state;
  return { wave: state.wave, score: state.score, integrity: state.integrity, kills: state.kills, foes: countActive(state) };
}

/**
 * Set `world` to the named scene (start, play, upgrade or end; any other name is
 * start) and return the screen to draw over it, the upgrades to offer and the best
 * score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'upgrade' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { aimAngle: Math.PI / 2, pulseHeld: false, shock: false }, true);
    }
    return { screen: SCREEN_TITLE, upgrades: [], best: 0, info: info(world) };
  }

  world.startWave(1);
  const limit = name === 'end' ? END_MAX_SECONDS : PLAY_MAX_SECONDS;
  const drive = name === 'end' ? dozingPilot : name === 'play' ? casualPilot : pilot;
  for (let i = 0; i < limit / STEP; i += 1) {
    const events = world.step(STEP, drive(world.state), false);
    if (events & EVENT_OVER) break;
    if (events & EVENT_WAVE_CLEAR) {
      if (name === 'upgrade') {
        // Let the last kill's sparks and score text fade before the portrait.
        for (let settle = 0; settle < 1.5 / STEP; settle += 1) {
          world.step(STEP, { aimAngle: Math.PI / 2, pulseHeld: false, shock: false }, false);
        }
        return { screen: SCREEN_UPGRADE, upgrades: world.rollUpgrades(), best: world.state.score, info: info(world) };
      }
      const upgrades = world.rollUpgrades();
      world.applyUpgrade(upgrades[0].id);
      world.startWave(world.state.wave + 1);
    }
    if (name === 'play' && world.state.wave >= PLAY_MIN_WAVE && countActive(world.state) >= PLAY_MIN_FOES) break;
  }
  if (world.state.integrity === 0) {
    return { screen: SCREEN_OVER, upgrades: [], best: world.state.score, info: info(world) };
  }
  return { screen: SCREEN_PLAY, upgrades: [], best: world.state.score, info: info(world) };
}
