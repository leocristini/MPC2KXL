// Native MPC2000XL .SND encoder: 42-byte header, then 16-bit samples.
// Stereo is stored non-interleaved: all left samples, then all right.
(() => {
  function encodeSnd(pcm, name) {
    const nch = pcm.length, frames = pcm[0].length;
    const buf = new ArrayBuffer(MPC.SND_HEADER + frames * nch * 2), dv = new DataView(buf);

    dv.setUint8(0, 1); dv.setUint8(1, 4);              // format version
    const nm = name.padEnd(16, " ").slice(0, 16);
    for (let i = 0; i < 16; i++) dv.setUint8(2 + i, nm.charCodeAt(i));
    dv.setUint8(18, 0);                                // name terminator
    dv.setUint8(19, 100);                              // level
    dv.setInt8(20, 0);                                 // tune
    dv.setUint8(21, nch === 2 ? 1 : 0);                // stereo flag
    dv.setUint32(22, 0, true);                         // start
    dv.setUint32(26, frames, true);                    // loop end
    dv.setUint32(30, frames, true);                    // end
    dv.setUint32(34, frames, true);                    // loop length
    dv.setUint8(38, 0);                                // loop off
    dv.setUint8(39, 1);                                // beats in loop
    dv.setUint16(40, MPC.RATE, true);                  // sample rate

    let o = MPC.SND_HEADER;
    for (let c = 0; c < nch; c++) for (let i = 0; i < frames; i++) { dv.setInt16(o, pcm[c][i], true); o += 2; }
    return new Uint8Array(buf);
  }

  MPC.snd = { encodeSnd };
})();
