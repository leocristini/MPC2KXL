// End-to-end test: loads index.html in headless Chrome, feeds it ffmpeg-generated audio,
// downloads WAV and .SND ZIPs, and checks the output bytes.
// Requires: Google Chrome, ffmpeg, `npm install`. Run with `npm test`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mpc-e2e-"));
const audioDir = path.join(tmp, "audio"), dlDir = path.join(tmp, "dl");
let browser, page;
const pageErrors = [];

const ff = (...args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args]);

function makeFixtures() {
  fs.mkdirSync(audioDir); fs.mkdirSync(dlDir);
  // Stereo 48 kHz MP3: 0.5 s silence + 1 s tone + 0.5 s silence.
  ff("-f", "lavfi", "-i", "sine=f=440:d=1:sample_rate=48000", "-f", "lavfi", "-i", "sine=f=660:d=1:sample_rate=48000",
     "-filter_complex", "[0][1]amerge=inputs=2,volume=0.25,adelay=500|500,apad=pad_dur=0.5", path.join(audioDir, "Kick Dusty 01.mp3"));
  // Mono 22.05 kHz WAV, 0.75 s.
  ff("-f", "lavfi", "-i", "sine=f=220:d=0.75:sample_rate=22050", "-ac", "1", "-c:a", "pcm_s16le", path.join(audioDir, "snare-tight.wav"));
}

// Minimal store-only ZIP reader → { name: Buffer }
function readZip(file) {
  const b = fs.readFileSync(file), out = {};
  let o = 0;
  while (b.readUInt32LE(o) === 0x04034b50) {
    const size = b.readUInt32LE(o + 18), nlen = b.readUInt16LE(o + 26), xlen = b.readUInt16LE(o + 28);
    const name = b.subarray(o + 30, o + 30 + nlen).toString();
    out[name] = b.subarray(o + 30 + nlen + xlen, o + 30 + nlen + xlen + size);
    o += 30 + nlen + xlen + size;
  }
  return out;
}

const tableRows = () => page.$$eval("#rows tr", (trs) => trs.map((tr) =>
  [...tr.querySelectorAll("td")].map((td) => td.querySelector("input")?.value ?? td.textContent.trim())));

async function downloadZip(button = "#dl") {
  const before = new Set(fs.readdirSync(dlDir));
  await page.click(button);
  // Wait for the new ZIP to appear and finish writing (size non-zero and unchanged between polls).
  let lastSize = -1;
  for (let i = 0; i < 50; i++) {
    const n = fs.readdirSync(dlDir).find((f) => !before.has(f) && f.endsWith(".zip"));
    if (n) {
      const size = fs.statSync(path.join(dlDir, n)).size;
      if (size > 0 && size === lastSize) return path.join(dlDir, n);
      lastSize = size;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("no download");
}

before(async () => {
  makeFixtures();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dlDir });
  await page.goto("file://" + path.join(ROOT, "index.html"));
  const input = await page.$("#file");
  await input.uploadFile(...fs.readdirSync(audioDir).sort().map((f) => path.join(audioDir, f)));
  await page.waitForFunction(() => document.querySelector("#status").textContent.includes("ready"), { timeout: 20000 });
});

