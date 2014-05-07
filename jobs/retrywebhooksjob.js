var config = require(__dirname + '/../config');
var invoiceWebhooks = require(__dirname + '/../invoicewebhooks');
var db = require(__dirname + '/../db');
var async = require('async');

function retryWebhooksJob() {
  db.getFailedWebhooks(function (err, webhooksArr) {
    if (!err && webhooksArr) {
      console.log('===========================');
      console.log('Retrying Failed Webhooks [' + webhooksArr.length + ']');
      console.log('===========================');
      async.eachSeries(webhooksArr, function(webhookObj, cb) {
        invoiceWebhooks.postToWebhookIgnoreFailure(webhookObj, cb);
      }, function(err) {
        if (!err) {
          console.log('> Done processing failed webhooks.');
        }
      });
    }
  });
}

var runRetryWebhooksJob = function () {
  setInterval(function(){
    retryWebhooksJob();
  }, config.retryWebhooksJobInterval);
};

module.exports = {
  runRetryWebhooksJob: runRetryWebhooksJob
};