var config = require(__dirname + '/../config');
var invoiceWebhooks = require(__dirname + '/../invoicewebhooks');
var db = require(__dirname + '/../db');
var async = require('async');

function webhooksJob() {
  db.getWebhooks(function (err, webhooksArr) {
    if (!err && webhooksArr) {
      console.log('===========================');
      console.log('Retrying Failed Webhooks [' + webhooksArr.length + ']');
      console.log('===========================');
      async.eachSeries(webhooksArr, function(webhookObj, cb) {
        invoiceWebhooks.postToWebhook(webhookObj, cb);
      }, function(err) {
        if (!err) {
          console.log('> Done processing failed webhooks.');
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