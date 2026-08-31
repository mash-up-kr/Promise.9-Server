#!/usr/bin/env bun

import {
    App,
    CliCredentialsStackSynthesizer,
    Environment,
    Tags,
} from 'aws-cdk-lib'

import { AccessStack } from '../lib/access-stack'
import { AWS_ACCOUNT_ID, AWS_REGION, PROJECT_NAME } from '../lib/constants'
import { EmailStack } from '../lib/email-stack'
import { LightsailStack } from '../lib/lightsail-stack'
import { QueueStack } from '../lib/queue-stack'

const app = new App()
const detectedAccount = process.env.CDK_DEFAULT_ACCOUNT

if (detectedAccount && detectedAccount !== AWS_ACCOUNT_ID) {
    throw new Error(
        `선택한 AWS profile의 계정이 Promise9 대상 계정과 다릅니다: ${detectedAccount}`,
    )
}

const env: Environment = {
    account: AWS_ACCOUNT_ID,
    region: AWS_REGION,
}
const accessStack = new AccessStack(app, 'Promise9AccessStack', {
    env,
    synthesizer: new CliCredentialsStackSynthesizer(),
    terminationProtection: true,
    description: 'Promise9 team access group for AWS infrastructure management',
})

Tags.of(accessStack).add('Project', PROJECT_NAME)
Tags.of(accessStack).add('ManagedBy', 'AWS-CDK')

const emailStack = new EmailStack(app, 'Promise9EmailStack', {
    env,
    synthesizer: new CliCredentialsStackSynthesizer(),
    terminationProtection: true,
    description: 'Promise9 SES identity and application sending access',
})

Tags.of(emailStack).add('Project', PROJECT_NAME)
Tags.of(emailStack).add('ManagedBy', 'AWS-CDK')

// 기존 Lightsail 리소스의 현재 상태를 유지하기 위해 Tag를 별도로 적용하지 않는다.
new LightsailStack(app, 'Promise9LightsailStack', {
    env,
    synthesizer: new CliCredentialsStackSynthesizer(),
    terminationProtection: true,
})

const queueStack = new QueueStack(app, 'Promise9QueueStack', {
    env,
    synthesizer: new CliCredentialsStackSynthesizer(),
    terminationProtection: true,
    description: 'Promise9 link analysis retry queue and runtime IAM user',
})

Tags.of(queueStack).add('Project', PROJECT_NAME)
Tags.of(queueStack).add('ManagedBy', 'AWS-CDK')
