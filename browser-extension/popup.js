const $ = id => document.getElementById(id);

// ---------- Tabs ----------
const tabs = [...document.querySelectorAll("[data-tab]")];
function selectTab(tab, focus = false) {
  tabs.forEach(t => {
    const on = t === tab;
    t.setAttribute("aria-selected", on);
    t.tabIndex = on ? 0 : -1;
    $(t.dataset.tab).hidden = !on;
  });
  if (focus) tab.focus();
}
tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", e => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "Home" ? -i : e.key === "End" ? tabs.length - 1 - i : 0;
    if (!step) return;
    e.preventDefault();
    selectTab(tabs[(i + step + tabs.length) % tabs.length], true);
  });
});

// ---------- Habits ----------
function renderHabits(usage) {
  const now = GF.thisWeek(usage), before = GF.lastWeek(usage);
  const total = Object.values(now).reduce((a, b) => a + b, 0);
  const prevTotal = Object.values(before).reduce((a, b) => a + b, 0);
  $("weekTotal").textContent = total;
  $("weekDelta").textContent = prevTotal ? `(${total >= prevTotal ? "+" : ""}${total - prevTotal} vs. the week before)` : "";

  const bars = $("bars");
  bars.innerHTML = "";
  const rows = Object.entries(now).sort((a, b) => b[1] - a[1]);
  if (!rows.length) {
    bars.innerHTML = `<p class="empty">Nothing counted yet. Send a message on Claude, ChatGPT, or Gemini and it will show up here.</p>`;
    return;
  }
  const max = rows[0][1];
  for (const [cat, n] of rows) {
    const frequent = n >= GF.FREQUENT && cat !== "Other";
    const prev = before[cat] || 0;
    const row = document.createElement("div");
    row.className = "bar" + (frequent ? " frequent" : "");
    const top = document.createElement("div"); top.className = "top";
    const name = document.createElement("span"); name.textContent = cat;
    if (frequent) { const f = document.createElement("span"); f.className = "flag"; f.textContent = "Frequent"; name.appendChild(f); }
    const count = document.createElement("span");
    count.textContent = n;
    if (prev) { const d = document.createElement("span"); d.className = "delta"; d.textContent = ` (was ${prev})`; count.appendChild(d); }
    top.append(name, count);
    const track = document.createElement("div"); track.className = "track";
    const fill = document.createElement("div"); fill.className = "fill"; fill.style.width = (100 * n / max) + "%";
    track.appendChild(fill);
    row.append(top, track);
    bars.appendChild(row);
  }
}

// ---------- Guesses ----------
function renderGuesses(history) {
  $("total").textContent = history.length;
  const compared = history.filter(h => h.comparison);
  const pct = v => compared.length ? Math.round(100 * compared.filter(h => h.comparison.verdict === v).length / compared.length) + "%" : "–";
  $("match").textContent = pct("match");
  $("partial").textContent = pct("partial");
  $("diff").textContent = pct("different");
  const ol = $("history");
  ol.innerHTML = "";
  if (!history.length) { ol.innerHTML = `<li class="m">No guesses yet.</li>`; return; }
  const labels = { match: "matched", partial: "partly right", different: "different" };
  history.slice(0, 30).forEach(h => {
    const li = document.createElement("li");
    const g = document.createElement("div"); g.className = "g"; g.textContent = h.guess;
    const m = document.createElement("div"); m.className = "m";
    const q = h.question.length > 70 ? h.question.slice(0, 70) + "…" : h.question;
    m.textContent = `${q} (${h.category}, ${h.comparison ? labels[h.comparison.verdict] : "not compared"})`;
    li.append(g, m); ol.appendChild(li);
  });
}

// ---------- Built-in AI setup ----------
async function renderAI() {
  const status = await GF.localStatus();
  const { apiKey } = await chrome.storage.local.get("apiKey");
  const btn = $("setupAI");
  btn.hidden = true;
  if (status === "available") {
    $("aiStatus").textContent = "Built-in AI is on. Comparisons and task sorting run free and privately on your computer.";
  } else if (status === "downloadable" || status === "downloading") {
    $("aiStatus").textContent = "Chrome can run a free AI model on this computer. It needs a one-time download of a few gigabytes.";
    btn.hidden = false;
  } else {
    $("aiStatus").textContent = apiKey
      ? "This computer can't run Chrome's built-in AI, so your API key is used."
      : "This computer can't run Chrome's built-in AI. Add an Anthropic API key below to turn on comparisons.";
    $("keyBox").open = !apiKey;
  }
}

