#!/bin/bash

zip -r aws-tag-watch.zip index.js node_modules/

# aws --profile private lambda add-permission --function-name "tag-watch-Lambda-12JP53F7W6XE6" --statement-id s1 --action "lambda:invokeFunction" --principal sns.amazonaws.com --source-arn "arn:aws:sns:eu-west-1:878533158213:878533158213trail-eu-west-1"

