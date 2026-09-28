// Think First page script: catches sends, hosts the Think First frame, and watches for the answer.
(() => {
  const SITES = {
    "claude.ai": {
      composer: ['div.ProseMirror[contenteditable="true"]', 'fieldset [contenteditable="true"]', 'textarea'],
      send: ['button[aria-label="Send message"]', 'button[aria-label*="Send" i]'],
      answer: ['.font-claude-response', '.font-claude-message', '[data-testid="assistant-message"]'],
      streaming: ['[data-is-streaming="true"]', 'button[aria-label*="Stop" i]']
    },
    "chatgpt.com": {
      composer: ['#prompt-textarea', 'form [contenteditable="true"]', 'form textarea'],
      send: ['button[data-testid="send-button"]', '#composer-submit-button', 'button[aria-label*="Send" i]'],
      answer: ['[data-message-author-role="assistant"]'],
      streaming: ['button[data-testid="stop-button"]', 'button[aria-label*="Stop" i]']
    },
    "gemini.google.com": {
      composer: ['rich-textarea .ql-editor', 'div[contenteditable="true"][role="textbox"]'],
      send: ['button[aria-label*="Send" i]', 'button.send-button'],
      answer: ['model-response message-content', 'model-response'],
      streaming: ['button[aria-label*="Stop" i]']
    }
  };
  const GENERIC = {
    composer: [],
    send: ['button[aria-label*="Send" i]', 'button[aria-label*="Submit" i]', 'button[type="submit"]'],
    answer: [],
    streaming: ['button[aria-label*="Stop" i]']
  };
  const site = SITES[location.hostname] || GENERIC;

  const EXT_ORIGIN = new URL(chrome.runtime.getURL("")).origin;
  let settings = { enabled: true, minLength: 20, trackUsage: true };
  let frame = null, port = null;
  let bypass = false, deciding = false, decideTimer = null;
  let watch = null;

  chrome.storage.local.get(["enabled", "minLength", "trackUsage"]).then(s => {
    settings.enabled = s.enabled !== false;
    settings.trackUsage = s.trackUsage !== false;
    if (Number.isFinite(s.minLength)) settings.minLength = s.minLength;
  });
  chrome.storage.onChanged.addListener(ch => {
    if (ch.enabled) settings.enabled = ch.enabled.newValue !== false;
    if (ch.trackUsage) settings.trackUsage = ch.trackUsage.newValue !== false;
    if (ch.minLength) settings.minLength = ch.minLength.newValue;
  });

  const q = list => { for (const s of list) { const el = document.querySelector(s); if (el) return el; } return null; };
  const qAll = list => { for (const s of list) { const els = document.querySelectorAll(s); if (els.length) return [...els]; } return []; };
  const isTextbox = el => el && (el.tagName === "TEXTAREA" || el.isContentEditable);
  let lastBox = null;
  window.addEventListener("focusin", e => { if (isTextbox(e.target)) lastBox = e.target; }, true);
  const composer = () => q(site.composer) || (isTextbox(document.activeElement) ? document.activeElement : null) ||
    (lastBox && lastBox.isConnected ? lastBox : null);
  const sendButton = () => q(site.send);
  const composerText = () => { const c = composer(); return c ? (c.value ?? c.innerText ?? "").trim() : ""; };

  // ---------- Frame ----------
  function mount() {
    if (frame) return;
    frame = document.createElement("iframe");
    frame.src = chrome.runtime.getURL("ui.html");
    frame.title = "Think First";
    frame.setAttribute("allowtransparency", "true");
    for (const [k, v] of Object.entries({ position: "fixed", border: "0", background: "transparent", "color-scheme": "normal",
      "z-index": "2147483647", display: "none", margin: "0", padding: "0", "max-width": "none", "min-width": "0", transform: "none" })) {
      frame.style.setProperty(k, v, "important");
    }
    frame.addEventListener("load", () => {
      const ch = new MessageChannel();
      port = ch.port1;
      port.onmessage = e => onFrameMessage(e.data);
      frame.contentWindow.postMessage({ gf: "init", site: location.hostname }, EXT_ORIGIN, [ch.port2]);
    });
    document.documentElement.appendChild(frame);
  }
  if (document.readyState === "complete") mount(); else window.addEventListener("load", mount);

  function setMode(mode, height) {
    const set = obj => { for (const [k, v] of Object.entries(obj)) frame.style.setProperty(k, v, "important"); };
    if (mode === "modal") {
      set({ display: "block", top: "0", left: "0", right: "auto", bottom: "auto", width: "100vw", height: "100vh", "max-height": "none" });
      frame.focus();
    } else if (mode === "panel") {
      set({ display: "block", top: "56px", left: "auto", right: "8px", bottom: "auto",
            width: "min(460px, calc(100vw - 16px))", height: Math.min(height || 220, innerHeight - 72) + "px" });
    } else {
      set({ display: "none" });
    }
  }

  function onFrameMessage(msg) {
    if (msg.t === "mode") {
      if (msg.mode === "modal") { deciding = false; clearTimeout(decideTimer); }
      setMode(msg.mode, msg.height);
    }
    if (msg.t === "proceed") proceed(msg.withGuess);
    if (msg.t === "getAnswer") port.postMessage({ t: "answerText", text: selectedText() || latestAnswer().text });
  }

  // ---------- Sending ----------
  function proceed(withGuess) {
    deciding = false;
    clearTimeout(decideTimer);
    if (withGuess) startWatch();
    bypass = true;
    setTimeout(() => { bypass = false; }, 3000);
    composer()?.focus();
    const btn = sendButton();
    if (btn && !btn.disabled) btn.click();
    else port?.postMessage({ t: "note", text: "Press Enter to send your message." });
  }

  function intercept(e) {
    if (bypass) { bypass = false; return; }
    if (deciding) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    const text = composerText();
    if (!text || !port) return;
    if (!settings.enabled || text.length < settings.minLength) {
      if (settings.trackUsage) port.postMessage({ t: "log", text });
      return; // let the message send normally
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    deciding = true;
    port.postMessage({ t: "maybeAsk", text });
    // Never block sending if the frame doesn't answer.
    decideTimer = setTimeout(() => { if (deciding) proceed(false); }, 2500);
  }

  // Registered at document_start so these run before the site's own handlers.
  window.addEventListener("keydown", e => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing || !e.isTrusted) return;
    const c = composer();
    if (!c || !(c === e.target || c.contains(e.target))) return;
    intercept(e);
  }, true);

  window.addEventListener("click", e => {
    if (!e.isTrusted) return;
    const btn = e.target.closest?.("button");
    if (!btn || btn !== sendButton()) return;
    intercept(e);
  }, true);

  // ---------- Active time (tab visible, window focused, and you interacted in the last 60 s) ----------
  let lastInput = Date.now(), activeSec = 0;
  ["keydown", "mousedown", "mousemove", "wheel", "touchstart"].forEach(ev =>
    window.addEventListener(ev, () => { lastInput = Date.now(); }, { capture: true, passive: true }));
  setInterval(() => {
    if (document.visibilityState === "visible" && document.hasFocus() && Date.now() - lastInput < 60000) activeSec += 5;
  }, 5000);
  setInterval(() => {
    if (activeSec && port) { port.postMessage({ t: "active", seconds: activeSec }); activeSec = 0; }
  }, 30000);

  // ---------- Finding the answer ----------
  const selectedText = () => { const s = window.getSelection()?.toString().trim(); return s && s.length > 20 ? s : ""; };
  const norm = s => s.replace(/\s+/g, " ").trim();

  function latestAnswer(baseline = -1, question = "") {
    const els = qAll(site.answer);
    if (els.length > baseline && els.length) {
      const fresh = baseline >= 0 ? els.slice(baseline) : [els[els.length - 1]];
      return { text: fresh.map(el => el.innerText.trim()).join("\n\n"), found: true };
    }
    // Fallback: take the page text that appears after the question.
    if (question) {
      const page = norm((document.querySelector("main") || document.body).innerText);
      const key = norm(question).slice(0, 60);
      const i = page.lastIndexOf(key);
      if (i >= 0) {
        const after = page.slice(i + norm(question).length).trim();
        if (after.length > 20) return { text: after, found: true };
      }
    }
    return { text: "", found: false };
  }

  function startWatch() {
    clearInterval(watch?.timer);
    const question = composerText();
    const baseline = qAll(site.answer).length;
    let last = "", stable = 0, ticks = 0;
    watch = {
      timer: setInterval(() => {
        ticks++;
        const { text, found } = latestAnswer(baseline, question);
        const streaming = !!q(site.streaming);
        if (found && text && text === last && !streaming) stable++; else stable = 0;
        last = text;
        if (stable >= 3) {
          clearInterval(watch.timer);
          port?.postMessage({ t: "answer", text });
        } else if (ticks > 240) {
          clearInterval(watch.timer);
          port?.postMessage({ t: "answerMissing" });
        }
      }, 1000)
    };
  }
})();
