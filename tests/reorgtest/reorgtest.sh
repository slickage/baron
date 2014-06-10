#!/bin/bash
SCRIPTDIR="$( cd "$( dirname "$0" )" && pwd )"

# Read reorgtest.conf
if [ ! -e reorgtest.conf ]; then
  echo "ERROR: reorgtest.conf not found."
  exit 255
else
  . $SCRIPTDIR/reorgtest.conf
  [ -n "$BARONDIR" ]    || errorexit "ERROR: BARONDIR must be defined in reorgtest.conf."
  [ -n "$BARONPORT" ]   || BARONPORT=8080
  [ -n "$DBNAME" ]      || DB_NAME=baronregtest
  [ -n "$BARONTMPDIR" ] || BARONTMPDIR=$BARONDIR/tests/reorgtest/tmp
  LOGDIR=$BARONDIR/tests/reorgtest/logs
fi

errorexit() {
  echo "$1"
  exit 255
}

# Sanity Checks
cd $SCRIPTDIR
for f in postwatcher.js TESTINVOICE TESTINVOICE2; do
  [ ! -e $f ] && errorexit "File not found: $SCRIPTDIR/$f"
done
cd - > /dev/null

setupbitcoind() {
  mkdir -p $BARONTMPDIR/${1}
  cd $BARONTMPDIR/${1}
  cat <<EOF > bitcoin.conf
rpcuser=user
rpcpassword=password
daemon=1
discover=0
server=1
listen=1
upnp=0
regtest=1
port=200${1}4
rpcport=200${1}3
EOF

  if [ "$1" == "1" ]; then
  cat <<EOF >> bitcoin.conf
walletnotify=curl -o /dev/null -s --data "txId=%s" http://localhost:$BARONPORT/notify
blocknotify=curl -o /dev/null -s --data "blockHash=%s" http://localhost:$BARONPORT/blocknotify
EOF
fi
}

btc() {
  N=$1
  shift
  bitcoind -datadir=$BARONTMPDIR/$N $@
}

startbtc() {
  set +e
  btc $1
  while true; do
    sleep 0.1
    btc $1 getinfo > /dev/null 2>&1
    [ "$?" == "0" ] && break
  done
  set -e
}

waitfor() {
  while true; do
    CHECK=$(btc $1 $2 | jq ".$3")
    [ "$CHECK" == "$4" ] && break
    sleep 0.25
  done
}

spendfrom() {
  WHICH=$1
  TXID=$2
  ADDR=$3
  UNSIGNED=$(btc $WHICH createrawtransaction "[{\"txid\":\"$TXID\",\"vout\":0}]" "{\"$ADDR\":50}")
  SIGNED=$(btc $WHICH signrawtransaction $UNSIGNED | jq -r '.hex')
  btc $WHICH sendrawtransaction $SIGNED
  echo "spendfrom: Sent 50 BTC from $TXID to $ADDR."
}


printalias() {
  echo "alias btc${1}='bitcoind -datadir=$BARONTMPDIR/$1'"
}

printhashes() {
  echo "###############################"
}

#### CLEAR BITCOIND AND NODE ####
echo "[DIE DIE DIE!!!]"
killall bitcoind
killall node
curl -s -o /dev/null -X DELETE http://localhost:5984/$DB_NAME/
sleep 3

rm -rf $BARONTMPDIR
mkdir -p $BARONTMPDIR
mkdir -p $LOGDIR

for x in 1 2 3 4; do
  setupbitcoind $x
  echo "[STARTING BITCOIND $x]"  
  startbtc $x
done

set -e # exit on error
# Connect all nodes
btc 2 addnode localhost:20014 onetry
btc 3 addnode localhost:20014 onetry
btc 4 addnode localhost:20014 onetry
sleep 1

# Generate blocks to have spendable outputs
btc 1 setgenerate true
sleep 1
btc 2 setgenerate true 106
waitfor 1 getinfo blocks 107
waitfor 3 getinfo blocks 107
waitfor 4 getinfo blocks 107
TXID1=$(btc 2 listunspent | jq -r '.[1].txid')
TXID2=$(btc 2 listunspent | jq -r '.[2].txid')
TXID3=$(btc 2 listunspent | jq -r '.[3].txid')
TXID4=$(btc 2 listunspent | jq -r '.[4].txid')
TXID5=$(btc 2 listunspent | jq -r '.[5].txid')

