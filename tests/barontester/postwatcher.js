var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var port = process.env.PORT || 8080;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/*', function(req, res) {
  if (req.body) {
    console.log('postwatcher: ' + req.path + ' body: ' + require('util').inspect(req.body));
  }
  res.end();
});

app.listen(port);
console.log('postwatcher listening at: http://localhost:' + port);
