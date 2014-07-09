/* jshint node: true */
'use strict';

var bunyan = require('bunyan');
var config = require(__dirname + '/config');
var appName = config.appTitle.toLowerCase();
// Default to info level
module.exports = bunyan.createLogger({name: appName, level: 30});