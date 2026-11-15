#!/usr/bin/env bash
# Build the Lambda deployment directory without Docker: Linux x86_64 / CPython 3.12 manylinux wheels + app source.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/backend/dist/lambda"
rm -rf "$OUT" && mkdir -p "$OUT"
uv pip install --quiet --python-platform x86_64-manylinux2014 --python-version 3.12 --only-binary :all: \
  --target "$OUT" -r "$ROOT/backend/requirements-lambda.txt"
cp -r "$ROOT/backend/app" "$OUT/app"
# ULYSSE market signals, pre-computed for the datapack date (the statistical engine itself stays out of the package)
(cd "$ROOT/backend" && .venv/bin/python -m ulysse.signaux "$OUT/app/data/ulysse_signals.json")
# trim: caches, bundled test suites (not needed at runtime)
find "$OUT" -type d -name "__pycache__" -prune -exec rm -rf {} +
rm -rf "$OUT"/pandas/tests "$OUT"/numpy/*/tests "$OUT"/numpy/tests "$OUT"/numpy/_core/tests 2>/dev/null || true
du -sh "$OUT"
