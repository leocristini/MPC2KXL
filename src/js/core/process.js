// Pure DSP on Float32 channel arrays: mono mixdown, silence trim, normalize, peak.
(() => {
  const TRIM_THRESHOLD = Math.pow(10, -60 / 20);   // -60 dBFS
  const NORMALIZE_TARGET = Math.pow(10, -0.3 / 20); // -0.3 dBFS

  function toMono(chans) {
    if (chans.length !== 2) return chans.map((c) => c.slice());
    const m = new Float32Array(chans[0].length);
    for (let i = 0; i < m.length; i++) m[i] = (chans[0][i] + chans[1][i]) * 0.5;
    return [m];
  }

  function trimSilence(chans) {
    const len = chans[0].length;
    const loud = (i) => chans.some((c) => Math.abs(c[i]) > TRIM_THRESHOLD);
    let a = 0, b = len - 1;
    while (a < len && !loud(a)) a++;
    while (b > a && !loud(b)) b--;
    return a < len ? chans.map((c) => c.slice(a, b + 1)) : chans;
  }

  function peakOf(chans) {
    let peak = 0;
    for (const c of chans) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > peak) peak = v; }
    return peak;
  }

  function normalize(chans, peak) {
    const g = NORMALIZE_TARGET / peak;
    for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g;
    return NORMALIZE_TARGET;
  }

  // raw: Float32Array[] at MPC.RATE; s: { ch, trim, norm } → { chans, peak }
  function processSample(raw, s) {
    let chans = s.ch === "mono" ? toMono(raw) : raw.map((c) => c.slice());
    if (s.trim) chans = trimSilence(chans);
    let peak = peakOf(chans);
    if (s.norm && peak > 0) peak = normalize(chans, peak);
    return { chans, peak };
  }

  MPC.dsp = { processSample, toMono, trimSilence, peakOf };
})();
