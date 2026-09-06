import {
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_s3 as s3,
    CfnOutput,
    RemovalPolicy,
    Stack,
    StackProps,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

export class AssetsStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props)

        const bucket = new s3.Bucket(this, 'AssetsBucket', {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
            versioned: true,
            removalPolicy: RemovalPolicy.RETAIN,
        })

        const distribution = new cloudfront.Distribution(
            this,
            'AssetsDistribution',
            {
                comment: 'Promise9 public brand and email assets',
                defaultBehavior: {
                    origin: origins.S3BucketOrigin.withOriginAccessControl(
                        bucket,
                    ),
                    viewerProtocolPolicy:
                        cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
                    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    compress: true,
                    responseHeadersPolicy:
                        cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
                },
                priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
                minimumProtocolVersion:
                    cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
            },
        )

        new CfnOutput(this, 'AssetsBucketName', { value: bucket.bucketName })
        new CfnOutput(this, 'AssetsDistributionId', {
            value: distribution.distributionId,
        })
        new CfnOutput(this, 'AssetsBaseUrl', {
            value: `https://${distribution.distributionDomainName}`,
        })
    }
}
