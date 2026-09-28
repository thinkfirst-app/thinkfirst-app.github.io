// Runs inside the extension's own frame, so the chat site can't intercept typing.
let port = null;
let site = "";
let current = null;    // { id, question, guess, category } for the pending guess
let modalText = "";
let modalCategory = "Other";
let noteTimer = null;

const $ = id => document.getElementById(id);
const post = msg => port?.postMessage(msg);

window.addEventListener("message", e => {
  if (port || e.source !== window.parent || e.data?.gf !== "init" || !e.ports[0]) return;
  port = e.ports[0];
  site = e.data.site;
  port.onmessage = ev => handle(ev.data);
});

// ---------- Desktop hub (optional): events go there too, queued while it's offline ----------
const HUB = "http://127.0.0.1:47321/api/event";
function toHub(event) {
  store(async () => {
    const { outbox = [] } = await chrome.storage.local.get("outbox");
    outbox.push(event);
    try {
      const res = await fetch(HUB, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(outbox) });
      if (res.ok) return chrome.storage.local.set({ outbox: [] });
    } catch { /* hub not running */ }
    await chrome.storage.local.set({ outbox: outbox.slice(-3000) });
  });
}

// ---------- Storage (serialized so writes never overwrite each other) ----------
let queue = Promise.resolve();
const store = fn => (queue = queue.then(fn).catch(err => console.warn("Think First:", err)));

function logSend({ text, category, guess }) {
  const id = crypto.randomUUID();
  const ts = Date.now();
  store(async () => {
    const s = await chrome.storage.local.get(["usage", "history", "trackUsage"]);
    if (s.trackUsage !== false) {
      const usage = s.usage || [];
      usage.push({ id, ts, site, category, guessed: !!guess });
      await chrome.storage.local.set({ usage: usage.slice(-5000) });
    }
    if (guess) {
      const history = s.history || [];
      history.unshift({ id, ts, site, question: text, guess, category, comparison: null });
      await chrome.storage.local.set({ history: history.slice(0, 500) });
    }
  });
  toHub({ kind: "prompt", source: "browser", tool: site, ts, ext_id: id, text, category, guessed: !!guess });
  // Refine the category with AI in the background, then check for a usage milestone.
  GF.classify(text).then(better => {
    store(async () => {
      const s = await chrome.storage.local.get(["usage", "history"]);
      const usage = s.usage || [], history = s.history || [];
      const u = usage.find(x => x.id === id); if (u) u.category = better;
      const h = history.find(x => x.id === id); if (h) h.category = better;
      await chrome.storage.local.set({ usage, history });
      if (current?.id === id) current.category = better;
      if (better !== category) toHub({ kind: "update", ext_id: id, category: better });
      milestone(better, GF.thisWeek(usage)[better] || 0);
    });
  });
  return id;
}

function saveComparison(id, comparison) {
  store(async () => {
    const { history = [] } = await chrome.storage.local.get("history");
    const h = history.find(x => x.id === id);
    if (h) { h.comparison = comparison; await chrome.storage.local.set({ history }); }
  });
  toHub({ kind: "update", ext_id: id, verdict: comparison.verdict });
}

const MILESTONES = [5, 10, 20, 30, 50, 75, 100];
function milestone(category, n) {
  if (!MILESTONES.includes(n) || category === "Other") return;
  showNote(`That's ${n} requests for ${category.toLowerCase()} in the last 7 days. Worth trying the next one yourself first?`);
}

// ---------- Layout sync with the page ----------
function sync() {
  if (!$("modal").hidden) return post({ t: "mode", mode: "modal" });
  if (!$("panel").hidden) return post({ t: "mode", mode: "panel", height: Math.ceil($("panel").getBoundingClientRect().bottom) + 28 });
  post({ t: "mode", mode: "hidden" });
}
const resizeWatch = new ResizeObserver(sync);
resizeWatch.observe(document.body);
resizeWatch.observe(document.getElementById("panel"));

