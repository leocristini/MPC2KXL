// Program builder: 4×4 pad grid with banks A–D, drag-and-drop assignment, per-pad editor.
(() => {
  const $ = (id) => document.getElementById(id);
  const { padLabel, DEFAULT_PAD, DEFAULT_PAD_NOTES, PADS } = MPC.pgm;
  const MIME_ITEM = "application/x-mpc-item";
  const MIME_PAD = "application/x-mpc-pad";

  // MPC pad layout: pad 13 top-left, pad 1 bottom-left.
  const GRID_ORDER = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3];

  // host: { items() → item[], findItem(id), play(item), addFiles(files) → Promise<item[]>, changed() }
  function create(host) {
    const pads = new Array(PADS).fill(null);   // null | { itemId, tune, attack, decay, overlap, volume, pan }
    let bank = 0, selected = 0;

    const programName = () => MPC.names.cleanProgramName($("pgm-name").value) || "NEWPGM-A";

    // ---------- assignment ----------
    function assign(pad, itemId) {
      const prev = pads[pad];
      pads[pad] = prev ? { ...prev, itemId } : { ...DEFAULT_PAD, itemId };
      selected = pad;
      render(); host.changed();
    }
    function clearPad(pad) { pads[pad] = null; render(); host.changed(); }
    function swap(a, b) { [pads[a], pads[b]] = [pads[b], pads[a]]; selected = b; render(); host.changed(); }
    function removeItem(itemId) {
      for (let i = 0; i < PADS; i++) if (pads[i] && pads[i].itemId === itemId) pads[i] = null;
    }
    function clearAll() { pads.fill(null); render(); host.changed(); }

    // Files dropped from the desktop onto a pad: first goes to that pad, the rest fill the next empty pads.
    async function dropFiles(pad, files) {
      const added = await host.addFiles(files, (items) => {
        let p = pad;
        for (const it of items) {
          while (p < PADS && pads[p] && p !== pad) p++;
          if (p >= PADS) break;
          pads[p] = { ...DEFAULT_PAD, itemId: it.id };
          p++;
        }
        selected = pad;
        render();
      });
      return added;
    }

    const usedCount = () => pads.filter(Boolean).length;

    // ---------- export ----------
    // Returns { pgmName, program, items } or null if nothing playable is assigned.
    function build() {
      const used = [];
      const programPads = pads.map((p) => {
        if (!p) return null;
        const it = host.findItem(p.itemId);
        if (!it || !it.out) return null;
        if (!used.includes(it)) used.push(it);
        return { sound: it.name, tune: p.tune, attack: p.attack, decay: p.decay, overlap: p.overlap, volume: p.volume, pan: p.pan };
      });
      if (!used.length) return null;
      const name = programName();
      return { fileName: MPC.names.cleanName(name) || "PROGRAM", program: { name, pads: programPads }, items: used };
    }

    // ---------- rendering ----------
    function padButton(i) {
      const p = pads[i], it = p && host.findItem(p.itemId);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pad" + (i === selected ? " sel" : "") + (p ? " full" : "") + (it && it.error ? " bad" : "");
      b.dataset.pad = i;
      b.draggable = !!p;
      b.setAttribute("aria-pressed", i === selected ? "true" : "false");
      b.setAttribute("aria-label", padLabel(i) + (it ? ", " + it.name : ", empty"));

      // Printed legend above the pad ("PAD 13" … note number), then the rubber face.
      const label = document.createElement("span"); label.className = "pad-id"; label.textContent = "PAD " + ((i % 16) + 1);
      const note = document.createElement("span"); note.className = "pad-note"; note.textContent = DEFAULT_PAD_NOTES[i];
      const face = document.createElement("span"); face.className = "pad-face";
      const name = document.createElement("span"); name.className = "pad-name";
      name.textContent = it ? (it.error ? "ERROR" : it.out ? it.name : "…") : "";
      b.append(label, note, face, name);
      return b;
    }

    // Flash a pad like it was hit.
    function hit(i) {
      const b = document.querySelector(`.pad[data-pad="${i}"]`);
      if (!b) return;
      b.classList.remove("hit"); void b.offsetWidth; b.classList.add("hit");
      b.addEventListener("animationend", () => b.classList.remove("hit"), { once: true });
    }

    function trigger(i) {
      const p = pads[i], it = p && host.findItem(p.itemId);
      if (it && it.out) { host.play(it, p); hit(i); }
    }

    function renderGrid() {
      const grid = $("pads");
      grid.textContent = "";
      for (const k of GRID_ORDER) grid.appendChild(padButton(bank * 16 + k));
      document.querySelectorAll('input[name="bank"]').forEach((r) => {
        const b = Number(r.value), n = pads.slice(b * 16, b * 16 + 16).filter(Boolean).length;
        r.nextElementSibling.querySelector(".lg").dataset.count = n ? String(n) : "";
        r.checked = b === bank;
      });
    }

    function renderEditor() {
      const p = pads[selected];
      $("pe-title").textContent = padLabel(selected) + " NOTE " + DEFAULT_PAD_NOTES[selected];
      const cur = p && host.findItem(p.itemId);
      $("pe-len").textContent = cur && cur.out ? (cur.out.chans[0].length / MPC.RATE).toFixed(2) + "s" : "EMPTY";
      const wave = $("pe-wave");
      if (cur && cur.out) MPC.wave.draw(wave, cur.out.chans);
      else wave.getContext("2d").clearRect(0, 0, wave.width, wave.height);

      const sel = $("pe-sound");
      sel.textContent = "";
      sel.add(new Option("— empty —", ""));
      for (const it of host.items()) if (it.out) sel.add(new Option(it.name, String(it.id)));
      sel.value = p ? String(p.itemId) : "";

      const fields = $("pe-fields");
      fields.disabled = !p;
      const v = p || DEFAULT_PAD;
      $("pe-tune").value = (v.tune / 10).toFixed(1);
      $("pe-attack").value = v.attack;
      $("pe-decay").value = v.decay;
      $("pe-overlap").value = v.overlap;
      $("pe-volume").value = v.volume;
      $("pe-pan").value = v.pan;
      $("pe-volume-out").textContent = v.volume;
      $("pe-pan-out").textContent = v.pan === 50 ? "C" : v.pan < 50 ? "L" + (50 - v.pan) : "R" + (v.pan - 50);
      // Note variation fader mirrors the pad's tune.
      const nv = $("nv-slider");
      nv.disabled = !p;
      if (document.activeElement !== nv) nv.value = v.tune;
    }

    function render() {
      renderGrid();
      renderEditor();
      const n = usedCount();
      $("pgm-count").textContent = n ? n + (n === 1 ? " pad assigned" : " pads assigned") : "No pads assigned";
      $("dl-pgm").disabled = !build();
    }

    // ---------- events ----------
    const grid = $("pads");
    const padFrom = (e) => { const b = e.target.closest(".pad"); return b ? Number(b.dataset.pad) : -1; };

    grid.addEventListener("click", (e) => {
      const i = padFrom(e); if (i < 0) return;
      selected = i;
      MPC.panel.show("pgm");   // triggers a redraw
      render();
      trigger(i);
    });
    grid.addEventListener("dragstart", (e) => {
      const i = padFrom(e); if (i < 0 || !pads[i]) return;
      e.dataTransfer.setData(MIME_PAD, String(i));
      e.dataTransfer.effectAllowed = "move";
    });
    grid.addEventListener("dragover", (e) => {
      const i = padFrom(e); if (i < 0) return;
      e.preventDefault();
      grid.querySelectorAll(".pad.hot").forEach((b) => b.classList.remove("hot"));
      e.target.closest(".pad").classList.add("hot");
    });
    grid.addEventListener("dragleave", (e) => { const b = e.target.closest(".pad"); if (b) b.classList.remove("hot"); });
    grid.addEventListener("drop", (e) => {
      const i = padFrom(e); if (i < 0) return;
      e.preventDefault();
      e.stopPropagation();   // the unit-wide file drop handler must not load these files again
      e.target.closest(".pad").classList.remove("hot");
      const dt = e.dataTransfer;
      if (dt.types.includes(MIME_PAD)) { const from = Number(dt.getData(MIME_PAD)); if (from !== i) swap(from, i); }
      else if (dt.types.includes(MIME_ITEM)) assign(i, Number(dt.getData(MIME_ITEM)));
      else if (dt.files && dt.files.length) dropFiles(i, dt.files);
    });

    document.querySelectorAll('input[name="bank"]').forEach((r) => r.addEventListener("change", () => { bank = Number(r.value); selected = bank * 16; render(); }));

    $("pe-sound").addEventListener("change", (e) => { const v = e.target.value; v ? assign(selected, Number(v)) : clearPad(selected); });
    const field = (id, key, parse) => $(id).addEventListener("input", (e) => {
      const p = pads[selected]; if (!p) return;
      p[key] = parse(e.target.value);
      renderEditor();
    });
    field("pe-tune", "tune", (v) => Math.max(-120, Math.min(120, Math.round(Number(v) * 10) || 0)));
    field("pe-attack", "attack", (v) => Math.max(0, Math.min(100, Number(v) | 0)));
    field("pe-decay", "decay", (v) => Math.max(0, Math.min(100, Number(v) | 0)));
    field("pe-overlap", "overlap", (v) => v);
    field("pe-volume", "volume", Number);
    field("pe-pan", "pan", Number);
    $("pe-play").addEventListener("click", () => trigger(selected));
    $("nv-slider").addEventListener("input", (e) => {
      const p = pads[selected]; if (!p) return;
      p.tune = Math.max(-120, Math.min(120, Number(e.target.value) | 0));
      renderEditor();
    });
    $("pe-clear").addEventListener("click", () => clearPad(selected));
    $("pgm-clear").addEventListener("click", clearAll);

    return { render, removeItem, build, playSelected: () => trigger(selected) };
  }

  MPC.program = { create, MIME_ITEM };
})();
