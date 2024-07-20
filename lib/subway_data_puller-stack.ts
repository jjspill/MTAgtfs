import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';

interface stackProps extends cdk.StackProps {
  postgres_connection_string: string;
}

export class SubwayDataPullerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: stackProps) {
    super(scope, id, props);

    if (!props.postgres_connection_string) {
      throw new Error('Postgres Connection String is required');
    }
    // Define the DynamoDB table for GTFS Data
    // const table = new dynamodb.Table(this, 'SubwayData', {
    //   tableName: 'GtfsHandlerTable',
    //   partitionKey: { name: 'stopId', type: dynamodb.AttributeType.STRING },
    //   // sortKey: { name: 'trainOrder', type: dynamodb.AttributeType.NUMBER },
    //   timeToLiveAttribute: 'ttl',
    //   billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    //   removalPolicy: cdk.RemovalPolicy.DESTROY, // Change as appropriate
    // });

    // const bucket = new s3.Bucket(this, 'Bucket', {
    //   bucketName: 'gtfs-data-bucket',
    //   removalPolicy: cdk.RemovalPolicy.DESTROY,
    // });

    // Define a dead-letter queue for Lambda
    // const deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue');
    // Define a Lambda function to process GTFS data
    const gtfsLambda = new NodejsFunction(this, 'GtfsHandler', {
      functionName: 'GtfsHandlerLambda',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/index.ts',
      handler: 'handler',
      environment: {
        // TABLE_NAME: table.tableName,
        // BUCKET_NAME: bucket.bucketName,
        POSTGRES_CONNECTION_STRING: props.postgres_connection_string,
      },
      memorySize: 256, // Increase if needed
      timeout: cdk.Duration.seconds(60), // Adjust based on processing needs
      // deadLetterQueue: deadLetterQueue,
      // deadLetterQueueEnabled: true,
    });

    // Grant the Lambda function permissions to write to the DynamoDB table
    // table.grantWriteData(gtfsLambda);
    // bucket.grantReadWrite(gtfsLambda);

    const ruleOnTheMinute = new events.Rule(this, 'RuleOnTheMinute', {
      schedule: events.Schedule.expression('cron(* * * * ? *)'),
    });

    ruleOnTheMinute.addTarget(new targets.LambdaFunction(gtfsLambda));

    // Rule to trigger 30 seconds into each minute
    // const ruleOnTheHalfMinute = new events.Rule(this, 'RuleOnTheHalfMinute', {
    //   schedule: events.Schedule.expression('cron(30/1 * * * * ?)'),
    // });
    // ruleOnTheHalfMinute.addTarget(new targets.LambdaFunction(gtfsLambda));

    // new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
    //   metric: gtfsLambda.metricErrors({
    //     period: cdk.Duration.minutes(1),
    //     statistic: 'Sum',
    //   }),
    //   threshold: 1,
    //   evaluationPeriods: 1,
    //   alarmDescription: 'Alarm when the Lambda function fails',
    //   actionsEnabled: true,
    //   treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING, // Consider data points as not breaching if missing
    // });
  }
}
