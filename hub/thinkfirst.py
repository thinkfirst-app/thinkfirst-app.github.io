#!/usr/bin/env python3
"""
Think First hub.

Collects AI-usage events from the browser extension, the VS Code extension,
AI desktop apps, and AI command-line tools; stores them in a private SQLite
database on this computer; checks your goals; and serves a dashboard at
http://127.0.0.1:47321

Uses only the Python standard library.

  python3 thinkfirst.py              run now and open the dashboard
  python3 thinkfirst.py --install    run automatically at login
  python3 thinkfirst.py --uninstall  stop running at login
"""
import ctypes, glob, hashlib, json, os, platform, re, shutil, sqlite3, subprocess, sys, threading, time, webbrowser
from datetime import datetime, timedelta
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

VERSION = "1.0.0"
PORT = 47321
HOME = Path.home()
APP_DIR = HOME / ".thinkfirst"
DB_PATH = APP_DIR / "data.db"
HERE = Path(__file__).resolve().parent
SYSTEM = platform.system()

DEFAULT_SETTINGS = {
    "daily_limit": 0,              # prompts per day, 0 = off
    "category_limits": {},         # {"Coding & debugging": 40} per 7 days
    "think_first_target": 30,      # % of browser prompts with a guess
    "app_minutes_limit": 0,        # minutes per day in AI apps and sites, 0 = off
    "ai_free_hours": [],           # [{"days":[0,1,2,3,4], "start":"09:00", "end":"11:00"}], 0 = Monday
    "ai_apps": ["ChatGPT", "Claude", "Perplexity", "Copilot", "Microsoft Copilot", "Gemini",
                "Grok", "DeepSeek", "Poe", "Le Chat", "Msty", "LM Studio", "Jan", "Ollama"],
    "store_text": True,
    "notify": True,
    "digest_time": "21:00",
    "track_apps": True,
    "import_cli": True,
}

CATEGORIES = ["Coding & debugging", "Writing & editing", "Emails & messages", "Math & numbers",
              "Summarizing", "Learning & explanations", "Facts & research", "Advice & decisions",
              "Brainstorming", "Translation", "Health", "Other"]

KEYWORDS = [
    ("Coding & debugging", r"\b(code|coding|bug|debug|error|exception|function|python|javascript|typescript|java|c\+\+|sql|regex|api|compile|stack ?trace|script|html|css|react|git|terminal|test|refactor|repo)\b"),
    ("Emails & messages", r"\b(e-?mail|reply to|respond to|message to|text (him|her|them|my)|slack|linkedin|cover letter)\b"),
    ("Translation", r"\b(translate|translation|how do you say)\b|\bin (spanish|french|german|chinese|japanese|korean|italian|portuguese|arabic|hindi)\b"),
    ("Summarizing", r"\b(summari[sz]e|summary|tl;?dr|key points|recap|condense)\b"),
    ("Math & numbers", r"\b(calculate|solve|equation|math|percent(age)?|derivative|integral|probability|statistics|how much is)\b|\d+\s*[-+*/^x×]\s*\d+|\d+(\.\d+)?\s*%"),
    ("Health", r"\b(symptoms?|pain|doctor|medication|medicine|diet|sleep|anxiety|diagnos\w*|injury|workout|calories)\b"),
    ("Writing & editing", r"\b(write|rewrite|edit|essay|paragraph|proofread|grammar|poem|story|blog|caption|draft|reword)\b"),
    ("Advice & decisions", r"\b(should i|what should|advice|decide|decision|pros and cons|recommend|which (one|is better))\b"),
    ("Brainstorming", r"\b(ideas?|brainstorm|suggestions?|names? for|come up with)\b"),
    ("Learning & explanations", r"\b(explain|what is|what are|how does|how do|why does|why is|why do|understand|eli5|teach me)\b"),
    ("Facts & research", r"\b(who|when|where|history of|find|research|sources?|latest)\b"),
]
KEYWORDS = [(c, re.compile(p, re.I)) for c, p in KEYWORDS]


def classify(text):
    for cat, rx in KEYWORDS:
        if rx.search(text or ""):
            return cat
    return "Other"


