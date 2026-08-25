#!/usr/bin/env bash
set -euo pipefail

echo '{"code":"CSTAR_PUBLIC_HERMES_DAEMON_DECOMMISSIONED","ok":false,"message":"Public Hermes spoke daemons are decommissioned; use canonical CStar Forge or Researcher lanes."}' >&2
exit 2
