// MPC2000XL program (.PGM) encoder.
//
// Layout (all little-endian), total 2290 + 17 × soundCount bytes:
//   2   magic 07 04
//   2   sound count (u16)
//   17×n sound names (16 chars space-padded + 0x00); the MPC finds NAME.SND files by these
//   2   unknown, constant 1E 00
//   17  program name (16 chars space-padded + 0x00)
//   9   slider: note, tune lo/hi, decay lo/hi, attack lo/hi, filter lo/hi
//   1   program change
//   5   unknown, constant
//   64×25 note parameters, indexed by MIDI note 35..98 (see NOTE below)
//   1   unknown, constant 06
//   64×6 pad mixer, indexed by note: fx out, volume, pan, indiv. volume, output, fx send
//   3   unknown, constant 00 40 00
//   64  pad → note mapping (A01..D16)
//   200 effects-board settings; not decoded, written as the stock block
//
// Layout and defaults cross-checked against files saved by a real MPC2000XL, as documented by
// the open-source vMPC2000XL emulator.
(() => {
  const FIRST_NOTE = 35;
  const PADS = 64;
  const NOTE_SIZE = 25;
  const MIXER_SIZE = 6;
  const UNASSIGNED = 0xFF;

  // Factory pad → note mapping (pad index 0 = A01).
  const DEFAULT_PAD_NOTES = [
    37, 36, 42, 82, 40, 38, 46, 44, 48, 47, 45, 43, 49, 55, 51, 53,
    54, 69, 81, 80, 65, 66, 76, 77, 56, 62, 63, 64, 73, 74, 71, 39,
    52, 57, 58, 59, 60, 61, 67, 68, 70, 72, 75, 78, 79, 35, 41, 50,
    83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98,
  ];

  const SLIDER = [0, -120, 120, 12, 45, 0, 20, -50, 50];
  const AFTER_SLIDER = [35, 64, 0, 25, 0];
  const FX_BLOCK_HEX =
    "02004800D0070000630114081DFC323302323C08050A1414320000020F19000541141E0105" +
    "0000056300F4FF0C0000000000000002004F014F0100424F0100424F01004232006328003C" +
    "0000D0070000630114081DFC323302323C08050A1414320000020F19000541141E01050000" +
    "056300F4FF0C0000000000000002004F014F0100424F0100424F01004232006328003C0000" +
    "04000C000000320023003E335A3214000000320023003E335A3214000000320023003E335A" +
    "3214000000320023003E335A321400";

  const OVERLAP = { poly: 0, mono: 1, noteoff: 2 };

  // Per-pad defaults, matching a fresh MPC program.
  const DEFAULT_PAD = { tune: 0, attack: 0, decay: 5, overlap: "poly", volume: 100, pan: 50 };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

  // program: { name: string, pads: Array(64) of null | { sound: string, tune, attack, decay, overlap, volume, pan } }
  //   tune: -120..120 (tenths of a semitone), attack/decay/volume: 0..100, pan: 0..100 (50 = centre)
  function encodePgm(program) {
    const soundNames = [];
    for (const p of program.pads) if (p && !soundNames.includes(p.sound)) soundNames.push(p.sound);

    const size = 2290 + 17 * soundNames.length;
    const u8 = new Uint8Array(size), dv = new DataView(u8.buffer);
    let o = 0;
    const u1 = (v) => { dv.setUint8(o, v); o += 1; };
    const s1 = (v) => { dv.setInt8(o, v); o += 1; };
    const name17 = (s) => {
      const t = s.padEnd(16, " ").slice(0, 16);
      for (let i = 0; i < 16; i++) u1(t.charCodeAt(i) & 0x7F);
      u1(0);
    };

    u1(0x07); u1(0x04);
    dv.setUint16(o, soundNames.length, true); o += 2;
    soundNames.forEach(name17);
    u1(0x1E); u1(0x00);
    name17(program.name || "NEWPGM-A");
    u1(SLIDER[0]); SLIDER.slice(1).forEach(s1);
    u1(0);                                   // program change
    AFTER_SLIDER.forEach(u1);

    // Note parameters and mixer are indexed by note; find which pad plays each note.
    const padForNote = new Array(PADS).fill(null);
    DEFAULT_PAD_NOTES.forEach((note, pad) => { padForNote[note - FIRST_NOTE] = program.pads[pad] || null; });

    for (let n = 0; n < PADS; n++) {
      const p = padForNote[n] ? { ...DEFAULT_PAD, ...padForNote[n] } : null;
      const start = o;
      u1(p ? soundNames.indexOf(p.sound) : UNASSIGNED);  // sound index
      u1(0);                                   // sound generation: normal
      u1(44);                                  // velocity range lower
      u1(0);                                   // also play note 1: off
      u1(88);                                  // velocity range upper
      u1(0);                                   // also play note 2: off
      u1(p ? OVERLAP[p.overlap] ?? 0 : 0);     // voice overlap
      u1(34); u1(34);                          // mute assign 1/2: off
      dv.setInt16(o, p ? clamp(p.tune, -120, 120) : 0, true); o += 2;
      u1(p ? clamp(p.attack, 0, 100) : 0);
      u1(p ? clamp(p.decay, 0, 100) : 5);
      u1(0);                                   // decay mode: end
      u1(100);                                 // filter cutoff
      u1(0);                                   // resonance
      u1(0); u1(0); u1(0);                     // velocity envelope → filter
      u1(100);                                 // velocity → level
      u1(0); u1(0); u1(0);                     // velocity → attack / start / cutoff
      u1(0);                                   // slider parameter
      u1(0);                                   // velocity → pitch
      if (o - start !== NOTE_SIZE) throw new Error("note size");
    }

    u1(0x06);
    for (let n = 0; n < PADS; n++) {
      const p = padForNote[n] ? { ...DEFAULT_PAD, ...padForNote[n] } : DEFAULT_PAD;
      u1(0);                                   // fx output: off
      u1(clamp(p.volume, 0, 100));
      u1(clamp(p.pan, 0, 100));
      u1(100);                                 // individual volume
      u1(0);                                   // individual output: off
      u1(0);                                   // fx send level
    }
    u1(0x00); u1(0x40); u1(0x00);
    DEFAULT_PAD_NOTES.forEach(s1);
    for (let i = 0; i < FX_BLOCK_HEX.length; i += 2) u1(parseInt(FX_BLOCK_HEX.slice(i, i + 2), 16));

    if (o !== size) throw new Error("PGM size mismatch: " + o + " != " + size);
    return u8;
  }

  // "A01".."D16"
  const padLabel = (i) => "ABCD"[Math.floor(i / 16)] + String((i % 16) + 1).padStart(2, "0");

  MPC.pgm = { encodePgm, padLabel, DEFAULT_PAD, DEFAULT_PAD_NOTES, PADS };
})();
