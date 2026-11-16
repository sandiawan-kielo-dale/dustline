// Synthesised sound effects with plain WebAudio — no audio files, no network.
// The context is created on the first user gesture; in ?shot= mode (no gesture)
// every call is a silent no-op.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (muted) return null;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.4;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    } catch {
      return null;
    }
  }

  function noiseBuffer(duration) {
    const c = ensure();
    if (!c) return null;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * duration), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function burst({ duration = 0.12, freq = 1200, gain = 0.5, type = 'lowpass', sweepTo = null }) {
    const c = ensure();
    if (!c) return;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(duration);
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, c.currentTime);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, c.currentTime + duration);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    src.connect(filter).connect(g).connect(master);
    src.start();
    src.stop(c.currentTime + duration);
  }

  function tone({ freq = 440, to = null, duration = 0.15, gain = 0.3, type = 'sine' }) {
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, c.currentTime + duration);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(g).connect(master);
    osc.start();
    osc.stop(c.currentTime + duration);
  }

  return {
    unlock() { ensure(); },
    setMuted(m) { muted = m; },
    shot(kind) {
      if (kind === 'rifle') { burst({ duration: 0.14, freq: 1600, sweepTo: 300, gain: 0.55 }); tone({ freq: 160, to: 60, duration: 0.1, gain: 0.35, type: 'square' }); }
      else if (kind === 'smg') { burst({ duration: 0.09, freq: 2200, sweepTo: 500, gain: 0.4 }); }
      else if (kind === 'sniper') { burst({ duration: 0.3, freq: 900, sweepTo: 120, gain: 0.7 }); tone({ freq: 90, to: 40, duration: 0.25, gain: 0.4, type: 'square' }); }
      else if (kind === 'shotgun') { burst({ duration: 0.2, freq: 1100, sweepTo: 200, gain: 0.65 }); }
      else { burst({ duration: 0.1, freq: 1800, sweepTo: 400, gain: 0.45 }); } // pistol
    },
    dryFire() { tone({ freq: 900, duration: 0.04, gain: 0.15, type: 'square' }); },
    reload() {
      tone({ freq: 500, duration: 0.05, gain: 0.2, type: 'square' });
      setTimeout(() => tone({ freq: 700, duration: 0.05, gain: 0.2, type: 'square' }), 260);
      setTimeout(() => tone({ freq: 1000, duration: 0.05, gain: 0.2, type: 'square' }), 520);
    },
    hit(kill) {
      tone({ freq: kill ? 1400 : 1050, duration: 0.07, gain: 0.3, type: 'sine' });
      if (kill) setTimeout(() => tone({ freq: 1750, duration: 0.09, gain: 0.3, type: 'sine' }), 70);
    },
    hurt() { tone({ freq: 220, to: 110, duration: 0.18, gain: 0.35, type: 'sawtooth' }); },
    step() { burst({ duration: 0.05, freq: 500, gain: 0.06 }); },
    plantBeep(final = false) { tone({ freq: final ? 1600 : 880, duration: final ? 0.3 : 0.09, gain: 0.3, type: 'square' }); },
    explosion() {
      burst({ duration: 0.9, freq: 500, sweepTo: 60, gain: 0.9 });
      tone({ freq: 70, to: 28, duration: 0.8, gain: 0.6, type: 'sine' });
    },
    grenadeThrow() { burst({ duration: 0.08, freq: 900, gain: 0.2 }); },
    roundStart() { tone({ freq: 523, duration: 0.12, gain: 0.25 }); setTimeout(() => tone({ freq: 784, duration: 0.18, gain: 0.25 }), 120); },
    roundWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone({ freq: f, duration: 0.16, gain: 0.28 }), i * 110)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone({ freq: f, duration: 0.2, gain: 0.25 }), i * 130)); },
    buy() { tone({ freq: 1200, duration: 0.06, gain: 0.25, type: 'square' }); setTimeout(() => tone({ freq: 1600, duration: 0.08, gain: 0.25, type: 'square' }), 60); },
    denied() { tone({ freq: 180, duration: 0.12, gain: 0.3, type: 'square' }); },
  };
}
