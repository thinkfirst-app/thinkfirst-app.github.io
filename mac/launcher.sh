#!/bin/bash
# Think First.app launcher: sets up the background tracker on first open, then opens the dashboard.
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
URL="http://127.0.0.1:47321"
say() { osascript -e "display dialog \"$1\" with title \"Think First\" buttons {\"OK\"} default button \"OK\" with icon note" >/dev/null 2>&1; }

# Already running: just open the dashboard.
if curl -s -m 2 "$URL/api/ping" 2>/dev/null | grep -q '"think-first"'; then open "$URL"; exit 0; fi

# Python comes with Apple's free command line tools.
if ! xcode-select -p >/dev/null 2>&1; then
  say "Think First needs Apple's free Command Line Tools, which include Python. An installer will open next. When it finishes, open Think First again."
  xcode-select --install >/dev/null 2>&1
  exit 0
fi

mkdir -p "$HOME/.thinkfirst"
/usr/bin/python3 "$RES/thinkfirst.py" --install >> "$HOME/.thinkfirst/install.log" 2>&1

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s -m 1 "$URL/api/ping" 2>/dev/null | grep -q '"think-first"'; then open "$URL"; exit 0; fi
  sleep 1
done
say "Think First couldn't start. Details are in the file .thinkfirst/install.log in your home folder."
