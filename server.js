var config = require(__dirname + '/config');
var watchJob = require(__dirname + '/watchpaymentjob');
var blockJob = require(__dirname + '/lastblockjob');
var path = require('path');
var express = require('express');
var app = express();
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.bodyParser());
app.use(express.static(path.join(__dirname, 'public')));

require(__dirname + '/db').instantiateDb();
require(__dirname + '/routes')(app);
require('bitstamped');
blockJob.runLastBlockJob();
watchJob.runWatchPaymentsJob();

app.listen(config.port);
console.log('HTTP Server on port: ' + config.port);
