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

async function downloadZip() {
  const before = new Set(fs.readdirSync(dlDir));
  await page.click("#dl");
  for (let i = 0; i < 50; i++) {
    const n = fs.readdirSync(dlDir).find((f) => !before.has(f) && f.endsWith(".zip"));
    if (n) return path.join(dlDir, n);
    await new Promise((r) => setTimeout(r, 200));
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

test("no page errors", () => assert.deepEqual(pageErrors, []));
