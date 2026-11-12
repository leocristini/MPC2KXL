// Device controls that aren't tied to one feature: LCD screens on the F-keys / MAIN SCREEN,
// the DATA wheel (nudges whichever program field is active, like the MPC's cursor + wheel)
// and the MAIN VOLUME knob (preview volume).
(() => {
  const $ = (id) => document.getElementById(id);
  const SCREEN_TITLES = { sound: "SOUND", pgm: "PROGRAM" };

  // ---------- screens ----------
  function show(name) {
    document.querySelectorAll(".lcd-screen").forEach((s) => { s.hidden = s.dataset.screen !== name; });
    document.querySelectorAll(".lcd-tabs span").forEach((t) => t.classList.toggle("on", t.dataset.for === name));
    document.querySelectorAll(".fkey[data-screen]").forEach((k) => k.setAttribute("aria-pressed", k.dataset.screen === name ? "true" : "false"));
    $("lcd-mode").textContent = SCREEN_TITLES[name] || name.toUpperCase();
    // Canvases on a hidden screen have no size; let the app redraw now that this one is visible.
    document.dispatchEvent(new CustomEvent("mpc:screen", { detail: name }));
  }
  document.querySelectorAll(".fkey[data-screen]").forEach((k) => k.addEventListener("click", () => show(k.dataset.screen)));
  $("main-screen").addEventListener("click", () => show("sound"));

  // ---------- rotary helper: wheel, drag and arrow keys → steps ----------
  // onStep(n) is called with whole steps; onTurn(deg) for the visual rotation.
  function rotary(el, { degPerStep, onStep, onTurn, vertical = false }) {
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      const s = e.deltaY < 0 ? 1 : -1;
      onTurn(s * degPerStep); onStep(s);
    }, { passive: false });

    el.addEventListener("keydown", (e) => {
      const s = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
      if (!s) return;
      e.preventDefault(); onTurn(Math.sign(s) * degPerStep); onStep(s);
    });

    let last = null, acc = 0;
    const angle = (e) => {
      const r = el.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    };
    el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); last = vertical ? e.clientY : angle(e); acc = 0; });
    el.addEventListener("pointermove", (e) => {
      if (last === null) return;
      let d;
      if (vertical) { d = (last - e.clientY) * 2; last = e.clientY; }        // drag up = turn right
      else { const a = angle(e); d = a - last; if (d > 180) d -= 360; if (d < -180) d += 360; last = a; }
      onTurn(d); acc += d;
      const steps = Math.trunc(acc / degPerStep);
      if (steps) { acc -= steps * degPerStep; onStep(steps); }
    });
    const end = () => { last = null; };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  // ---------- data wheel ----------
  const FIELDS = { "pe-tune": "Tune", "pe-attack": "Attack", "pe-decay": "Decay", "pe-overlap": "Mode", "pe-volume": "Level", "pe-pan": "Pan" };
  let active = "pe-tune";

  function setActive(id) {
    if (!FIELDS[id]) return;
    active = id;
    Object.keys(FIELDS).forEach((f) => $(f).classList.toggle("active", f === id));
    $("wheel-target").textContent = FIELDS[id];
    $("wheel").setAttribute("aria-valuetext", FIELDS[id] + " " + $(id).value);
  }
  Object.keys(FIELDS).forEach((id) => $(id).addEventListener("focus", () => setActive(id)));

  function nudge(steps) {
    if (!steps) return;
    show("pgm");
    if ($("pe-fields").disabled) return;
    const el = $(active);
    if (el.tagName === "SELECT") {
      el.selectedIndex = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + Math.sign(steps)));
    } else if (el.type === "number") {
      steps > 0 ? el.stepUp(steps) : el.stepDown(-steps);
    } else {
      el.value = Number(el.value) + steps;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    $("wheel").setAttribute("aria-valuetext", FIELDS[active] + " " + el.value);
  }

  const wheelKnob = $("wheel").querySelector(".wheel-knob");
  let wheelRot = 0;
  rotary($("wheel"), {
    degPerStep: 15,
    onStep: nudge,
    onTurn: (d) => { wheelRot += d; wheelKnob.style.setProperty("--rot", wheelRot + "deg"); },
  });

  // ---------- main volume knob: 0..100, 270° sweep ----------
  const knob = $("vol-knob"), cap = knob.querySelector(".knob-cap");
  let volume = 80;
  function setVolume(v) {
    volume = Math.max(0, Math.min(100, Math.round(v)));
    cap.style.setProperty("--rot", (-135 + volume * 2.7) + "deg");
    knob.setAttribute("aria-valuenow", String(volume));
    MPC.audio.setVolume(volume / 100);
  }
  rotary(knob, { degPerStep: 2.7, vertical: true, onStep: (s) => setVolume(volume + s), onTurn: () => {} });
  setVolume(volume);

  setActive(active);
  show("sound");

  MPC.panel = { show };
})();
