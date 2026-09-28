// Shared AI + stats helpers. Used by the in-page frame (ui.html) and the popup.
// Engine order: Chrome's built-in on-device AI (free, private) -> Anthropic API key -> keywords only.
const GF = (() => {
  const CATEGORIES = [
    "Coding & debugging", "Writing & editing", "Emails & messages", "Math & numbers",
    "Summarizing", "Learning & explanations", "Facts & research", "Advice & decisions",
    "Brainstorming", "Translation", "Health", "Other"
  ];
  const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const FREQUENT = 5; // uses in 7 days that mark a task as frequent

  // First match wins, so more specific categories come first.
  const KEYWORDS = [
    ["Coding & debugging", /\b(code|coding|bug|debug|error|exception|function|python|javascript|typescript|java|c\+\+|sql|regex|api|compile|stack ?trace|script|html|css|react|git|terminal)\b/i],
    ["Emails & messages", /\b(e-?mail|reply to|respond to|message to|text (him|her|them|my)|slack|linkedin|cover letter)\b/i],
    ["Translation", /\b(translate|translation|how do you say)\b|\bin (spanish|french|german|chinese|japanese|korean|italian|portuguese|arabic|hindi)\b/i],
    ["Summarizing", /\b(summari[sz]e|summary|tl;?dr|key points|recap|condense)\b/i],
    ["Math & numbers", /\b(calculate|solve|equation|math|percent(age)?|derivative|integral|probability|statistics|how much is)\b|\d+\s*[-+*/^x×]\s*\d+|\d+(\.\d+)?\s*%/i],
    ["Health", /\b(symptoms?|pain|doctor|medication|medicine|diet|sleep|anxiety|diagnos\w*|injury|workout|calories)\b/i],
    ["Writing & editing", /\b(write|rewrite|edit|essay|paragraph|proofread|grammar|poem|story|blog|caption|draft|reword)\b/i],
    ["Advice & decisions", /\b(should i|what should|advice|decide|decision|pros and cons|recommend|which (one|is better))\b/i],
    ["Brainstorming", /\b(ideas?|brainstorm|suggestions?|names? for|come up with)\b/i],
    ["Learning & explanations", /\b(explain|what is|what are|how does|how do|why does|why is|why do|understand|eli5|teach me)\b/i],
    ["Facts & research", /\b(who|when|where|history of|find|research|sources?|latest)\b/i]
  ];

  function keywordClassify(text) {
    for (const [cat, re] of KEYWORDS) if (re.test(text)) return cat;
    return "Other";
  }

  // ---------- Engines ----------
  const LM_LANG = {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }]
  };

  async function localStatus() {
    if (typeof LanguageModel === "undefined") return "unavailable";
    try { return await LanguageModel.availability(LM_LANG); }
    catch { try { return await LanguageModel.availability(); } catch { return "unavailable"; } }
  }

  async function createLocal(system, monitor) {
    const opts = { ...LM_LANG };
    if (system) opts.initialPrompts = [{ role: "system", content: system }];
    if (monitor) opts.monitor = monitor;
    try { return await LanguageModel.create(opts); }
    catch (e) {
      delete opts.expectedInputs; delete opts.expectedOutputs;
      return await LanguageModel.create(opts);
    }
  }

  async function engine() {
    const s = await chrome.storage.local.get(["engine", "apiKey"]);
    if (s.engine === "anthropic" && s.apiKey) return "anthropic";
    if ((await localStatus()) === "available") return "local";
    if (s.apiKey) return "anthropic";
    return "none";
  }

  function parseJSON(text) {
    const clean = String(text).replace(/```json|```/g, "").trim();
    const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
    return JSON.parse(start >= 0 ? clean.slice(start, end + 1) : clean);
  }

  async function askJSON(eng, system, user, schema) {
    if (eng === "local") {
      const session = await createLocal(system);
      try {
        let out;
        try { out = await session.prompt(user, { responseConstraint: schema }); }
        catch { out = await session.prompt(user); }
        return parseJSON(out);
      } finally { session.destroy?.(); }
    }
    if (eng === "anthropic") {
      const { apiKey, model } = await chrome.storage.local.get(["apiKey", "model"]);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: model || DEFAULT_MODEL,
          max_tokens: 500,
          system: system + "\nRespond with ONLY the JSON object, no other text.",
          messages: [{ role: "user", content: user }]
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
      return parseJSON((data.content || []).filter(b => b.type === "text").map(b => b.text).join(""));
    }
    throw new Error("NO_ENGINE");
  }

  // ---------- Tasks ----------
  const COMPARE_SYSTEM = `You compare a person's quick guess with an AI's answer to their question.
The goal is to help them learn and trust their own thinking, not to grade harshly. Be brief and specific.
Return JSON: {"verdict":"match"|"partial"|"different","right":[...],"missed":[...],"takeaway":"..."}
"verdict": match if the guess reaches the same main conclusion, partial if it is on the right track, different otherwise.
"right": up to 3 short points the guess got right. "missed": up to 3 short points the answer adds or where the guess went wrong.
"takeaway": one sentence. If the guess catches something the AI answer missed or got wrong, say so here.`;

  const COMPARE_SCHEMA = {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["match", "partial", "different"] },
      right: { type: "array", items: { type: "string" }, maxItems: 3 },
      missed: { type: "array", items: { type: "string" }, maxItems: 3 },
      takeaway: { type: "string" }
    },
    required: ["verdict", "right", "missed", "takeaway"]
  };

  async function compare(question, guess, answer) {
    const eng = await engine();
    if (eng === "none") throw new Error("NO_ENGINE");
    const limit = eng === "local" ? 5000 : 12000;
    const r = await askJSON(eng, COMPARE_SYSTEM,
      `QUESTION:\n${question.slice(0, 2000)}\n\nPERSON'S GUESS:\n${guess}\n\nAI ANSWER:\n${answer.slice(0, limit)}`,
      COMPARE_SCHEMA);
    return {
      verdict: ["match", "partial", "different"].includes(r.verdict) ? r.verdict : "partial",
      right: Array.isArray(r.right) ? r.right.slice(0, 3) : [],
      missed: Array.isArray(r.missed) ? r.missed.slice(0, 3) : [],
      takeaway: typeof r.takeaway === "string" ? r.takeaway : "",
      engine: eng
    };
  }

  async function classify(text) {
    const fallback = keywordClassify(text);
    const { aiSort } = await chrome.storage.local.get("aiSort");
    if (aiSort === false) return fallback;
    try {
      const eng = await engine();
      if (eng === "none") return fallback;
      const r = await askJSON(eng,
        `Sort a request someone sent to an AI assistant into exactly one category: ${CATEGORIES.join("; ")}. Return JSON {"category":"..."}.`,
        text.slice(0, 1500),
        { type: "object", properties: { category: { type: "string", enum: CATEGORIES } }, required: ["category"] });
      return CATEGORIES.includes(r.category) ? r.category : fallback;
    } catch { return fallback; }
  }

  // ---------- Stats ----------
  function countBy(usage, from, to = Infinity) {
    const out = {};
    for (const u of usage) if (u.ts >= from && u.ts < to) out[u.category] = (out[u.category] || 0) + 1;
    return out;
  }
  const thisWeek = usage => countBy(usage, Date.now() - WEEK);
  const lastWeek = usage => countBy(usage, Date.now() - 2 * WEEK, Date.now() - WEEK);

  return { CATEGORIES, DEFAULT_MODEL, WEEK, FREQUENT, keywordClassify, localStatus, createLocal, engine, compare, classify, thisWeek, lastWeek };
})();
