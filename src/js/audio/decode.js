// Browser audio I/O: decode any supported file to Float32 at MPC.RATE, and preview playback.
(() => {
  let actx = null;
  const ctx = () => (actx = actx || new (window.AudioContext || window.webkitAudioContext)());

  // File → Float32Array[] (1 or 2 channels) resampled to MPC.RATE.
  async function decodeFile(file) {
    const decoded = await ctx().decodeAudioData(await file.arrayBuffer());
    const frames = Math.max(1, Math.ceil(decoded.duration * MPC.RATE));
    const nch = Math.min(2, decoded.numberOfChannels);
    const off = new OfflineAudioContext(nch, frames, MPC.RATE);
    const src = off.createBufferSource();
    src.buffer = decoded; src.connect(off.destination); src.start();
    const rendered = await off.startRendering();
    const chans = [];
    for (let c = 0; c < nch; c++) chans.push(rendered.getChannelData(c).slice());
    return chans;
  }

  let playing = null;
  // Plays Float32 channels; throws if audio is blocked.
  // opts (optional, pad settings): tune in tenths of a semitone, volume 0..100, pan 0..100 (50 = centre).
  function play(chans, opts = {}) {
    const a = ctx();
    if (a.state === "suspended") a.resume();
    if (playing) { try { playing.stop(); } catch (e) {} }
    const b = a.createBuffer(chans.length, chans[0].length, MPC.RATE);
    chans.forEach((c, i) => b.copyToChannel(c, i));
    const src = a.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = Math.pow(2, (opts.tune || 0) / 120);
    const gain = a.createGain();
    gain.gain.value = (opts.volume ?? 100) / 100;
    let node = src.connect(gain);
    if (a.createStereoPanner) {
      const pan = a.createStereoPanner();
      pan.pan.value = ((opts.pan ?? 50) - 50) / 50;
      node = node.connect(pan);
    }
    node.connect(a.destination);
    src.start();
    playing = src;
  }

  MPC.audio = { decodeFile, play };
})();
