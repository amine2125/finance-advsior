import * as path from "path";
import * as fs from "fs";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";

/**
 * Smallest credible AWS footprint for AEGIS:
 *  CloudFront (+ private S3 SPA) -> /api/* -> API Gateway HTTP API -> Lambda (FastAPI) -> async worker Lambda (multi-agent jobs)
 *  Amazon Bedrock (Converse) for every agent call; DynamoDB single table; private S3 data bucket;
 *  CloudWatch logs (EMF token/latency metrics) + dashboard.
 *  Amazon Cognito user pool for sign-up / sign-in (the API validates each access token; passwords never reach our code).
 */
export class AegisStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const repo = path.resolve(__dirname, "..", "..");
    const agentModel: string = this.node.tryGetContext("agentModelId");
    const supervisorModel: string = this.node.tryGetContext("supervisorModelId");
    const appName: string = this.node.tryGetContext("appName") || "AEGIS";

    // ---------------------------------------------------------------- storage
    const dataBucket = new s3.Bucket(this, "DataBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true,
      versioned: true, removalPolicy: cdk.RemovalPolicy.DESTROY, autoDeleteObjects: true,
    });
    const dataDir = path.join(repo, "data", "active");
    if (!fs.existsSync(path.join(dataDir, "prices_daily.csv"))) {
      throw new Error("data/active is empty: run `make data` before deploying");
    }
    new s3deploy.BucketDeployment(this, "DeployDataset", {
      sources: [s3deploy.Source.asset(dataDir)], destinationBucket: dataBucket, destinationKeyPrefix: "datasets/active/", prune: true,
      memoryLimit: 512,
    });

    const table = new dynamodb.Table(this, "Table", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING }, sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, timeToLiveAttribute: "ttl", encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }, removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ---------------------------------------------------------------- accounts (Amazon Cognito)
    // Datathon demo: new accounts are confirmed at once (no e-mail code to wait for), so judges can sign up and test immediately.
    const autoConfirm = new lambda.Function(this, "AutoConfirmFunction", {
      runtime: lambda.Runtime.NODEJS_20_X, handler: "index.handler", timeout: cdk.Duration.seconds(5),
      code: lambda.Code.fromInline(
        "exports.handler=async(e)=>{e.response.autoConfirmUser=true;if(e.request.userAttributes&&e.request.userAttributes.email){e.response.autoVerifyEmail=true;}return e;};"),
      description: "Cognito pre-sign-up: confirm demo accounts immediately",
    });
    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${appName}-users`, selfSignUpEnabled: true, signInAliases: { email: true }, signInCaseSensitive: false,
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 8, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY, lambdaTriggers: { preSignUp: autoConfirm },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const userPoolClient = userPool.addClient("WebClient", {
      authFlows: { userPassword: true, userSrp: true }, generateSecret: false, preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1), idTokenValidity: cdk.Duration.hours(1), refreshTokenValidity: cdk.Duration.days(30),
    });

    // ---------------------------------------------------------------- compute
    const bundle = path.join(repo, "backend", "dist", "lambda");
    if (!fs.existsSync(path.join(bundle, "app", "main.py"))) {
      throw new Error("backend/dist/lambda missing: run scripts/build_lambda.sh first");
    }
    const code = lambda.Code.fromAsset(bundle);
    const env: Record<string, string> = {
      AEGIS_APP_NAME: appName, AEGIS_ENV: "aws", AEGIS_STORAGE_BACKEND: "dynamodb", AEGIS_DYNAMODB_TABLE: table.tableName,
      AEGIS_DATA_BUCKET: dataBucket.bucketName, AEGIS_DATA_PREFIX: "datasets/active/", AEGIS_BEDROCK_REGION: this.region,
      AEGIS_AGENT_MODEL_ID: agentModel, AEGIS_SUPERVISOR_MODEL_ID: supervisorModel, AEGIS_LLM_ENABLED: "true",
      AEGIS_JOB_RUNNER: "lambda", AEGIS_WEB_RESEARCH_ENABLED: "true",
      AEGIS_CORS_ORIGINS: "http://localhost:5173", AEGIS_SEC_USER_AGENT: "AEGIS datathon prototype aegis-demo@example.org",
      AEGIS_LOCAL_STORE: "/tmp/aegis-local", AEGIS_LLM_TIMEOUT_S: "90",
      AEGIS_AUTH: "cognito", AEGIS_COGNITO_REGION: this.region, AEGIS_COGNITO_USER_POOL_ID: userPool.userPoolId,
      AEGIS_COGNITO_CLIENT_ID: userPoolClient.userPoolClientId, AEGIS_DEMO_ACCOUNTS: "true",
    };
    const worker = new lambda.Function(this, "WorkerFunction", {
      runtime: lambda.Runtime.PYTHON_3_12, architecture: lambda.Architecture.X86_64, handler: "app.lambda_handler.worker_handler", code,
      memorySize: 2048, timeout: cdk.Duration.minutes(10), environment: env, ephemeralStorageSize: cdk.Size.mebibytes(1024),
      logGroup: new logs.LogGroup(this, "WorkerLogs", { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: cdk.RemovalPolicy.DESTROY }),
      description: "AEGIS multi-agent jobs (debate, copilot, hype research, replay, reports) and scheduled Guardian scans",
      retryAttempts: 0,
    });
    const api = new lambda.Function(this, "ApiFunction", {
      runtime: lambda.Runtime.PYTHON_3_12, architecture: lambda.Architecture.X86_64, handler: "app.lambda_handler.api_handler", code,
      memorySize: 1769, timeout: cdk.Duration.seconds(29), environment: { ...env, AEGIS_WORKER_FUNCTION: worker.functionName },
      logGroup: new logs.LogGroup(this, "ApiLogs", { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: cdk.RemovalPolicy.DESTROY }),
      description: "AEGIS REST API (FastAPI via Mangum)",
    });
    for (const fn of [api, worker]) {
      table.grantReadWriteData(fn);
      dataBucket.grantRead(fn);
      // Least privilege: only the configured models, via the US cross-region inference profile and its foundation models.
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [...new Set([agentModel, supervisorModel])].flatMap((m) => [
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${m}`,
          `arn:aws:bedrock:*::foundation-model/${m.replace(/^(us|global|eu|apac)\./, "")}`,
        ]),
      }));
    }
    worker.grantInvoke(api);
    // Shared news cache: every 15 min (GDELT's own update rhythm) the worker re-reads SEC / GDELT / CoinGecko for the single
    // securities, so an analysis no longer waits for these slow, rate-limited sources. No language model in this refresh.
    new events.Rule(this, "NewsRefreshSchedule", {
      description: "AEGIS: refresh the shared news cache (free public sources only)",
      schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
      targets: [new targets.LambdaFunction(worker, { event: events.RuleTargetInput.fromObject({ task: "news_refresh", period_s: 900 }), retryAttempts: 0 })],
    });

    // ---------------------------------------------------------------- API
    const httpApi = new apigw.HttpApi(this, "HttpApi", {
      apiName: `${appName}-api`, description: "AEGIS API (served same-origin behind CloudFront)",
      defaultIntegration: new integrations.HttpLambdaIntegration("ApiIntegration", api),
    });
    const stage = httpApi.defaultStage?.node.defaultChild as apigw.CfnStage;
    stage.defaultRouteSettings = { throttlingBurstLimit: 50, throttlingRateLimit: 20 };

    // ---------------------------------------------------------------- frontend
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, autoDeleteObjects: true,
    });
    const spaRewrite = new cloudfront.Function(this, "SpaRewrite", {
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event){var r=event.request;if(r.uri.indexOf('.')===-1){r.uri='/index.html';}return r;}"),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });
    const apiDomain = cdk.Fn.select(2, cdk.Fn.split("/", httpApi.apiEndpoint));
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: `${appName} web app`, defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket), viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new origins.HttpOrigin(apiDomain, { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY, readTimeout: cdk.Duration.seconds(30) }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY, allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });
    const dist = path.join(repo, "frontend", "dist");
    if (fs.existsSync(path.join(dist, "index.html"))) {
      new s3deploy.BucketDeployment(this, "DeploySite", {
        sources: [s3deploy.Source.asset(dist)], destinationBucket: siteBucket, distribution, distributionPaths: ["/*"], memoryLimit: 512,
      });
    }

    // ---------------------------------------------------------------- observability
    const agentIds = ["opportunity_agent.r1", "risk_agent.r1", "explainer", "copilot", "supervisor", "market_intelligence.claim_extraction"];
    new cw.Dashboard(this, "Dashboard", {
      dashboardName: `${appName}-agents`,
      widgets: [[
        new cw.GraphWidget({ title: "Jetons Bedrock par agent", width: 12, left: agentIds.map((a) => new cw.Metric({ namespace: "AEGIS/Agents",
          metricName: "OutputTokens", dimensionsMap: { agent_id: a }, statistic: "Sum", period: cdk.Duration.minutes(5), label: a })) }),
        new cw.GraphWidget({ title: "Latence des appels Bedrock (ms, p90)", width: 12, left: agentIds.map((a) => new cw.Metric({ namespace: "AEGIS/Agents",
          metricName: "LatencyMs", dimensionsMap: { agent_id: a }, statistic: "p90", period: cdk.Duration.minutes(5), label: a })) }),
      ], [
        new cw.GraphWidget({ title: "Lambda – erreurs / invocations", width: 12, left: [api.metricErrors(), worker.metricErrors()], right: [api.metricInvocations(), worker.metricInvocations()] }),
        new cw.GraphWidget({ title: "Lambda – durée (p90)", width: 12, left: [api.metricDuration({ statistic: "p90" }), worker.metricDuration({ statistic: "p90" })] }),
      ]],
    });

    new cdk.CfnOutput(this, "AppUrl", { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, "ApiEndpoint", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "TableName", { value: table.tableName });
    new cdk.CfnOutput(this, "DataBucketName", { value: dataBucket.bucketName });
    new cdk.CfnOutput(this, "WorkerFunctionName", { value: worker.functionName });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
  }
}
