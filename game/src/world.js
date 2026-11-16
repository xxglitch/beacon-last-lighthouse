// The game's rules and state, with no drawing and no browser in it: the lighthouse
// beam, the pulse and the shockwave, the waves of creatures out of the dark sea,
// spawning, damage, score, integrity and upgrades. step() advances one fixed step
// and returns what happened as bit flags, so the caller can react with sound and
// screens without the world knowing about either. Nothing here allocates after
// createWorld returns: enemies, particles and floating texts live in fixed pools.

import { BEAM, ENEMY, FIELD, INTEGRITY_MAX, ISLAND, LAMP, POOL, SEA_Y, SHOCK, UPGRADES, WAVE } from './config.js';

export const KIND_WISP = 0;
export const KIND_CRAWLER = 1;
export const KIND_BRUTE = 2;

export const EVENT_KILL = 1;
export const EVENT_HIT = 2;
export const EVENT_OVER = 4;
export const EVENT_WAVE_CLEAR = 8;
export const EVENT_PULSE = 16;
export const EVENT_SHOCK = 32;

const KIND_DEFS = [ENEMY.wisp, ENEMY.crawler, ENEMY.brute];
const KIND_COLORS = ['#b78cff', '#4fe0b0', '#ff5a5a'];

/** The shortest signed turn from `from` to `to`, in (-PI, PI]. */
function angleDiff(to, from) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff <= -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function createWorld(random) {
  const enemies = [];
  for (let i = 0; i < POOL.enemies; i += 1) {
    enemies.push({ active: false, kind: KIND_WISP, x: 0, y: 0, tx: 0, ty: 0, hp: 1, maxHp: 1, speed: 0, radius: 0, damage: 0, score: 0, wobblePhase: 0, wobbleAmp: 0, wobbleRate: 0, flash: 0 });
  }
  const particles = [];
  for (let i = 0; i < POOL.particles; i += 1) {
    particles.push({ active: false, kind: 'spark', x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff' });
  }
  const texts = [];
  for (let i = 0; i < POOL.texts; i += 1) {
    texts.push({ active: false, x: 0, y: 0, text: '', life: 0, maxLife: 1, color: '#ffd97a' });
  }

  const state = {
    enemies,
    particles,
    texts,
    score: 0,
    wave: 0,
    integrity: INTEGRITY_MAX,
    energy: BEAM.energyMax,
    shockCharges: SHOCK.startCharges,
    beamAngle: Math.PI / 2,
    aimAngle: Math.PI / 2,
    beamDps: BEAM.dps,
    beamHalfAngle: BEAM.halfAngle,
    beamRange: BEAM.range,
    pulseDamage: BEAM.pulseDamage,
    energyRegen: BEAM.energyRegen,
    elapsed: 0,
    shake: 0,
    hitFlash: 0,
    pulseFlash: 0,
    kills: 0,
    foesLeft: 0,
  };

  let spawnQueue = [];
  let spawnTimer = 0;
  let waveActive = false;
  let pulseCooldown = 0;
  let attractTimer = 0;

  function reset() {
    for (const enemy of enemies) enemy.active = false;
    for (const particle of particles) particle.active = false;
    for (const text of texts) text.active = false;
    state.score = 0;
    state.wave = 0;
    state.integrity = INTEGRITY_MAX;
    state.energy = BEAM.energyMax;
    state.shockCharges = SHOCK.startCharges;
    state.beamAngle = Math.PI / 2;
    state.aimAngle = Math.PI / 2;
    state.beamDps = BEAM.dps;
    state.beamHalfAngle = BEAM.halfAngle;
    state.beamRange = BEAM.range;
    state.pulseDamage = BEAM.pulseDamage;
    state.energyRegen = BEAM.energyRegen;
    state.elapsed = 0;
    state.shake = 0;
    state.hitFlash = 0;
    state.pulseFlash = 0;
    state.kills = 0;
    state.foesLeft = 0;
    spawnQueue = [];
    spawnTimer = 0;
    waveActive = false;
    pulseCooldown = 0;
    attractTimer = 0;
  }

  function spawnParticle(kind, x, y, vx, vy, life, size, color) {
    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];
      if (particle.active) continue;
      particle.active = true;
      particle.kind = kind;
      particle.x = x;
      particle.y = y;
      particle.vx = vx;
      particle.vy = vy;
      particle.life = life;
      particle.maxLife = life;
      particle.size = size;
      particle.color = color;
      return;
    }
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = random.next() * Math.PI * 2;
      const velocity = speed * (0.3 + random.next() * 0.9);
      spawnParticle('spark', x, y, Math.cos(angle) * velocity, Math.sin(angle) * velocity - 30, random.range(0.35, 0.8), random.range(1.5, 3.5), color);
    }
  }

  function floatText(x, y, text, color) {
    for (let i = 0; i < texts.length; i += 1) {
      if (texts[i].active) continue;
      texts[i].active = true;
      texts[i].x = x;
      texts[i].y = y;
      texts[i].text = text;
      texts[i].life = 1.1;
      texts[i].maxLife = 1.1;
      texts[i].color = color;
      return;
    }
  }

  /** The wave's creatures, toughest last: brutes from wave 3, crawlers from wave 2. */
  function buildQueue(wave) {
    const count = WAVE.baseCount + WAVE.perWave * (wave - 1);
    const brutes = wave >= 3 ? Math.min(1 + Math.floor((wave - 3) / 2), 4) : 0;
    const crawlers = wave >= 2 ? Math.min(2 + (wave - 2) * 2, Math.max(0, count - brutes - 2)) : 0;
    const queue = [];
    for (let i = 0; i < count - brutes - crawlers; i += 1) queue.push(KIND_WISP);
    for (let i = 0; i < crawlers; i += 1) queue.push(KIND_CRAWLER);
    for (let i = 0; i < brutes; i += 1) queue.push(KIND_BRUTE);
    return random.shuffled(queue);
  }

  function startWave(wave) {
    state.wave = wave;
    spawnQueue = buildQueue(wave);
    spawnTimer = 1.0;
    waveActive = true;
    state.foesLeft = spawnQueue.length;
  }

  function spawnInterval() {
    return Math.max(WAVE.minInterval, WAVE.spawnInterval * WAVE.spawnScale ** (state.wave - 1));
  }

  function freeEnemy() {
    for (let i = 0; i < enemies.length; i += 1) if (!enemies[i].active) return enemies[i];
    return null;
  }

  function spawn(kind) {
    const enemy = freeEnemy();
    if (!enemy) return;
    const def = KIND_DEFS[kind];
    const hpScale = 1 + WAVE.hpGrowth * (state.wave - 1);
    const speedScale = Math.min(WAVE.speedCap, 1 + WAVE.speedGrowth * (state.wave - 1));
    const fromLeft = random.next() < 0.5;
    enemy.active = true;
    enemy.kind = kind;
    enemy.x = fromLeft ? -30 : FIELD.width + 30;
    enemy.y = random.range(SEA_Y + 40, FIELD.height - 30);
    enemy.tx = ISLAND.x + random.range(-55, 55);
    enemy.ty = ISLAND.y - random.range(0, 30);
    enemy.maxHp = Math.round(def.hp * hpScale);
    enemy.hp = enemy.maxHp;
    enemy.speed = def.speed * speedScale * random.range(0.9, 1.1);
    enemy.radius = def.radius;
    enemy.damage = def.damage;
    enemy.score = def.score;
    enemy.wobblePhase = random.next() * Math.PI * 2;
    enemy.wobbleAmp = def.wobble;
    enemy.wobbleRate = def.wobbleRate;
    enemy.flash = 0;
  }

  function kill(enemy) {
    enemy.active = false;
    state.score += enemy.score;
    state.kills += 1;
    const color = KIND_COLORS[enemy.kind];
    burst(enemy.x, enemy.y, color, enemy.kind === KIND_BRUTE ? 26 : 12, enemy.kind === KIND_BRUTE ? 220 : 150);
    spawnParticle('ring', enemy.x, enemy.y, 0, 0, 0.45, enemy.radius * 2.4, color);
    floatText(enemy.x, enemy.y - enemy.radius - 6, `+${enemy.score}`, '#ffd97a');
  }

  function damageEnemy(enemy, amount) {
    enemy.hp -= amount;
    enemy.flash = 0.07;
    if (enemy.hp <= 0) kill(enemy);
  }

  function updateParticles(dt) {
    for (const particle of particles) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      if (particle.kind === 'spark' || particle.kind === 'ember') {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += (particle.kind === 'ember' ? -40 : 160) * dt;
      }
    }
    for (const text of texts) {
      if (!text.active) continue;
      text.life -= dt;
      text.y -= 34 * dt;
      if (text.life <= 0) text.active = false;
    }
  }

  function updateEnemies(dt, harmless) {
    let events = 0;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      if (enemy.flash > 0) enemy.flash -= dt;
      const dx = enemy.tx - enemy.x;
      const dy = enemy.ty - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      const wobble = Math.sin(state.elapsed * enemy.wobbleRate + enemy.wobblePhase) * enemy.wobbleAmp;
      const px = -dy / distance;
      const py = dx / distance;
      enemy.x += ((dx / distance) * enemy.speed + px * wobble * 0.4) * dt;
      enemy.y += ((dy / distance) * enemy.speed + py * wobble * 0.4) * dt;
      const shore = Math.hypot(enemy.x - ISLAND.x, enemy.y - ISLAND.y);
      if (shore > ISLAND.radius + enemy.radius * 0.4) continue;
      enemy.active = false;
      for (let i = 0; i < 8; i += 1) {
        spawnParticle('splash', enemy.x, enemy.y, random.range(-60, 60), random.range(-140, -20), random.range(0.3, 0.6), random.range(2, 4), '#7fd4ff');
      }
      if (harmless) continue;
      state.integrity = Math.max(0, state.integrity - enemy.damage);
      state.hitFlash = 0.55;
      state.shake = Math.max(state.shake, 0.7);
      events |= EVENT_HIT;
      if (state.integrity === 0) events |= EVENT_OVER;
    }
    return events;
  }

  /** Burn every creature the beam touches; embers rise off the ones it sears. */
  function burnBeam(dt) {
    let events = 0;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - LAMP.x;
      const dy = enemy.y - LAMP.y;
      const distance = Math.hypot(dx, dy);
      if (distance > state.beamRange + enemy.radius) continue;
      const angle = Math.atan2(dy, dx);
      const allowed = state.beamHalfAngle + enemy.radius / Math.max(60, distance);
      if (Math.abs(angleDiff(angle, state.beamAngle)) > allowed) continue;
      const before = enemy.hp;
      damageEnemy(enemy, state.beamDps * dt);
      if (before > 0 && enemy.hp <= 0) events |= EVENT_KILL;
      else if (random.next() < dt * 9) {
        spawnParticle('ember', enemy.x + random.range(-8, 8), enemy.y - enemy.radius * 0.5, random.range(-12, 12), random.range(-70, -30), random.range(0.3, 0.6), random.range(1.5, 3), '#ffb347');
      }
    }
    return events;
  }

  function firePulse() {
    let events = EVENT_PULSE;
    state.energy -= BEAM.pulseCost;
    state.pulseFlash = 0.14;
    pulseCooldown = BEAM.pulseCooldown;
    spawnParticle('flash', LAMP.x, LAMP.y, 0, 0, 0.18, 90, '#fff3c4');
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - LAMP.x;
      const dy = enemy.y - LAMP.y;
      const distance = Math.hypot(dx, dy);
      if (distance > state.beamRange + enemy.radius) continue;
      const angle = Math.atan2(dy, dx);
      const allowed = BEAM.pulseHalfAngle + enemy.radius / Math.max(60, distance);
      if (Math.abs(angleDiff(angle, state.beamAngle)) > allowed) continue;
      const before = enemy.hp;
      damageEnemy(enemy, state.pulseDamage);
      if (before > 0 && enemy.hp <= 0) events |= EVENT_KILL;
    }
    return events;
  }

  function fireShock() {
    let events = EVENT_SHOCK;
    state.shockCharges -= 1;
    state.shake = 1;
    spawnParticle('ring', LAMP.x, LAMP.y, 0, 0, 0.6, SHOCK.radius * 2, '#bfe9ff');
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - LAMP.x;
      const dy = enemy.y - LAMP.y;
      const distance = Math.hypot(dx, dy);
      if (distance > SHOCK.radius + enemy.radius) continue;
      const push = SHOCK.knockback * (1 - distance / (SHOCK.radius + enemy.radius));
      enemy.x += (dx / (distance || 1)) * push;
      enemy.y += (dy / (distance || 1)) * push;
      const before = enemy.hp;
      damageEnemy(enemy, SHOCK.damage);
      if (before > 0 && enemy.hp <= 0) events |= EVENT_KILL;
    }
    return events;
  }

  function countActive() {
    let count = 0;
    for (const enemy of enemies) if (enemy.active) count += 1;
    return count;
  }

  /**
   * One fixed step. `controls` carries the aim angle, whether the pulse is held and
   * whether a shockwave was asked for this step. With `attract` set (the title
   * screen's backdrop) wisps drift in and dissolve at the shore: nothing scores,
   * nothing hurts the tower, and the beam sweeps the sea on its own.
   */
  function step(dt, controls, attract) {
    let events = 0;
    state.elapsed += dt;
    state.shake = Math.max(0, state.shake - dt * 2.2);
    state.hitFlash = Math.max(0, state.hitFlash - dt);
    state.pulseFlash = Math.max(0, state.pulseFlash - dt);
    if (pulseCooldown > 0) pulseCooldown -= dt;
    updateParticles(dt);

    const aim = attract ? Math.PI / 2 + Math.sin(state.elapsed * 0.22) * 1.05 : controls.aimAngle;
    state.aimAngle = aim;
    const turn = angleDiff(aim, state.beamAngle);
    const maxTurn = BEAM.turnRate * dt;
    state.beamAngle += Math.max(-maxTurn, Math.min(maxTurn, turn));

    if (attract) {
      attractTimer -= dt;
      if (attractTimer <= 0) {
        attractTimer = 1.7;
        if (countActive() < 5) spawn(KIND_WISP);
      }
      updateEnemies(dt, true);
      return events;
    }

    state.energy = Math.min(BEAM.energyMax, state.energy + state.energyRegen * dt);

    if (waveActive && spawnQueue.length > 0) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawn(spawnQueue.pop());
        spawnTimer += spawnInterval();
      }
    }

    if (controls.pulseHeld && pulseCooldown <= 0 && state.energy >= BEAM.pulseCost) {
      events |= firePulse();
    }
    if (controls.shock && state.shockCharges > 0) {
      events |= fireShock();
    }
    events |= burnBeam(dt);
    events |= updateEnemies(dt, false);

    state.foesLeft = spawnQueue.length + countActive();
    if (waveActive && spawnQueue.length === 0 && countActive() === 0) {
      waveActive = false;
      state.score += WAVE.clearBonus * state.wave;
      state.shockCharges = Math.min(SHOCK.maxCharges, state.shockCharges + 1);
      events |= EVENT_WAVE_CLEAR;
    }
    return events;
  }

  function rollUpgrades() {
    return random.shuffled(UPGRADES).slice(0, 3);
  }

  function applyUpgrade(id) {
    if (id === 'wide') state.beamHalfAngle *= 1.4;
    else if (id === 'hot') state.beamDps *= 1.35;
    else if (id === 'long') state.beamRange *= 1.2;
    else if (id === 'swift') state.energyRegen *= 1.45;
    else if (id === 'power') state.pulseDamage *= 1.5;
    else if (id === 'stone') state.integrity = Math.min(INTEGRITY_MAX, state.integrity + 35);
    else if (id === 'storm') {
      if (state.shockCharges < SHOCK.maxCharges) state.shockCharges += 1;
      else state.score += 250;
    }
  }

  reset();
  return { state, reset, startWave, step, rollUpgrades, applyUpgrade };
}
