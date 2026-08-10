import { aws_iam as iam, Stack, StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'

import { TEAM_GROUP_NAME } from './constants'

export class AccessStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props)

        const signInPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName(
            'SignInLocalDevelopmentAccess',
        )
        const administratorPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName(
            'AdministratorAccess',
        )
        const billingReadOnlyPolicy =
            iam.ManagedPolicy.fromAwsManagedPolicyName(
                'AWSBillingReadOnlyAccess',
            )

        new iam.Group(this, 'TeamGroup', {
            groupName: TEAM_GROUP_NAME,
            managedPolicies: [
                signInPolicy,
                administratorPolicy,
                billingReadOnlyPolicy,
            ],
        })
    }
}