# START BARON
cd $BARONDIR
echo "[STARTING BARON]"
export BITCOIND_USER=user
export BITCOIND_PASS=password
export BARON_API_KEY=postaccesstoken
export DB_NAME=baronregtest
export PORT=$BARONPORT
export BITCOIND_PORT=20013
export LAST_BLOCK_JOB_INTERVAL=4133
export UPDATE_WATCH_LIST_INTERVAL=5000
npm start > $LOGDIR/baron.log 2>&1 & 
cd - > /dev/null

# START POSTWATCHER
echo "[STARTING POSTWATCHER]"
export PORT=9242
cd $SCRIPTDIR
node postwatcher.js &
cd - > /dev/null
sleep 1

### STARTUP COMPLETE

### Test #1: Reorg unconfirm then reconfirm into another block
test1() {
printhashes
echo "TEST #1: Reorg unconfirm then reconfirm into another block"
printhashes
echo "[STOPPING BITCOIND 3 & 4]"
btc 3 stop
btc 4 stop
sleep 3
echo "[COPYING WALLET 1 to 3]"
cp $BARONTMPDIR/2/regtest/wallet.dat $BARONTMPDIR/3/regtest/wallet.dat
echo "[STARTING BITCOIND 3 & 4]"
startbtc 3
startbtc 4

btc 4 addnode localhost:20034 onetry
echo "[SUBMIT INVOICE TO BARON]"
INVOICEID=$(curl -s -X POST -H "Content-Type: application/json" -d @$BARONDIR/tests/reorgtest/TESTINVOICE http://localhost:$BARONPORT/invoices |jq -r '.id')
echo "URL: http://localhost:$BARONPORT/invoices/$INVOICEID"
# Poke payment page so the payment is created
curl -s -o /dev/null http://localhost:$BARONPORT/pay/$INVOICEID
PAYADDRESS=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID | jq -r '.address')
if [ "$PAYADDRESS" == "null" ]; then
  errorexit "ERROR: route/status.js must expose payment.address."
fi
echo "[PAY $PAYADDRESS using wallet 2]"
spendfrom 2 $TXID1 $PAYADDRESS
sleep 1
echo "[GENERATE block on node 1]"
btc 1 setgenerate true
echo "[Wait 6 seconds to ensure that baron had processed the payment."
sleep 6
echo "[GENERATE block on node 3]"
btc 3 setgenerate true
sleep 1
echo "[Reconnect partitions]"
btc 3 addnode localhost:20014 onetry
sleep 1
echo "[GENERATE block on node 3 to trigger reorg.  Payment should now be unconfirmed.]"
btc 3 setgenerate true
sleep 6
echo "[GENERATE block on node 1 to reconfirm transaction.]"
btc 1 setgenerate true
sleep 1
}

### Test #2: Double Spend (Replace Payment to Same Address)
test2() {
printhashes
echo "TEST #2: Double Spend Replace (payment to same address)"
printhashes
echo "[STOPPING BITCOIND 3 & 4]"
btc 3 stop
btc 4 stop
sleep 3
echo "[COPYING WALLET 1 to 3]"
cp $BARONTMPDIR/2/regtest/wallet.dat $BARONTMPDIR/3/regtest/wallet.dat
echo "[STARTING BITCOIND 3 & 4]"
startbtc 3
startbtc 4
btc 4 addnode localhost:20034 onetry
sleep 0.5
echo "[SUBMIT INVOICE TO BARON]"
INVOICEID=$(curl -s -X POST -H "Content-Type: application/json" -d @$BARONDIR/tests/reorgtest/TESTINVOICE http://localhost:$BARONPORT/invoices |jq -r '.id')
echo "URL: http://localhost:$BARONPORT/invoices/$INVOICEID"
# Poke payment page so the payment is created
curl -s -o /dev/null http://localhost:$BARONPORT/pay/$INVOICEID
PAYADDRESS=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID | jq -r '.address')
if [ "$PAYADDRESS" == "null" ]; then
  errorexit "ERROR: route/status.js must expose payment.address."
fi
echo "[PAY $PAYADDRESS using wallet 2]"
spendfrom 2 $TXID2 $PAYADDRESS
sleep 1
echo "[GENERATE block on node 1]"
btc 1 setgenerate true
echo "[Wait 6 seconds to ensure that baron had processed the payment."
sleep 6
echo "[Double Spend Replace using wallet 3]"
spendfrom 3 $TXID2 $PAYADDRESS
sleep 1
echo "[GENERATE block on node 3]"
btc 3 setgenerate true
sleep 1
echo "[Reconnect partitions]"
btc 3 addnode localhost:20014 onetry
sleep 1
echo "[GENERATE block on node 3 to trigger reorg]"
btc 3 setgenerate true
sleep 1
}

