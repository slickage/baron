#!/bin/bash
export BITCOIND_HOST=bitcoind
export BITCOIND_PORT=18332
export BITCOIND_USER=bitcoinrpc
export BITCOIND_PASS=asdf1234
export DB_URL=http://couchdb:5984

cd /src
node server

