// Sound, synthesized live with WebAudio: no audio files, no network. A gunshot
// is filtered noise plus a low thump; footsteps are short ticks; the bomb beeps
// faster as it nears detonation. Created on the first user gesture, since the
// browser will not let audio start before one.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function noise(dur, filterFreq, gain, type = 'lowpass') {
    if (!ctx || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
    src.stop(ctx.currentTime + dur);
  }

  function tone(freq, dur, gain, type = 'sine', slideTo = 0) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  return {
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    shot(kind, distant) {
      if (!ensure()) return;
      const gain = distant ? 0.12 : 0.5;
      if (kind === 'shotgun' || kind === 'dmr') {
        noise(0.22, 900, gain);
        tone(90, 0.18, gain * 0.8, 'sine', 45);
      } else if (kind === 'smg') {
        noise(0.08, 2400, gain * 0.8);
        tone(160, 0.07, gain * 0.5, 'square', 90);
      } else {
        noise(0.12, 1800, gain);
        tone(130, 0.1, gain * 0.6, 'sine', 60);
      }
    },
    dryClick() {
      tone(1800, 0.03, 0.15, 'square');
    },
    reload() {
      tone(900, 0.05, 0.2, 'square');
      setTimeout(() => tone(600, 0.05, 0.2, 'square'), 260);
    },
    hit(kill) {
      tone(kill ? 1400 : 1000, 0.07, 0.3, 'sine');
      if (kill) setTimeout(() => tone(1800, 0.1, 0.3, 'sine'), 70);
    },
    hurt() {
      tone(220, 0.12, 0.3, 'sawtooth', 140);
    },
    footstep() {
      noise(0.05, 500, 0.08);
    },
    beep(fast) {
      tone(fast ? 1500 : 1100, 0.06, 0.25, 'square');
    },
    plant() {
      tone(880, 0.1, 0.3, 'square');
      setTimeout(() => tone(880, 0.1, 0.3, 'square'), 140);
    },
    explode() {
      noise(1.1, 300, 0.9);
      tone(60, 0.9, 0.7, 'sine', 28);
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.3, 'triangle'), i * 130));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.2, 0.3, 'triangle'), i * 140));
    },
    buy() {
      tone(1200, 0.06, 0.25, 'sine');
    },
    denied() {
      tone(180, 0.15, 0.3, 'square', 120);
    },
  };
}
