import {
    aws_iam as iam,
    aws_sqs as sqs,
    CfnOutput,
    Duration,
    RemovalPolicy,
    Stack,
    StackProps,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

// 링크 분석 재시도 큐. 애플리케이션의 SQS_LINK_ANALYSIS_QUEUE_URL이 이 큐를 가리킨다.
const QUEUE_NAME = 'promise9-link-analysis'
// 시도 횟수는 코드의 LINK_ANALYSIS_MAX_ATTEMPTS가 제어하므로, redrive는 파싱 실패와
// 발행 실패처럼 처리 자체가 불가능한 메시지만 걸러내는 안전망 역할이다.
const MAX_RECEIVE_COUNT = 3
// 애플리케이션의 SQS_VISIBILITY_TIMEOUT_SECONDS 기본값과 같은 값으로 맞춘다.
const VISIBILITY_TIMEOUT = Duration.seconds(300)
const RETENTION_PERIOD = Duration.days(4)
// 빈 큐를 반복 호출하지 않도록 long polling 상한을 쓴다.
const RECEIVE_WAIT_TIME = Duration.seconds(20)
// Lightsail 인스턴스는 IAM role을 붙일 수 없어 런타임이 액세스 키로 인증한다.
const RUNTIME_USER_NAME = 'Promise9AppRuntime'

// 메시지에 사용자 링크 URL이 담기므로 저장 암호화와 HTTPS 전송을 기본값에 맡기지 않는다.
// SQS 관리형 키를 쓰면 KMS 비용 없이 저장 암호화를 켤 수 있다.
const QUEUE_SECURITY_OPTIONS = {
    encryption: sqs.QueueEncryption.SQS_MANAGED,
    enforceSSL: true,
} as const

// 링크 분석 재시도 큐와 DLQ, 그리고 런타임이 사용할 IAM 사용자를 정의한다.
export class QueueStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props)

        const production = this.createLinkAnalysisQueue(
            'Production',
            QUEUE_NAME,
        )

        this.grantRuntimeAccess(production)

        new CfnOutput(this, 'ProductionQueueUrl', {
            value: production.queueUrl,
            description:
                'production 배포의 SQS_LINK_ANALYSIS_QUEUE_URL에 넣을 값',
        })
    }

    // 큐와 DLQ를 한 쌍으로 만든다. 스택을 지워도 남은 메시지가 사라지지 않도록 보존한다.
    private createLinkAnalysisQueue(
        idPrefix: string,
        queueName: string,
    ): sqs.Queue {
        const deadLetterQueue = new sqs.Queue(this, `${idPrefix}DeadLetter`, {
            queueName: `${queueName}-dlq`,
            retentionPeriod: Duration.days(14),
            ...QUEUE_SECURITY_OPTIONS,
            removalPolicy: RemovalPolicy.RETAIN,
        })

        const queue = new sqs.Queue(this, `${idPrefix}Queue`, {
            queueName,
            visibilityTimeout: VISIBILITY_TIMEOUT,
            retentionPeriod: RETENTION_PERIOD,
            receiveMessageWaitTime: RECEIVE_WAIT_TIME,
            deadLetterQueue: {
                queue: deadLetterQueue,
                maxReceiveCount: MAX_RECEIVE_COUNT,
            },
            ...QUEUE_SECURITY_OPTIONS,
            removalPolicy: RemovalPolicy.RETAIN,
        })

        return queue
    }

    // 액세스 키는 CloudFormation에 남기지 않기 위해 CDK에서 만들지 않는다.
    // 콘솔에서 발급해 GitHub Secrets(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)에 넣는다.
    private grantRuntimeAccess(queue: sqs.Queue): void {
        const runtimeUser = new iam.User(this, 'AppRuntimeUser', {
            userName: RUNTIME_USER_NAME,
        })

        runtimeUser.addToPolicy(
            new iam.PolicyStatement({
                actions: [
                    'sqs:SendMessage',
                    'sqs:ReceiveMessage',
                    'sqs:DeleteMessage',
                ],
                resources: [queue.queueArn],
            }),
        )
    }
}
