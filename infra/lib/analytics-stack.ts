import {
    ArnFormat,
    aws_athena as athena,
    aws_cognito as cognito,
    aws_glue as glue,
    aws_iam as iam,
    aws_kinesisfirehose as firehose,
    aws_logs as logs,
    aws_s3 as s3,
    CfnOutput,
    Duration,
    RemovalPolicy,
    Stack,
    StackProps,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

// producer는 ISO 8601 UTC 문자열을 전송한다. Athena에서 from_iso8601_timestamp로
// 해석하며 Firehose timestamp 파서의 암묵적인 형식 변환에 의존하지 않는다.
const EVENT_COLUMNS: glue.CfnTable.ColumnProperty[] = [
    { name: 'schema_version', type: 'int' },
    ...[
        'event_id',
        'event_name',
        'source',
        'platform',
        'environment',
        'occurred_at',
        'anonymous_id',
        'user_id',
        'session_id',
        'operation_id',
        'custom_data',
    ].map((name) => ({ name, type: 'string' })),
    {
        name: 'attribution',
        type: 'struct<touch_id:string,model:string,scope:string,captured_at:string,utm_source:string,utm_medium:string,utm_campaign:string,utm_content:string,utm_term:string>',
    },
]

export class AnalyticsStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props)

        const name = 'promise9-analytics-production'
        const databaseName = 'promise9_analytics_production'
        const tableName = 'events'
        const bucketOptions: s3.BucketProps = {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
            removalPolicy: RemovalPolicy.RETAIN,
        }
        // 정상 이벤트는 계속 보관하고 오류·쿼리 결과만 7일 후 만료한다.
        const dataBucket = new s3.Bucket(this, 'DataBucket', {
            ...bucketOptions,
            lifecycleRules: [
                { prefix: 'errors/', expiration: Duration.days(7) },
            ],
        })
        const resultsBucket = new s3.Bucket(this, 'QueryResultsBucket', {
            ...bucketOptions,
            lifecycleRules: [
                { prefix: 'query-results/', expiration: Duration.days(7) },
            ],
        })

        const database = new glue.CfnDatabase(this, 'Database', {
            catalogId: this.account,
            databaseInput: { name: databaseName },
        })
        const table = new glue.CfnTable(this, 'EventsTable', {
            catalogId: this.account,
            databaseName: database.ref,
            tableInput: {
                name: tableName,
                tableType: 'EXTERNAL_TABLE',
                parameters: {
                    classification: 'parquet',
                    EXTERNAL: 'TRUE',
                    'projection.enabled': 'true',
                    'projection.arrival_date.type': 'date',
                    'projection.arrival_date.format': 'yyyy-MM-dd',
                    'projection.arrival_date.range': '2026-10-14,NOW',
                    'projection.arrival_date.interval': '1',
                    'projection.arrival_date.interval.unit': 'DAYS',
                    'storage.location.template': `${dataBucket.s3UrlForObject('events/')}arrival_date=\${arrival_date}/`,
                },
                partitionKeys: [{ name: 'arrival_date', type: 'string' }],
                storageDescriptor: {
                    columns: EVENT_COLUMNS,
                    location: dataBucket.s3UrlForObject('events/'),
                    inputFormat:
                        'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat',
                    outputFormat:
                        'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat',
                    serdeInfo: {
                        serializationLibrary:
                            'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe',
                    },
                },
            },
        })
        database.applyRemovalPolicy(RemovalPolicy.RETAIN)
        table.applyRemovalPolicy(RemovalPolicy.RETAIN)

        const logGroup = new logs.LogGroup(this, 'DeliveryLogs', {
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: RemovalPolicy.RETAIN,
        })
        const logStream = new logs.LogStream(this, 'DeliveryLogStream', {
            logGroup,
            logStreamName: 'S3Delivery',
        })
        const deliveryRole = new iam.Role(this, 'DeliveryRole', {
            assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com'),
        })
        // IAM policy를 별도 리소스로 만들고 DeliveryStream 생성보다 먼저 적용한다.
        const deliveryPolicy = new iam.Policy(this, 'DeliveryPolicy', {
            roles: [deliveryRole],
            statements: [
                new iam.PolicyStatement({
                    actions: [
                        's3:GetBucketLocation',
                        's3:ListBucket',
                        's3:ListBucketMultipartUploads',
                    ],
                    resources: [dataBucket.bucketArn],
                }),
                new iam.PolicyStatement({
                    actions: [
                        's3:PutObject',
                        's3:GetObject',
                        's3:AbortMultipartUpload',
                    ],
                    resources: [
                        dataBucket.arnForObjects('events/*'),
                        dataBucket.arnForObjects('errors/*'),
                    ],
                }),
                new iam.PolicyStatement({
                    actions: [
                        'glue:GetTable',
                        'glue:GetTableVersion',
                        'glue:GetTableVersions',
                    ],
                    resources: [
                        this.formatArn({
                            service: 'glue',
                            resource: 'catalog',
                        }),
                        this.formatArn({
                            service: 'glue',
                            resource: 'database',
                            resourceName: databaseName,
                        }),
                        this.formatArn({
                            service: 'glue',
                            resource: 'table',
                            resourceName: `${databaseName}/${tableName}`,
                        }),
                    ],
                }),
                new iam.PolicyStatement({
                    actions: ['logs:PutLogEvents'],
                    resources: [
                        this.formatArn({
                            service: 'logs',
                            resource: 'log-group',
                            resourceName: `${logGroup.logGroupName}:log-stream:${logStream.logStreamName}`,
                            arnFormat: ArnFormat.COLON_RESOURCE_NAME,
                        }),
                    ],
                }),
            ],
        })
        const deliveryStream = new firehose.CfnDeliveryStream(
            this,
            'DeliveryStream',
            {
                deliveryStreamName: name,
                deliveryStreamType: 'DirectPut',
                deliveryStreamEncryptionConfigurationInput: {
                    keyType: 'AWS_OWNED_CMK',
                },
                extendedS3DestinationConfiguration: {
                    bucketArn: dataBucket.bucketArn,
                    roleArn: deliveryRole.roleArn,
                    prefix: 'events/arrival_date=!{timestamp:yyyy-MM-dd}/',
                    errorOutputPrefix:
                        'errors/type=!{firehose:error-output-type}/arrival_date=!{timestamp:yyyy-MM-dd}/',
                    customTimeZone: 'UTC',
                    bufferingHints: { sizeInMBs: 64, intervalInSeconds: 300 },
                    // Parquet 내부에서 압축하며 S3 객체 전체에 추가 압축하지 않는다.
                    compressionFormat: 'UNCOMPRESSED',
                    cloudWatchLoggingOptions: {
                        enabled: true,
                        logGroupName: logGroup.logGroupName,
                        logStreamName: logStream.logStreamName,
                    },
                    dataFormatConversionConfiguration: {
                        enabled: true,
                        inputFormatConfiguration: {
                            deserializer: { openXJsonSerDe: {} },
                        },
                        outputFormatConfiguration: {
                            serializer: {
                                parquetSerDe: { compression: 'SNAPPY' },
                            },
                        },
                        schemaConfiguration: {
                            catalogId: this.account,
                            region: this.region,
                            databaseName: database.ref,
                            tableName: table.ref,
                            roleArn: deliveryRole.roleArn,
                            versionId: 'LATEST',
                        },
                    },
                },
            },
        )
        deliveryStream.node.addDependency(deliveryPolicy)

        const pool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
            identityPoolName: name,
            allowUnauthenticatedIdentities: true,
            allowClassicFlow: false,
        })
        const clientRole = new iam.Role(this, 'ClientRole', {
            assumedBy: new iam.FederatedPrincipal(
                'cognito-identity.amazonaws.com',
                {
                    StringEquals: {
                        'cognito-identity.amazonaws.com:aud': pool.ref,
                    },
                    'ForAnyValue:StringLike': {
                        'cognito-identity.amazonaws.com:amr': 'unauthenticated',
                    },
                },
                'sts:AssumeRoleWithWebIdentity',
            ),
        })
        clientRole.addToPolicy(
            new iam.PolicyStatement({
                actions: ['firehose:PutRecordBatch'],
                resources: [deliveryStream.attrArn],
            }),
        )
        new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoles', {
            identityPoolId: pool.ref,
            roles: { unauthenticated: clientRole.roleArn },
        })
        const workgroup = new athena.CfnWorkGroup(this, 'Workgroup', {
            name,
            state: 'ENABLED',
            recursiveDeleteOption: false,
            workGroupConfiguration: {
                enforceWorkGroupConfiguration: true,
                publishCloudWatchMetricsEnabled: true,
                bytesScannedCutoffPerQuery: 1024 ** 3,
                engineVersion: {
                    selectedEngineVersion: 'Athena engine version 3',
                },
                resultConfiguration: {
                    outputLocation:
                        resultsBucket.s3UrlForObject('query-results/'),
                    expectedBucketOwner: this.account,
                    encryptionConfiguration: { encryptionOption: 'SSE_S3' },
                },
            },
        })
        workgroup.applyRemovalPolicy(RemovalPolicy.RETAIN)

        for (const [key, value] of Object.entries({
            IdentityPoolId: pool.ref,
            Region: this.region,
            DeliveryStreamName: deliveryStream.ref,
            DeliveryStreamArn: deliveryStream.attrArn,
            DataBucketName: dataBucket.bucketName,
            QueryResultsBucketName: resultsBucket.bucketName,
            DatabaseName: database.ref,
            TableName: table.ref,
            WorkgroupName: workgroup.ref,
        })) {
            new CfnOutput(this, key, { value })
        }
    }
}
