/* jshint node: true */
'use strict';

var bitcoinUtil = require(__dirname + '/bitcoinutil');
var async = require('async');

var proceedWhenBitcoindIsReady = function(cb) {
	var waitForBitcoind = true;
  async.whilst(
	  function () { return waitForBitcoind; },
	  function (cb) {
	    bitcoinUtil.getBlockTemplate(function(err, gbt) {
	      if (err) {
	        if (err.code && err.code === -10) {
	          // getBlockTemplate returns error code -10 while "Bitcoin is downloading blocks..."
	          console.log(Math.floor(new Date().getTime()/1000) + ": bitcoind is busy syncing blocks, please wait ...");
	          setTimeout(cb, 10000);
	        }
	        else {
	          // FATAL: unknown other error
	          console.log('FATAL bitcoind ' + JSON.stringify(err));
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
	  	//console.log('Sanity Check: bitcoind is ready.	')
      cb();
	  }
	);
};

module.exports = {
	proceedWhenBitcoindIsReady: proceedWhenBitcoindIsReady
};
