// Tiny static server for local use: `npm start`.
// Opening index.html directly from ~/Documents can fail on macOS: privacy protection lets the browser
// read only the file it was asked to open, so the CSS and JS next to it are blocked. Serving over
// http://localhost avoids that. No dependencies.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 5173;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
  catch { res.writeHead(400).end(); return; }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(ROOT, rel);
  // Stay inside the project and out of dependencies / git internals.
  if (!file.startsWith(ROOT + path.sep) || /[\\/](node_modules|\.git)([\\/]|$)/.test(file.slice(ROOT.length))) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end("Not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`MPC2000XL Sample Prep running at ${url}  (Ctrl+C to stop)`);
  if (!process.env.NO_OPEN) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    execFile(opener, [url], () => {});
  }
});
