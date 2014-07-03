#!/bin/bash
SCRIPTDIR="$( cd "$( dirname "$0" )" && pwd )"

if [ ! -e $SCRIPTDIR/barontester.conf ]; then
  echo "ERROR: $SCRIPTDIR/barontester.conf not found."
  exit 255
else
  . $SCRIPTDIR/barontester.conf
  [ -n "$BARONDIR" ]    || errorexit "ERROR: BARONDIR must be defined in barontester.conf."
  [ -n "$BARONPORT" ]   || BARONPORT=58080
  [ -n "$DBNAME" ]      || DB_NAME=baronregtest
  [ -n "$BARONTMPDIR" ] || BARONTMPDIR=$BARONDIR/tests/barontester/tmp
fi

errorexit() {
  echo "$1"
  exit 255
}

# Sanity Checks
cd $SCRIPTDIR
for f in postwatcher.js testinvoices/simple.json; do
  [ ! -e $f ] && errorexit "ERROR: File not found: $SCRIPTDIR/$f"
done
cd - > /dev/null
for CMD in curl jq node bitcoind; do
  if ! which $CMD > /dev/null 2>&1; then
    errorexit "ERROR: Command not found: $CMD"
  fi
done

setupbitcoind() {
  mkdir -p $BARONTMPDIR/${1}
  cd $BARONTMPDIR/${1}
  cat <<EOF > bitcoin.conf
rpcuser=user
rpcpassword=password
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
walletnotify=curl -o /dev/null -s -H "Content-Type: application/json" --data "{ \"txid\": \"%s\", \"api_key\": \"secretapikey\" }" http://localhost:$BARONPORT/walletnotify
blocknotify=curl -o /dev/null -s -H "Content-Type: application/json" --data "{ \"blockhash\": \"%s\", \"api_key\": \"secretapikey\" }" http://localhost:$BARONPORT/blocknotify
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
  bitcoind -datadir=$BARONTMPDIR/$1 &
  LASTPID=$!
  case "$1" in
    1)
    BTC_PID1=$LASTPID
    ;;
    2)
    BTC_PID2=$LASTPID
    ;;
    3)
    BTC_PID3=$LASTPID
    ;;
    4)
    BTC_PID4=$LASTPID
    ;;
    *)
    echo "ERROR: startbtc() should never reach here."
    exit 255
    ;;
  esac
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
    btc $1 getrawmempool |grep -q $2 && break
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
    curl -s -o /dev/null http://0.0.0.0:$BARONPORT && break
  done
}

submitinvoice() {
  echo "[SUBMIT INVOICE TO BARON]"
  INVOICEID=$(curl -s -H "Content-Type: application/json" -d @$BARONDIR/tests/barontester/testinvoices/$1 http://localhost:$BARONPORT/invoices |jq -r '.id')
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

startbaron() {
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
  node server.js &
  BARON_PID=$!
  cd - > /dev/null
}

# Exit handler: killall node and bitcoind instances along with tester
cleanexit() {
  set +e;
  kill $BARON_PID 2> /dev/null
  kill $POSTWATCHER_PID 2> /dev/null
  kill $BTC_PID1 2> /dev/null
  kill $BTC_PID2 2> /dev/null
  kill $BTC_PID3 2> /dev/null
  kill $BTC_PID4 2> /dev/null
  exit 0
}
trap cleanexit SIGINT SIGTERM EXIT
echo "Press CTRL-C to stop tester."

### Initialize Test Environment ###
# Wipe CouchDB baronregtest
curl -s -o /dev/null -X DELETE http://localhost:5984/$DB_NAME/

rm -rf $BARONTMPDIR
mkdir -p $BARONTMPDIR

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
btc 2 setgenerate true 110
waitforbtc 1 getinfo blocks 111
waitforbtc 3 getinfo blocks 111
waitforbtc 4 getinfo blocks 111
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
startbaron

# START POSTWATCHER
echo "[STARTING POSTWATCHER]"
export PORT=9242
cd $SCRIPTDIR
node postwatcher.js &
POSTWATCHER_PID=$?
cd - > /dev/null
waitforbaron

### STARTUP COMPLETE

### Test #1: Reorg unconfirm then reconfirm into another block
test1() {
printtitle "TEST #1: Reorg unconfirm then reconfirm into another block"
setuppartitions
submitinvoice simple.json
openurl http://localhost:$BARONPORT/invoices/$INVOICEID
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
submitinvoice simple.json
openurl http://localhost:$BARONPORT/invoices/$INVOICEID
PAYADDRESS=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID | jq -r '.address')
echo "[PAY $PAYADDRESS from wallet 2]"
spendfrom 2 $TXID2 $PAYADDRESS 50
waitfortx 1 $TXIDSENT
echo "[GENERATE six blocks on node 1]"
btc 1 setgenerate true 6
waitforpaid $INVOICEID
echo "[Double Spend Replace from wallet 4]"
spendfrom 4 $TXID2 $PAYADDRESS 50
waitfortx 3 $TXIDSENT
echo "[GENERATE six blocks on node 3]"
btc 3 setgenerate true 6
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
submitinvoice simple.json
openurl http://localhost:$BARONPORT/invoices/$INVOICEID
PAYADDRESS=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID | jq -r '.address')
echo "[PAY $PAYADDRESS using wallet 2]"
spendfrom 2 $TXID3 $PAYADDRESS 50
waitfortx 1 $TXIDSENT
echo "[GENERATE six blocks on node 1]"
btc 1 setgenerate true 6
waitforpaid $INVOICEID
echo "[Double Spend Theft from wallet 4]"
spendfrom 4 $TXID3 mjAK1JGRAiFiNqb6aCJ5STpnYRNbq4j9f1 50
waitfortx 3 $TXIDSENT
echo "[GENERATE six blocks on node 3]"
btc 3 setgenerate true 6
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
submitinvoice metadataid.json
openurl http://localhost:$BARONPORT/invoices/$INVOICEID
PAYADDRESS=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID | jq -r '.address')
echo "[PAY $PAYADDRESS from wallet 2]"
spendfrom 2 $TXID4 $PAYADDRESS 50
waitfortx 1 $TXIDSENT
echo "[GENERATE block on node 1]"
btc 1 setgenerate true
waitforbtc 1 gettransaction $TXIDSENT confirmations 1
sleep 1
echo "[END TEST #4]"
}

