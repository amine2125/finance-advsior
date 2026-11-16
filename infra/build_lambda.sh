#!/usr/bin/env bash
# Build the Lambda package WITHOUT Docker (decision D-020/D-030): Linux arm64 wheels via pip --platform.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/infra/build/lambda"
PIP="$ROOT/backend/.venv/bin/pip"
rm -rf "$OUT" && mkdir -p "$OUT"
"$PIP" install --quiet --no-compile --target "$OUT" \
  --platform manylinux2014_aarch64 --platform manylinux_2_28_aarch64 --implementation cp --python-version 3.12 --only-binary=:all: \
  "numpy==2.5.4" "scipy==1.18.1" "scikit-learn==1.9.1" "pydantic==2.14.3" "anthropic==2.8.0"
# boto3/botocore are provided by the Lambda Python 3.12 runtime
rm -rf "$OUT"/boto3* "$OUT"/botocore* "$OUT"/s3transfer* "$OUT"/jmespath* "$OUT"/bin
find "$OUT" -type d \( -name tests -o -name test -o -name __pycache__ \) -prune -exec rm -rf {} +
find "$OUT" -name "*.pyx" -o -name "*.pxd" -o -name "*.c" -o -name "*.cpp" -o -name "*.h" | xargs rm -f
cp -R "$ROOT/backend/ulysse" "$OUT/ulysse"
find "$OUT/ulysse" -name __pycache__ -prune -exec rm -rf {} +
mkdir -p "$OUT/data/manual"
cp "$ROOT/data/manual/esg_evidence.json" "$ROOT/data/manual/wikipedia_articles.csv" "$OUT/data/manual/"
echo "package: $(du -sh "$OUT" | cut -f1) (unzipped, Lambda limit 250 MB)"
