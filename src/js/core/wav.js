// 16-bit PCM WAV encoder (interleaved).
(() => {
  function encodeWav(pcm) {
    const nch = pcm.length, frames = pcm[0].length, dataLen = frames * nch * 2;
    const buf = new ArrayBuffer(MPC.WAV_HEADER + dataLen), dv = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };

    w(0, "RIFF"); dv.setUint32(4, 36 + dataLen, true); w(8, "WAVE");
    w(12, "fmt ");
    dv.setUint32(16, 16, true);                    // fmt chunk size
    dv.setUint16(20, 1, true);                     // PCM
    dv.setUint16(22, nch, true);
    dv.setUint32(24, MPC.RATE, true);
    dv.setUint32(28, MPC.RATE * nch * 2, true);    // byte rate
    dv.setUint16(32, nch * 2, true);               // block align
    dv.setUint16(34, 16, true);                    // bits per sample
    w(36, "data"); dv.setUint32(40, dataLen, true);

    let o = MPC.WAV_HEADER;
    for (let i = 0; i < frames; i++) for (let c = 0; c < nch; c++) { dv.setInt16(o, pcm[c][i], true); o += 2; }
    return new Uint8Array(buf);
  }

  MPC.wav = { encodeWav };
})();
