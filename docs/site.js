// Think First website script: download links, the interactive demo, and the ticker control.
// Everything on the page works without this file except the demo and the ticker's pause button.
(() => {
  "use strict";

  // Fill these in after publishing. Store links replace the zip download steps automatically.
  const CONFIG = {
    repo: "thinkfirst-app/thinkfirst-app.github.io",
    chromeStoreUrl: "",  // Chrome Web Store link once approved
    vscodeUrl: ""        // VS Code Marketplace link once published
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---------- Download links ----------
  const dl = file => `https://github.com/${CONFIG.repo}/releases/latest/download/${file}`;
  $$("[data-dl]").forEach(a => { a.href = dl(a.dataset.dl); });
  $$("[data-repo]").forEach(a => { a.href = `https://github.com/${CONFIG.repo}`; });
  function useStore(kind, url) {
    if (!url) return;
    $$(`[data-variant="${kind}-zip"]`).forEach(el => { el.hidden = true; });
    $$(`[data-variant="${kind}-store"]`).forEach(el => { el.hidden = false; });
    $$(`[data-store="${kind}"]`).forEach(a => { a.href = url; });
  }
  useStore("browser", CONFIG.chromeStoreUrl);
  useStore("code", CONFIG.vscodeUrl);

  // ---------- Ticker pause / play (WCAG 2.2.2) ----------
  const ticker = $("#ticker");
  const tbtn = $("#ticker-toggle");
  if (ticker && tbtn) {
    tbtn.addEventListener("click", () => {
      const paused = ticker.classList.toggle("is-paused");
      tbtn.setAttribute("aria-pressed", String(paused));
      $(".sr-only", tbtn).textContent = paused ? "Play the example strip" : "Pause the example strip";
    });
  }

  // ---------- Interactive demo ----------
  const demo = $("#demo");
  if (!demo) return;

  const PRESETS = [
    { q: "Why is the sky blue?", a: "Sunlight scatters off air molecules, and shorter blue wavelengths scatter far more than red (Rayleigh scattering), so blue light reaches your eyes from every direction.", field: "Science", type: "Explain" },
    { q: "What's 15% of 240?", a: "36. 10% is 24, 5% is 12, and 24 + 12 = 36.", field: "Math", type: "Explain" },
    { q: "Why does my useEffect run twice?", a: "In React 18+ Strict Mode, development builds mount, unmount, and remount components to surface missing cleanup. It only runs once in production.", field: "Software", type: "Fix" }
  ];
  const FIELDS = ["Software", "Writing", "Science", "Math", "Business", "Law", "Health", "Languages", "History", "Personal"];
  const TYPES = ["Explain", "Write", "Fix", "Summarize", "Decide", "Translate"];
  const MIN = 20;
  const FALLBACK = "The answer would appear here. In this demo, try one of the suggested questions.";

  // Local keyword classifier, used when no on-device model is available. First match wins.
  const FIELD_RULES = [
    ["Languages", /\b(translate|translation|how do you say|in (spanish|french|german|chinese|japanese|korean|italian|portuguese|arabic|hindi))\b/i],
    ["Software", /\b(code|coding|bug|debug|error|exception|function|python|javascript|typescript|java|c\+\+|sql|regex|api|compile|stack ?trace|script|html|css|react|useeffect|git|terminal|npm|server|database)\b/i],
    ["Math", /\b(calculate|solve|equation|math|percent(age)?|derivative|integral|probability|statistics|how much is|split)\b|\d+\s*[-+*/^x×]\s*\d+|\d+(\.\d+)?\s*%/i],
    ["Law", /\b(lease|contract|legal|law|lawyer|attorney|sue|liable|rights|clause|tenant|landlord|copyright|gdpr)\b/i],
    ["Health", /\b(symptoms?|pain|doctor|medication|medicine|diet|sleep|anxiety|diagnos\w*|injury|workout|calories|vitamin|fever)\b/i],
    ["History", /\b(history|historical|century|empire|rome|roman|war|revolution|ancient|medieval|dynasty|who was)\b/i],
    ["Science", /\b(physics|chemistry|biology|molecule|atom|gravity|planet|sky|light|energy|cell|dna|evolution|p-value|experiment|climate|why is|why does|how does)\b/i],
    ["Business", /\b(business|marketing|invoice|pricing|startup|revenue|customer|sales|resume|cover letter|linkedin|meeting|strategy|budget)\b/i],
    ["Writing", /\b(write|rewrite|edit|essay|paragraph|proofread|grammar|poem|story|blog|caption|draft|reword|affect|effect|word)\b/i],
    ["Personal", /\b(should i|advice|deadline|friend|boss|partner|feel|relationship|habit|motivat\w*|my life)\b/i]
  ];
  const TYPE_RULES = [
    ["Translate", /\b(translate|translation|how do you say)\b/i],
    ["Summarize", /\b(summari[sz]e|summary|tl;?dr|key points|recap|condense)\b/i],
    ["Fix", /\b(fix|bug|error|wrong|broken|not working|debug|why does my|correct|typo)\b/i],
    ["Decide", /\b(should i|decide|decision|which (one|is better)|pros and cons|recommend|or)\b/i],
    ["Write", /\b(write|draft|compose|generate|create|regex that|email to|make me)\b/i]
  ];
  const classify = q => ({
    field: (FIELD_RULES.find(([, re]) => re.test(q)) || ["Personal"])[0],
    type: (TYPE_RULES.find(([, re]) => re.test(q)) || ["Explain"])[0]
  });

  // Optional: Chrome's built-in on-device model, when the browser has it ready. No data leaves the device.
  async function askLocalModel(q) {
    if (typeof LanguageModel === "undefined") return null;
    let status;
    try { status = await LanguageModel.availability(); } catch { return null; }
    if (status !== "available") return null;
    const session = await LanguageModel.create();
    try {
      const prompt = `Answer this question in at most 2 short sentences. Classify its field as one of: ${FIELDS.join(", ")}. Classify request type as one of: ${TYPES.join(", ")}. Reply ONLY with JSON {"answer":"...","field":"...","type":"..."}. Question: ${q}`;
      const out = await Promise.race([
        session.prompt(prompt),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000))
      ]);
      const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
      if (typeof j.answer !== "string" || !j.answer.trim()) return null;
      return {
        answer: j.answer.trim(),
        field: FIELDS.includes(j.field) ? j.field : null,
        type: TYPES.includes(j.type) ? j.type : null
      };
    } finally { session.destroy && session.destroy(); }
  }

  const el = {
    q: $("#q"), g: $("#g"), box: $("#gbox"), hint: $("#hint"), reveal: $("#reveal"),
    status: $("#demo-status"), result: $("#result"), tag: $("#ans-tag"), text: $("#ans-text"),
    steps: $$("#demo-steps li"), radios: $$("input[name='rate']"), reset: $("#reset"), chips: $$(".chip")
  };
  const S = { q: "", g: "", phase: "ask", answer: "", field: "", type: "", rating: null };

  let announceTimer = 0;
  function announce(msg, delay = 0) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      el.status.textContent = "";
      requestAnimationFrame(() => { el.status.textContent = msg; });
    }, delay);
  }

  function render() {
    const n = S.g.trim().length;
    const hasQ = S.q.trim().length > 0;
    const ready = n >= MIN && hasQ && S.phase === "ask";
    const step = S.phase === "done" ? 3 : hasQ ? 2 : 1;

    el.steps.forEach((li, i) => {
      const k = i + 1;
      li.classList.toggle("is-done", k < step);
      if (k === step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });

    el.box.classList.toggle("is-valid", n >= MIN);
    const hint = S.phase === "done" ? "Guess saved"
      : !hasQ ? "Ask something first"
      : n < MIN ? `Answer ready · ${MIN - n} more characters to unlock`
      : "Guess locked in";
    el.hint.textContent = hint;
    el.hint.classList.toggle("is-ok", n >= MIN && hasQ && S.phase !== "done");

    el.reveal.setAttribute("aria-disabled", String(!ready));
    el.reveal.textContent = S.phase === "loading" ? "Revealing…" : S.phase === "done" ? "Revealed" : "Reveal answer";

    const done = S.phase === "done";
    el.result.hidden = !done;
    el.result.setAttribute("aria-busy", String(S.phase === "loading"));
    if (done) {
      el.tag.textContent = `${S.field} · ${S.type}`;
      el.text.textContent = S.answer;
    }
  }

  function clearRating() {
    S.rating = null;
    el.radios.forEach(r => { r.checked = false; });
  }

  async function reveal() {
    const q = S.q.trim();
    if (S.phase !== "ask" || !q || S.g.trim().length < MIN) return;
    const p = PRESETS.find(x => x.q === q);
    if (p) {
      Object.assign(S, { phase: "done", answer: p.a, field: p.field, type: p.type });
    } else {
      S.phase = "loading";
      render();
      announce("Revealing the answer.");
      const local = classify(q);
      let r = null;
      try { r = await askLocalModel(q); } catch { r = null; }
      if (S.phase !== "loading") return; // the question changed meanwhile
      Object.assign(S, {
        phase: "done",
        answer: r ? r.answer : FALLBACK,
        field: (r && r.field) || local.field,
        type: (r && r.type) || local.type
      });
    }
    render();
    announce("Answer revealed. Rate how close your guess was.");
    el.result.focus({ preventScroll: false });
  }

  el.q.addEventListener("input", () => {
    S.q = el.q.value;
    if (S.phase !== "ask") { S.phase = "ask"; clearRating(); }
    render();
  });
  el.q.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); el.g.focus(); }
  });

  let lastReady = false;
  el.g.addEventListener("input", () => {
    S.g = el.g.value;
    render();
    const readyNow = S.g.trim().length >= MIN && S.q.trim().length > 0 && S.phase === "ask";
    if (readyNow !== lastReady) {
      lastReady = readyNow;
      if (readyNow) announce("Guess locked in. You can reveal the answer.", 600);
    }
  });
  el.g.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); reveal(); }
  });

  el.reveal.addEventListener("click", () => {
    if (el.reveal.getAttribute("aria-disabled") === "true") {
      if (S.phase !== "ask") return;
      announce(el.hint.textContent);
      (S.q.trim() ? el.g : el.q).focus();
      return;
    }
    reveal();
  });

  el.chips.forEach(btn => {
    btn.addEventListener("click", () => {
      Object.assign(S, { q: btn.textContent.trim(), g: "", phase: "ask" });
      clearRating();
      el.q.value = S.q;
      el.g.value = "";
      lastReady = false;
      render();
      announce(`Question set to: ${S.q}. Now write your guess.`);
      el.g.focus();
    });
  });

  el.radios.forEach(r => {
    r.addEventListener("change", () => { if (r.checked) S.rating = Number(r.value); });
  });

  el.reset.addEventListener("click", () => {
    Object.assign(S, { q: "", g: "", phase: "ask", answer: "", field: "", type: "" });
    clearRating();
    el.q.value = "";
    el.g.value = "";
    lastReady = false;
    render();
    announce("Cleared. Ask a new question.");
    el.q.focus();
  });

  render();
})();
