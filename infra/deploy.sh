#!/usr/bin/env bash
# Phase 7 deployment (run only with credentials provided by the team; nothing is hardcoded).
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
sam deploy --template-file template.yaml --stack-name "$STACK" --region "$REGION" --resolve-s3 \
  --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
  --parameter-overrides "BedrockModelId=$MODEL" "BudgetEmail=$BUDGET_EMAIL"
out() { aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
DATA=$(out DataBucketName); UI=$(out UiBucketName); DIST=$(out DistributionId); FN=$(out FunctionName); URL=$(out AppUrl)
aws s3 sync "$ROOT/data/build/datapack/" "s3://$DATA/datapack/" --region "$REGION" --delete
aws s3 sync "$ROOT/frontend/dist/" "s3://$UI/" --region "$REGION" --delete
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null
aws lambda invoke --function-name "$FN" --region "$REGION" --cli-binary-format raw-in-base64-out \
  --payload '{"requestContext":{"http":{"method":"POST"}},"rawPath":"/api/demo/reinitialiser","body":"{}"}' /dev/stdout >/dev/null
echo "ULYSSE déployé : $URL"
