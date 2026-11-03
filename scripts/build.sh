#!/usr/bin/env bash
# Copyright (C) 2026 wendsell
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Build store-ready zips into dist/.
#   scripts/build.sh            -> everything
#   scripts/build.sh chrome     -> Chrome only
#   scripts/build.sh firefox    -> Firefox only (see store/firefox/README.md, not yet tested)
#   scripts/build.sh userscript -> userscript/spoolghetti.user.js (Tampermonkey / Violentmonkey)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/extension"
DIST="$ROOT/dist"
VERSION="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['version'])" "$SRC/manifest.json")"
TARGET="${1:-all}"

mkdir -p "$DIST"

build_chrome() {
  local out="$DIST/spoolghetti-chrome-$VERSION.zip"
  rm -f "$out"
  (cd "$SRC" && zip -qr "$out" manifest.json content.js icons)
  echo "Chrome:  $out"
}

build_firefox() {
  local out="$DIST/spoolghetti-firefox-$VERSION.zip"
  local tmp
  tmp="$(mktemp -d)"
  cp -r "$SRC/content.js" "$SRC/icons" "$tmp/"
  # Base manifest + Firefox-only keys (gecko id, data collection declaration)
  python3 - "$SRC/manifest.json" "$ROOT/platforms/firefox/manifest.overrides.json" "$tmp/manifest.json" <<'PY'
import json, sys
base, over, out = sys.argv[1:4]
m = json.load(open(base))
def merge(a, b):
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            merge(a[k], v)
        else:
            a[k] = v
merge(m, json.load(open(over)))
json.dump(m, open(out, "w"), indent=2, ensure_ascii=False)
PY
  rm -f "$out"
  (cd "$tmp" && zip -qr "$out" manifest.json content.js icons)
  rm -rf "$tmp"
  echo "Firefox: $out  (untested, see store/firefox/README.md)"
}

build_userscript() {
  # Same code as the extension, with a Tampermonkey/Violentmonkey header in front.
  # Committed to the repo (not dist/) so it can be installed from its raw GitHub URL.
  local out="$ROOT/userscript/spoolghetti.user.js"
  local raw="https://raw.githubusercontent.com/wendsell/spoolghetti/main"
  mkdir -p "$ROOT/userscript"
  {
    cat <<EOF
// ==UserScript==
// @name         Spoolghetti: Filament Price per kg
// @namespace    https://github.com/wendsell/spoolghetti
// @version      $VERSION
// @description  Check the math. True price per kg on Amazon.com filament searches, best deals sorted to the top, junk filtered out.
// @author       wendsell
// @license      GPL-3.0-or-later
// @homepageURL  https://wendsell.github.io/spoolghetti/
// @supportURL   https://github.com/wendsell/spoolghetti/issues
// @icon         $raw/extension/icons/icon48.png
// @updateURL    $raw/userscript/spoolghetti.user.js
// @downloadURL  $raw/userscript/spoolghetti.user.js
// @match        https://www.amazon.com/s*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// GENERATED FILE. Edit extension/content.js, then run: scripts/build.sh userscript

EOF
    cat "$SRC/content.js"
  } > "$out"
  echo "Userscript: $out"
}

case "$TARGET" in
  chrome)     build_chrome ;;
  firefox)    build_firefox ;;
  userscript) build_userscript ;;
  all)        build_chrome; build_firefox; build_userscript ;;
  *) echo "Usage: $0 [chrome|firefox|userscript|all]" >&2; exit 1 ;;
esac
