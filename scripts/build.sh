#!/usr/bin/env bash
# Builds the three Think First packages from source into release/:
#   Think-First-Chrome-<version>.zip     browser extension
#   Think-First-Mac.zip                  Mac app bundle
#   think-first-tracker-<version>.vsix   VS Code extension
#   SHA256SUMS.txt                       checksums of the above
# Needs: python3, zip, node (for the VS Code package). No other dependencies.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(python3 -c 'import json; print(json.load(open("browser-extension/manifest.json"))["version"])')

# Every component must carry the same version number.
check() { grep -q -- "$2" "$1" || { echo "Version mismatch: $1 does not contain '$2' (manifest says $VERSION)." >&2; echo "Run scripts/bump-version.sh $VERSION to align them." >&2; exit 1; }; }
check vscode-extension/package.json "\"version\": \"$VERSION\""
check hub/thinkfirst.py "VERSION = \"$VERSION\""
check mac/Info.plist "<string>$VERSION</string>"

OUT="$PWD/release"; mkdir -p "$OUT"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

echo "Building Think First $VERSION"

# 1. Browser extension: the folder as-is, minus dotfiles.
(cd browser-extension && zip -q -X -r "$TMP/Think-First-Chrome-$VERSION.zip" . -x '.*' '*/.*')
echo "  browser extension  ok"

# 2. Mac app: a plain bundle around the Python hub. Unsigned; see LAUNCH.md.
APP="$TMP/Think First.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp mac/Info.plist "$APP/Contents/Info.plist"
cp mac/launcher.sh "$APP/Contents/MacOS/ThinkFirst" && chmod 755 "$APP/Contents/MacOS/ThinkFirst"
cp hub/thinkfirst.py hub/dashboard.html assets/ThinkFirst.icns "$APP/Contents/Resources/"
(cd "$TMP" && zip -q -X -r "$TMP/Think-First-Mac.zip" "Think First.app")
echo "  Mac app            ok"

# 3. VS Code extension, packaged with the official tool.
(cd vscode-extension && npx --yes @vscode/vsce@3 package --no-dependencies -o "$TMP/think-first-tracker-$VERSION.vsix" >/dev/null)
echo "  VS Code extension  ok"

mv "$TMP/Think-First-Chrome-$VERSION.zip" "$TMP/Think-First-Mac.zip" "$TMP/think-first-tracker-$VERSION.vsix" "$OUT/"
(cd "$OUT" && shasum -a 256 "Think-First-Chrome-$VERSION.zip" "Think-First-Mac.zip" "think-first-tracker-$VERSION.vsix" > SHA256SUMS.txt)

echo; echo "Packages in release/:"; (cd "$OUT" && ls -l "Think-First-Chrome-$VERSION.zip" "Think-First-Mac.zip" "think-first-tracker-$VERSION.vsix" SHA256SUMS.txt | awk '{printf "  %-36s %8s bytes\n", $9, $5}')
