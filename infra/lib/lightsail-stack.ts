import {
    aws_lightsail as lightsail,
    RemovalPolicy,
    Stack,
    StackProps,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

const INSTANCE_NAME = 'Ubuntu-1'
const STATIC_IP_NAME = 'StaticIp-1'
// 기존 firewall 규칙 순서를 유지해 import 이후 불필요한 diff를 방지한다.
const PUBLIC_TCP_PORTS = [443, 22, 80] as const

export class LightsailStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props)

        const instance = new lightsail.CfnInstance(this, 'Instance', {
            instanceName: INSTANCE_NAME,
            availabilityZone: 'ap-northeast-2a',
            blueprintId: 'ubuntu_24_04',
            bundleId: 'small_3_0',
            keyPairName: 'LightsailDefaultKeyPair',
            networking: {
                ports: PUBLIC_TCP_PORTS.map((port) => ({
                    accessDirection: 'inbound',
                    accessFrom: 'Anywhere (0.0.0.0/0 and ::/0)',
                    accessType: 'public',
                    cidrListAliases: [],
                    cidrs: ['0.0.0.0/0'],
                    commonName: '',
                    fromPort: port,
                    ipv6Cidrs: ['::/0'],
                    protocol: 'tcp',
                    toPort: port,
                })),
            },
        })
        instance.applyRemovalPolicy(RemovalPolicy.RETAIN)

        const staticIp = new lightsail.CfnStaticIp(this, 'StaticIp', {
            staticIpName: STATIC_IP_NAME,
            attachedTo: instance.ref,
        })
        staticIp.applyRemovalPolicy(RemovalPolicy.RETAIN)
    }
}
