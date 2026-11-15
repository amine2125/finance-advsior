"""Creates (or resets the password of) the three jury demo accounts in the deployed Cognito user pool.

Their profile, questionnaire answers and portfolio are written to DynamoDB by the API on their first sign-in (or after
« Tout effacer »), so this script only manages the Cognito side. Idempotent: safe to run after every deploy.

    backend/.venv/bin/python scripts/seed_demo_accounts.py            # reads infrastructure/cdk-outputs.json
    backend/.venv/bin/python scripts/seed_demo_accounts.py --pool us-east-1_XXXX
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import app.config  # noqa: E402,F401  (loads the local .env: AWS credentials and region)
import boto3  # noqa: E402
from app.services.demo_accounts import DEMO, password  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pool", help="Cognito user pool id (default: AegisStack output UserPoolId)")
    args = ap.parse_args()
    pool = args.pool
    if not pool:
        out = json.loads((ROOT / "infrastructure" / "cdk-outputs.json").read_text())
        pool = out["AegisStack"]["UserPoolId"]
    cog = boto3.client("cognito-idp", region_name=pool.split("_")[0])
    for d in DEMO:
        try:
            cog.admin_create_user(UserPoolId=pool, Username=d["email"], MessageAction="SUPPRESS",
                                  UserAttributes=[{"Name": "email", "Value": d["email"]}, {"Name": "email_verified", "Value": "true"}])
            state = "créé"
        except cog.exceptions.UsernameExistsException:
            state = "existait déjà"
        cog.admin_set_user_password(UserPoolId=pool, Username=d["email"], Password=password(), Permanent=True)
        print(f"{d['name']:<7} {d['email']:<32} {state}")


if __name__ == "__main__":
    main()