### Test #5: Payment of two Invoices with the same Transaction
test5() {
printtitle "Test #5: Payment of two Invoices with the same Transaction"
echo "[SUBMIT INVOICE 1 TO BARON]"
INVOICEID1=$(curl -s -H "Content-Type: application/json" -d @$BARONDIR/tests/barontester/testinvoices/multi-1st.json http://localhost:$BARONPORT/invoices |jq -r '.id')
openurl http://localhost:$BARONPORT/invoices/$INVOICEID1
PAYADDRESS1=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID1 | jq -r '.address')
echo "[SUBMIT INVOICE 2 TO BARON]"
INVOICEID2=$(curl -s -H "Content-Type: application/json" -d @$BARONDIR/tests/barontester/testinvoices/multi-2nd.json http://localhost:$BARONPORT/invoices |jq -r '.id')
openurl http://localhost:$BARONPORT/invoices/$INVOICEID2
PAYADDRESS2=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID2 | jq -r '.address')
echo "[PAY $PAYADDRESS1 and $PAYADDRESS2 from wallet 2]"
spendfrom 2 $TXID5 $PAYADDRESS1 25 $PAYADDRESS2 25
waitfortx 1 $TXIDSENT
echo "[GENERATE block on node 1]"
btc 1 setgenerate true
waitforbtc 1 gettransaction $TXIDSENT confirmations 1
sleep 1
echo "[END TEST #5]"
}

### Test #6: Partial Payments from same Transactions
test6() {
printtitle "Test #6: Partial Payments from same Transactions"
echo "[SUBMIT INVOICE 1 TO BARON]"
INVOICEID1=$(curl -s -H "Content-Type: application/json" -d @$BARONDIR/tests/barontester/testinvoices/multi-1st.json http://localhost:$BARONPORT/invoices |jq -r '.id')
openurl http://localhost:$BARONPORT/invoices/$INVOICEID1
PAYADDRESS1=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID1 | jq -r '.address')
echo "[SUBMIT INVOICE 2 TO BARON]"
INVOICEID2=$(curl -s -H "Content-Type: application/json" -d @$BARONDIR/tests/barontester/testinvoices/multi-2nd.json http://localhost:$BARONPORT/invoices |jq -r '.id')
openurl http://localhost:$BARONPORT/invoices/$INVOICEID2
PAYADDRESS2=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID2 | jq -r '.address')
echo "[PARTIAL PAY $PAYADDRESS1 and $PAYADDRESS2 from wallet 2]"
spendfrom 2 $TXID6 $PAYADDRESS1 10 $PAYADDRESS2 10 mjAK1JGRAiFiNqb6aCJ5STpnYRNbq4j9f1 30
waitfortx 1 $TXIDSENT
echo "[PARTIAL PAY $PAYADDRESS1 and $PAYADDRESS2 from wallet 2]"
spendfrom 2 $TXID7 $PAYADDRESS1 15 $PAYADDRESS2 15 mjAK1JGRAiFiNqb6aCJ5STpnYRNbq4j9f1 20
waitfortx 1 $TXIDSENT
echo "[GENERATE block on node 1]"
btc 1 setgenerate true
waitforbtc 1 gettransaction $TXIDSENT confirmations 1
sleep 1
echo "[END TEST #6]"
}

### Test #7: Two Payments to the Same Address (Race)
test7() {
printtitle "Test #7: Two payments to the Same Address (updatePayment race)"
setuppartitions
submitinvoice simple100.json
openurl http://localhost:$BARONPORT/invoices/$INVOICEID
PAYADDRESS=$(curl -s http://localhost:$BARONPORT/api/pay/$INVOICEID | jq -r '.address')
spendfrom 4 $TXID8 $PAYADDRESS 50
waitfortx 3 $TXIDSENT
spendfrom 4 $TXID9 $PAYADDRESS 50
waitfortx 3 $TXIDSENT
btc 3 addnode localhost:20014 onetry
waitforbtc 1 getinfo connections 2
echo "[GENERATE block on node 3 to send transactions to node 1]"
btc 3 setgenerate true
sleep 6
echo "[END TEST #7]"
}

[ -z "$1" ] && TESTS="test1 test2 test3 test4 test5 test6 test7"
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

