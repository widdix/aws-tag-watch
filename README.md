# AWS tag watch

This lambda function checks if your EC2 instances all have a specific tag (defined in `config.json`) in near real-time. CloudTrail is used to report EC2 `CreateTags`, `DeleteTags` and `RunInstances` events. The lambda function can be deployed with CloudFormation.

## Install

1. Create a SNS topic and subscribe to the topic via email (aws-tag-watch will send alerts to this topic)
2. download the code https://github.com/widdix/aws-tag-watch/archive/master.zip
3. unzip
4. run `npm install` inside to install Node.js dependencies
5. edit `config.json`
6. execute `./bundle.sh` in your console
7. upload `aws-tag-watch.zip` to S3
8. create a CloudFormation stack based on `template.json`
9. unfortunately Lambda support in CloudFormation is not perfect so you need to do one permission thing manually
```
# --function-name please fill in LambdaFunctionName output from CloudFormation stack
# --source-arn please fill in TrailTopicArn output from CloudFormation stack
$ aws lambda add-permission --function-name "..." --statement-id "s1" --action "lambda:invokeFunction" --principal "sns.amazonaws.com" --source-arn "..."
```

done.
