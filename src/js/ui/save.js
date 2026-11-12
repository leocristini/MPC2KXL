// Saving the ZIP: claude.ai "downloads" capability when available, otherwise a normal browser download.
(() => {
  let downloads = null;

  // Resolves once we know whether the claude.ai capability exists.
  function init() {
    if (window.claude && typeof window.claude.use === "function") {
      return window.claude.use("downloads").then((d) => { downloads = d || null; }).catch(() => {});
    }
    return Promise.resolve();
  }

  function browserSave(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // Returns "saved" | "declined" | "busy".
  async function save(blob, filename) {
    if (!downloads) { browserSave(blob, filename); return "saved"; }
    try {
      await downloads.save({ filename, data: blob });
      return "saved";
    } catch (e) {
      if (e && e.code === "declined") return "declined";
      if (e && e.code === "rate_limited") return "busy";
      browserSave(blob, filename);
      return "saved";
    }
  }

  MPC.save = { init, save };
})();
