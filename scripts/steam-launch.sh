#!/bin/sh
# Isaac Chronicle - starts the Companion together with the game and stops it when the game closes.
# Steam Deck / Linux. In Steam: The Binding of Isaac > Properties > Launch options:
#
#     "/home/deck/IsaacCompanion/steam-launch.sh" %command%
#
# Extra Companion options go in IRTC_ARGS, for example to force mobile mode on:
#
#     IRTC_ARGS="--lan" "/home/deck/IsaacCompanion/steam-launch.sh" %command%
#
# The Companion output (including the phone link) is written to companion.log in this folder.

DIR="$(cd "$(dirname "$0")" && pwd)"

# The Companion is a normal host program: keep Steam's runtime libraries and overlay out of it.
# shellcheck disable=SC2086
env -u LD_PRELOAD -u LD_LIBRARY_PATH "$DIR/isaac-companion" --no-open ${IRTC_ARGS:-} >"$DIR/companion.log" 2>&1 &
COMPANION=$!

if [ "$#" -eq 0 ]; then
  echo "Use this script in the Steam launch options:  \"$DIR/steam-launch.sh\" %command%" >&2
  wait "$COMPANION"
  exit $?
fi

"$@"
STATUS=$?

kill "$COMPANION" 2>/dev/null
wait "$COMPANION" 2>/dev/null
exit "$STATUS"
