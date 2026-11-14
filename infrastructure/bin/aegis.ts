#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { AegisStack } from "../lib/aegis-stack";

const app = new cdk.App();
const region = app.node.tryGetContext("region") || process.env.CDK_DEFAULT_REGION || "us-east-1";
new AegisStack(app, "AegisStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region },
  description: "AEGIS - multi-agent portfolio intelligence (PolyFinances Datathon 2026). Simulation only.",
});
