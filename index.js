var config = require('./config');
var path = require('path');
var express = require('express');
var routes = require('./routes');
var app = express();
app.set('view engine', 'ejs');
app.use(express.bodyParser());
app.use(express.static(path.join(__dirname, 'public')));

/*
  TODO List:
  - Store payment status as strings (paid, pending, unpaid, partial, overpaid, expired)
  - Payments should log the current "spot_rate" when paid (at 0 confirmations)
  - Add fudge rate for fiat balance due
  - Invoice needs expiration (optionally) (Warren)
  - Need to handle locking in Rate for 5 minutes for fiat
  - Handle balance paid for fiat 
*/

var index = function(app) {
  routes(app);
};

module.exports = index;

index(app);
app.listen(config.port);
console.log('HTTP Server on port: ' + config.port);
