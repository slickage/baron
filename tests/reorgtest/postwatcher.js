var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var port = process.env.PORT || 8080;

app.use(bodyParser());

app.post('/*', function(req, res) {
  if (req.body) {
    console.log('Route posted to:  ' + req.path);
    console.log('Body Parameters:');
    console.log(req.body);
  }
  res.end();
});

app.listen(port);
console.log('Listening at: ' + port);
