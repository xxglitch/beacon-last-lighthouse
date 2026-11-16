// Every sound is synthesized with WebAudio: no audio files, no network, nothing to
// load. The context is created on the first player gesture (browsers demand that),
// and every call is guarded, so a browser with no audio still plays fine.

function toneNode(context, destination, { type, from, to, duration, gain, when = 0 }) {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  const start = context.currentTime + when;
  oscillator.frequency.setValueAtTime(from, start);
  if (to !== undefined) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(gain, start + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

function noiseNode(context, destination, { duration, gain, frequency, when = 0 }) {
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = frequency;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(gain, context.currentTime + when);
  envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + when + duration);
  source.connect(filter).connect(envelope).connect(destination);
  source.start(context.currentTime + when);
}

export function createAudio() {
  let context = null;
  let master = null;
  let ambient = null;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function play(fn) {
    if (!ensure() || muted) return;
    try {
      if (context.state === 'suspended') void context.resume();
      fn();
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    /** Call from a click or keypress so the browser allows sound. Safe to call often. */
    unlock() {
      if (ensure() && context.state === 'suspended') void context.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (master && context) master.gain.setTargetAtTime(value ? 0 : 0.5, context.currentTime, 0.02);
    },
    isMuted() {
      return muted;
    },
    /** A low night-sea drone under the game: two detuned sines, barely there. */
    startAmbient() {
      if (!ensure() || ambient) return;
      try {
        const gain = context.createGain();
        gain.gain.value = 0.035;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 220;
        const first = context.createOscillator();
        first.type = 'sine';
        first.frequency.value = 55;
        const second = context.createOscillator();
        second.type = 'sine';
        second.frequency.value = 82.5;
        const swell = context.createOscillator();
        swell.type = 'sine';
        swell.frequency.value = 0.07;
        const swellGain = context.createGain();
        swellGain.gain.value = 0.015;
        swell.connect(swellGain).connect(gain.gain);
        first.connect(filter);
        second.connect(filter);
        filter.connect(gain).connect(master);
        first.start();
        second.start();
        swell.start();
        ambient = { first, second, swell, gain };
      } catch {
        ambient = null;
      }
    },
    stopAmbient() {
      if (!ambient) return;
      try {
        ambient.gain.gain.setTargetAtTime(0, context.currentTime, 0.1);
        const { first, second, swell } = ambient;
        window.setTimeout(() => {
          try {
            first.stop();
            second.stop();
            swell.stop();
          } catch {
            // Already stopped.
          }
        }, 500);
      } catch {
        // Nothing to stop.
      }
      ambient = null;
    },
    pulse() {
      play(() => {
        toneNode(context, master, { type: 'square', from: 880, to: 220, duration: 0.12, gain: 0.08 });
        noiseNode(context, master, { duration: 0.08, gain: 0.05, frequency: 3200 });
      });
    },
    kill() {
      play(() => {
        toneNode(context, master, { type: 'sine', from: 520, to: 180, duration: 0.16, gain: 0.12 });
      });
    },
    hit() {
      play(() => {
        toneNode(context, master, { type: 'sine', from: 90, to: 38, duration: 0.35, gain: 0.35 });
        noiseNode(context, master, { duration: 0.25, gain: 0.2, frequency: 400 });
      });
    },
    shock() {
      play(() => {
        toneNode(context, master, { type: 'sine', from: 140, to: 36, duration: 0.6, gain: 0.4 });
        noiseNode(context, master, { duration: 0.5, gain: 0.22, frequency: 900 });
      });
    },
    waveClear() {
      play(() => {
        [523.25, 659.25, 783.99].forEach((frequency, index) => {
          toneNode(context, master, { type: 'sine', from: frequency, duration: 0.22, gain: 0.12, when: index * 0.09 });
        });
      });
    },
    upgrade() {
      play(() => {
        toneNode(context, master, { type: 'triangle', from: 660, duration: 0.14, gain: 0.14 });
        toneNode(context, master, { type: 'triangle', from: 990, duration: 0.2, gain: 0.14, when: 0.08 });
      });
    },
    click() {
      play(() => {
        toneNode(context, master, { type: 'triangle', from: 740, to: 560, duration: 0.07, gain: 0.08 });
      });
    },
  };
}
