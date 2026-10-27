#!/usr/bin/env bash
# Usage: ci-bounded-apt.sh FIRST_SECONDS RETRY_SECONDS COMMAND...
#
# QUAL-33: runs COMMAND as root under a wall-clock bound, with one retry. The
# runner's Azure apt mirror sometimes trickles (one stall logged "Fetched 24.9 MB
# in 6min 2s (68.9 kB/s)"; others cost 328 to 774 s) where a normal install takes
# 8 to 29 s. That is a slow connection, not a dead one, so apt's own timeouts never
# fire; only a wall-clock kill does. GNU timeout signals its whole process group,
# so apt-get under it dies too. Two bounds, because a mirror that stays slow for
# both attempts would otherwise turn a slow green job into a red one: the stall that
# prompted this finished after 371 s, so the retry gets the longer bound.
# CI_BOUNDED_APT_PREFIX overrides the sudo prefix
# (empty in tests, which have no root).
set -u

if [ "$#" -lt 3 ]; then
  echo "usage: ci-bounded-apt.sh FIRST_SECONDS RETRY_SECONDS COMMAND..." >&2
  exit 2
fi
if ! command -v timeout >/dev/null 2>&1; then
  echo "ci-bounded-apt.sh: GNU timeout not found; refusing to run unbounded" >&2
  exit 127
fi

first=$1
retry=$2
shift 2
if [ "${CI_BOUNDED_APT_PREFIX+set}" = set ]; then
  read -r -a prefix <<<"$CI_BOUNDED_APT_PREFIX"
else
  # HOME=/root: npx as root must not write root-owned files into the runner user's ~/.npm.
  prefix=(sudo env "PATH=$PATH" HOME=/root)
fi

status=0
for attempt in 1 2; do
  seconds=$first
  if [ "$attempt" = 2 ]; then
    seconds=$retry
    "${prefix[@]}" dpkg --configure -a || true
  fi
  "${prefix[@]}" timeout --kill-after=15 "$seconds" "$@"
  status=$?
  [ "$status" -eq 0 ] && exit 0
  echo "::warning::attempt $attempt of 2 failed (exit $status, bound ${seconds}s): $*"
done
exit "$status"
