#!/usr/bin/env bash
set -euo pipefail
INPUT=$(cat)
echo "$INPUT" > /tmp/vitest-elicitation-result-debug.json
exit 0
