var config = require('./config');
var express = require('express');
var app = express();

app.get('/', function(req, res){
  res.send('hello world');
});

app.listen(config.port);
console.log('HTTP Server on port: ' + config.port);
