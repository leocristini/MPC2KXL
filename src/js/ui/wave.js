// Waveform thumbnails drawn on <canvas>. Colour comes from the canvas's CSS `color`, so themes apply.
// Canvases are queued and drawn on the next frame, once they're in the DOM and have a size.
(() => {
  const peakCache = new WeakMap();   // Float32Array (first channel) → Map(buckets → {min, max})
  let pending = [];

  // Min/max per bucket of the mono mix.
  function peaks(chans, buckets) {
    let byN = peakCache.get(chans[0]);
    if (!byN) { byN = new Map(); peakCache.set(chans[0], byN); }
    if (byN.has(buckets)) return byN.get(buckets);
    const len = chans[0].length, nch = chans.length, step = len / buckets;
    const min = new Float32Array(buckets), max = new Float32Array(buckets);
    for (let b = 0; b < buckets; b++) {
      let lo = 0, hi = 0;
      const a = Math.floor(b * step), z = Math.max(a + 1, Math.floor((b + 1) * step));
      for (let i = a; i < z && i < len; i++) {
        let v = 0;
        for (let c = 0; c < nch; c++) v += chans[c][i];
        v /= nch;
        if (v < lo) lo = v; if (v > hi) hi = v;
      }
      min[b] = lo; max[b] = hi;
    }
    const r = { min, max };
    byN.set(buckets, r);
    return r;
  }

  function draw(canvas, chans) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const color = getComputedStyle(canvas).color;
    const mid = h / 2;

    g.globalAlpha = 0.35; g.fillStyle = color;
    g.fillRect(0, Math.round(mid), w, 1);                 // centre line

    const cols = Math.max(8, Math.floor(w / 2));          // one bar every 2px
    const { min, max } = peaks(chans, cols);
    let peak = 0;
    for (let i = 0; i < cols; i++) peak = Math.max(peak, -min[i], max[i]);
    const scale = peak > 0 ? (mid - 1) / peak : 0;
    g.globalAlpha = 1;
    for (let i = 0; i < cols; i++) {
      const top = mid - max[i] * scale, bot = mid - min[i] * scale;
      g.fillRect(i * (w / cols), top, Math.max(1, w / cols - 0.6), Math.max(1, bot - top));
    }
  }

  function flush() {
    const batch = pending; pending = [];
    for (const [canvas, chans] of batch) if (canvas.isConnected) draw(canvas, chans);
  }

  // Creates a canvas that will show `chans`. className sets size/colour via CSS.
  function canvasFor(chans, className) {
    const c = document.createElement("canvas");
    c.className = className;
    c.setAttribute("aria-hidden", "true");
    if (!pending.length) requestAnimationFrame(flush);
    pending.push([c, chans]);
    return c;
  }

  MPC.wave = { canvasFor, draw };
})();
