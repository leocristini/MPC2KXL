// App controller: state, settings, file intake, export, and event wiring. Loaded last.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const { baseName, cleanName, uniqueName } = MPC.names;

  const state = { items: [] };
  let nextId = 1;

  // ---------- settings ----------
  function settings() {
    return {
      fmt: document.querySelector('input[name="fmt"]:checked').value,
      ch: document.querySelector('input[name="ch"]:checked').value,
      norm: $("opt-norm").checked,
      trim: $("opt-trim").checked,
      dither: $("opt-dither").checked,
      ramMB: Number($("ram").value),
    };
  }

  const takenNames = (exceptId) => new Set(state.items.filter((it) => it.id !== exceptId).map((it) => it.name));

  // ---------- render ----------
  function play(it, padSettings) {
    try { MPC.audio.play(it.out.chans, padSettings); }
    catch (e) { MPC.view.setStatus("Playback is blocked in this view.", true); }
  }

  const handlers = {
    onRename(it, value) {
      it.name = uniqueName(cleanName(value) || baseName(it.file.name), takenNames(it.id));
      program.render();
      return it.name;
    },
    onPlay(it) { play(it); },
    onRemove(it) {
      state.items = state.items.filter((x) => x !== it);
      program.removeItem(it.id);
      render();
    },
  };

  const program = MPC.program.create({
    items: () => state.items,
    findItem: (id) => state.items.find((it) => it.id === id),
    play,
    addFiles: (files, onCreated) => addFiles(files, onCreated),
    changed: () => {},
  });

  const render = () => {
    MPC.view.render(state.items, settings(), handlers);
    program.render();
  };

  // Re-run DSP for every decoded item after a setting changes.
  function reprocess() {
    const s = settings();
    for (const it of state.items) if (it.raw) it.out = MPC.dsp.processSample(it.raw, s);
    render();
  }

  // ---------- intake ----------
  // onCreated(items) runs once the new items exist, before decoding (used to drop files straight onto pads).
  async function addFiles(list, onCreated) {
    const created = [];
    for (const file of Array.from(list)) {
      const it = { id: nextId++, file, raw: null, out: null, error: false, name: "" };
      it.name = uniqueName(baseName(file.name), takenNames(it.id));
      state.items.push(it);
      created.push(it);
    }
    if (onCreated) onCreated(created);
    render();

    for (const it of state.items.filter((x) => !x.raw && !x.error)) {
      MPC.view.setStatus("Loading " + it.file.name + " …");
      try {
        it.raw = await MPC.audio.decodeFile(it.file);
        it.out = MPC.dsp.processSample(it.raw, settings());
      } catch (e) {
        it.error = true;
      }
      render();
    }
    MPC.view.setStatus(state.items.filter((x) => x.out).length + " ready. Files stay in your browser.");
    return created;
  }

  // ---------- export ----------
  function buildFiles(s) {
    const ext = s.fmt === "snd" ? "SND" : "WAV";
    return state.items.filter((it) => it.out).map((it) => {
      const pcm = MPC.pcm.toInt16(it.out.chans, s.dither);
      const data = s.fmt === "snd" ? MPC.snd.encodeSnd(pcm, it.name) : MPC.wav.encodeWav(pcm);
      return { name: it.name + "." + ext, data };
    });
  }

  async function saveZip(files, filename) {
    const result = await MPC.save.save(MPC.zip.buildZip(files), filename);
    if (result === "saved") MPC.view.setStatus("Saved " + filename + " (" + files.length + " files).");
    else if (result === "declined") MPC.view.setStatus("Download cancelled.");
    else MPC.view.setStatus("A save prompt is already open. Finish it, then try again.", true);
  }

  function download() {
    const s = settings();
    const files = buildFiles(s);
    return saveZip(files, "MPC_" + (s.fmt === "snd" ? "SND" : "WAV") + "_" + files.length + ".zip");
  }

  // Program ZIP: NAME.PGM plus a .SND for every sample used on a pad (programs load sounds by name).
  function downloadProgram() {
    const built = program.build();
    if (!built) return;
    const s = settings();
    const files = [{ name: built.fileName + ".PGM", data: MPC.pgm.encodePgm(built.program) }];
    for (const it of built.items) {
      files.push({ name: it.name + ".SND", data: MPC.snd.encodeSnd(MPC.pcm.toInt16(it.out.chans, s.dither), it.name) });
    }
    return saveZip(files, built.fileName + ".zip");
  }

  // ---------- wiring ----------
  const drop = $("drop"), fileInput = $("file");
  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  // Loaded files show up on the SOUND screen.
  const insert = (files) => { MPC.panel.show("sound"); return addFiles(files); };
  fileInput.addEventListener("change", () => { insert(fileInput.files); fileInput.value = ""; });

  // Files can be dropped anywhere on the unit (pads handle their own drops and stop them there).
  const device = $("device");
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
  let dragDepth = 0;
  device.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; dragDepth++; device.classList.add("hot"); });
  device.addEventListener("dragleave", () => { if (dragDepth && !--dragDepth) device.classList.remove("hot"); });
  device.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  device.addEventListener("drop", (e) => {
    dragDepth = 0; device.classList.remove("hot");
    if (!hasFiles(e) || !e.dataTransfer.files.length) return;
    e.preventDefault();
    insert(e.dataTransfer.files);
  });
  // A pad drop stops propagation, so also clear the overlay from the document.
  document.addEventListener("drop", () => { dragDepth = 0; device.classList.remove("hot"); }, true);

  $("stop").addEventListener("click", () => MPC.audio.stop());
  $("play-pad").addEventListener("click", () => program.playSelected());

  document.querySelectorAll('input[name="fmt"], input[name="ch"], #opt-norm, #opt-trim, #opt-dither, #ram')
    .forEach((el) => el.addEventListener("change", reprocess));
  $("clear").addEventListener("click", () => {
    state.items.forEach((it) => program.removeItem(it.id));
    state.items = [];
    render();
    MPC.view.setStatus("Cleared.");
  });
  $("dl").addEventListener("click", download);
  $("dl-pgm").addEventListener("click", downloadProgram);

  // Waveform colours come from the theme: redraw when the system switches light/dark.
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
  // Switching LCD screens: redraw so waveforms on the newly visible screen get sized.
  document.addEventListener("mpc:screen", render);

  render();
  MPC.save.init();
})();
