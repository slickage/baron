var config = require('./config');
//var job = require('./watchpaymentjob');
var lastBlock = require('./lastblockjob');
var path = require('path');
var express = require('express');
var app = express();
app.set('view engine', 'ejs');
app.use(express.bodyParser());
app.use(express.static(path.join(__dirname, 'public')));

require('./routes')(app);
require('bitstamped');

//job.runWatchPaymentsJob();
lastBlock.runLastBlockJob();

app.listen(config.port);
console.log('HTTP Server on port: ' + config.port);
