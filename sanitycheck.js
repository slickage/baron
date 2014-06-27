/* jshint node: true */
'use strict';

var bitcoinUtil = require(__dirname + '/bitcoinutil');
var async = require('async');

var proceedWhenBitcoindIsReady = function(cb) {
	var waitForBitcoind = true;
	var connFailurePrint = true;
	var syncPrint = true;
  async.whilst(
	  function () { return waitForBitcoind; },
	  function (cb) {
	    bitcoinUtil.getBlockTemplate(function(err, gbt) {
	      if (err) {
	      	if (!gbt) {
	      		// connection failure, err === {} which is unhelpful
	      		if (connFailurePrint) {
	      			 console.log('Baron Init: Bitcoind connection failure.  Baron will retry every 15 seconds until it appears.');
	      			 connFailurePrint = false;
	      		}
	      		setTimeout(cb, 15000);
	      	}
	        else if (err.code && err.code === -10) {
	          // getBlockTemplate returns error code -10 while "Bitcoin is downloading blocks..."
	          if (syncPrint) {
	          	console.log('Baron Init: Bitcoind is busy syncing blocks.  Baron will quietly check every 15 seconds until it is ready.');
	          	syncPrint = false;
	          }
	          setTimeout(cb, 15000);
	        }
	        else {
	          // FATAL: unknown other error
	          console.log('Baron Init: Fatal bitcoind error: ' + JSON.stringify(err));
	          process.exit(1);
	        }
	      }
	      else {
	        waitForBitcoind = false;
	        cb();
	      }
	    });
	  },
	  function (err) {
	  	console.log('Baron Init: bitcoind is ready.	');
      cb();
	  }
	);
};

module.exports = {
	proceedWhenBitcoindIsReady: proceedWhenBitcoindIsReady
};
