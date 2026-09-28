// Think First for VS Code (and VS Code-based editors like Cursor).
// Classifies each edit as typed by you, pasted, or likely accepted from an AI suggestion.
const vscode = require("vscode");

const AI_EXTENSIONS = {
  "github.copilot": "GitHub Copilot", "github.copilot-chat": "Copilot Chat", "anthropic.claude-code": "Claude Code",
  "codeium.codeium": "Codeium", "continue.continue": "Continue", "sourcegraph.cody-ai": "Cody",
  "supermaven.supermaven": "Supermaven", "tabnine.tabnine-vscode": "Tabnine", "saoudrizwan.claude-dev": "Cline",
  "rooveterinaryinc.roo-cline": "Roo Code", "amazonwebservices.amazon-q-vscode": "Amazon Q", "google.geminicodeassist": "Gemini Code Assist"
};

let bucket = {};          // language -> counts since last flush
let today;                // running totals for the status bar
let queue = [];           // events waiting to reach the hub
let status, ctx, warnedToday = "";

const dayKey = () => new Date().toISOString().slice(0, 10);
const hub = () => vscode.workspace.getConfiguration("thinkFirst").get("hubUrl");

function activate(context) {
  ctx = context;
  queue = context.globalState.get("queue", []);
  today = context.globalState.get("today", { day: dayKey(), typed: 0, ai: 0, insertions: 0 });

  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = "thinkFirst.showToday";
  status.show();
  updateStatus();

  context.subscriptions.push(
    status,
    vscode.workspace.onDidChangeTextDocument(onChange),
    vscode.commands.registerCommand("thinkFirst.openDashboard", () => vscode.env.openExternal(vscode.Uri.parse(hub()))),
    vscode.commands.registerCommand("thinkFirst.showToday", showToday)
  );
  const timer = setInterval(flush, 60 * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
}

function looksLikeAI(text) {
  const s = text.trim();
  if (!s) return false;
  // Multi-line insertions, or long insertions with spaces (single identifiers are usually IntelliSense).
  return (text.includes("\n") && s.length >= 10) || (s.length >= 25 && /\s/.test(s));
}

function add(lang, field, n) {
  const b = bucket[lang] || (bucket[lang] = { typed: 0, ai: 0, insertions: 0, pasted: 0 });
  b[field] += n;
  if (today.day !== dayKey()) today = { day: dayKey(), typed: 0, ai: 0, insertions: 0 };
  if (field === "typed" || field === "ai" || field === "insertions") today[field] += n;
}

function onChange(e) {
  if (e.reason !== undefined) return; // undo or redo
  const scheme = e.document.uri.scheme;
  if (!["file", "untitled", "vscode-notebook-cell"].includes(scheme)) return;
  const lang = e.document.languageId;
  const changes = e.contentChanges;
  if (!changes.length) return;

  if (changes.length > 1) {
    // Multi-cursor typing counts as typed; bigger multi-range edits (formatting, refactors) are ignored.
    for (const c of changes) if (c.text.length === 1) add(lang, "typed", 1);
    return;
  }
  const text = changes[0].text;
  if (!text) return;                                   // deletion
  if (text.length <= 2) return add(lang, "typed", text.trim() ? text.length : 1);
  if (!text.trim()) return add(lang, "typed", 1);      // Enter plus auto-indent

  vscode.env.clipboard.readText().then(clip => {
    const norm = s => s.replace(/\r\n/g, "\n");
    if (clip && norm(clip) === norm(text)) return add(lang, "pasted", text.length);
    if (looksLikeAI(text)) {
      add(lang, "ai", text.trim().length);
      add(lang, "insertions", 1);
      checkWarning();
    }
    // Anything else (IntelliSense word completions, short snippets) is not counted either way.
    updateStatus();
  }, () => {});
  updateStatus();
}

function share() {
  const t = today.typed + today.ai;
  return t ? Math.round(100 * today.ai / t) : 0;
}

function updateStatus() {
  if (!status) return;
  const t = today.typed + today.ai;
  status.text = t ? `$(sparkle) AI ${share()}% today` : "$(sparkle) AI 0% today";
  status.tooltip = `Think First: about ${today.ai.toLocaleString()} characters from AI (${today.insertions} suggestions) and ${today.typed.toLocaleString()} typed by you today. Click for details.`;
  ctx?.globalState.update("today", today);
}

function checkWarning() {
  const limit = vscode.workspace.getConfiguration("thinkFirst").get("aiShareWarning");
  if (!limit || warnedToday === dayKey() || today.typed + today.ai < 2000) return;
  if (share() > limit) {
    warnedToday = dayKey();
    vscode.window.showWarningMessage(`Think First: about ${share()}% of the code you've written today came from AI suggestions (your warning level is ${limit}%). Try writing the next function yourself.`, "Open dashboard")
      .then(choice => choice && vscode.commands.executeCommand("thinkFirst.openDashboard"));
  }
}

function showToday() {
  const installed = Object.entries(AI_EXTENSIONS).filter(([id]) => vscode.extensions.getExtension(id)).map(([, n]) => n);
  vscode.window.showInformationMessage(
    `Today: ~${share()}% of your code came from AI (${today.ai.toLocaleString()} characters across ${today.insertions} suggestions) and ${today.typed.toLocaleString()} characters were typed by you.` +
    (installed.length ? ` AI extensions installed: ${installed.join(", ")}.` : ""),
    "Open dashboard"
  ).then(choice => choice && vscode.commands.executeCommand("thinkFirst.openDashboard"));
}

async function flush() {
  if (Object.keys(bucket).length) {
    const installed = Object.keys(AI_EXTENSIONS).filter(id => vscode.extensions.getExtension(id));
    queue.push({ kind: "code", source: "vscode", tool: vscode.env.appName, ts: Date.now(), meta: { by_lang: bucket, ai_extensions: installed } });
    bucket = {};
    queue = queue.slice(-2000);
  }
  if (!queue.length) return;
  try {
    const res = await fetch(hub() + "/api/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(queue) });
    if (res.ok) queue = [];
  } catch { /* hub not running; keep the queue and try again next minute */ }
  ctx.globalState.update("queue", queue);
}

function deactivate() { return flush(); }

module.exports = { activate, deactivate };
