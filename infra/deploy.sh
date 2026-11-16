#!/usr/bin/env bash
# Deployment with the AWS CLI credentials of the person deploying (aws configure / aws sso login); no .env, nothing hardcoded.
# Usage: AWS_PROFILE=<profile> BUDGET_EMAIL=<address> ./infra/deploy.sh [stack-name]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STACK="${1:-ulysse}"
REGION="${AWS_REGION:-ca-central-1}"
MODEL="${ULYSSE_BEDROCK_MODEL:-anthropic.claude-opus-5-5}"
: "${BUDGET_EMAIL:?set BUDGET_EMAIL for cost alerts}"
"$ROOT/infra/build_lambda.sh"
(cd "$ROOT/frontend" && npm run build)
cd "$ROOT/infra"
SAM="sam"; command -v sam.cmd >/dev/null 2>&1 && SAM="sam.cmd"
ACCT=$(aws sts get-caller-identity --query Account --output text)
SAM_BUCKET="${SAM_BUCKET:-ulysse-sam-$ACCT-$REGION}"
if ! aws s3api head-bucket --bucket "$SAM_BUCKET" --region "$REGION" 2>/dev/null; then
  aws s3 mb "s3://$SAM_BUCKET" --region "$REGION"
fi
"$SAM" deploy --template-file template.yaml --stack-name "$STACK" --region "$REGION" --s3-bucket "$SAM_BUCKET" \
  --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
  --parameter-overrides "BedrockModelId=$MODEL" "BudgetEmail=$BUDGET_EMAIL"
out() { aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
DATA=$(out DataBucketName); UI=$(out UiBucketName); DIST=$(out DistributionId); FN=$(out FunctionName); URL=$(out AppUrl)
aws s3 sync "$ROOT/data/build/datapack/" "s3://$DATA/datapack/" --region "$REGION" --delete
aws s3 sync "$ROOT/frontend/dist/" "s3://$UI/" --region "$REGION" --delete
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null
PY="$ROOT/backend/.venv/bin/python"; [ -x "$PY" ] || PY="$ROOT/backend/.venv/Scripts/python.exe"   # Windows (Git Bash)
"$PY" "$ROOT/scripts/creer_comptes_demo.py" --stack "$STACK" --region "$REGION"     # jury accounts (Cognito)
aws lambda invoke --function-name "$FN" --region "$REGION" --cli-binary-format raw-in-base64-out \
  --payload '{"action":"vigie"}' /dev/null >/dev/null                                 # first Vigie run
echo "ULYSSE déployé : $URL"
