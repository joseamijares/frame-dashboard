#!/bin/sh
# Build, sign and install the launcher, the same way scripts/tizen.sh does the dashboard shell.
# Needs the Tizen Studio CLI and a Samsung certificate profile (see the README).
#   sh launcher/scripts/tizen.sh build              → launcher/FrameLauncher.wgt
#   TV_IP=192.168.1.50 sh launcher/scripts/tizen.sh install
set -eu
cd "$(dirname "$0")/.."

TIZEN="${TIZEN_HOME:-$HOME/tizen-studio}/tools/ide/bin/tizen"
SDB="${TIZEN_HOME:-$HOME/tizen-studio}/tools/sdb"
PROFILE="${TIZEN_PROFILE:-frame}"
APP_ID=FrmLnchr01.Launcher
OUT=.buildResult

[ -x "$TIZEN" ] || { echo "Tizen CLI not found at $TIZEN (set TIZEN_HOME)"; exit 1; }

case "${1:-}" in
  build)
    # index.html always loads the gitignored per-TV overrides; ship an empty one if there are none.
    [ -f src/js/config.local.js ] || echo '/* No local overrides. See config.local.example.js. */' > src/js/config.local.js
    node scripts/build-marks.mjs
    rm -rf "src/$OUT"
    "$TIZEN" build-web -out "$OUT" -- src
    "$TIZEN" package -t wgt -s "$PROFILE" -- "src/$OUT"
    mv "src/$OUT"/*.wgt FrameLauncher.wgt
    rm -rf "src/$OUT"
    echo "Built launcher/FrameLauncher.wgt"
    ;;
  install)
    : "${TV_IP:?set TV_IP to the address of the TV}"
    "$SDB" connect "$TV_IP:26101"
    # Only the TV at TV_IP, even when another one is also connected.
    TARGET=$("$SDB" devices | awk -v serial="$TV_IP:26101" 'NR>1 && $1 == serial {print $3; exit}')
    [ -n "$TARGET" ] || { echo "No TV connected at $TV_IP:26101 (is Developer Mode pointing at this Mac?)"; exit 1; }
    "$TIZEN" install -n FrameLauncher.wgt -t "$TARGET" -- .
    "$TIZEN" run -p "$APP_ID" -t "$TARGET"
    ;;
  *)
    echo "usage: sh launcher/scripts/tizen.sh build|install"; exit 1 ;;
esac
