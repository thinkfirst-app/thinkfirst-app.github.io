#!/usr/bin/env bash
# Sets the same version number in every component, then shows what changed.
# Usage: scripts/bump-version.sh 1.0.1
set -euo pipefail
cd "$(dirname "$0")/.."
NEW=${1:-}
[[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Usage: scripts/bump-version.sh X.Y.Z" >&2; exit 1; }
OLD=$(python3 -c 'import json; print(json.load(open("browser-extension/manifest.json"))["version"])')
[ "$OLD" != "$NEW" ] || { echo "Already at $NEW."; exit 0; }

python3 - "$OLD" "$NEW" <<'PY'
import re, sys, pathlib
old, new = sys.argv[1], sys.argv[2]
def sub(path, pattern, repl, count=1):
    p = pathlib.Path(path); s = p.read_text(); s2, n = re.subn(pattern, repl, s, count=count)
    assert n == count, f"{path}: expected {count} match(es) for {pattern!r}, found {n}"
    p.write_text(s2)
sub("browser-extension/manifest.json", r'"version": "%s"' % re.escape(old), '"version": "%s"' % new)
sub("vscode-extension/package.json",  r'"version": "%s"' % re.escape(old), '"version": "%s"' % new)
sub("hub/thinkfirst.py",              r'VERSION = "%s"' % re.escape(old),  'VERSION = "%s"' % new)
sub("mac/Info.plist",                 r'<string>%s</string>' % re.escape(old), '<string>%s</string>' % new, count=2)
PY
echo "Version $OLD -> $NEW in:"
git --no-pager diff --stat -- browser-extension/manifest.json vscode-extension/package.json hub/thinkfirst.py mac/Info.plist | sed 's/^/  /'
echo
echo "Next: add a [$NEW] section to CHANGELOG.md, commit, then:"
echo "  git tag v$NEW && git push origin main v$NEW"
echo "The release workflow builds the packages and publishes the release."