$("setupAI").addEventListener("click", async () => {
  const btn = $("setupAI");
  btn.disabled = true;
  $("aiStatus").textContent = "Downloading… You can close this menu; the download keeps going.";
  try {
    const session = await GF.createLocal(null, m => m.addEventListener("downloadprogress", e => {
      $("aiStatus").textContent = `Downloading… ${Math.round(e.loaded * 100)}%. You can close this menu.`;
    }));
    session.destroy?.();
    renderAI();
  } catch (err) {
    $("aiStatus").textContent = "The download couldn't start: " + err.message;
    btn.disabled = false;
  }
});

// ---------- Settings ----------
async function load() {
  const s = await chrome.storage.local.get(null);
  $("enabled").checked = s.enabled !== false;
  $("askMode").value = s.askMode || "always";
  $("minLength").value = Number.isFinite(s.minLength) ? s.minLength : 20;
  $("trackUsage").checked = s.trackUsage !== false;
  $("aiSort").checked = s.aiSort !== false;
  $("apiKey").value = s.apiKey || "";
  $("model").value = s.model || GF.DEFAULT_MODEL;
  $("preferKey").checked = s.engine === "anthropic";
  renderHabits(s.usage || []);
  renderGuesses(s.history || []);
  renderAI();
}

$("save").addEventListener("click", async () => {
  const minLength = parseInt($("minLength").value, 10);
  await chrome.storage.local.set({
    enabled: $("enabled").checked,
    askMode: $("askMode").value,
    minLength: Number.isFinite(minLength) ? minLength : 20,
    trackUsage: $("trackUsage").checked,
    aiSort: $("aiSort").checked,
    apiKey: $("apiKey").value.trim(),
    model: $("model").value.trim() || GF.DEFAULT_MODEL,
    engine: $("preferKey").checked ? "anthropic" : "auto"
  });
  $("savedMsg").textContent = "Saved";
  setTimeout(() => $("savedMsg").textContent = "", 1500);
  renderAI();
});

$("export").addEventListener("click", async () => {
  const { usage = [], history = [] } = await chrome.storage.local.get(["usage", "history"]);
  const url = URL.createObjectURL(new Blob([JSON.stringify({ usage, history }, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = "think-first-data.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$("clear").addEventListener("click", async () => {
  if (!confirm("Delete all saved guesses and usage counts?")) return;
  await chrome.storage.local.set({ usage: [], history: [] });
  renderHabits([]); renderGuesses([]);
});

load();

// ---------- Desktop hub and time on sites ----------
(async () => {
  try {
    const res = await fetch("http://127.0.0.1:47321/api/ping");
    if (!res.ok) throw 0;
    $("hubStatus").textContent = "Connected to the Think First desktop app. Your browser, editor, and app usage are combined there.";
    $("openDash").hidden = false;
  } catch {
    $("hubStatus").textContent = "Want to track AI use across your whole computer? Install the free Think First desktop app for the full dashboard, goals, and alerts.";
  }
  const { time = {}, outbox = [] } = await chrome.storage.local.get(["time", "outbox"]);
  const since = Date.now() - 7 * 864e5;
  const sec = Object.entries(time).filter(([k]) => Date.parse(k.split("|")[0]) >= since).reduce((a, [, v]) => a + v, 0);
  const m = Math.round(sec / 60);
  $("timeLine").textContent = m ? `${m >= 60 ? Math.floor(m / 60) + " h " : ""}${m % 60} min actively using AI sites this week` : "";
  if (outbox.length) $("hubStatus").textContent += ` ${outbox.length} events are waiting to sync.`;
})();
$("openDash").addEventListener("click", () => chrome.tabs.create({ url: "http://127.0.0.1:47321" }));
