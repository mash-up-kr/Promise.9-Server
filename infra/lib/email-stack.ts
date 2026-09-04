import {
    aws_iam as iam,
    aws_ses as ses,
    CfnOutput,
    RemovalPolicy,
    Stack,
    StackProps,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

import { EMAIL_DOMAIN, EMAIL_SENDER_USER_NAME } from './constants'

export class EmailStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props)

        const identity = new ses.EmailIdentity(this, 'EmailIdentity', {
            identity: ses.Identity.domain(EMAIL_DOMAIN),
        })
        identity.applyRemovalPolicy(RemovalPolicy.RETAIN)

        const sender = new iam.User(this, 'ProductionEmailSender', {
            userName: EMAIL_SENDER_USER_NAME,
        })
        identity.grant(sender, 'ses:SendEmail', 'ses:SendBulkEmail')

        new CfnOutput(this, 'ProductionEmailSenderUserName', {
            value: sender.userName,
        })

        identity.dkimRecords.forEach((record, index) => {
            const outputNumber = index + 1

            new CfnOutput(this, `DkimRecord${outputNumber}Name`, {
                value: record.name,
            })
            new CfnOutput(this, `DkimRecord${outputNumber}Value`, {
                value: record.value,
            })
        })

        new CfnOutput(this, 'EmailIdentityArn', {
            value: identity.emailIdentityArn,
        })
    }
}
