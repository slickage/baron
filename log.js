'use strict';

var bunyan = require('bunyan');
var config = require(__dirname + '/config');

var streams = [{ stream: process.stdout }];

if (config.logFileEnabled) {
  console.log('Baron logging to ' + config.logFile);
  streams[0].level = 'fatal';
  streams.push({ path: config.logFile });
}

var log = bunyan.createLogger({
  name: config.appTitle.toLowerCase(),
  level: config.logLevel,
  streams: streams
});

if (config.logFileEnabled) {
  process.on('SIGUSR2', function () {
    log.reopenFileStreams();
  });
}

module.exports =  log;
