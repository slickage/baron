'use strict';

var rootDir = __dirname + '/../';
var log = require(rootDir + 'log');
var config = require(rootDir + 'config');
var webhooks = require(rootDir + 'lib/webhooks');
var db = require(rootDir + 'db');
var async = require('async');

function webhooksJob() {
  db.getWebhooks(function (err, webhooksArr) {
    if (!err && webhooksArr) {
      // Do not print secret tokens in log,
      // also log entry should be a single line
      var webhookIds = [];
      async.eachSeries(webhooksArr, function(webhookObj, cb) {
        webhookIds.push(webhookObj._id);
      });
      log.debug('Retrying Failed Webhooks [' + webhooksArr.length + ']' + JSON.stringify(webhookIds));
      async.eachSeries(webhooksArr, function(webhookObj, cb) {
        webhooks.postToWebhookIgnoreFailure(webhookObj, cb);
      },
      function(err) {
        if (!err) {
          log.debug('Done processing failed webhooks.');
        }
      });
    }
  });
}

var runWebhooksJob = function () {
  setInterval(function(){
    webhooksJob();
  }, config.webhooksJobInterval);
};

module.exports = {
  runWebhooksJob: runWebhooksJob
};