after(async () => {
  await browser?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("decodes, names, trims and normalizes", async () => {
  const rows = await tableRows();
  assert.deepEqual(rows.map((r) => r.slice(1, 4)), [["KICKDUST", "1.00 s", "M"], ["SNARE-TI", "0.75 s", "M"]]);
  assert.ok(rows.every((r) => r[5] === "-0.3 dB"));
  assert.equal(await page.$eval("#dl", (b) => b.disabled), false);
});

test("WAV export: valid 16-bit 44.1 kHz mono files", async () => {
  const files = readZip(await downloadZip());
  assert.deepEqual(Object.keys(files).sort(), ["KICKDUST.WAV", "SNARE-TI.WAV"]);
  for (const d of Object.values(files)) {
    assert.equal(d.toString("ascii", 0, 4), "RIFF");
    assert.equal(d.readUInt16LE(22), 1);       // channels
    assert.equal(d.readUInt32LE(24), 44100);   // rate
    assert.equal(d.readUInt16LE(34), 16);      // bits
  }
});

test(".SND export, keep channels: header matches data", async () => {
  await page.click('label[for="fmt-snd"]');
  await page.click('label[for="ch-keep"]');
  const files = readZip(await downloadZip());
  const kick = files["KICKDUST.SND"], snare = files["SNARE-TI.SND"];
  for (const [d, name, stereo] of [[kick, "KICKDUST", 1], [snare, "SNARE-TI", 0]]) {
    assert.deepEqual([d[0], d[1]], [1, 4]);
    assert.equal(d.toString("ascii", 2, 18).trim(), name);
    assert.equal(d[19], 100);                  // level
    assert.equal(d[21], stereo);
    assert.equal(d.readUInt16LE(40), 44100);
    const frames = (d.length - 42) / 2 / (stereo ? 2 : 1);
    assert.equal(d.readUInt32LE(30), frames);  // end point
  }
});

// Simulates an HTML5 drag from `fromSel` to `toSel` inside the page.
const drag = (fromSel, toSel) => page.evaluate((f, t) => {
  const from = document.querySelector(f), to = document.querySelector(t);
  const dt = new DataTransfer();
  from.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
  to.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
  to.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
}, fromSel, toSel);

const padName = (i) => page.$eval(`.pad[data-pad="${i}"] .pad-name`, (e) => e.textContent);

// Reads the fields this app writes from a .PGM buffer.
function parsePgm(d) {
  const n = d.readUInt16LE(2);
  const names = Array.from({ length: n }, (_, i) => d.toString("ascii", 4 + 17 * i, 4 + 17 * i + 16).trim());
  let o = 4 + 17 * n + 2;
  const name = d.toString("ascii", o, o + 16).trim(); o += 17 + 9 + 1 + 5;
  const notes = Array.from({ length: 64 }, (_, i) => d.subarray(o + 25 * i, o + 25 * i + 25)); o += 1600 + 1;
  const mix = Array.from({ length: 64 }, (_, i) => d.subarray(o + 6 * i, o + 6 * i + 6)); o += 384 + 3;
  const padNotes = [...d.subarray(o, o + 64)]; o += 64 + 200;
  return { magic: [d[0], d[1]], names, name, notes, mix, padNotes, exactLength: o === d.length };
}

test("program: drag samples onto pads, edit, swap, download PGM + SND", async () => {
  assert.equal(await page.$eval("#dl-pgm", (b) => b.disabled), true);

  // Table rows are [KICKDUST, SNARE-TI]. Pad 0 = A01, pad 1 = A02.
  await drag("#rows tr:nth-child(1)", '.pad[data-pad="0"]');
  await drag("#rows tr:nth-child(2)", '.pad[data-pad="1"]');
  await drag("#rows tr:nth-child(1)", '.pad[data-pad="5"]');   // same sample on a second pad
  assert.equal(await padName(0), "KICKDUST");
  assert.equal(await padName(1), "SNARE-TI");
  assert.equal(await page.$eval("#pgm-count", (e) => e.textContent), "3 pads assigned");

  // Edit A02: tune -0.7 st, mono, volume 80, pan 30.
  await page.click('.pad[data-pad="1"]');
  await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
    set("pe-tune", "-0.7"); set("pe-overlap", "mono"); set("pe-volume", "80"); set("pe-pan", "30");
  });

  // Swap A06 (kick) with A07 (empty) → kick moves to A07.
  await drag('.pad[data-pad="5"]', '.pad[data-pad="6"]');
  assert.equal(await padName(5), "");
  assert.equal(await padName(6), "KICKDUST");

  await page.$eval("#pgm-name", (e) => { e.value = "My Kit"; });
  const files = readZip(await downloadZip("#dl-pgm"));
  assert.deepEqual(Object.keys(files).sort(), ["KICKDUST.SND", "MYKIT.PGM", "SNARE-TI.SND"]);

  const p = parsePgm(files["MYKIT.PGM"]);
  assert.ok(p.exactLength);
  assert.deepEqual(p.magic, [7, 4]);
  assert.equal(p.name, "My Kit");
  assert.deepEqual(p.names, ["KICKDUST", "SNARE-TI"]);
  assert.deepEqual(p.padNotes.slice(0, 7), [37, 36, 42, 82, 40, 38, 46]);  // factory layout
  const note = (pad) => p.notes[p.padNotes[pad] - 35];
  const mix = (pad) => p.mix[p.padNotes[pad] - 35];
  assert.equal(note(0)[0], 0);                     // A01 → KICKDUST
  assert.equal(note(1)[0], 1);                     // A02 → SNARE-TI
  assert.equal(note(5)[0], 0xFF);                  // A06 empty after swap
  assert.equal(note(6)[0], 0);                     // A07 → KICKDUST
  assert.equal(note(1).readInt16LE(9), -7);        // tune
  assert.equal(note(1)[6], 1);                     // mono
  assert.deepEqual([mix(1)[1], mix(1)[2]], [80, 30]);
  assert.deepEqual([mix(0)[1], mix(0)[2]], [100, 50]);
  assert.equal(p.notes.filter((n) => n[0] !== 0xFF).length, 3);
});

test("panel: F-keys switch screens, data wheel and fader edit the selected pad", async () => {
  const visible = (sel) => page.$eval(sel, (e) => !e.hidden);
  await page.click('.fkey[data-screen="sound"]');
  assert.equal(await visible("#screen-sound"), true);
  assert.equal(await visible("#screen-pgm"), false);

  await page.click('.pad[data-pad="1"]');                       // hitting a pad opens the PGM screen
  assert.equal(await visible("#screen-pgm"), true);
  assert.equal(await page.$eval("#lcd-mode", (e) => e.textContent), "PROGRAM");

  await page.focus("#pe-attack");                                // make Attack the wheel's target
  const before = Number(await page.$eval("#pe-attack", (e) => e.value));
  await page.$eval("#wheel", (w) => { for (let i = 0; i < 3; i++) w.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true })); });
  assert.equal(Number(await page.$eval("#pe-attack", (e) => e.value)), before + 3);
  assert.equal(await page.$eval("#wheel-target", (e) => e.textContent), "Attack");

  await page.$eval("#nv-slider", (s) => { s.value = "25"; s.dispatchEvent(new Event("input", { bubbles: true })); });
  assert.equal(await page.$eval("#pe-tune", (e) => e.value), "2.5");
});

test("program: removing a sample clears its pads", async () => {
  await page.click('.fkey[data-screen="sound"]');
  await page.click("#rows tr:nth-child(2) button:last-child");   // Remove SNARE-TI
  assert.equal(await padName(1), "");
  assert.equal(await page.$eval("#pgm-count", (e) => e.textContent), "2 pads assigned");
});

test("no page errors", () => assert.deepEqual(pageErrors, []));