### Test #3: Double Spend (Payment to address elsewhere)
test3() {
printhashes
echo "Test #3: Double Spend (Payment to address elsewhere)"
printhashes
echo "[STOPPING BITCOIND 3 & 4]"
btc 3 stop
btc 4 stop
sleep 3
echo "[COPYING WALLET 1 to 3]"
cp $BARONTMPDIR/2/regtest/wallet.dat $BARONTMPDIR/3/regtest/wallet.dat
echo "[STARTING BITCOIND 3 & 4]"
startbtc 3
startbtc 4
btc 4 addnode localhost:20034 onetry
sleep 0.5
echo "[SUBMIT INVOICE TO BARON]"
INVOICEID=$(curl -s -X POST -H "Content-Type: application/json" -d @$BARONDIR/tests/reorgtest/TESTINVOICE http://localhost:$BARONPORT/invoices |jq -r '.id')
echo "URL: http://localhost:$BARONPORT/invoices/$INVOICEID"
# Poke payment page so the payment is created
curl -s -o /dev/null http://localhost:$BARONPORT/pay/$INVOICEID
PAYADDRESS=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID | jq -r '.address')
if [ "$PAYADDRESS" == "null" ]; then
  errorexit "ERROR: route/status.js must expose payment.address."
fi
echo "[PAY $PAYADDRESS using wallet 2]"
spendfrom 2 $TXID3 $PAYADDRESS
sleep 1
echo "[GENERATE block on node 1]"
btc 1 setgenerate true
echo "[Wait 6 seconds to ensure that baron had processed the payment."
sleep 6
echo "[Double Spend to mjAK1JGRAiFiNqb6aCJ5STpnYRNbq4j9f1 using wallet 3]"
spendfrom 3 $TXID3 mjAK1JGRAiFiNqb6aCJ5STpnYRNbq4j9f1
sleep 1
echo "[GENERATE block on node 3]"
btc 3 setgenerate true
sleep 1
echo "[Reconnect partitions]"
btc 3 addnode localhost:20014 onetry
sleep 1
echo "[GENERATE block on node 3 to trigger reorg]"
btc 3 setgenerate true
sleep 1
}

### Test #4: Payment with Metadata ID
test4() {
printhashes
echo "Test #4: Payment with Metadata ID"
printhashes
echo "[SUBMIT INVOICE TO BARON]"
INVOICEID=$(curl -s -X POST -H "Content-Type: application/json" -d @$BARONDIR/tests/reorgtest/TESTINVOICE2 http://localhost:$BARONPORT/invoices |jq -r '.id')
echo "URL: http://localhost:$BARONPORT/invoices/$INVOICEID"
# Poke payment page so the payment is created
curl -s -o /dev/null http://localhost:$BARONPORT/pay/$INVOICEID
PAYADDRESS=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID | jq -r '.address')
if [ "$PAYADDRESS" == "null" ]; then
  errorexit "ERROR: route/status.js must expose payment.address."
fi
echo "[PAY $PAYADDRESS using wallet 2]"
spendfrom 2 $TXID4 $PAYADDRESS
sleep 1
echo "[GENERATE block on node 1]"
btc 1 setgenerate true
}

[ -z "$1" ] && TESTS="test1 test2 test3 test4"
for x in $@; do
  TESTS="$TESTS $x"
done

# execute tests
for x in $TESTS; do
  $x
done