# ---------------------------------------------------------------- database
class Store:
    def __init__(self, path):
        APP_DIR.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS events(
                id INTEGER PRIMARY KEY, ts REAL NOT NULL, source TEXT, tool TEXT, kind TEXT,
                category TEXT, text TEXT, guessed INTEGER DEFAULT 0, verdict TEXT,
                seconds REAL DEFAULT 0, meta TEXT, ext_id TEXT UNIQUE);
            CREATE INDEX IF NOT EXISTS ev_ts ON events(ts);
            CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT);
        """)
        self.db.commit()

    def get(self, key, default=None):
        with self.lock:
            row = self.db.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def put(self, key, value):
        with self.lock:
            self.db.execute("INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)", (key, json.dumps(value)))
            self.db.commit()

    def settings(self):
        s = dict(DEFAULT_SETTINGS)
        s.update(self.get("settings", {}))
        return s

    def add(self, e):
        kind = e.get("kind")
        ts = float(e.get("ts") or time.time())
        if ts > 1e12:  # milliseconds from JavaScript
            ts /= 1000
        with self.lock:
            if kind == "update":
                fields, vals = [], []
                if e.get("category") in CATEGORIES:
                    fields.append("category=?"); vals.append(e["category"])
                if e.get("verdict") in ("match", "partial", "different"):
                    fields.append("verdict=?"); vals.append(e["verdict"])
                if fields and e.get("ext_id"):
                    self.db.execute(f"UPDATE events SET {','.join(fields)} WHERE ext_id=?", (*vals, e["ext_id"]))
            elif kind in ("prompt", "app_time", "code"):
                text = e.get("text")
                category = e.get("category") if e.get("category") in CATEGORIES else (classify(text) if kind == "prompt" else None)
                if kind == "prompt" and not self._store_text:
                    text = None
                elif text:
                    text = text[:600]
                self.db.execute(
                    "INSERT OR IGNORE INTO events(ts,source,tool,kind,category,text,guessed,verdict,seconds,meta,ext_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                    (ts, e.get("source", "unknown"), e.get("tool", "unknown"), kind, category, text,
                     1 if e.get("guessed") else 0, e.get("verdict"), float(e.get("seconds") or 0),
                     json.dumps(e["meta"]) if e.get("meta") else None, e.get("ext_id")))
            self.db.commit()

    _store_text = True

    def rows(self, since, until=None, kinds=None):
        q = "SELECT * FROM events WHERE ts>=?"
        args = [since]
        if until:
            q += " AND ts<?"; args.append(until)
        if kinds:
            q += f" AND kind IN ({','.join('?' * len(kinds))})"; args += kinds
        with self.lock:
            return [dict(r) for r in self.db.execute(q + " ORDER BY ts", args)]

    def recent(self, limit=200, query="", category=""):
        q = "SELECT id,ts,source,tool,category,text,guessed,verdict FROM events WHERE kind='prompt'"
        args = []
        if query:
            q += " AND text LIKE ?"; args.append(f"%{query}%")
        if category:
            q += " AND category=?"; args.append(category)
        q += " ORDER BY ts DESC LIMIT ?"; args.append(limit)
        with self.lock:
            return [dict(r) for r in self.db.execute(q, args)]

    def clear(self):
        with self.lock:
            self.db.execute("DELETE FROM events")
            self.db.execute("DELETE FROM kv WHERE key LIKE 'alert%' OR key LIKE 'notified:%'")
            self.db.commit()


STORE = None


# ---------------------------------------------------------------- notifications
def notify(title, body, key=None):
    """Show a desktop notification once per key and keep it in the alert log."""
    if key:
        if STORE.get("notified:" + key):
            return
        STORE.put("notified:" + key, time.time())
    alerts = STORE.get("alerts", [])
    alerts.insert(0, {"ts": time.time(), "title": title, "body": body})
    STORE.put("alerts", alerts[:200])
    if not STORE.settings().get("notify", True):
        return
    try:
        if SYSTEM == "Darwin":
            esc = lambda s: s.replace("\\", "\\\\").replace('"', '\\"')
            subprocess.run(["osascript", "-e", f'display notification "{esc(body)}" with title "{esc(title)}"'],
                           timeout=5, capture_output=True)
        elif SYSTEM == "Linux":
            subprocess.run(["notify-send", title, body], timeout=5, capture_output=True)
        elif SYSTEM == "Windows":
            ps = ("[reflection.assembly]::loadwithpartialname('System.Windows.Forms')|Out-Null;"
                  "$n=New-Object System.Windows.Forms.NotifyIcon;$n.Icon=[System.Drawing.SystemIcons]::Information;"
                  f"$n.Visible=$true;$n.ShowBalloonTip(8000,'{title.replace(chr(39), '')}','{body.replace(chr(39), '')}','Info');Start-Sleep 9;$n.Dispose()")
            subprocess.Popen(["powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps])
    except Exception as err:
        print("notification failed:", err)


# ---------------------------------------------------------------- desktop app tracking
def run(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=3).stdout
    except Exception:
        return ""


def frontmost_app():
    if SYSTEM == "Darwin":
        asn = run(["lsappinfo", "front"]).strip()
        if not asn:
            return None
        m = re.search(r'"(?:LSDisplayName|name)"\s*=\s*"([^"]*)"', run(["lsappinfo", "info", "-only", "name", asn]))
        return m.group(1) if m else None
    if SYSTEM == "Windows":
        try:
            user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32
            pid = ctypes.c_ulong()
            user32.GetWindowThreadProcessId(user32.GetForegroundWindow(), ctypes.byref(pid))
            h = kernel32.OpenProcess(0x1000, False, pid.value)
            buf = ctypes.create_unicode_buffer(512)
            size = ctypes.c_ulong(512)
            kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size))
            kernel32.CloseHandle(h)
            return Path(buf.value).stem
        except Exception:
            return None
    if SYSTEM == "Linux":
        pid = run(["xdotool", "getactivewindow", "getwindowpid"]).strip()
        try:
            return Path(f"/proc/{pid}/comm").read_text().strip() if pid else None
        except Exception:
            return None
    return None


def idle_seconds():
    if SYSTEM == "Darwin":
        m = re.search(r'"HIDIdleTime"\s*=\s*(\d+)', run(["ioreg", "-c", "IOHIDSystem", "-d", "4"]))
        return int(m.group(1)) / 1e9 if m else 0
    if SYSTEM == "Windows":
        try:
            class LII(ctypes.Structure):
                _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]
            lii = LII(); lii.cbSize = ctypes.sizeof(LII)
            ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii))
            return (ctypes.windll.kernel32.GetTickCount() - lii.dwTime) / 1000
        except Exception:
            return 0
    out = run(["xprintidle"]).strip()
    return int(out) / 1000 if out.isdigit() else 0


def app_tracker():
    acc, last_flush, tick = {}, time.time(), 5
    while True:
        time.sleep(tick)
        s = STORE.settings()
        if s.get("track_apps", True):
            app = frontmost_app()
            if app and idle_seconds() < 120:
                match = next((a for a in s["ai_apps"] if a.lower() == app.lower()), None)
                if match:
                    acc[match] = acc.get(match, 0) + tick
        if time.time() - last_flush >= 60:
            for app, sec in acc.items():
                STORE.add({"kind": "app_time", "source": "desktop", "tool": app, "seconds": sec})
            acc, last_flush = {}, time.time()


# ---------------------------------------------------------------- AI command-line tools
def parse_ts(value):
    try:
        if isinstance(value, (int, float)):
            return value / 1000 if value > 1e12 else value
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def text_from_content(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        if any(isinstance(c, dict) and c.get("type") == "tool_result" for c in content):
            return None
        parts = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") in ("text", "input_text")]
        return "\n".join(p for p in parts if p) or None
    return None


def is_real_prompt(text):
    t = (text or "").strip()
    return bool(t) and not t.startswith("<") and not t.startswith("Caveat:") and not t.startswith("[Request interrupted")


def claude_code_prompt(obj):
    if obj.get("type") != "user" or obj.get("isMeta") or obj.get("isSidechain"):
        return None
    msg = obj.get("message") or {}
    if msg.get("role") != "user":
        return None
    return text_from_content(msg.get("content"))


def codex_prompt(obj):
    p = obj.get("payload") if isinstance(obj.get("payload"), dict) else obj
    if p.get("type") in ("message", None) and p.get("role") == "user":
        return text_from_content(p.get("content"))
    return None


def read_new_lines(path):
    key = "offset:" + path
    offset = STORE.get(key, 0)
    try:
        size = os.path.getsize(path)
        if size < offset:
            offset = 0
        if size == offset:
            return []
        with open(path, "rb") as f:
            f.seek(offset)
            data = f.read()
    except OSError:
        return []
    end = data.rfind(b"\n")
    if end < 0:
        return []
    STORE.put(key, offset + end + 1)
    base = offset
    out = []
    for line in data[:end].split(b"\n"):
        out.append((base, line))
        base += len(line) + 1
    return out


def import_cli_once():
    sources = [
        ("Claude Code", glob.glob(str(HOME / ".claude/projects/*/*.jsonl")), claude_code_prompt),
        ("Codex CLI", glob.glob(str(HOME / ".codex/sessions/**/*.jsonl"), recursive=True), codex_prompt),
    ]
    for tool, files, extract in sources:
        for path in files:
            for pos, raw in read_new_lines(path):
                try:
                    obj = json.loads(raw)
                except Exception:
                    continue
                text = extract(obj) if isinstance(obj, dict) else None
                if not is_real_prompt(text):
                    continue
                uid = obj.get("uuid") or hashlib.sha1(f"{path}:{pos}".encode()).hexdigest()
                STORE.add({"kind": "prompt", "source": "cli", "tool": tool, "text": text,
                           "ts": parse_ts(obj.get("timestamp")) or os.path.getmtime(path), "ext_id": f"{tool}:{uid}"})
    # Gemini CLI keeps a JSON array per project.
    for path in glob.glob(str(HOME / ".gemini/tmp/*/logs.json")):
        try:
            size = os.path.getsize(path)
            if STORE.get("offset:" + path) == size:
                continue
            items = json.loads(Path(path).read_text())
            STORE.put("offset:" + path, size)
        except Exception:
            continue
        for i, it in enumerate(items if isinstance(items, list) else []):
            if isinstance(it, dict) and it.get("type") == "user" and is_real_prompt(it.get("message")):
                STORE.add({"kind": "prompt", "source": "cli", "tool": "Gemini CLI", "text": it["message"],
                           "ts": parse_ts(it.get("timestamp")) or time.time(),
                           "ext_id": f"Gemini CLI:{it.get('sessionId', path)}:{it.get('messageId', i)}"})


def cli_importer():
    while True:
        if STORE.settings().get("import_cli", True):
            try:
                import_cli_once()
            except Exception as err:
                print("CLI import error:", err)
        time.sleep(60)


# ---------------------------------------------------------------- analysis
def day_start(ts=None):
    d = datetime.fromtimestamp(ts or time.time())
    return d.replace(hour=0, minute=0, second=0, microsecond=0)


def in_window(dt, w):
    try:
        if dt.weekday() not in w.get("days", list(range(7))):
            return False
        hm = dt.strftime("%H:%M")
        return w["start"] <= hm < w["end"]
    except Exception:
        return False


def code_totals(rows):
    out = {"typed": 0, "ai": 0, "insertions": 0, "pasted": 0, "by_lang": {}, "by_tool": {}}
    for r in rows:
        if r["kind"] != "code" or not r["meta"]:
            continue
        meta = json.loads(r["meta"])
        for lang, v in (meta.get("by_lang") or {}).items():
            L = out["by_lang"].setdefault(lang, {"typed": 0, "ai": 0})
            for k in ("typed", "ai"):
                L[k] += v.get(k, 0)
            out["typed"] += v.get("typed", 0)
            out["ai"] += v.get("ai", 0)
            out["insertions"] += v.get("insertions", 0)
            out["pasted"] += v.get("pasted", 0)
        t = out["by_tool"].setdefault(r["tool"], 0)
        out["by_tool"][r["tool"]] = t + sum(v.get("ai", 0) for v in (meta.get("by_lang") or {}).values())
    return out


def goal_day_ok(prompts, minutes, s):
    ok = True
    if s["daily_limit"]:
        ok &= prompts <= s["daily_limit"]
    if s["app_minutes_limit"]:
        ok &= minutes <= s["app_minutes_limit"]
    return ok


def summary(days):
    s = STORE.settings()
    days = max(1, min(int(days), 365))
    start = day_start() - timedelta(days=days - 1)
    prev_start = start - timedelta(days=days)
    all_rows = STORE.rows(prev_start.timestamp())
    cur = [r for r in all_rows if r["ts"] >= start.timestamp()]
    prev = [r for r in all_rows if r["ts"] < start.timestamp()]
    prompts = [r for r in cur if r["kind"] == "prompt"]
    prev_prompts = [r for r in prev if r["kind"] == "prompt"]
    times = [r for r in cur if r["kind"] == "app_time"]

    # daily series
    daily = []
    for i in range(days):
        d0 = start + timedelta(days=i)
        a, b = d0.timestamp(), (d0 + timedelta(days=1)).timestamp()
        dp = [r for r in prompts if a <= r["ts"] < b]
        by_source = {}
        for r in dp:
            by_source[r["source"]] = by_source.get(r["source"], 0) + 1
        minutes = sum(r["seconds"] for r in times if a <= r["ts"] < b) / 60
        daily.append({"date": d0.strftime("%Y-%m-%d"), "label": d0.strftime("%a %d"), "prompts": len(dp),
                      "by_source": by_source, "minutes": round(minutes, 1),
                      "guessed": sum(r["guessed"] for r in dp), "ok": goal_day_ok(len(dp), minutes, s)})

    # categories
    cats = {}
    for r in prompts:
        c = cats.setdefault(r["category"] or "Other", {"name": r["category"] or "Other", "count": 0, "prev": 0,
                                                        "guessed": 0, "match": 0, "partial": 0, "different": 0})
        c["count"] += 1
        c["guessed"] += r["guessed"]
        if r["verdict"] in ("match", "partial", "different"):
            c[r["verdict"]] += 1
    for r in prev_prompts:
        name = r["category"] or "Other"
        cats.setdefault(name, {"name": name, "count": 0, "prev": 0, "guessed": 0, "match": 0, "partial": 0, "different": 0})
        cats[name]["prev"] += 1
    week_ago = time.time() - 7 * 86400
    week_counts = {}
    for r in all_rows:
        if r["kind"] == "prompt" and r["ts"] >= week_ago:
            week_counts[r["category"] or "Other"] = week_counts.get(r["category"] or "Other", 0) + 1

    # tools
    tools = {}
    for r in prompts:
        t = tools.setdefault(r["tool"], {"tool": r["tool"], "source": r["source"], "prompts": 0, "minutes": 0})
        t["prompts"] += 1
    for r in times:
        t = tools.setdefault(r["tool"], {"tool": r["tool"], "source": r["source"], "prompts": 0, "minutes": 0})
        t["minutes"] += r["seconds"] / 60
    for t in tools.values():
        t["minutes"] = round(t["minutes"], 1)

    # heatmap weekday x hour
    heat = [[0] * 24 for _ in range(7)]
    for r in prompts:
        d = datetime.fromtimestamp(r["ts"])
        heat[d.weekday()][d.hour] += 1

    # guesses (only browser prompts can have one)
    guessable = [r for r in prompts if r["source"] == "browser"]
    guessed = [r for r in guessable if r["guessed"]]
    compared = [r for r in guessed if r["verdict"]]
    verdicts = {v: sum(1 for r in compared if r["verdict"] == v) for v in ("match", "partial", "different")}

    # quick re-asks: prompts within 45s of the previous one on the same tool
    quick = 0
    last = {}
    for r in prompts:
        if r["tool"] in last and r["ts"] - last[r["tool"]] < 45:
            quick += 1
        last[r["tool"]] = r["ts"]

    late = sum(1 for r in prompts if datetime.fromtimestamp(r["ts"]).hour >= 23 or datetime.fromtimestamp(r["ts"]).hour < 5)
    code = code_totals(cur)
    prev_code = code_totals(prev)
    minutes_total = round(sum(r["seconds"] for r in times) / 60, 1)

    # streak: consecutive days, ending today, that met your daily goals
    streak = None
    if s["daily_limit"] or s["app_minutes_limit"]:
        streak = 0
        first = STORE.rows(0, None, ["prompt", "app_time"])[:1]
        first_day = day_start(first[0]["ts"]) if first else day_start()
        d = day_start()
        while d >= first_day and streak < 365:
            a, b = d.timestamp(), (d + timedelta(days=1)).timestamp()
            rows = STORE.rows(a, b, ["prompt", "app_time"])
            p = sum(1 for r in rows if r["kind"] == "prompt")
            m = sum(r["seconds"] for r in rows if r["kind"] == "app_time") / 60
            if not goal_day_ok(p, m, s):
                break
            streak += 1
            d -= timedelta(days=1)

    today_rows = [r for r in cur if r["ts"] >= day_start().timestamp()]
    today = {"prompts": sum(1 for r in today_rows if r["kind"] == "prompt"),
             "minutes": round(sum(r["seconds"] for r in today_rows if r["kind"] == "app_time") / 60, 1),
             "guessed": sum(r["guessed"] for r in today_rows if r["kind"] == "prompt")}

    result = {
        "days": days, "settings": s, "today": today, "daily": daily, "heatmap": heat, "streak": streak,
        "totals": {"prompts": len(prompts), "prev_prompts": len(prev_prompts), "minutes": minutes_total,
                   "prev_minutes": round(sum(r["seconds"] for r in prev if r["kind"] == "app_time") / 60, 1),
                   "guessable": len(guessable), "guessed": len(guessed), "compared": len(compared), **verdicts,
                   "quick_reasks": quick, "late_night": late},
        "categories": sorted(cats.values(), key=lambda c: -c["count"]),
        "week_counts": week_counts,
        "tools": sorted(tools.values(), key=lambda t: -(t["prompts"] + t["minutes"])),
        "code": code, "prev_code": prev_code,
        "alerts": STORE.get("alerts", [])[:30],
    }
    result["insights"] = insights(result)
    return result


def pct(a, b):
    return round(100 * a / b) if b else 0


def insights(r):
    out = []
    t = r["totals"]
    if not t["prompts"] and not t["minutes"] and not r["code"]["ai"]:
        return ["No AI use recorded in this period yet."]
    if t["prev_prompts"]:
        change = pct(t["prompts"] - t["prev_prompts"], t["prev_prompts"])
        out.append(f"You sent {t['prompts']} prompts, {abs(change)}% {'more' if change >= 0 else 'fewer'} than the previous {r['days']} days ({t['prev_prompts']}).")
    elif t["prompts"]:
        out.append(f"You sent {t['prompts']} prompts across {len(r['tools'])} tools.")
    cats = [c for c in r["categories"] if c["count"]]
    if cats:
        top = cats[0]
        out.append(f"Your top task was {top['name'].lower()}: {top['count']} prompts, {pct(top['count'], t['prompts'])}% of the total.")
        grown = [c for c in cats if c["prev"] >= 3 and c["count"] >= c["prev"] * 1.5]
        if grown:
            g = max(grown, key=lambda c: c["count"] / c["prev"])
            out.append(f"{g['name']} grew the most, from {g['prev']} to {g['count']} prompts.")
    heat = r["heatmap"]
    hours = [sum(heat[d][h] for d in range(7)) for h in range(24)]
    if max(hours):
        h = hours.index(max(hours))
        label = f"{h % 12 or 12} {'AM' if h < 12 else 'PM'}"
        out.append(f"Your busiest hour for AI starts at {label}, with {max(hours)} prompts in this period.")
    if t["guessable"]:
        rate = pct(t["guessed"], t["guessable"])
        target = r["settings"]["think_first_target"]
        out.append(f"You guessed first on {rate}% of browser prompts" + (f", below your {target}% target." if rate < target else f", meeting your {target}% target."))
    judged = [c for c in cats if c["match"] + c["partial"] + c["different"] >= 3]
    if len(judged) >= 2:
        score = lambda c: (c["match"] + 0.5 * c["partial"]) / (c["match"] + c["partial"] + c["different"])
        best, worst = max(judged, key=score), min(judged, key=score)
        if best is not worst:
            out.append(f"Your instincts are strongest in {best['name'].lower()} ({round(100 * score(best))}% guess score) and weakest in {worst['name'].lower()} ({round(100 * score(worst))}%).")
    if t["quick_reasks"] >= 5:
        out.append(f"{t['quick_reasks']} prompts came less than 45 seconds after the previous one, which often means re-asking instead of thinking it through.")
    if t["late_night"] >= 3:
        out.append(f"{t['late_night']} prompts were sent between 11 PM and 5 AM.")
    c = r["code"]
    if c["typed"] + c["ai"] > 500:
        out.append(f"An estimated {pct(c['ai'], c['typed'] + c['ai'])}% of the code written in your editor came from AI suggestions.")
    if t["minutes"]:
        out.append(f"You spent {fmt_minutes(t['minutes'])} actively using AI apps and sites.")
    return out


def fmt_minutes(m):
    m = int(round(m))
    return f"{m // 60} h {m % 60} min" if m >= 60 else f"{m} min"


# ---------------------------------------------------------------- goals and alerts
def accountability_loop():
    while True:
        time.sleep(60)
        try:
            check_goals()
        except Exception as err:
            print("goal check error:", err)


def check_goals():
    s = STORE.settings()
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    t0 = day_start().timestamp()
    rows = STORE.rows(t0, None, ["prompt", "app_time"])
    prompts = [r for r in rows if r["kind"] == "prompt"]
    minutes = sum(r["seconds"] for r in rows if r["kind"] == "app_time") / 60

    limit = s["daily_limit"]
    if limit:
        n = len(prompts)
        if n >= limit * 0.8:
            notify("80% of today's AI budget", f"{n} of {limit} prompts used today.", f"limit80:{today}")
        if n >= limit:
            notify("Daily AI limit reached", f"You've sent {n} prompts today; your limit is {limit}.", f"limit100:{today}")
        if n >= limit + 10:
            over = (n - limit) // 10 * 10
            notify("Still going past your limit", f"{n - limit} prompts over your daily limit of {limit}.", f"over{over}:{today}")

    if s["app_minutes_limit"] and minutes >= s["app_minutes_limit"]:
        notify("AI time limit reached", f"{fmt_minutes(minutes)} in AI apps and sites today.", f"minutes:{today}")

    week = STORE.rows(time.time() - 7 * 86400, None, ["prompt"])
    for cat, lim in (s.get("category_limits") or {}).items():
        n = sum(1 for r in week if r["category"] == cat)
        if lim and n >= lim:
            notify(f"Weekly limit: {cat}", f"{n} prompts in the last 7 days (limit {lim}). Try the next one yourself.", f"cat:{cat}:{today}")

    recent = [r for r in rows if r["ts"] >= time.time() - 90]
    for w in s.get("ai_free_hours") or []:
        if in_window(now, w) and recent:
            notify("This is an AI-free block", f"You planned no AI from {w['start']} to {w['end']}.", f"free:{today}:{w['start']}:{now.hour}")

    browser = [r for r in prompts if r["source"] == "browser"]
    if len(browser) >= 10 and now.hour >= 15:
        rate = pct(sum(r["guessed"] for r in browser), len(browser))
        if rate < s["think_first_target"]:
            notify("Think first", f"You guessed first on {rate}% of prompts today (target {s['think_first_target']}%).", f"think:{today}")

    if now.strftime("%H:%M") >= s.get("digest_time", "21:00"):
        cats = {}
        for r in prompts:
            cats[r["category"]] = cats.get(r["category"], 0) + 1
        top = max(cats, key=cats.get) if cats else None
        body = f"{len(prompts)} prompts" + (f", mostly {top.lower()} ({cats[top]})" if top else "") + f". {fmt_minutes(minutes)} in AI apps and sites."
        notify("Today's AI use", body, f"digest:{today}")
        if now.weekday() == 6:
            r = summary(7)
            notify("Your week with AI", " ".join(r["insights"][:2]), f"weekly:{today}")


# ---------------------------------------------------------------- web server
def allowed_origin(origin):
    if not origin:
        return True
    return origin.startswith(("chrome-extension://", "moz-extension://", "vscode-webview://")) or \
        origin in (f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def guard(self):
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin")
        if host not in (f"127.0.0.1:{PORT}", f"localhost:{PORT}") or not allowed_origin(origin):
            self.send_error(403)
            return False
        return True

    def cors(self):
        origin = self.headers.get("Origin")
        if origin and allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Headers", "content-type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.cors()
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"null") if n else None

    def do_OPTIONS(self):
        if not self.guard():
            return
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        if not self.guard():
            return
        url = urlparse(self.path)
        qs = {k: v[0] for k, v in parse_qs(url.query).items()}
        if url.path in ("/", "/index.html"):
            html = (HERE / "dashboard.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html)
        elif url.path == "/api/ping":
            self.send_json({"ok": True, "app": "think-first", "version": VERSION})
        elif url.path == "/api/summary":
            self.send_json(summary(qs.get("days", 7)))
        elif url.path == "/api/events":
            self.send_json(STORE.recent(int(qs.get("limit", 200)), qs.get("q", ""), qs.get("category", "")))
        elif url.path == "/api/settings":
            self.send_json(STORE.settings())
        else:
            self.send_error(404)

    def do_POST(self):
        if not self.guard():
            return
        url = urlparse(self.path)
        try:
            data = self.body()
        except Exception:
            return self.send_json({"ok": False, "error": "bad json"}, 400)
        if url.path == "/api/event":
            for e in (data if isinstance(data, list) else [data]):
                if isinstance(e, dict):
                    STORE.add(e)
            self.send_json({"ok": True})
        elif url.path == "/api/settings" and isinstance(data, dict):
            s = STORE.settings()
            for k in DEFAULT_SETTINGS:
                if k in data:
                    s[k] = data[k]
            STORE.put("settings", s)
            Store._store_text = bool(s.get("store_text", True))
            self.send_json(s)
        elif url.path == "/api/uninstall":
            self.send_json({"ok": True})
            threading.Timer(0.5, lambda: (uninstall(), os._exit(0))).start()
        elif url.path == "/api/clear":
            STORE.clear()
            self.send_json({"ok": True})
        else:
            self.send_error(404)


# ---------------------------------------------------------------- install at login
INSTALL_DIR = APP_DIR / "app"
PLIST = HOME / "Library/LaunchAgents/com.thinkfirst.hub.plist"


def install():
    INSTALL_DIR.mkdir(parents=True, exist_ok=True)
    for f in ("thinkfirst.py", "dashboard.html"):
        shutil.copy2(HERE / f, INSTALL_DIR / f)
    script = INSTALL_DIR / "thinkfirst.py"
    if SYSTEM == "Darwin":
        PLIST.parent.mkdir(parents=True, exist_ok=True)
        PLIST.write_text(f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.thinkfirst.hub</string>
  <key>ProgramArguments</key><array><string>{sys.executable}</string><string>{script}</string><string>--no-browser</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>{APP_DIR / 'hub.log'}</string>
  <key>StandardErrorPath</key><string>{APP_DIR / 'hub.log'}</string>
</dict></plist>
""")
        uid = os.getuid()
        subprocess.run(["launchctl", "bootout", f"gui/{uid}", str(PLIST)], capture_output=True)
        r = subprocess.run(["launchctl", "bootstrap", f"gui/{uid}", str(PLIST)], capture_output=True, text=True)
        if r.returncode != 0:
            subprocess.run(["launchctl", "load", "-w", str(PLIST)])
        print("Installed. Think First now runs in the background and starts at login.")
    elif SYSTEM == "Windows":
        startup = Path(os.environ["APPDATA"]) / "Microsoft/Windows/Start Menu/Programs/Startup/ThinkFirst.cmd"
        pyw = Path(sys.executable).with_name("pythonw.exe")
        startup.write_text(f'@start "" "{pyw if pyw.exists() else sys.executable}" "{script}" --no-browser\r\n')
        subprocess.Popen([str(pyw if pyw.exists() else sys.executable), str(script), "--no-browser"])
        print("Installed. Think First now starts when you log in.")
    else:
        auto = HOME / ".config/autostart/thinkfirst.desktop"
        auto.parent.mkdir(parents=True, exist_ok=True)
        auto.write_text(f"[Desktop Entry]\nType=Application\nName=Think First\nExec={sys.executable} {script} --no-browser\n")
        subprocess.Popen([sys.executable, str(script), "--no-browser"])
        print("Installed. Think First now starts when you log in.")
    print(f"Dashboard: http://127.0.0.1:{PORT}")


