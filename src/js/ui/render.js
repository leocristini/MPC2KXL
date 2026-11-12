// DOM rendering: sample table rows and the LCD memory readout.
(() => {
  const $ = (id) => document.getElementById(id);

  function fmtBytes(b) {
    return b < 1024 * 1024 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(2) + " MB";
  }

  function setStatus(msg, err) {
    const el = $("status");
    el.textContent = msg;
    el.classList.toggle("err", !!err);
  }

  function button(label, onClick) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "icon"; b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  // Builds one table row. handlers: { onRename(item, value) → name, onPlay(item), onRemove(item) }
  function renderRow(it, s, handlers) {
    const tr = document.createElement("tr");
    const td = (cls, content) => {
      const d = document.createElement("td");
      if (cls) d.className = cls;
      if (content instanceof Node) d.appendChild(content); else d.textContent = content;
      tr.appendChild(d);
      return d;
    };

    const src = document.createElement("div");
    const srcName = document.createElement("span");
    srcName.className = "src-name"; srcName.textContent = it.file.name;
    src.appendChild(srcName);
    if (it.out) src.appendChild(MPC.wave.canvasFor(it.out.chans, "wave-sm"));
    td("src", src);

    if (it.error) {
      const p = document.createElement("span");
      p.className = "pill bad"; p.textContent = "Can't decode: try converting to WAV first";
      td("", p).colSpan = 5;
    } else if (!it.out) {
      td("", "Decoding…").colSpan = 5;
    } else {
      // Rows of decoded samples can be dragged onto program pads.
      tr.draggable = true;
      tr.className = "draggable";
      tr.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData(MPC.program.MIME_ITEM, String(it.id));
        e.dataTransfer.effectAllowed = "copy";
      });

      const inp = document.createElement("input");
      inp.type = "text"; inp.className = "name"; inp.maxLength = MPC.NAME_LENGTH; inp.value = it.name; inp.id = "name-" + it.id;
      inp.setAttribute("aria-label", "MPC name for " + it.file.name);
      inp.addEventListener("change", () => { inp.value = handlers.onRename(it, inp.value); });
      td("", inp);

      const frames = it.out.chans[0].length, nch = it.out.chans.length;
      td("num", (frames / MPC.RATE).toFixed(2) + " s");
      td("num", nch === 2 ? "ST" : "M");
      td("num", fmtBytes(frames * nch * 2 + (s.fmt === "snd" ? MPC.SND_HEADER : MPC.WAV_HEADER)));

      const db = it.out.peak > 0 ? 20 * Math.log10(it.out.peak) : -Infinity;
      const pill = document.createElement("span");
      pill.className = "pill " + (db >= -0.05 && !s.norm ? "warn" : "ok");
      pill.textContent = isFinite(db) ? db.toFixed(1) + " dB" : "silent";
      td("num", pill);
    }

    const acts = document.createElement("div");
    acts.className = "row-actions";
    if (it.out) acts.appendChild(button("Play", () => handlers.onPlay(it)));
    acts.appendChild(button("Remove", () => handlers.onRemove(it)));
    td("", acts);
    return tr;
  }

  function renderLcd(totalBytes, readyCount, ramMB) {
    const ram = ramMB * 1048576, over = totalBytes > ram;
    $("memBar").style.width = Math.min(100, (totalBytes / ram) * 100) + "%";
    $("lcd").classList.toggle("over", over);
    $("memLabel").textContent = (totalBytes / 1048576).toFixed(2) + " / " + ramMB.toFixed(2) + " MB" + (over ? " FULL" : "");
    $("memCount").textContent = readyCount + (readyCount === 1 ? " SOUND" : " SOUNDS");
    $("memTime").textContent = ((ram - Math.min(totalBytes, ram)) / (MPC.RATE * 2)).toFixed(1) + " s MONO FREE";
  }

  // Full redraw from state.
  function render(items, s, handlers) {
    const tb = $("rows");
    tb.textContent = "";
    let total = 0;
    for (const it of items) {
      tb.appendChild(renderRow(it, s, handlers));
      if (it.out) total += it.out.chans[0].length * it.out.chans.length * 2;
    }
    const ready = items.filter((it) => it.out).length;
    $("empty").style.display = items.length ? "none" : "block";
    renderLcd(total, ready, s.ramMB);
    $("dl").disabled = !ready;
  }

  MPC.view = { render, setStatus };
})();
