var config = require('./config');
var watchJob = require('./watchpaymentjob');
var blockJob = require('./lastblockjob');
var path = require('path');
var express = require('express');
var app = express();
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.bodyParser());
app.use(express.static(path.join(__dirname, 'public')));

require('./db').instantiateDb();
require('./routes')(app);
require('bitstamped');
blockJob.runLastBlockJob();
setTimeout(watchJob.runWatchPaymentsJob(), config.lastBlockJobInterval / 2);

app.listen(config.port);
console.log('HTTP Server on port: ' + config.port);
