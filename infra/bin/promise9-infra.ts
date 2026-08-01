#!/usr/bin/env bun

import {
    App,
    CliCredentialsStackSynthesizer,
    Environment,
    Tags,
} from 'aws-cdk-lib'

import { AccessStack } from '../lib/access-stack'
import { AWS_ACCOUNT_ID, AWS_REGION, PROJECT_NAME } from '../lib/constants'

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
const synthesizer = new CliCredentialsStackSynthesizer()

const accessStack = new AccessStack(app, 'Promise9AccessStack', {
    env,
    synthesizer,
    terminationProtection: true,
    description: 'Promise9 team access group for AWS infrastructure management',
})

Tags.of(accessStack).add('Project', PROJECT_NAME)
Tags.of(accessStack).add('ManagedBy', 'AWS-CDK')