// ---------- Messages from the page ----------
async function handle(msg) {
  if (msg.t === "maybeAsk") {
    const s = await chrome.storage.local.get(["enabled", "askMode", "usage"]);
    const category = GF.keywordClassify(msg.text);
    const weekCount = GF.thisWeek(s.usage || [])[category] || 0;
    const frequent = weekCount >= GF.FREQUENT;
    const ask = s.enabled !== false && (s.askMode !== "frequent" || frequent);
    if (!ask) { logSend({ text: msg.text, category }); return post({ t: "proceed", withGuess: false }); }
    openModal(msg.text, category, weekCount);
  }
  if (msg.t === "log") logSend({ text: msg.text, category: GF.keywordClassify(msg.text) });
  if (msg.t === "answer") runCompare(msg.text);
  if (msg.t === "answerMissing") setStatus("Couldn't find the answer on the page. Highlight it, then click the button below.", true);
  if (msg.t === "answerText") {
    if (msg.text) runCompare(msg.text);
    else setStatus("Highlight the answer text on the page first, then click the button again.", true);
  }
  if (msg.t === "note") showNote(msg.text);
  if (msg.t === "active") {
    toHub({ kind: "app_time", source: "browser", tool: site, seconds: msg.seconds, ts: Date.now() });
    store(async () => {
      const { time = {} } = await chrome.storage.local.get("time");
      const key = new Date().toISOString().slice(0, 10) + "|" + site;
      time[key] = (time[key] || 0) + msg.seconds;
      for (const k of Object.keys(time)) if (Date.parse(k.split("|")[0]) < Date.now() - 30 * 864e5) delete time[k];
      await chrome.storage.local.set({ time });
    });
  }
}

// ---------- Guess modal ----------
function openModal(text, category, weekCount) {
  modalText = text;
  modalCategory = category;
  $("question").textContent = text;
  $("usage").innerHTML = "";
  if (category !== "Other") {
    const b = document.createElement("b"); b.textContent = category;
    $("usage").append(b, ` request number ${weekCount + 1} this week.`);
  }
  $("guessBox").value = "";
  $("modal").hidden = false;
  sync();
  setTimeout(() => $("guessBox").focus(), 30);
}

function finish(withGuess) {
  const guess = $("guessBox").value.trim();
  $("modal").hidden = true;
  const useGuess = withGuess && guess.length > 0;
  const id = logSend({ text: modalText, category: modalCategory, guess: useGuess ? guess : null });
  if (useGuess) {
    current = { id, question: modalText, guess, category: modalCategory };
    $("panelTitle").textContent = "Your guess";
    $("guessText").textContent = guess;
    $("result").innerHTML = "";
    $("manual").hidden = true;
    $("guessArea").hidden = false;
    $("panel").hidden = false;
    setStatus("Waiting for the answer to finish…");
  }
  sync();
  post({ t: "proceed", withGuess: useGuess });
}

$("go").addEventListener("click", () => finish(true));
$("skip").addEventListener("click", () => finish(false));
$("guessBox").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); finish(true); }
  if (e.key === "Escape") { e.preventDefault(); finish(false); }
});

// ---------- Comparison panel ----------
function setStatus(text, isError = false) {
  $("status").textContent = text;
  $("status").classList.toggle("err", isError);
  $("manual").hidden = !isError;
  sync();
}

async function runCompare(answer) {
  if (!current) return;
  setStatus("Comparing your guess with the answer…");
  try {
    const result = await GF.compare(current.question, current.guess, answer);
    renderResult(result);
    saveComparison(current.id, result);
  } catch (err) {
    if (err.message === "NO_ENGINE") {
      setStatus("To compare automatically, open the Think First menu in your toolbar and turn on the built-in AI or add an API key.", true);
    } else {
      setStatus("Comparison failed: " + err.message, true);
    }
  }
}

function renderResult(r) {
  const labels = { match: "Your guess matched", partial: "Partly there", different: "Different from the answer" };
  $("status").textContent = "";
  $("manual").hidden = true;
  const box = $("result");
  box.innerHTML = "";
  const add = (tag, text, cls) => { const el = document.createElement(tag); if (cls) el.className = cls; el.textContent = text; box.appendChild(el); return el; };
  add("span", labels[r.verdict], "verdict");
  const list = (title, items) => {
    if (!items.length) return;
    add("strong", title);
    const ul = document.createElement("ul");
    items.forEach(i => { const li = document.createElement("li"); li.textContent = i; ul.appendChild(li); });
    box.appendChild(ul);
  };
  list("You got right", r.right);
  list("What the answer adds", r.missed);
  if (r.takeaway) add("p", r.takeaway);
  sync();
}

$("manual").addEventListener("click", () => post({ t: "getAnswer" }));

function showNote(text) {
  $("note").textContent = text;
  $("note").hidden = false;
  $("panel").hidden = false;
  if ($("guessArea").hidden) $("panelTitle").textContent = "Your AI habits";
  sync();
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    $("note").hidden = true;
    if ($("guessArea").hidden) $("panel").hidden = true;
    sync();
  }, 12000);
}

$("close").addEventListener("click", () => {
  $("panel").hidden = true;
  $("guessArea").hidden = true;
  $("note").hidden = true;
  current = null;
  sync();
});
