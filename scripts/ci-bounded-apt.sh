#!/usr/bin/env bash
# Usage: ci-bounded-apt.sh SECONDS COMMAND...
#
# QUAL-33: runs COMMAND as root under a wall-clock bound, with one retry. The
# runner's Azure apt mirror sometimes trickles (one stall logged "Fetched 24.9 MB
# in 6min 2s (68.9 kB/s)"; others cost 328 to 774 s) where a normal install takes
# 8 to 29 s. That is a slow connection, not a dead one, so apt's own timeouts never
# fire; only a wall-clock kill does. GNU timeout signals its whole process group,
# so apt-get under it dies too. CI_BOUNDED_APT_PREFIX overrides the sudo prefix
# (empty in tests, which have no root).
set -u

if [ "$#" -lt 2 ]; then
  echo "usage: ci-bounded-apt.sh SECONDS COMMAND..." >&2
  exit 2
fi
if ! command -v timeout >/dev/null 2>&1; then
  echo "ci-bounded-apt.sh: GNU timeout not found; refusing to run unbounded" >&2
  exit 127
fi

seconds=$1
shift
if [ "${CI_BOUNDED_APT_PREFIX+set}" = set ]; then
  read -r -a prefix <<<"$CI_BOUNDED_APT_PREFIX"
else
  prefix=(sudo env "PATH=$PATH")
fi

status=0
for attempt in 1 2; do
  if [ "$attempt" = 2 ]; then
    "${prefix[@]}" dpkg --configure -a || true
  fi
  "${prefix[@]}" timeout --kill-after=15 "$seconds" "$@"
  status=$?
  [ "$status" -eq 0 ] && exit 0
  echo "::warning::attempt $attempt of 2 failed (exit $status, bound ${seconds}s): $*"
done
exit "$status"
