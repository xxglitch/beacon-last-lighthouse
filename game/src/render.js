// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. Every picture is procedural: gradients, glow and
// particles, no image files at all. Text that holds a number is rebuilt only when
// the number changes, so a frame allocates almost nothing.

import { FIELD, FONT, INTEGRITY_MAX, ISLAND, LAMP, PALETTE, SEA_Y, SHOCK } from './config.js';
import { KIND_BRUTE, KIND_CRAWLER, KIND_WISP } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** The three upgrade cards: their rectangles, shared by drawing and click tests. */
const CARD = { width: 300, height: 250, gap: 24, y: 258 };
const CARDS_X = (FIELD.width - (CARD.width * 3 + CARD.gap * 2)) / 2;

function cardRect(index) {
  return { x: CARDS_X + index * (CARD.width + CARD.gap), y: CARD.y, width: CARD.width, height: CARD.height };
}

/** Which upgrade card (0-2) a playfield point is on, or -1. */
export function cardAt(x, y) {
  for (let index = 0; index < 3; index += 1) {
    const rect = cardRect(index);
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) return index;
  }
  return -1;
}

/** A deterministic 0..1 value from an integer: star fields and ripples stay put. */
function hash(n) {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const bestLabel = cachedLabel('BEST ');
  const waveLabel = cachedLabel('WAVE ');
  const foesLabel = cachedLabel('FOES LEFT ');

  const stars = [];
  for (let i = 0; i < 110; i += 1) {
    stars.push({ x: hash(i) * FIELD.width, y: hash(i + 500) * (SEA_Y - 60), r: 0.6 + hash(i + 900) * 1.5, phase: hash(i + 1300) * Math.PI * 2 });
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function font(size, bold) {
    const key = `${bold ? 'b' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align = 'left', bold = false) {
    context.font = font(size, bold);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  function drawSky(state) {
    const gradient = context.createLinearGradient(0, 0, 0, SEA_Y);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(1, PALETTE.skyBottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, SEA_Y);
    for (const star of stars) {
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(state.elapsed * 0.7 + star.phase));
      context.globalAlpha = twinkle;
      context.fillStyle = '#dfe8ff';
      context.beginPath();
      context.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // The moon, high and full, with a soft halo.
    const moonX = 1090;
    const moonY = 108;
    const halo = context.createRadialGradient(moonX, moonY, 10, moonX, moonY, 120);
    halo.addColorStop(0, 'rgba(205, 216, 255, 0.35)');
    halo.addColorStop(1, 'rgba(205, 216, 255, 0)');
    context.fillStyle = halo;
    context.beginPath();
    context.arc(moonX, moonY, 120, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.moon;
    context.beginPath();
    context.arc(moonX, moonY, 42, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(180, 170, 140, 0.5)';
    context.beginPath();
    context.arc(moonX - 12, moonY - 8, 9, 0, Math.PI * 2);
    context.arc(moonX + 14, moonY + 12, 6, 0, Math.PI * 2);
    context.fill();
    // Drifting fog banks.
    context.fillStyle = 'rgba(160, 180, 220, 0.06)';
    for (let i = 0; i < 3; i += 1) {
      const fx = ((state.elapsed * (6 + i * 3) + i * 430) % (FIELD.width + 400)) - 200;
      context.beginPath();
      context.ellipse(fx, 300 + i * 48, 220, 22, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawSea(state) {
    const gradient = context.createLinearGradient(0, SEA_Y, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.seaTop);
    gradient.addColorStop(1, PALETTE.seaBottom);
    context.fillStyle = gradient;
    context.fillRect(0, SEA_Y, FIELD.width, FIELD.height - SEA_Y);
    // The moon's reflection: a shimmering column of broken light.
    for (let i = 0; i < 16; i += 1) {
      const y = SEA_Y + 14 + i * 15;
      const wobble = Math.sin(state.elapsed * 1.8 + i * 1.7) * 14;
      const width = 26 + hash(i + 40) * 46;
      context.fillStyle = `rgba(230, 225, 190, ${0.05 + 0.06 * Math.abs(Math.sin(state.elapsed + i))})`;
      context.fillRect(1090 - width / 2 + wobble, y, width, 3);
    }
    // Rolling wave lines.
    context.strokeStyle = 'rgba(127, 212, 255, 0.16)';
    context.lineWidth = 2;
    for (let row = 0; row < 3; row += 1) {
      const baseY = SEA_Y + 36 + row * 78;
      context.beginPath();
      for (let x = 0; x <= FIELD.width; x += 16) {
        const y = baseY + Math.sin(x * 0.012 + state.elapsed * (0.9 + row * 0.3) + row * 2) * 5;
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
  }

  function drawIsland() {
    // The rock mound the lighthouse stands on.
    context.fillStyle = PALETTE.rockDark;
    context.beginPath();
    context.ellipse(ISLAND.x, 706, 235, 66, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.rock;
    context.beginPath();
    context.moveTo(430, 692);
    context.lineTo(468, 634);
    context.lineTo(540, 606);
    context.lineTo(610, 592);
    context.lineTo(676, 592);
    context.lineTo(742, 610);
    context.lineTo(812, 640);
    context.lineTo(852, 692);
    context.closePath();
    context.fill();
    context.strokeStyle = PALETTE.rockRim;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(468, 634);
    context.lineTo(540, 606);
    context.lineTo(610, 592);
    context.lineTo(676, 592);
    context.lineTo(742, 610);
    context.lineTo(812, 640);
    context.stroke();
    // Two wind-bent pines.
    for (const pineX of [492, 792]) {
      context.fillStyle = '#12261c';
      for (let tier = 0; tier < 3; tier += 1) {
        const width = 34 - tier * 8;
        const y = 628 - tier * 16;
        context.beginPath();
        context.moveTo(pineX - width / 2, y);
        context.lineTo(pineX, y - 22);
        context.lineTo(pineX + width / 2, y);
        context.closePath();
        context.fill();
      }
    }
  }

  function drawLighthouse() {
    const baseY = 596;
    // The tower: a trapezoid in cream and signal red.
    context.beginPath();
    context.moveTo(608, baseY);
    context.lineTo(618, 452);
    context.lineTo(662, 452);
    context.lineTo(672, baseY);
    context.closePath();
    context.save();
    context.clip();
    const bands = [PALETTE.towerLight, PALETTE.towerDark, PALETTE.towerLight, PALETTE.towerDark, PALETTE.towerLight];
    for (let i = 0; i < bands.length; i += 1) {
      context.fillStyle = bands[i];
      context.fillRect(600, 452 + i * 29, 80, 29);
    }
    context.restore();
    context.strokeStyle = 'rgba(10, 10, 20, 0.6)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(608, baseY);
    context.lineTo(618, 452);
    context.lineTo(662, 452);
    context.lineTo(672, baseY);
    context.stroke();
    // The door.
    context.fillStyle = '#2a1a12';
    context.beginPath();
    context.moveTo(630, baseY);
    context.lineTo(630, baseY - 26);
    context.arc(640, baseY - 26, 10, Math.PI, 0);
    context.lineTo(650, baseY);
    context.closePath();
    context.fill();
    // The gallery and its railing.
    context.fillStyle = '#1c2436';
    context.fillRect(610, 444, 60, 8);
    context.strokeStyle = '#0e1424';
    context.lineWidth = 2;
    for (let i = 0; i < 6; i += 1) {
      const x = 614 + i * 11;
      context.beginPath();
      context.moveTo(x, 444);
      context.lineTo(x, 430);
      context.stroke();
    }
    // The lamp room: dark frame, amber heart, red cap.
    context.fillStyle = '#141a2a';
    context.fillRect(620, 412, 40, 34);
    const lampGlow = context.createRadialGradient(LAMP.x, 429, 2, LAMP.x, 429, 26);
    lampGlow.addColorStop(0, 'rgba(255, 240, 190, 0.95)');
    lampGlow.addColorStop(1, 'rgba(255, 180, 60, 0)');
    context.fillStyle = lampGlow;
    context.beginPath();
    context.arc(LAMP.x, 429, 26, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffe9a8';
    context.beginPath();
    context.arc(LAMP.x, 429, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.towerDark;
    context.beginPath();
    context.moveTo(616, 412);
    context.lineTo(640, 396);
    context.lineTo(664, 412);
    context.closePath();
    context.fill();
  }

  /** The beam: three wedges, soft edge to bright core, flickering like a real lamp. */
  function drawBeam(state, faint) {
    const flicker = 0.93 + 0.07 * Math.sin(state.elapsed * 13.7) * Math.sin(state.elapsed * 7.3);
    const surge = 1 + state.pulseFlash * 2.2;
    const angle = state.beamAngle;
    const range = state.beamRange;
    const half = state.beamHalfAngle;
    const layers = faint
      ? [{ spread: 1.5, alpha: 0.05 }]
      : [
          { spread: 1.9, alpha: 0.13 * flicker },
          { spread: 1.25, alpha: 0.22 * flicker * surge },
          { spread: 0.55, alpha: 0.5 * flicker * surge },
        ];
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const layer of layers) {
      const spread = half * layer.spread;
      const endX = LAMP.x + Math.cos(angle) * range;
      const endY = LAMP.y + Math.sin(angle) * range;
      const gradient = context.createLinearGradient(LAMP.x, LAMP.y, endX, endY);
      gradient.addColorStop(0, `rgba(255, 214, 130, ${layer.alpha})`);
      gradient.addColorStop(1, 'rgba(255, 160, 50, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(LAMP.x, LAMP.y);
      context.arc(LAMP.x, LAMP.y, range, angle - spread, angle + spread);
      context.closePath();
      context.fill();
    }
    context.restore();
    if (!faint) {
      const glow = context.createRadialGradient(LAMP.x, 429, 2, LAMP.x, 429, 70);
      glow.addColorStop(0, `rgba(255, 230, 150, ${0.5 * surge})`);
      glow.addColorStop(1, 'rgba(255, 200, 80, 0)');
      context.save();
      context.globalCompositeOperation = 'lighter';
      context.fillStyle = glow;
      context.beginPath();
      context.arc(LAMP.x, 429, 70, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  function drawEnemies(state) {
    for (const enemy of state.enemies) {
      if (!enemy.active) continue;
      const bob = Math.sin(state.elapsed * 3 + enemy.wobblePhase) * 3;
      const y = enemy.y + bob;
      // A pale wake trailing behind it in the water.
      context.fillStyle = 'rgba(150, 200, 255, 0.10)';
      context.beginPath();
      context.ellipse(enemy.x + (enemy.x < ISLAND.x ? -enemy.radius : enemy.radius), enemy.y + enemy.radius * 0.7, enemy.radius * 1.4, enemy.radius * 0.35, 0, 0, Math.PI * 2);
      context.fill();
      if (enemy.kind === KIND_BRUTE) {
        context.save();
        context.shadowColor = PALETTE.brute;
        context.shadowBlur = 26;
        context.fillStyle = '#2a0f16';
        context.beginPath();
        for (let i = 0; i < 9; i += 1) {
          const a = (i / 9) * Math.PI * 2;
          const r = enemy.radius * (i % 2 === 0 ? 1.15 : 0.85);
          const px = enemy.x + Math.cos(a) * r;
          const py = y + Math.sin(a) * r;
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.closePath();
        context.fill();
        context.restore();
        context.fillStyle = '#ff8a7a';
        context.beginPath();
        context.arc(enemy.x - 11, y - 8, 5, 0, Math.PI * 2);
        context.arc(enemy.x + 11, y - 8, 5, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#ffd2c2';
        context.beginPath();
        context.arc(enemy.x - 11, y - 8, 2, 0, Math.PI * 2);
        context.arc(enemy.x + 11, y - 8, 2, 0, Math.PI * 2);
        context.fill();
      } else if (enemy.kind === KIND_CRAWLER) {
        context.save();
        context.shadowColor = PALETTE.crawler;
        context.shadowBlur = 20;
        const body = context.createRadialGradient(enemy.x - 6, y - 8, 2, enemy.x, y, enemy.radius * 1.3);
        body.addColorStop(0, '#7df0c4');
        body.addColorStop(0.6, '#1d8f6b');
        body.addColorStop(1, 'rgba(20, 90, 70, 0.9)');
        context.fillStyle = body;
        context.beginPath();
        context.ellipse(enemy.x, y, enemy.radius, enemy.radius * 0.85, 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
        context.fillStyle = '#0d3a2c';
        context.beginPath();
        context.moveTo(enemy.x - 14, y - enemy.radius * 0.6);
        context.lineTo(enemy.x - 8, y - enemy.radius * 1.25);
        context.lineTo(enemy.x - 2, y - enemy.radius * 0.6);
        context.moveTo(enemy.x + 2, y - enemy.radius * 0.6);
        context.lineTo(enemy.x + 8, y - enemy.radius * 1.25);
        context.lineTo(enemy.x + 14, y - enemy.radius * 0.6);
        context.fill();
        context.fillStyle = '#eafff5';
        context.beginPath();
        context.arc(enemy.x - 7, y - 2, 3.4, 0, Math.PI * 2);
        context.arc(enemy.x + 7, y - 2, 3.4, 0, Math.PI * 2);
        context.fill();
      } else {
        const glow = context.createRadialGradient(enemy.x, y, 1, enemy.x, y, enemy.radius * 2);
        glow.addColorStop(0, 'rgba(200, 160, 255, 0.85)');
        glow.addColorStop(0.45, 'rgba(150, 110, 255, 0.4)');
        glow.addColorStop(1, 'rgba(140, 100, 255, 0)');
        context.fillStyle = glow;
        context.beginPath();
        context.arc(enemy.x, y, enemy.radius * 2, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#e6d6ff';
        context.beginPath();
        context.arc(enemy.x, y, enemy.radius * 0.62, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#2a1450';
        context.beginPath();
        context.arc(enemy.x - 4, y - 1, 2.4, 0, Math.PI * 2);
        context.arc(enemy.x + 4, y - 1, 2.4, 0, Math.PI * 2);
        context.fill();
      }
      if (enemy.flash > 0) {
        context.globalAlpha = Math.min(1, enemy.flash / 0.07) * 0.75;
        context.fillStyle = '#ffffff';
        context.beginPath();
        context.arc(enemy.x, y, enemy.radius, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }
      if (enemy.hp < enemy.maxHp && enemy.kind !== KIND_WISP) {
        const width = enemy.radius * 2;
        context.fillStyle = 'rgba(0, 0, 0, 0.55)';
        context.fillRect(enemy.x - width / 2, y - enemy.radius - 14, width, 5);
        context.fillStyle = enemy.hp / enemy.maxHp > 0.35 ? '#8fe388' : '#ff6a5e';
        context.fillRect(enemy.x - width / 2, y - enemy.radius - 14, width * (enemy.hp / enemy.maxHp), 5);
      }
    }
  }

  function drawParticles(state) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const particle of state.particles) {
      if (!particle.active) continue;
      const fade = particle.life / particle.maxLife;
      if (particle.kind === 'ring') {
        const progress = 1 - fade;
        context.globalAlpha = fade * 0.8;
        context.strokeStyle = particle.color;
        context.lineWidth = 3 + 4 * fade;
        context.beginPath();
        context.arc(particle.x, particle.y, 12 + particle.size * progress, 0, Math.PI * 2);
        context.stroke();
      } else if (particle.kind === 'flash') {
        const gradient = context.createRadialGradient(particle.x, particle.y, 1, particle.x, particle.y, particle.size);
        gradient.addColorStop(0, `rgba(255, 246, 200, ${0.85 * fade})`);
        gradient.addColorStop(1, 'rgba(255, 200, 90, 0)');
        context.globalAlpha = 1;
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      } else {
        context.globalAlpha = fade;
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size * (0.5 + fade * 0.5), 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
    context.globalAlpha = 1;
    for (const item of state.texts) {
      if (!item.active) continue;
      context.globalAlpha = Math.min(1, item.life / 0.45);
      text(item.text, item.x, item.y, 21, item.color, 'center', true);
    }
    context.globalAlpha = 1;
  }

  function drawBar(x, y, width, height, fraction, color, label) {
    text(label, x, y - 6, 13, PALETTE.muted, 'left', true);
    context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    roundRect(x, y, width, height, 4);
    context.fill();
    if (fraction > 0) {
      context.fillStyle = color;
      roundRect(x, y, Math.max(height, width * fraction), height, 4);
      context.fill();
    }
    context.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    context.lineWidth = 1;
    roundRect(x, y, width, height, 4);
    context.stroke();
  }

  function drawHud(state, ui) {
    text(scoreLabel(state.score), 24, 20, 26, PALETTE.text, 'left', true);
    text(waveLabel(state.wave), FIELD.width / 2, 20, 26, PALETTE.text, 'center', true);
    text(foesLabel(state.foesLeft), FIELD.width / 2, 52, 16, PALETTE.muted, 'center');
    text(bestLabel(ui.best), FIELD.width - 24, 20, 26, PALETTE.text, 'right', true);
    if (ui.muted) text('MUTED', FIELD.width - 24, 52, 15, PALETTE.muted, 'right', true);
    const integrityFraction = state.integrity / INTEGRITY_MAX;
    drawBar(24, 660, 240, 15, integrityFraction, integrityFraction > 0.35 ? PALETTE.integrity : PALETTE.danger, 'INTEGRITY');
    drawBar(24, 694, 240, 15, state.energy / 100, PALETTE.energy, 'PULSE  —  HOLD CLICK');
    // Shockwave charges, bottom right.
    text('SHOCKWAVE  [SPACE]', FIELD.width - 24, 644, 13, PALETTE.muted, 'right', true);
    for (let i = 0; i < SHOCK.maxCharges; i += 1) {
      const cx = FIELD.width - 40 - i * 34;
      const cy = 678;
      context.fillStyle = i < state.shockCharges ? '#ffd97a' : 'rgba(255, 255, 255, 0.12)';
      context.beginPath();
      context.arc(cx, cy, 12, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = i < state.shockCharges ? '#2a1c05' : 'rgba(255, 255, 255, 0.25)';
      context.beginPath();
      context.moveTo(cx + 2, cy - 8);
      context.lineTo(cx - 4, cy + 1);
      context.lineTo(cx, cy + 1);
      context.lineTo(cx - 2, cy + 8);
      context.lineTo(cx + 4, cy - 1);
      context.lineTo(cx, cy - 1);
      context.closePath();
      context.fill();
    }
    // A small gold ring where the beam is aimed.
    if (ui.aim) {
      context.strokeStyle = 'rgba(255, 217, 122, 0.65)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(ui.aim.x, ui.aim.y, 11, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(ui.aim.x, ui.aim.y, 2.5, 0, Math.PI * 2);
      context.fillStyle = 'rgba(255, 217, 122, 0.8)';
      context.fill();
    }
  }

  function drawPanelBox(x, y, width, height) {
    context.fillStyle = 'rgba(8, 12, 26, 0.88)';
    roundRect(x, y, width, height, 18);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRect(x, y, width, height, 18);
    context.stroke();
  }

  function drawTitle(state, best) {
    const blink = 0.8 + 0.2 * Math.sin(state.elapsed * 3.2);
    const panelX = (FIELD.width - 680) / 2;
    drawPanelBox(panelX, 48, 680, 360);
    text('BEACON', FIELD.width / 2, 132, 76, PALETTE.beamCore, 'center', true);
    context.save();
    try {
      context.letterSpacing = '8px';
    } catch {
      // Older canvases ignore letter spacing; the words still read.
    }
    text('THE LAST LIGHTHOUSE', FIELD.width / 2, 166, 22, PALETTE.panelEdge, 'center', true);
    context.restore();
    text('The dark tide rises. Hold the light through the night.', FIELD.width / 2, 208, 20, PALETTE.text, 'center');
    const lines = [
      'Move the mouse to aim the beam — it burns what it touches.',
      'Hold click to fire a focused pulse.  Space unleashes a shockwave.',
      'Between waves, choose a boon to strengthen the lamp.',
      'If the creatures reach the rocks, the tower takes the blow.',
    ];
    lines.forEach((line, index) => {
      text(line, FIELD.width / 2, 246 + index * 28, 19, PALETTE.muted, 'center');
    });
    text(bestLabel(best), FIELD.width / 2, 358, 20, PALETTE.muted, 'center', true);
    context.globalAlpha = blink;
    text('Click or press Enter to light the lamp', FIELD.width / 2, 392, 22, PALETTE.beamCore, 'center', true);
    context.globalAlpha = 1;
  }

  function drawUpgrade(state, upgrades) {
    context.fillStyle = 'rgba(4, 6, 15, 0.45)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text(`WAVE ${state.wave} CLEARED`, FIELD.width / 2, 130, 40, PALETTE.beamCore, 'center', true);
    text('The tide ebbs for a breath. Choose a boon for the lamp.', FIELD.width / 2, 168, 20, PALETTE.muted, 'center');
    text(`Score ${state.score}   ·   Integrity ${state.integrity}`, FIELD.width / 2, 204, 19, PALETTE.text, 'center', true);
    upgrades.forEach((upgrade, index) => {
      const rect = cardRect(index);
      context.fillStyle = 'rgba(11, 16, 32, 0.94)';
      roundRect(rect.x, rect.y, rect.width, rect.height, 16);
      context.fill();
      context.strokeStyle = PALETTE.panelEdge;
      context.lineWidth = 2;
      roundRect(rect.x, rect.y, rect.width, rect.height, 16);
      context.stroke();
      context.fillStyle = PALETTE.panelEdge;
      context.beginPath();
      context.arc(rect.x + rect.width / 2, rect.y + 52, 24, 0, Math.PI * 2);
      context.fill();
      text(String(index + 1), rect.x + rect.width / 2, rect.y + 61, 26, '#241a05', 'center', true);
      text(upgrade.name, rect.x + rect.width / 2, rect.y + 122, 24, PALETTE.text, 'center', true);
      text(upgrade.detail, rect.x + rect.width / 2, rect.y + 152, 18, PALETTE.beamCore, 'center', true);
      const words = upgrade.blurb.split(' ');
      let line = '';
      const wrapped = [];
      for (const word of words) {
        if ((line + word).length > 26) {
          wrapped.push(line.trim());
          line = '';
        }
        line += `${word} `;
      }
      wrapped.push(line.trim());
      wrapped.forEach((wrappedLine, lineIndex) => {
        text(wrappedLine, rect.x + rect.width / 2, rect.y + 186 + lineIndex * 24, 17, PALETTE.muted, 'center');
      });
    });
    text('Press 1, 2 or 3 — or click a card', FIELD.width / 2, 648, 20, PALETTE.muted, 'center');
  }

  function drawPaused() {
    context.fillStyle = 'rgba(4, 6, 15, 0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    drawPanelBox((FIELD.width - 460) / 2, 250, 460, 220);
    text('PAUSED', FIELD.width / 2, 332, 44, PALETTE.text, 'center', true);
    text('The tide waits for no keeper — but it waits for you.', FIELD.width / 2, 378, 18, PALETTE.muted, 'center');
    text('Press P to carry on', FIELD.width / 2, 424, 20, PALETTE.beamCore, 'center', true);
  }

  function drawOver(state, ui) {
    context.fillStyle = 'rgba(4, 6, 15, 0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    const panelX = (FIELD.width - 620) / 2;
    drawPanelBox(panelX, 150, 620, 420);
    text('THE LIGHT GOES OUT', FIELD.width / 2, 232, 42, PALETTE.danger, 'center', true);
    text('The dark tide takes the lighthouse — this time.', FIELD.width / 2, 272, 19, PALETTE.muted, 'center');
    text(`Score  ${state.score}`, FIELD.width / 2, 336, 30, PALETTE.text, 'center', true);
    text(bestLabel(ui.best), FIELD.width / 2, 374, 22, PALETTE.muted, 'center', true);
    if (ui.newBest) text('NEW BEST!', FIELD.width / 2, 406, 22, PALETTE.beamCore, 'center', true);
    text(`Waves held: ${state.wave}    ·    Creatures burned: ${state.kills}`, FIELD.width / 2, 448, 19, PALETTE.muted, 'center');
    const blink = 0.8 + 0.2 * Math.sin(state.elapsed * 3.2);
    context.globalAlpha = blink;
    text('Press R or click to light the lamp again', FIELD.width / 2, 516, 22, PALETTE.beamCore, 'center', true);
    context.globalAlpha = 1;
  }

  function drawVignette(state) {
    const gradient = context.createRadialGradient(FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.42, FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.85);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    if (state.hitFlash > 0) {
      context.fillStyle = `rgba(255, 40, 30, ${state.hitFlash * 0.22})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  /** Paint one frame: the night, the game, then the HUD or a panel for the screen. */
  function draw(state, screen, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = (Math.random() * 2 - 1) * state.shake * 12;
    const shakeY = (Math.random() * 2 - 1) * state.shake * 12;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawSky(state);
    drawSea(state);
    drawIsland();
    drawLighthouse();
    drawBeam(state, false);
    drawEnemies(state);
    drawParticles(state);
    drawBeam(state, true);
    drawVignette(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui.best);
      return;
    }
    drawHud(state, ui);
    if (ui.banner && ui.banner.age < ui.banner.duration) {
      const progress = ui.banner.age / ui.banner.duration;
      context.globalAlpha = progress < 0.15 ? progress / 0.15 : 1 - Math.max(0, (progress - 0.6) / 0.4);
      text(ui.banner.text, FIELD.width / 2, 300, 54, PALETTE.beamCore, 'center', true);
      context.globalAlpha = 1;
    }
    if (screen === SCREEN_UPGRADE) drawUpgrade(state, ui.upgrades || []);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, ui);
  }

  /** Turn a client-pixel point into playfield coordinates, or null when outside. */
  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - view.x / (window.devicePixelRatio || 1)) / (view.scale / (window.devicePixelRatio || 1));
    const y = (clientY - rect.top - view.y / (window.devicePixelRatio || 1)) / (view.scale / (window.devicePixelRatio || 1));
    if (x < 0 || x > FIELD.width || y < 0 || y > FIELD.height) return null;
    return { x, y };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toLogical };
}
