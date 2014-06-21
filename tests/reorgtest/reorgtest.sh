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
walletnotify=curl -o /dev/null -s -X POST -H "Content-Type: application/json" --data "{ \"txid\": \"%s\", \"api_key\": \"secretapikey\" }" http://localhost:$BARONPORT/notify
blocknotify=curl -o /dev/null -s -X POST -H "Content-Type: application/json" --data "{ \"blockhash\": \"%s\", \"api_key\": \"secretapikey\" }" http://localhost:$BARONPORT/blocknotify
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

waitforbtc() {
  while true; do
    if [ -n "$5" ]; then
      # RPC command with arg
      CHECK=$(btc $1 $2 $3 2> /dev/null | jq -r ".$4")
      [ "$CHECK" == "$5" ] && break
    else
      # RPC command without arg
      CHECK=$(btc $1 $2 2> /dev/null | jq -r ".$3")
      [ "$CHECK" == "$4" ] && break
    fi
    sleep 0.2
  done
}

waitfortx() {
  while true; do
    CHECK=$(btc $1 getrawmempool |jq -r '.[0]')
    [ "$CHECK" == "$2" ] && break
    #echo "waitfortx $2 on node $1"
    sleep 0.2
  done
}

waitforpaid() {
  while true; do
    CHECK=$(curl -s -X GET http://localhost:$BARONPORT/api/invoices/$1 | jq '.is_paid')
    [ "$CHECK" == "true" ] && break
    #echo "waitforpaid Invoice $1"
    sleep 0.25
  done
}

waitforbaron() {
  while true; do
    curl -s -o /dev/null -X POST http://0.0.0.0:$BARONPORT/notify && break
  done
}

spendfrom() {
  WHICH=$1
  shift
  TXID=$1
  shift
  unset OUTPUTS
  while [ -n "$1" ]; do
    [ -n "$OUTPUTS" ] && OUTPUTS="$OUTPUTS,"
    OUTPUTS="$OUTPUTS\"$1\":$2"
    shift
    shift
  done
  UNSIGNED=$(btc $WHICH createrawtransaction "[{\"txid\":\"$TXID\",\"vout\":0}]" "{$OUTPUTS}")
  SIGNED=$(btc $WHICH signrawtransaction $UNSIGNED | jq -r '.hex')
  TXIDSENT=$(btc $WHICH sendrawtransaction $SIGNED)
  echo "spendfrom: Sent to $OUTPUTS in $TXIDSENT"
}

printalias() {
  echo "alias btc${1}='bitcoind -datadir=$BARONTMPDIR/$1'"
}

printtitle() {
  echo "###############################"
  echo "$1"
  echo "###############################"
}

detectwhichopen() {
  # X11 Freedesktop
  which xdg-open > /dev/null 2>&1 && [ -n "$DISPLAY" ]      && OPEN=xdg-open
  # OSX
  which open > /dev/null 2>&1 && uname -a | grep -q ^Darwin && OPEN=open
}

openurl() {
  echo "URL: $1"
  [ -n "$OPEN" ] && $OPEN $1 > /dev/null 2>&1 ||:
}

setuppartitions() {
  echo "[STOPPING BITCOIND 3,4]"
  btc 3 stop
  btc 4 stop
  sleep 2
  echo "[COPYING WALLETS from 1,2 to 3,4]"
  btc 1 backupwallet $BARONTMPDIR/3/regtest/wallet.dat
  btc 2 backupwallet $BARONTMPDIR/4/regtest/wallet.dat
  echo "[STARTING BITCOIND 3,4]"
  startbtc 3
  startbtc 4
  btc 4 addnode localhost:20034 onetry
  waitforbtc 3 getinfo connections 1
}

#### CLEAR BITCOIND AND NODE ####
killall bitcoind 2> /dev/null
killall node     2> /dev/null
curl -s -o /dev/null -X DELETE http://localhost:5984/$DB_NAME/
sleep 1

rm -rf $BARONTMPDIR
mkdir -p $BARONTMPDIR
mkdir -p $LOGDIR

# Exit handler: killall node and bitcoind instances along with tester
trap "echo 'BARONTESTER DONE'; set +e; killall node 2> /dev/null; killall bitcoind 2> /dev/null; exit 0" SIGINT SIGTERM EXIT
echo "Use CTRL-C to kill tester, Baron and bitcoind."

# Detect browser
unset OPEN
detectwhichopen
[ -n "$OPEN" ] && echo "Browser Opener: $OPEN"

for x in 1 2 3 4; do
  setupbitcoind $x
  echo "[STARTING BITCOIND $x]"  
  startbtc $x
done

set -e # exit on error
# Connect all nodes
btc 2 addnode localhost:20014 onetry
btc 3 addnode localhost:20014 onetry
btc 4 addnode localhost:20034 onetry

# Generate blocks to obtain spendable outputs
btc 1 setgenerate true
waitforbtc 2 getinfo blocks 1
btc 2 setgenerate true 109
waitforbtc 1 getinfo blocks 110
waitforbtc 3 getinfo blocks 110
waitforbtc 4 getinfo blocks 110
TXID1=$(btc 2 listunspent | jq -r '.[1].txid')
TXID2=$(btc 2 listunspent | jq -r '.[2].txid')
TXID3=$(btc 2 listunspent | jq -r '.[3].txid')
TXID4=$(btc 2 listunspent | jq -r '.[4].txid')
TXID5=$(btc 2 listunspent | jq -r '.[5].txid')
TXID6=$(btc 2 listunspent | jq -r '.[6].txid')
TXID7=$(btc 2 listunspent | jq -r '.[7].txid')
TXID8=$(btc 2 listunspent | jq -r '.[8].txid')
TXID9=$(btc 2 listunspent | jq -r '.[9].txid')

# START BARON
cd $BARONDIR
echo "[STARTING BARON]"
export BITCOIND_USER=user
export BITCOIND_PASS=password
export BARON_API_KEY=secretapikey
export DB_NAME=baronregtest
export PORT=$BARONPORT
export BITCOIND_PORT=20013
export LAST_BLOCK_JOB_INTERVAL=4133
export UPDATE_WATCH_LIST_INTERVAL=5000
#npm start > $LOGDIR/baron.log 2>&1 &
node server.js &
cd - > /dev/null

# START POSTWATCHER
echo "[STARTING POSTWATCHER]"
export PORT=9242
cd $SCRIPTDIR
node postwatcher.js &
cd - > /dev/null
waitforbaron

### STARTUP COMPLETE

### Test #1: Reorg unconfirm then reconfirm into another block
test1() {
printtitle "TEST #1: Reorg unconfirm then reconfirm into another block"
setuppartitions
echo "[SUBMIT INVOICE TO BARON]"
INVOICEID=$(curl -s -X POST -H "Content-Type: application/json" -d @$BARONDIR/tests/reorgtest/TESTINVOICE http://localhost:$BARONPORT/invoices |jq -r '.id')
openurl http://localhost:$BARONPORT/invoices/$INVOICEID
# Poke payment page so the payment is created
curl -s -o /dev/null http://localhost:$BARONPORT/pay/$INVOICEID
PAYADDRESS=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID | jq -r '.address')
echo "[PAY $PAYADDRESS from wallet 2]"
spendfrom 2 $TXID1 $PAYADDRESS 50
waitfortx 1 $TXIDSENT
echo "[GENERATE block on node 1]"
btc 1 setgenerate true
waitforpaid $INVOICEID
echo "[GENERATE block on node 3]"
btc 3 setgenerate true
sleep 1
echo "[Reconnect partitions]"
btc 3 addnode localhost:20014 onetry
waitforbtc 1 getinfo connections 2
echo "[GENERATE block on node 3 to trigger reorg.  Payment should now be unconfirmed.]"
btc 3 setgenerate true
sleep 6
echo "[GENERATE block on node 1 to reconfirm transaction.]"
btc 1 setgenerate true
sleep 2
echo "[END TEST #1]"
}

### Test #2: Double Spend (Replace Payment to Same Address)
test2() {
printtitle "TEST #2: Double Spend Replace (payment to same address)"
setuppartitions
echo "[SUBMIT INVOICE TO BARON]"
INVOICEID=$(curl -s -X POST -H "Content-Type: application/json" -d @$BARONDIR/tests/reorgtest/TESTINVOICE http://localhost:$BARONPORT/invoices |jq -r '.id')
openurl http://localhost:$BARONPORT/invoices/$INVOICEID
# Poke payment page so the payment is created
curl -s -o /dev/null http://localhost:$BARONPORT/pay/$INVOICEID
PAYADDRESS=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID | jq -r '.address')
echo "[PAY $PAYADDRESS from wallet 2]"
spendfrom 2 $TXID2 $PAYADDRESS 50
waitfortx 1 $TXIDSENT
echo "[GENERATE block on node 1]"
btc 1 setgenerate true
waitforpaid $INVOICEID
echo "[Double Spend Replace from wallet 4]"
spendfrom 4 $TXID2 $PAYADDRESS 50
waitfortx 3 $TXIDSENT
echo "[GENERATE block on node 3]"
btc 3 setgenerate true
sleep 1
echo "[Reconnect partitions]"
btc 3 addnode localhost:20014 onetry
waitforbtc 1 getinfo connections 2
echo "[GENERATE block on node 3 to trigger reorg]"
btc 3 setgenerate true
# FIXME: Huge sleep because Baron experiences a major delay in processing this reorg
sleep 6
echo "[END TEST #2]"
}

### Test #3: Double Spend Theft
test3() {
printtitle "Test #3: Double Spend Theft"
setuppartitions
echo "[SUBMIT INVOICE TO BARON]"
INVOICEID=$(curl -s -X POST -H "Content-Type: application/json" -d @$BARONDIR/tests/reorgtest/TESTINVOICE http://localhost:$BARONPORT/invoices |jq -r '.id')
openurl http://localhost:$BARONPORT/invoices/$INVOICEID
# Poke payment page so the payment is created
curl -s -o /dev/null http://localhost:$BARONPORT/pay/$INVOICEID
PAYADDRESS=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID | jq -r '.address')
echo "[PAY $PAYADDRESS using wallet 2]"
spendfrom 2 $TXID3 $PAYADDRESS 50
waitfortx 1 $TXIDSENT
echo "[GENERATE block on node 1]"
btc 1 setgenerate true
waitforpaid $INVOICEID
echo "[Double Spend Theft from wallet 4]"
spendfrom 4 $TXID3 mjAK1JGRAiFiNqb6aCJ5STpnYRNbq4j9f1 50
waitfortx 3 $TXIDSENT
echo "[GENERATE block on node 3]"
btc 3 setgenerate true
sleep 1
echo "[Reconnect partitions]"
btc 3 addnode localhost:20014 onetry
waitforbtc 1 getinfo connections 2
echo "[GENERATE block on node 3 to trigger reorg]"
btc 3 setgenerate true
# FIXME: Huge sleep because Baron experiences a major delay in processing this reorg
sleep 6
echo "[END TEST #3]"
}

### Test #4: Payment with Metadata ID
test4() {
printtitle "Test #4: Payment with Metadata ID"
echo "[SUBMIT INVOICE TO BARON]"
INVOICEID=$(curl -s -X POST -H "Content-Type: application/json" -d @$BARONDIR/tests/reorgtest/TESTINVOICE2 http://localhost:$BARONPORT/invoices |jq -r '.id')
openurl http://localhost:$BARONPORT/invoices/$INVOICEID
# Poke payment page so the payment is created
curl -s -o /dev/null http://localhost:$BARONPORT/pay/$INVOICEID
PAYADDRESS=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID | jq -r '.address')
echo "[PAY $PAYADDRESS from wallet 2]"
spendfrom 2 $TXID4 $PAYADDRESS 50
waitfortx 1 $TXIDSENT
echo "[GENERATE block on node 1]"
btc 1 setgenerate true
waitforbtc 1 gettransaction $TXIDSENT confirmations 1
echo "[END TEST #4]"
}

### Test #5: Payment of two Invoices with the same Transaction
test5() {
printtitle "Test #5: Payment of two Invoices with the same Transaction"
echo "[SUBMIT INVOICE 1 TO BARON]"
INVOICEID1=$(curl -s -X POST -H "Content-Type: application/json" -d @$BARONDIR/tests/reorgtest/TESTINVOICE3 http://localhost:$BARONPORT/invoices |jq -r '.id')
openurl http://localhost:$BARONPORT/invoices/$INVOICEID1
# Poke payment page so the payment is created
curl -s -o /dev/null http://localhost:$BARONPORT/pay/$INVOICEID1
PAYADDRESS1=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID1 | jq -r '.address')
echo "[SUBMIT INVOICE 2 TO BARON]"
INVOICEID2=$(curl -s -X POST -H "Content-Type: application/json" -d @$BARONDIR/tests/reorgtest/TESTINVOICE4 http://localhost:$BARONPORT/invoices |jq -r '.id')
openurl http://localhost:$BARONPORT/invoices/$INVOICEID2
# Poke payment page so the payment is created
curl -s -o /dev/null http://localhost:$BARONPORT/pay/$INVOICEID2
PAYADDRESS2=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID2 | jq -r '.address')
echo "[PAY $PAYADDRESS1 and $PAYADDRESS2 from wallet 2]"
spendfrom 2 $TXID4 $PAYADDRESS1 25 $PAYADDRESS2 25
waitfortx 1 $TXIDSENT
echo "[GENERATE block on node 1]"
btc 1 setgenerate true
waitforbtc 1 gettransaction $TXIDSENT confirmations 1
echo "[END TEST #5]"
}

### Test #6: Partial Payments from same Transactions
test6() {
printtitle "Test #6: Partial Payments from same Transactions"
echo "[SUBMIT INVOICE 1 TO BARON]"
INVOICEID1=$(curl -s -X POST -H "Content-Type: application/json" -d @$BARONDIR/tests/reorgtest/TESTINVOICE3 http://localhost:$BARONPORT/invoices |jq -r '.id')
openurl http://localhost:$BARONPORT/invoices/$INVOICEID1
# Poke payment page so the payment is created
curl -s -o /dev/null http://localhost:$BARONPORT/pay/$INVOICEID1
PAYADDRESS1=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID1 | jq -r '.address')
echo "[SUBMIT INVOICE 2 TO BARON]"
INVOICEID2=$(curl -s -X POST -H "Content-Type: application/json" -d @$BARONDIR/tests/reorgtest/TESTINVOICE4 http://localhost:$BARONPORT/invoices |jq -r '.id')
openurl http://localhost:$BARONPORT/invoices/$INVOICEID2
# Poke payment page so the payment is created
curl -s -o /dev/null http://localhost:$BARONPORT/pay/$INVOICEID2
PAYADDRESS2=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID2 | jq -r '.address')
echo "[PARTIAL PAY $PAYADDRESS1 and $PAYADDRESS2 from wallet 2]"
spendfrom 2 $TXID5 $PAYADDRESS1 10 $PAYADDRESS2 10 mjAK1JGRAiFiNqb6aCJ5STpnYRNbq4j9f1 30
waitfortx 1 $TXIDSENT
echo "[PARTIAL PAY $PAYADDRESS1 and $PAYADDRESS2 from wallet 2]"
spendfrom 2 $TXID6 $PAYADDRESS1 15 $PAYADDRESS2 15 mjAK1JGRAiFiNqb6aCJ5STpnYRNbq4j9f1 20
waitfortx 1 $TXIDSENT
echo "[GENERATE block on node 1]"
btc 1 setgenerate true
waitforbtc 1 gettransaction $TXIDSENT confirmations 1
echo "[END TEST #6]"
}

[ -z "$1" ] && TESTS="test1 test2 test3 test4 test5 test6"
for x in $@; do
  TESTS="$TESTS $x"
done

# execute tests
for x in $TESTS; do
  $x
done

# Loop forever until CTRL-C
while :
do
        sleep 60
done

