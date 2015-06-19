# AWS tag watch

## Deploy

1. edit `config.json`
2. execute `./bundle.sh` in your console
3. upload `aws-tag-watch.zip` to S3
4. create stack based on `template.json`
5. unfortunately Lambda support in CloudFormation is not perfect so you need to do one permission thing manually

  #--function-name please fill in LambdaFunctionName output from CloudFormation stack
  #--source-arn please fill in TrailTopicArn output from CloudFormation stack
  aws lambda add-permission --function-name "..." --statement-id "s1" --action "lambda:invokeFunction" --principal "sns.amazonaws.com" --source-arn "..."

6. subscribe to the topic you configured in `config.json`
