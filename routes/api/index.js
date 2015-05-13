'use strict';

var express = require('express');
var api = express.Router();

require(__dirname + '/invoices')(api);
require(__dirname + '/pay')(api);

module.exports = api;