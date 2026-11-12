# MPC2000XL Sample Prep

Converts WAV / MP3 / FLAC / OGG / M4A files into Akai MPC2000XL-ready samples — 16-bit, 44.1 kHz,
8-character names — as standard `.WAV` or native `.SND`, bundled in a ZIP. Everything runs in the browser;
nothing is uploaded.

The page is styled as an MPC2000XL-like unit. The LCD shows the sound list (F1 / MAIN SCREEN) and
the program editor (F2). The blue keypad sets the output (WAV/SND, mono, normalize, trim, dither),
LOAD (orange) opens files (or drop them anywhere on the unit), the red keys save the sounds or the
program, PLAY/STOP audition the selected pad, MAIN VOLUME sets preview volume, the note-variation
fader tunes the selected pad and the DATA wheel nudges whichever program field is selected.

It also builds **programs**: drag samples onto a 4×4 pad grid (banks A–D), set tune / attack / decay /
voice overlap / volume / pan per pad, and download a ZIP with the `.PGM` and the `.SND` files it uses.
Copy them to one folder on the card and load the `.PGM` with its sounds.

Known issue: AIFF files fail to decode in Chrome (the browser's decoder doesn't support them).
Other browsers are untested.

## Use

```
npm start
```

This serves the folder at http://localhost:5173 and opens it in your browser (Ctrl+C to stop; set `PORT`
to change the port). No build step and no dependencies needed to run it.

Opening `index.html` directly also works, except when the project lives in a macOS-protected folder
such as ~/Documents or ~/Desktop. There the browser is only allowed to read the file you opened, so
the CSS and scripts don't load and the page shows up unstyled and inactive. Use `npm start` instead.

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
      pgm.js            program (.PGM) encoder
    audio/decode.js     Web Audio decode + resample, preview playback
    ui/
      save.js           claude.ai downloads capability, or plain browser download
      wave.js           waveform drawing on <canvas>
      render.js         sound list rows + LCD memory meter
      program.js        pad grid, drag and drop, pad editor
      panel.js          LCD screens on the F-keys, data wheel, volume knob
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

## .PGM format

The program layout and defaults come from the open-source vMPC2000XL emulator's format description,
checked byte for byte against the example `.PGM` files it ships. Programs are not yet verified on hardware.
