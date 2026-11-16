#!/usr/bin/env python3
"""Create (or reset the password of) the three jury demo accounts in the stack's Cognito user pool.

Usage: python scripts/creer_comptes_demo.py --stack ulysse [--region ca-central-1] [--mot-de-passe ...]
AWS credentials come from the AWS CLI (aws configure / aws sso login), never from a file in the repository.
The accounts are fictitious; their reference profile is created by the API at the first sign-in.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from ulysse.compte import DEMO_MOT_DE_PASSE_DEFAUT  # noqa: E402
from ulysse.personas import COMPTES_DEMO  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stack", default="ulysse")
    ap.add_argument("--region", default=os.environ.get("AWS_REGION", "ca-central-1"))
    ap.add_argument("--mot-de-passe", default=os.environ.get("ULYSSE_DEMO_MOT_DE_PASSE", DEMO_MOT_DE_PASSE_DEFAUT))
    a = ap.parse_args()
    import boto3
    outs = boto3.client("cloudformation", region_name=a.region).describe_stacks(StackName=a.stack)["Stacks"][0]["Outputs"]
    pool = next(o["OutputValue"] for o in outs if o["OutputKey"] == "UserPoolId")
    idp = boto3.client("cognito-idp", region_name=a.region)
    for email in COMPTES_DEMO:
        try:
            idp.admin_create_user(UserPoolId=pool, Username=email, MessageAction="SUPPRESS",
                                  UserAttributes=[{"Name": "email", "Value": email}, {"Name": "email_verified", "Value": "true"}])
            etat = "créé"
        except idp.exceptions.UsernameExistsException:
            etat = "existant"
        idp.admin_set_user_password(UserPoolId=pool, Username=email, Password=a.mot_de_passe, Permanent=True)
        print(f"{email} : {etat}, mot de passe à jour")


if __name__ == "__main__":
    main()
