// Beacon: The Last Lighthouse — every tuning number, colour and upgrade in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the window,
// so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Where the lamp room sits: the beam, the pulse and the shockwave all start here. */
export const LAMP = { x: 640, y: 424 };

/** The island the creatures march on: reaching its edge hurts the lighthouse. */
export const ISLAND = { x: 640, y: 668, radius: 108 };

/** The waterline: creatures swim below it, the sky and the moon live above it. */
export const SEA_Y = 452;

export const INTEGRITY_MAX = 100;

export const BEAM = {
  dps: 46,
  halfAngle: 0.105,
  range: 740,
  turnRate: 7.5,
  pulseDamage: 60,
  pulseCost: 26,
  pulseCooldown: 0.22,
  pulseHalfAngle: 0.07,
  energyMax: 100,
  energyRegen: 15,
};

export const SHOCK = {
  radius: 330,
  damage: 130,
  knockback: 70,
  startCharges: 2,
  maxCharges: 3,
};

/** The three creatures of the dark tide: what they are, how tough, how fast, what they cost you. */
export const ENEMY = {
  wisp: { radius: 14, hp: 30, speed: 58, damage: 8, score: 50, wobble: 26, wobbleRate: 2.4 },
  crawler: { radius: 22, hp: 95, speed: 36, damage: 12, score: 100, wobble: 10, wobbleRate: 1.4 },
  brute: { radius: 34, hp: 280, speed: 23, damage: 25, score: 300, wobble: 5, wobbleRate: 0.9 },
};

export const WAVE = {
  baseCount: 6,
  perWave: 3,
  spawnInterval: 1.15,
  spawnScale: 0.93,
  minInterval: 0.35,
  hpGrowth: 0.07,
  speedGrowth: 0.03,
  speedCap: 1.6,
  clearBonus: 100,
};

/** The upgrades offered between waves: one of three, picked with 1/2/3 or a click. */
export const UPGRADES = [
  { id: 'wide', name: 'Wider Beam', blurb: 'The lamp throws a broader cone of light.', detail: '+40% beam width' },
  { id: 'hot', name: 'Hotter Light', blurb: 'The beam burns the dark much faster.', detail: '+35% burn damage' },
  { id: 'long', name: 'Long Lens', blurb: 'Light reaches further across the black water.', detail: '+20% beam range' },
  { id: 'swift', name: 'Swift Current', blurb: 'Pulse energy flows back far quicker.', detail: '+45% energy recharge' },
  { id: 'power', name: 'Bright Pulse', blurb: 'Each focused pulse hits far harder.', detail: '+50% pulse damage' },
  { id: 'stone', name: 'Stonework', blurb: 'Masons patch the tower through the night.', detail: 'Restore 35 integrity' },
  { id: 'storm', name: 'Storm Cell', blurb: 'Bottle the lightning for one more blast.', detail: '+1 shockwave charge' },
];

/** How many creatures and particles can exist at once; the pools are allocated once, at boot. */
export const POOL = { enemies: 96, particles: 360, texts: 24 };

export const PALETTE = {
  backdrop: '#04060f',
  skyTop: '#050816',
  skyBottom: '#0d1533',
  seaTop: '#0a1430',
  seaBottom: '#050914',
  moon: '#f4ead0',
  moonGlow: '#cdd8ff',
  beamCore: '#ffe9a8',
  beamEdge: '#ff9d2e',
  rock: '#232c3d',
  rockDark: '#161d2b',
  rockRim: '#4d5a75',
  towerLight: '#f2e7d0',
  towerDark: '#b3372f',
  wisp: '#b78cff',
  crawler: '#4fe0b0',
  brute: '#ff5a5a',
  ember: '#ffb347',
  panel: '#0b1020',
  panelEdge: '#e8b64c',
  text: '#f2ecdc',
  muted: '#9aa5c0',
  danger: '#ff6a5e',
  energy: '#7fd4ff',
  integrity: '#8fe388',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'beacon.best';
