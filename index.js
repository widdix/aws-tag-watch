// constants
var REGION = "eu-west-1";

// Node.js modules
var zlib = require("zlib");

// thirdparty modules
var async = require("async");
var underscore = require("underscore");
var AWS = require("aws-sdk");

// global state
var handlerRegistry = {};

// implementation
function alert(message, cb) {
  console.log("alert()", message);
  var sns = new AWS.SNS({
    region: REGION
  });
  sns.publish({
    Message: message,
    Subject: "aws-tag-watch",
    TopicArn: "arn:aws:sns:eu-west-1:878533158213:878533158213alert-eu-west-1"
  }, cb);
}

function registerHandler(eventSource, eventName, handler) {
  console.log("registerHandler()", [eventSource, eventName]);
  if (handlerRegistry[eventSource] === undefined) {
    handlerRegistry[eventSource] = {};
  }
  if (handlerRegistry[eventSource][eventName] !== undefined) {
    throw new Error("handler already registered");
  }
  handlerRegistry[eventSource][eventName] = handler;
}

function inspectTrail(trail, cb) {
  console.log("inspectTrail()", trail.Records.length);
  async.eachLimit(trail.Records, 5, function(record, cb) {
    if (handlerRegistry[record.eventSource] !== undefined && handlerRegistry[record.eventSource][record.eventName] !== undefined) {
      handlerRegistry[record.eventSource][record.eventName](record, cb);
    } else {
      // debug console.log("unhandled event", [record.eventSource, record.eventName]);
      cb();
    }
  }, cb);
}

function downloadAndParseTrail(s3Bucket, s3ObjectKey, cb) {
  console.log("downloadAndParseTrail()", s3ObjectKey);
  var s3 = new AWS.S3({
    region: REGION
  });
  s3.getObject({
    Bucket: s3Bucket,
    Key: s3ObjectKey
  }, function(err, data) {
    if (err) {
      cb(err);
    } else {
      zlib.gunzip(data.Body, function(err, buf) {
        if (err) {
          cb(err);
        } else {
          cb(null, JSON.parse(buf.toString("utf8")));
        }
      });
    }
  });
}

// event := {"s3Bucket":"878533158213trail-eu-west-1","s3ObjectKey":["AWSLogs/878533158213/CloudTrail/eu-west-1/2015/06/18/878533158213_CloudTrail_eu-west-1_20150618T2015Z_H1x5ghOoaLGopLJ7.json.gz"]}
exports.handler = function(event, context) {
  console.log("handler()", event);
  async.eachLimit(event.Records, 5, function(record, cb) {
    var message = JSON.parse(record.Sns.Message);
    // debug console.log("handler() message", message);
    async.eachLimit(message.s3ObjectKey, 5, function(s3ObjectKey, cb) {
      downloadAndParseTrail(message.s3Bucket, s3ObjectKey, function(err, trail) {
        if (err) {
          cb(err);
        } else {
          inspectTrail(trail, cb);
        }
      });
    }, cb);
  }, function(err) {
    if (err) {
      context.fail(err);
    } else {
      context.succeed("done");
    }
  });
};

registerHandler("ec2.amazonaws.com", "RunInstances", function(record, cb) {
  console.log("ec2.amazonaws.com.RunInstances()");
  var ec2 = new AWS.EC2({
    region: REGION
  });
  async.eachLimit(record.responseElements.instancesSet.items, 5, function(item, cb) {
    ec2.describeInstances({
      InstanceIds: [item.instanceId]
    }, function(err, data) {
      if (err) {
        cb(err);
      } else {
        if (data.Reservations.length === 0) {
          console.log("reservation not found", item.instanceId);
          cb();
        } else if (data.Reservations.length === 1) {
          if (data.Reservations[0].Instances.length === 0) {
            console.log("instance not found", item.instanceId);
            cb();
          } else if (data.Reservations[0].Instances.length === 1) {
            var tags = underscore.filter(data.Reservations[0].Instances[0].Tags, function(tag) {
              return tag.Key === "aws:cloudformation:stack-name";
            });
            if (tags.length === 0) {
              alert("instance " + item.instanceId + " is not tagged with aws:cloudformation:stack-name", cb);
            } else {
              cb();
            }
          } else {
            cb(new Error("multiple instances found for instance id"));
          }
        } else {
          cb(new Error("multiple reservations instances found for instance id"));
        }
      }
    });
  }, cb);
});
