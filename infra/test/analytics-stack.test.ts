import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'

import { AnalyticsStack } from '../lib/analytics-stack'
import { AWS_ACCOUNT_ID, AWS_REGION } from '../lib/constants'

function synthesize() {
    const app = new App()
    const stack = new AnalyticsStack(app, 'AnalyticsTest', {
        env: { account: AWS_ACCOUNT_ID, region: AWS_REGION },
    })
    return Template.fromStack(stack)
}

void describe('AnalyticsStack', () => {
    void it('Cognito 게스트는 해당 pool에서만 역할을 얻고 Firehose 배치 쓰기만 허용한다', () => {
        const template = synthesize()
        template.hasResourceProperties('AWS::Cognito::IdentityPool', {
            AllowUnauthenticatedIdentities: true,
            AllowClassicFlow: false,
        })
        template.hasResourceProperties('AWS::IAM::Role', {
            AssumeRolePolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: {
                            Federated: 'cognito-identity.amazonaws.com',
                        },
                        Action: 'sts:AssumeRoleWithWebIdentity',
                        Condition: {
                            StringEquals: {
                                'cognito-identity.amazonaws.com:aud': {
                                    Ref: 'IdentityPool',
                                },
                            },
                            'ForAnyValue:StringLike': {
                                'cognito-identity.amazonaws.com:amr':
                                    'unauthenticated',
                            },
                        },
                    },
                ],
            },
        })
        template.hasResourceProperties('AWS::IAM::Policy', {
            Roles: Match.anyValue(),
            PolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Action: 'firehose:PutRecordBatch',
                        Resource: { 'Fn::GetAtt': ['DeliveryStream', 'Arn'] },
                    },
                ],
            },
        })
        template.resourceCountIs('AWS::Cognito::UserPool', 0)
    })

    void it('서버 IAM 사용자에 분석 전송 권한이나 access key를 추가하지 않는다', () => {
        const template = synthesize()
        template.resourceCountIs('AWS::IAM::User', 0)
        template.resourceCountIs('AWS::IAM::AccessKey', 0)
        template.allResourcesProperties('AWS::IAM::Policy', {
            Users: Match.absent(),
        })
    })

    void it('정상 이벤트는 만료하지 않고 오류·쿼리 결과만 7일 만료하며 버킷은 보존한다', () => {
        const template = synthesize()
        template.resourceCountIs('AWS::S3::Bucket', 2)
        template.allResources(
            'AWS::S3::Bucket',
            Match.objectLike({
                DeletionPolicy: 'Retain',
                UpdateReplacePolicy: 'Retain',
                Properties: Match.objectLike({
                    PublicAccessBlockConfiguration: {
                        BlockPublicAcls: true,
                        BlockPublicPolicy: true,
                        IgnorePublicAcls: true,
                        RestrictPublicBuckets: true,
                    },
                    BucketEncryption: {
                        ServerSideEncryptionConfiguration: [
                            {
                                ServerSideEncryptionByDefault: {
                                    SSEAlgorithm: 'AES256',
                                },
                            },
                        ],
                    },
                }),
            }),
        )
        // 각 버킷의 전체 규칙 배열을 검사해 events/나 버킷 전체 만료가 섞이지 않게 한다.
        for (const prefix of ['errors/', 'query-results/']) {
            template.hasResourceProperties('AWS::S3::Bucket', {
                LifecycleConfiguration: {
                    Rules: [
                        {
                            Prefix: prefix,
                            Status: 'Enabled',
                            ExpirationInDays: 7,
                        },
                    ],
                },
            })
        }
        template.resourceCountIs('AWS::S3::BucketPolicy', 2)
        template.allResourcesProperties('AWS::S3::BucketPolicy', {
            PolicyDocument: Match.objectLike({
                Statement: Match.arrayWith([
                    Match.objectLike({
                        Effect: 'Deny',
                        Condition: { Bool: { 'aws:SecureTransport': 'false' } },
                    }),
                ]),
            }),
        })
    })

    void it('DirectPut을 Parquet로 변환하고 delivery 역할의 권한 적용을 기다린다', () => {
        const template = synthesize()
        template.resourceCountIs('AWS::Kinesis::Stream', 0)
        template.resourceCountIs('AWS::Lambda::Function', 0)
        template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
            DeliveryStreamType: 'DirectPut',
            KinesisStreamSourceConfiguration: Match.absent(),
            DeliveryStreamEncryptionConfigurationInput: {
                KeyType: 'AWS_OWNED_CMK',
            },
            ExtendedS3DestinationConfiguration: Match.objectLike({
                Prefix: 'events/arrival_date=!{timestamp:yyyy-MM-dd}/',
                ErrorOutputPrefix:
                    'errors/type=!{firehose:error-output-type}/arrival_date=!{timestamp:yyyy-MM-dd}/',
                BufferingHints: { SizeInMBs: 64, IntervalInSeconds: 300 },
                DynamicPartitioningConfiguration: Match.absent(),
                DataFormatConversionConfiguration: Match.objectLike({
                    Enabled: true,
                    InputFormatConfiguration: {
                        Deserializer: { OpenXJsonSerDe: {} },
                    },
                    OutputFormatConfiguration: {
                        Serializer: { ParquetSerDe: { Compression: 'SNAPPY' } },
                    },
                    SchemaConfiguration: Match.objectLike({
                        DatabaseName: { Ref: 'Database' },
                        TableName: { Ref: 'EventsTable' },
                    }),
                }),
            }),
        })
        const policyId = Object.keys(
            template.findResources('AWS::IAM::Policy'),
        ).find((key) => key.startsWith('DeliveryPolicy'))!
        template.hasResource('AWS::KinesisFirehose::DeliveryStream', {
            DependsOn: Match.arrayWith([policyId]),
        })
    })

    void it('Athena는 14개 이벤트 필드와 날짜 projection을 사용하고 결과 설정·스캔 제한을 강제한다', () => {
        const template = synthesize()
        template.resourceCountIs('AWS::Glue::Crawler', 0)
        template.hasResourceProperties('AWS::Glue::Table', {
            TableInput: Match.objectLike({
                PartitionKeys: [{ Name: 'arrival_date', Type: 'string' }],
                Parameters: Match.objectLike({
                    'projection.enabled': 'true',
                    'projection.arrival_date.format': 'yyyy-MM-dd',
                    'projection.arrival_date.range': '2026-10-14,NOW',
                }),
                StorageDescriptor: Match.objectLike({
                    Columns: Match.arrayEquals([
                        { Name: 'schema_version', Type: 'int' },
                        ...[
                            'event_id',
                            'event_name',
                            'occurred_at',
                            'source',
                            'environment',
                            'anonymous_id',
                            'user_id',
                            'session_id',
                            'os',
                            'browser',
                            'client_version',
                        ].map((Name) => ({ Name, Type: 'string' })),
                        {
                            Name: 'utm',
                            Type: 'struct<touch_id:string,captured_at:string,utm_source:string,utm_medium:string,utm_campaign:string,utm_content:string,utm_term:string>',
                        },
                        { Name: 'custom_data', Type: 'string' },
                    ]),
                }),
            }),
        })
        template.hasResourceProperties('AWS::Athena::WorkGroup', {
            RecursiveDeleteOption: false,
            WorkGroupConfiguration: Match.objectLike({
                BytesScannedCutoffPerQuery: 1024 ** 3,
                EnforceWorkGroupConfiguration: true,
                ResultConfiguration: Match.objectLike({
                    ExpectedBucketOwner: AWS_ACCOUNT_ID,
                    EncryptionConfiguration: { EncryptionOption: 'SSE_S3' },
                }),
            }),
        })
    })

    void it('문서의 전송 예시가 Glue 필드·타입과 일치하고 custom_data에는 해당 이벤트 속성만 둔다', () => {
        const template = synthesize()
        const table = template.findResources('AWS::Glue::Table').EventsTable
        const columns = table.Properties.TableInput.StorageDescriptor
            .Columns as {
            Name: string
            Type: string
        }[]
        const document = readFileSync(
            join(
                __dirname,
                '../../docs/infrastructure/analytics-event-design.md',
            ),
            'utf8',
        )
        const example = document.match(/```json\n([\s\S]*?)\n```/)
        assert.ok(example, '문서에 Firehose 전송 JSON 예시가 있어야 한다')
        const event = JSON.parse(example[1]) as Record<string, unknown>
        assert.deepEqual(
            Object.keys(event).sort(),
            columns.map(({ Name }) => Name).sort(),
        )

        for (const { Name, Type } of columns) {
            const value = event[Name]
            if (Type.startsWith('struct<')) {
                assert.ok(value && typeof value === 'object')
                const fields = Type.slice(7, -1)
                    .split(',')
                    .map((field) => field.split(':')[0])
                assert.deepEqual(Object.keys(value).sort(), fields.sort())
                for (const fieldValue of Object.values(value)) {
                    if (fieldValue !== null) {
                        assert.equal(typeof fieldValue, 'string')
                    }
                }
            } else if (value !== null) {
                assert.equal(typeof value, Type === 'int' ? 'number' : 'string')
            }
        }

        assert.equal(event.schema_version, 1)
        assert.deepEqual(JSON.parse(event.custom_data as string), {
            link_id: 456,
            entry_point: 'create_link_sheet',
        })
    })
})
