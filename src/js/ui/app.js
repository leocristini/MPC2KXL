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
  const handlers = {
    onRename(it, value) {
      it.name = uniqueName(cleanName(value) || baseName(it.file.name), takenNames(it.id));
      return it.name;
    },
    onPlay(it) {
      try { MPC.audio.play(it.out.chans); }
      catch (e) { MPC.view.setStatus("Playback is blocked in this view.", true); }
    },
    onRemove(it) {
      state.items = state.items.filter((x) => x !== it);
      render();
    },
  };

  const render = () => MPC.view.render(state.items, settings(), handlers);

  // Re-run DSP for every decoded item after a setting changes.
  function reprocess() {
    const s = settings();
    for (const it of state.items) if (it.raw) it.out = MPC.dsp.processSample(it.raw, s);
    render();
  }

  // ---------- intake ----------
  async function addFiles(list) {
    for (const file of Array.from(list)) {
      const it = { id: nextId++, file, raw: null, out: null, error: false, name: "" };
      it.name = uniqueName(baseName(file.name), takenNames(it.id));
      state.items.push(it);
    }
    render();

    for (const it of state.items.filter((x) => !x.raw && !x.error)) {
      try {
        it.raw = await MPC.audio.decodeFile(it.file);
        it.out = MPC.dsp.processSample(it.raw, settings());
      } catch (e) {
        it.error = true;
      }
      render();
    }
    MPC.view.setStatus(state.items.filter((x) => x.out).length + " ready. Files stay in your browser.");
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

  async function download() {
    const s = settings();
    const files = buildFiles(s);
    const filename = "MPC_" + (s.fmt === "snd" ? "SND" : "WAV") + "_" + files.length + ".zip";
    const result = await MPC.save.save(MPC.zip.buildZip(files), filename);
    if (result === "saved") MPC.view.setStatus("Saved " + files.length + " files.");
    else if (result === "declined") MPC.view.setStatus("Download cancelled.");
    else MPC.view.setStatus("A save prompt is already open. Finish it, then try again.", true);
  }

  // ---------- wiring ----------
  const drop = $("drop"), fileInput = $("file");
  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", () => { addFiles(fileInput.files); fileInput.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("hot"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("hot"); }));
  drop.addEventListener("drop", (e) => { if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

  document.querySelectorAll('input[name="fmt"], input[name="ch"], #opt-norm, #opt-trim, #opt-dither, #ram')
    .forEach((el) => el.addEventListener("change", reprocess));
  $("clear").addEventListener("click", () => { state.items = []; render(); MPC.view.setStatus("Cleared."); });
  $("dl").addEventListener("click", download);

  render();
  MPC.save.init();
})();
