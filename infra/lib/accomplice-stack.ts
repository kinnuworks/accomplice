// Accomplice on AWS (ap-south-1).
//
// Default (cdn=false, tunnel=cloudflare):
//   phones, TV, Echo ──HTTPS/WSS──> Cloudflare quick tunnel ──> cloudflared inside the Fargate task ──> server
//   anyone          ──HTTP/WS────> ALB ──> Fargate task     (stable address, health checks)
// With -c cdn=true (needs a CloudFront-verified account):
//   devices ──HTTPS/WSS──> CloudFront ──┬─ /tv/* /p/* /echo/* /assets/* /audio/* ─> S3 (fallback: ALB)
//                                       └─ everything else (/ws /stt /api /mcp) ───> ALB ─> Fargate task
//   Fargate task ─> Polly (ap-south-1 neural, us-east-1 generative), Transcribe streaming, Translate,
//                   DynamoDB (game + records tables), S3 audio cache, Secrets Manager (API keys), CloudWatch.
//
// Why Fargate and not App Runner: App Runner does not support WebSockets, and the game runs on two
// long lived sockets (/ws game state, /stt live speech). Fargate behind an ALB does.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Stack, type StackProps, Duration, RemovalPolicy, CfnOutput, SecretValue,
  aws_ec2 as ec2, aws_ecs as ecs, aws_elasticloadbalancingv2 as elbv2, aws_iam as iam,
  aws_dynamodb as ddb, aws_s3 as s3, aws_s3_deployment as s3deploy, aws_cloudfront as cf,
  aws_cloudfront_origins as origins, aws_secretsmanager as sm, aws_logs as logs, aws_cloudwatch as cw,
  aws_ecr_assets as ecrAssets, aws_ssm as ssm,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8787;
const NAMESPACE = 'Accomplice';

