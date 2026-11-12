# MPC2000XL Sample Prep

Converts WAV / MP3 / FLAC / OGG / M4A files into Akai MPC2000XL-ready samples — 16-bit, 44.1 kHz,
8-character names — as standard `.WAV` or native `.SND`, bundled in a ZIP. Everything runs in the browser;
nothing is uploaded.

Known issue: AIFF files fail to decode in Chrome (the browser's decoder doesn't support them).
Other browsers are untested.

## Use

Open `index.html` in a browser (double-click, or `npm start`). No build step.

## Layout

```
index.html              page markup; loads the scripts below in order
src/
  styles/main.css       all styles (theme tokens, light/dark)
  js/
    core/               pure logic, no DOM
      constants.js      MPC namespace + constants (sample rate, header sizes)
      pcm.js            float → int16 with dither
      wav.js            WAV encoder
      snd.js            native .SND encoder (42-byte header)
      zip.js            store-only ZIP writer + CRC-32
      names.js          8-char name cleanup and de-duplication
      process.js        mono mixdown, silence trim, normalize
    audio/decode.js     Web Audio decode + resample, preview playback
    ui/
      save.js           claude.ai downloads capability, or plain browser download
      render.js         table rows + LCD memory meter
      app.js            state, settings, file intake, export, event wiring
tests/e2e.test.mjs      headless Chrome end-to-end test
```

The scripts are plain (non-module) files sharing a `window.MPC` namespace, because browsers block
ES modules on `file://` pages.

## Test

Needs Google Chrome and `ffmpeg`.

```
npm install
npm test
```
