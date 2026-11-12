// Float32 → Int16 conversion with optional TPDF dither.
(() => {
  function toInt16(channels, dither) {
    return channels.map((ch) => {
      const out = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++) {
        let v = ch[i] * 32767;
        if (dither) v += Math.random() - Math.random();
        v = Math.round(v);
        out[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
      }
      return out;
    });
  }

  MPC.pcm = { toInt16 };
})();