export class AccompliceStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const ctx = (k: string, d: unknown) => this.node.tryGetContext(k) ?? d;
    const cpu = Number(ctx('cpu', 512));
    const memoryLimitMiB = Number(ctx('memoryMiB', 1024));
    const flag = (k: string, d: boolean) => { const v = ctx(k, d); return v === true || v === 'true' || v === 'on'; };
    // CloudFront is designed in but off by default: this account needs AWS verification before it may create
    // CloudFront resources. Turn on with -c cdn=true once verified.
    const cdn = flag('cdn', false);
    // HTTPS for phones without CloudFront or a domain: a Cloudflare quick tunnel from inside the container.
    const tunnel = String(ctx('tunnel', 'cloudflare')) === 'cloudflare' && !cdn;

    // ---------- network: two public subnets, no NAT gateway (saves ~$33/month) ----------
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }],
      restrictDefaultSecurityGroup: false,
    });

    // ---------- data ----------
    // Game table: room snapshots, fair play audit rows, results, all-time counters (see apps/server/src/aws/store.ts).
    const gameTable = new ddb.TableV2(this, 'GameTable', {
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
      sortKey: { name: 'sk', type: ddb.AttributeType.STRING },
      billing: ddb.Billing.onDemand(),
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: RemovalPolicy.RETAIN,
    });
    // Detective records for the voice assistant add-on (packages/mcp-game, partition key "household").
    const recordsTable = new ddb.TableV2(this, 'RecordsTable', {
      partitionKey: { name: 'household', type: ddb.AttributeType.STRING },
      billing: ddb.Billing.onDemand(),
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // One private bucket for the rendered voice cache (and, with CloudFront, the web apps and art).
    const bucket = new s3.Bucket(this, 'StaticBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // API keys. Created with empty placeholders (the game runs in offline mode until they are filled).
    // Fill them with infra/scripts/put-secrets.sh, which reads apps/server/.env on your machine.
    const keys = new sm.Secret(this, 'AppKeys', {
      description: 'Accomplice API keys (ANTHROPIC_API_KEY, ELEVENLABS_API_KEY). Set with infra/scripts/put-secrets.sh',
      secretStringValue: SecretValue.unsafePlainText(JSON.stringify({ ANTHROPIC_API_KEY: '', ELEVENLABS_API_KEY: '' })),
    });

    // ---------- load balancer: CloudFront only when the CDN is on, otherwise open HTTP ----------
    const albSg = new ec2.SecurityGroup(this, 'AlbSg', { vpc, description: cdn ? 'ALB: HTTP from CloudFront only' : 'ALB: public HTTP', allowAllOutbound: false });
    if (cdn) {
      const cfPrefixList = ec2.PrefixList.fromLookup(this, 'CloudFrontOriginFacing', { prefixListName: 'com.amazonaws.global.cloudfront.origin-facing' });
      albSg.addIngressRule(ec2.Peer.prefixList(cfPrefixList.prefixListId), ec2.Port.tcp(80), 'CloudFront origin-facing');
    } else {
      albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Public HTTP');
    }
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc, internetFacing: true, securityGroup: albSg,
      idleTimeout: Duration.seconds(3600), // keep idle game sockets open
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    let distribution: cf.Distribution | undefined;
    if (cdn) {
      // ---------- CloudFront: one HTTPS origin for everything, WebSockets included ----------
      const albOrigin = new origins.LoadBalancerV2Origin(alb, {
        protocolPolicy: cf.OriginProtocolPolicy.HTTP_ONLY,
        readTimeout: Duration.seconds(60),
        keepaliveTimeout: Duration.seconds(60),
      });
      const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(bucket);
      // Static paths read S3 first; a miss (403/404) falls through to the server, which has the same files.
      // That covers SPA deep links and voice lines rendered a moment ago and not yet copied to S3.
      const staticGroup = new origins.OriginGroup({ primaryOrigin: s3Origin, fallbackOrigin: albOrigin, fallbackStatusCodes: [403, 404] });
      const indexRewrite = new cf.Function(this, 'IndexRewrite', {
        runtime: cf.FunctionRuntime.JS_2_0,
        comment: 'Serve <app>/index.html for directory requests',
        code: cf.FunctionCode.fromInline(
          "function handler(event) { var r = event.request; if (r.uri.endsWith('/')) { r.uri += 'index.html'; } return r; }"),
      });
      const staticBehavior = (rewrite: boolean): cf.BehaviorOptions => ({
        origin: staticGroup,
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cf.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cf.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        functionAssociations: rewrite ? [{ function: indexRewrite, eventType: cf.FunctionEventType.VIEWER_REQUEST }] : undefined,
      });
      distribution = new cf.Distribution(this, 'Cdn', {
        comment: 'Accomplice game',
        priceClass: cf.PriceClass.PRICE_CLASS_200, // includes India edge locations
        httpVersion: cf.HttpVersion.HTTP2_AND_3,
        defaultBehavior: {
          origin: albOrigin,
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cf.AllowedMethods.ALLOW_ALL,
          cachePolicy: cf.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER, // forwards the WebSocket upgrade headers
        },
        additionalBehaviors: {
          '/tv/*': staticBehavior(true),
          '/p/*': staticBehavior(true),
          '/echo/*': staticBehavior(true),
          '/assets/*': staticBehavior(false),
          '/audio/*': staticBehavior(false),
        },
      });
    }
    const albUrl = `http://${alb.loadBalancerDnsName}`;
    // With the tunnel, the container replaces this with its https://*.trycloudflare.com address at start.
    const publicUrl = distribution ? `https://${distribution.distributionDomainName}` : albUrl;
    const urlParam = new ssm.StringParameter(this, 'PublicUrlParam', {
      parameterName: '/accomplice/public-url',
      stringValue: publicUrl,
      description: 'Current public game URL. The server overwrites it on start (the tunnel URL changes per start).',
    });

    // ---------- compute: one small ARM Fargate task ----------
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc, containerInsightsV2: ecs.ContainerInsights.DISABLED });
    const logGroup = new logs.LogGroup(this, 'ServerLogs', { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY });

    const taskDef = new ecs.FargateTaskDefinition(this, 'Task', {
      cpu, memoryLimitMiB,
      runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.ARM64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX },
    });

    // Least privilege for the game server itself (the task role).
    const role = taskDef.taskRole;
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      sid: 'PollyVoices', actions: ['polly:SynthesizeSpeech', 'polly:DescribeVoices'], resources: ['*'],
    }));
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      sid: 'TranscribeStreaming', actions: ['transcribe:StartStreamTranscription', 'transcribe:StartStreamTranscriptionWebSocket'], resources: ['*'],
    }));
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      sid: 'Translate', actions: ['translate:TranslateText', 'comprehend:DetectDominantLanguage'], resources: ['*'],
    }));
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      sid: 'GameTable', actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query'], resources: [gameTable.tableArn],
    }));
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      sid: 'RecordsTable', actions: ['dynamodb:GetItem', 'dynamodb:PutItem'], resources: [recordsTable.tableArn],
    }));
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      sid: 'AudioCacheObjects', actions: ['s3:GetObject', 's3:PutObject'], resources: [bucket.arnForObjects('audio/*')],
    }));
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      sid: 'AudioCacheList', actions: ['s3:ListBucket'], resources: [bucket.bucketArn],
      conditions: { StringLike: { 's3:prefix': ['audio/*'] } },
    }));
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      sid: 'PublishPublicUrl', actions: ['ssm:PutParameter'], resources: [urlParam.parameterArn],
    }));

    const image = ecs.ContainerImage.fromAsset(REPO_ROOT, {
      file: 'apps/server/Dockerfile',
      platform: ecrAssets.Platform.LINUX_ARM64,
      exclude: ['infra', '**/node_modules', '**/cdk.out', '.git', 'apps/vega', '**/.env'],
    });

    taskDef.addContainer('server', {
      image,
      essential: true,
      portMappings: [{ containerPort: PORT }],
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: 'server', mode: ecs.AwsLogDriverMode.NON_BLOCKING }),
      environment: {
        PORT: String(PORT),
        PUBLIC_URL: publicUrl,
        AWS_REGION: this.region,
        // Suspects: neural voices next door in Mumbai. Narrator: generative voices in us-east-1, pre-rendered.
        POLLY_REGION: this.region,
        NARRATOR_POLLY_REGION: 'us-east-1',
        NARRATOR_PROVIDER: String(ctx('narratorProvider', 'polly')),
        TTS_PROVIDER: 'polly',
        STT_PROVIDER: 'transcribe',
        TRANSLATE: 'on',
        ACCOMPLICE_TABLE: gameTable.tableName,
        AUDIO_BUCKET: bucket.bucketName,
        AUDIO_PREFIX: 'audio/',
        EMF_METRICS: 'on',
        EMF_NAMESPACE: NAMESPACE,
        ACCOMPLICE_RECORDS: 'dynamodb',
        ACCOMPLICE_RECORDS_TABLE: recordsTable.tableName,
        PUBLIC_URL_PARAM: urlParam.parameterName,
        ...(tunnel ? { TUNNEL: 'cloudflare' } : {}),
      },
      // Injected at start by the execution role; never in the image or the template.
      secrets: {
        ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(keys, 'ANTHROPIC_API_KEY'),
        ELEVENLABS_API_KEY: ecs.Secret.fromSecretsManager(keys, 'ELEVENLABS_API_KEY'),
      },
    });

    const service = new ecs.FargateService(this, 'Service', {
      cluster, taskDefinition: taskDef,
      desiredCount: 1,
      minHealthyPercent: 100, maxHealthyPercent: 200, // new task is healthy before the old one stops
      assignPublicIp: true, // outbound to AWS APIs and the model API without a NAT gateway
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: Duration.seconds(90),
    });

    const listener = alb.addListener('Http', { port: 80, open: false });
    listener.addTargets('Server', {
      port: PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      deregistrationDelay: Duration.seconds(30),
      healthCheck: { path: '/api/health', interval: Duration.seconds(30), healthyThresholdCount: 2, unhealthyThresholdCount: 3 },
    });

    // ---------- static files to S3 (CloudFront mode only; otherwise the server serves /tv /p /echo /assets) ----------
    if (cdn) {
      // ---------- static files to S3 ----------
      // Built web apps: hashed bundles are immutable, everything else (index.html, icons) revalidates after a minute.
      const apps: [string, string][] = [['tv', 'apps/tv-web/dist'], ['p', 'apps/phone/dist'], ['echo', 'apps/echo-sim/dist']];
      for (const [prefix, rel] of apps) {
        const dir = path.join(REPO_ROOT, rel);
        if (!existsSync(path.join(dir, 'index.html'))) {
          throw new Error(`${rel} is missing. Build the web apps first: npm --prefix infra run build:web`);
        }
        const name = prefix[0].toUpperCase() + prefix.slice(1);
        new s3deploy.BucketDeployment(this, `${name}Bundles`, {
          sources: [s3deploy.Source.asset(dir)], destinationBucket: bucket, destinationKeyPrefix: `${prefix}/`,
          exclude: ['*'], include: ['assets/*'], prune: false, memoryLimit: 512,
          cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
        });
        new s3deploy.BucketDeployment(this, `${name}Pages`, {
          sources: [s3deploy.Source.asset(dir)], destinationBucket: bucket, destinationKeyPrefix: `${prefix}/`,
          exclude: ['assets/*'], prune: false, memoryLimit: 512,
          cacheControl: [s3deploy.CacheControl.fromString('public, max-age=60')],
          distribution, distributionPaths: [`/${prefix}/*`],
        });
      }
      // Shared art, music and sound effects (the voice audition samples stay out).
      new s3deploy.BucketDeployment(this, 'SharedAssets', {
        sources: [s3deploy.Source.asset(path.join(REPO_ROOT, 'assets'), { exclude: ['audio/auditions/**', '**/.DS_Store'] })],
        destinationBucket: bucket, destinationKeyPrefix: 'assets/', prune: false, memoryLimit: 512,
        cacheControl: [s3deploy.CacheControl.fromString('public, max-age=86400')],
      });
    }

    // ---------- CloudWatch dashboard ----------
    const m = (metricName: string, statistic: string, label?: string, period = Duration.minutes(1)) =>
      new cw.Metric({ namespace: NAMESPACE, metricName, dimensionsMap: { Service: 'game-server' }, statistic, label: label ?? `${metricName} ${statistic}`, period });
    const dash = new cw.Dashboard(this, 'Dashboard', { dashboardName: 'Accomplice', defaultInterval: Duration.hours(6) });
    dash.addWidgets(
      new cw.TextWidget({ width: 24, height: 2, markdown: `## Accomplice live game server\nPlay at ${tunnel ? 'the address in SSM /accomplice/public-url (run infra/scripts/url.sh)' : publicUrl + '/tv'}. Metrics come from structured log lines (Embedded Metric Format) written by the server.` }),
    );
    dash.addWidgets(
      new cw.GraphWidget({ title: 'Rooms and players', width: 8, left: [m('ActiveRooms', 'Maximum', 'rooms'), m('RoomsInGame', 'Maximum', 'rooms in a game'), m('ConnectedClients', 'Maximum', 'connected screens')] }),
      new cw.GraphWidget({ title: 'Questions asked', width: 8, left: [m('Questions', 'Sum', 'questions', Duration.minutes(5))], right: [m('GamesStarted', 'Sum', 'games started', Duration.hours(1)), m('GamesFinished', 'Sum', 'games finished', Duration.hours(1))] }),
      new cw.GraphWidget({ title: 'Question to answer latency (ms)', width: 8, left: [m('AnswerLatencyMs', 'p50', 'p50', Duration.minutes(5)), m('AnswerLatencyMs', 'p95', 'p95', Duration.minutes(5))] }),
    );
    dash.addWidgets(
      new cw.GraphWidget({ title: 'Suspect reply time (ms)', width: 8, left: [m('ReplyMs', 'p50', 'reply p50', Duration.minutes(5)), m('ReplyMs', 'p95', 'reply p95', Duration.minutes(5)), m('FirstSentenceMs', 'p50', 'first sentence p50', Duration.minutes(5)), m('FirstSentenceMs', 'p95', 'first sentence p95', Duration.minutes(5))] }),
      new cw.GraphWidget({ title: 'Fair play checks', width: 8, left: [m('Replies', 'Sum', 'replies checked', Duration.minutes(5)), m('CaughtViolations', 'Sum', 'secrets caught before speaking', Duration.minutes(5)), m('Deflected', 'Sum', 'deflected', Duration.minutes(5))] }),
      new cw.GraphWidget({ title: 'Server CPU and memory (%)', width: 8, left: [service.metricCpuUtilization({ period: Duration.minutes(1) }), service.metricMemoryUtilization({ period: Duration.minutes(1) })] }),
    );
    dash.addWidgets(
      new cw.GraphWidget({ title: 'Load balancer', width: 12, left: [alb.metrics.requestCount({ period: Duration.minutes(5) })], right: [alb.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, { period: Duration.minutes(5) }), alb.metrics.targetResponseTime({ period: Duration.minutes(5), statistic: 'p95' })] }),
      new cw.LogQueryWidget({
        title: 'Recent server warnings and errors', width: 12, logGroupNames: [logGroup.logGroupName],
        queryLines: ['fields @timestamp, @message', "filter @message like /(?i)(warn|error|failed)/ and @message not like /_aws/", 'sort @timestamp desc', 'limit 30'],
      }),
    );

    // ---------- outputs ----------
    new CfnOutput(this, 'Url', { value: publicUrl, description: tunnel ? 'Plain HTTP address. The HTTPS game address is in SSM /accomplice/public-url (infra/scripts/url.sh)' : 'Open /tv on the TV; phones join from the QR code' });
    new CfnOutput(this, 'AlbUrl', { value: albUrl });
    new CfnOutput(this, 'PublicUrlParameter', { value: urlParam.parameterName });
    new CfnOutput(this, 'SecretArn', { value: keys.secretArn });
    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new CfnOutput(this, 'ServiceName', { value: service.serviceName });
    new CfnOutput(this, 'GameTableName', { value: gameTable.tableName });
    new CfnOutput(this, 'RecordsTableName', { value: recordsTable.tableName });
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'LogGroupName', { value: logGroup.logGroupName });
    new CfnOutput(this, 'DashboardUrl', { value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards/dashboard/Accomplice` });
  }
}