def uninstall():
    if SYSTEM == "Darwin" and PLIST.exists():
        subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}", str(PLIST)], capture_output=True)
        PLIST.unlink()
    elif SYSTEM == "Windows":
        p = Path(os.environ["APPDATA"]) / "Microsoft/Windows/Start Menu/Programs/Startup/ThinkFirst.cmd"
        if p.exists():
            p.unlink()
    else:
        p = HOME / ".config/autostart/thinkfirst.desktop"
        if p.exists():
            p.unlink()
    print("Think First will no longer start at login. Your data is still in", APP_DIR)


OLD = "guess" + "first"  # the app's previous name


def migrate_from_old_name():
    """Carry data over from the previous name and stop the old background app."""
    old_dir = HOME / ("." + OLD)
    if (old_dir / "data.db").exists() and not DB_PATH.exists():
        APP_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(old_dir / "data.db", DB_PATH)
    if SYSTEM == "Darwin":
        old_plist = HOME / f"Library/LaunchAgents/com.{OLD}.hub.plist"
        if old_plist.exists():
            subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}", str(old_plist)], capture_output=True)
            old_plist.unlink()
            time.sleep(1)
    elif SYSTEM == "Windows":
        p = Path(os.environ.get("APPDATA", "")) / "Microsoft/Windows/Start Menu/Programs/Startup/GuessFirst.cmd"
        if p.exists():
            p.unlink()
    else:
        p = HOME / f".config/autostart/{OLD}.desktop"
        if p.exists():
            p.unlink()


def main():
    global STORE
    try:
        migrate_from_old_name()
    except Exception as err:
        print("migration skipped:", err)
    if "--install" in sys.argv:
        return install()
    if "--uninstall" in sys.argv:
        return uninstall()
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        print(f"Think First is already running. Dashboard: http://127.0.0.1:{PORT}")
        if "--no-browser" not in sys.argv:
            webbrowser.open(f"http://127.0.0.1:{PORT}")
        return
    STORE = Store(DB_PATH)
    Store._store_text = bool(STORE.settings().get("store_text", True))
    for fn in (app_tracker, cli_importer, accountability_loop):
        threading.Thread(target=fn, daemon=True).start()
    print(f"Think First hub {VERSION} running. Dashboard: http://127.0.0.1:{PORT}  (Ctrl+C to stop)")
    if "--no-browser" not in sys.argv:
        threading.Timer(1, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}")).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
