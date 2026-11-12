// 8-character MPC name helpers.
(() => {
  const clean = (v) => v.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, MPC.NAME_LENGTH);

  // "Kick Dusty 01.mp3" → "KICKDUST"
  function baseName(src) {
    return clean(src.replace(/\.[^.]+$/, "")) || "SMP";
  }

  function cleanName(v) { return clean(v); }

  // Returns `want`, or `want` with a numeric suffix that isn't in `taken` (a Set of names).
  function uniqueName(want, taken) {
    if (!taken.has(want)) return want;
    for (let n = 1; n < 1000; n++) {
      const s = String(n);
      const cand = want.slice(0, MPC.NAME_LENGTH - s.length) + s;
      if (!taken.has(cand)) return cand;
    }
    return want;
  }

  MPC.names = { baseName, cleanName, uniqueName };
})();
