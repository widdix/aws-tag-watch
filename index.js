var INSTANCES_BATCH_SIZE = 10;
var BATCHES_IN_PARALLEL = 5;

var config = require("./config.json");

// Node.js modules
var zlib = require("zlib");

// thirdparty modules
var async = require("async");
var lodash = require("lodash");
var AWS = require("aws-sdk");

// global state
var handlerRegistry = {};
var ec2 = new AWS.EC2({
  region: config.region
});
var sns = new AWS.SNS({
  region: config.region
});

// implementation
function alert(message, cb) {
  console.log("alert()", message);
  sns.publish({
    Message: message,
    Subject: "aws-tag-watch",
    TopicArn: config.alertTopicArn
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
      cb();
    }
  }, cb);
}

function downloadAndParseTrail(s3Bucket, s3ObjectKey, cb) {
  console.log("downloadAndParseTrail()", s3ObjectKey);
  var s3 = new AWS.S3({
    region: config.region
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

exports.handler = function(event, context) {
  console.log("handler()", event);
  async.eachLimit(event.Records, 5, function(record, cb) {
    var message = JSON.parse(record.Sns.Message);
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

function checkForRequiredTag(instanceIds, cb) {
  console.log("checkForRequiredTag()");
  var uniqueInstanceIds = lodash.unique(instanceIds);
  var chunks = lodash.chunk(uniqueInstanceIds, INSTANCES_BATCH_SIZE);
  async.eachLimit(chunks, BATCHES_IN_PARALLEL, function(chunk, cb) {
    var params = {
      InstanceIds: chunk
    };
    ec2.describeInstances(params, function(err, data) {
      if (err) {
        cb(err);
      } else {
        var instances = lodash.flatten(lodash.map(data.Reservations, function(reservation) {
          return lodash.map(reservation.Instances);
        }));
        if (instances.length !== chunk.length) {
          console.log("not all instances returned", chunk);
          cb();
        } else {
          async.eachLimit(instances, 1, function(instance, cb) {
            var tags = lodash.filter(instance.Tags, function(tag) {
              return tag.Key === config.requiredTag;
            });
            if (tags.length === 0) {
              alert("instance " + instance.InstanceId + " is not tagged with " + config.requiredTag, cb);
            }
          }, cb);
        }
      }
    });
  }, cb);
}

function handleCreateOrDeleteTags(record, cb) {
  console.log("handleCreateOrDeleteTags()");
  var resourceIds = lodash.map(record.requestParameters.resourcesSet.items, "resourceId");
  var instanceIds = lodash.filter(resourceIds, function(resourceId) {
    return resourceId.indexOf("i-") === 0;
  });
  checkForRequiredTag(instanceIds, cb);
}
registerHandler("ec2.amazonaws.com", "CreateTags", handleCreateOrDeleteTags);
registerHandler("ec2.amazonaws.com", "DeleteTags", handleCreateOrDeleteTags);

function handleRunInstances(record, cb) {
  console.log("handleRunInstances()");
  var instanceIds = lodash.map(record.responseElements.instancesSet.items, "instanceId");
  checkForRequiredTag(instanceIds, cb);
}
registerHandler("ec2.amazonaws.com", "RunInstances", handleRunInstances);
