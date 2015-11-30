# Baron [![Gitter chat](http://img.shields.io/badge/gitter-slickage%2Fbaron-1dce73.svg?style=flat)](https://gitter.im/slickage/baron)[![Build Status](http://img.shields.io/travis/slickage/baron.svg?style=flat)](https://travis-ci.org/slickage/baron) [[Live Demo](http://demo.baronpay.org)]

Baron is a Bitcoin payment processor that anyone can deploy

* Allow creation of invoices denominated in USD or BTC from any other application with the API key.
* Invoices denominated in USD are quoted at market-rate in BTC at the time of payment.
* Records BTC exchange rates when payments are made, useful for accounting.
* Keeps history of all invoices and payments.
* Keeps history of unusual events like reorg, double-spend, etc.
* Properly handles incoming payments after recovering from downtime.
* Notifies external applications via webhooks when an invoice is paid or rendered invalid.
* No lost notifications: monitors for success/failure of webhooks with a retry queue.
* Responsive web design allows for a better user experience across multiple devices.

![Baron Screenshot](http://i.imgur.com/WQwJ0E9.gif)

## License and Disclaimer
```
Permission is hereby granted, without written agreement and without
license or royalty fees, to use, copy, modify, and distribute this
software and its documentation for any purpose, provided that the
above copyright notice and the following two paragraphs appear in
all copies of this software.

IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE TO ANY PARTY FOR
DIRECT, INDIRECT, SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGES
ARISING OUT OF THE USE OF THIS SOFTWARE AND ITS DOCUMENTATION, EVEN
IF THE COPYRIGHT HOLDER HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH
DAMAGE.

THE COPYRIGHT HOLDER SPECIFICALLY DISCLAIMS ANY WARRANTIES, INCLUDING,
BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS FOR A PARTICULAR PURPOSE.  THE SOFTWARE PROVIDED HEREUNDER IS
ON AN "AS IS" BASIS, AND THE COPYRIGHT HOLDER HAS NO OBLIGATION TO
PROVIDE MAINTENANCE, SUPPORT, UPDATES, ENHANCEMENTS, OR MODIFICATIONS.
```

## External Dependencies
* [node](http://nodejs.org) - baron is confirmed to work with nodejs v0.10.36, we need help to make it work with newer versions of node.js
* [couchdb](http://wiki.apache.org/couchdb/Installation)
* [bitcoin](https://bitcoin.org/en/download) - latest Bitcoin Core version is recommended, tested with 0.11
* [curl](http://curl.haxx.se/dlwiz/?type=bin)
* [foreman](https://github.com/ddollar/foreman) (optional)

## Install
Run the following commands to install Baron:
```sh
$ git clone https://github.com/slickage/baron.git
$ cd baron
$ npm install
```

### Baron Configuration
Options are read from environment variables listed in the tables below. A common way to configure environment variables and launch node applications is using [foreman](https://github.com/ddollar/foreman) with a [.env](http://ddollar.github.io/foreman/#ENVIRONMENT) file.  Alternatively node applications are often launched with a [systemd](http://www.freedesktop.org/wiki/Software/systemd/) .service definition file.  `foreman export` can generate systemd files from an `.env` file.

#### CouchDB Options
* `DB_HOST` - CouchDB's connection hostname:port (do not specify protocol)
* `DB_NAME` - The name of Baron's database
* `DB_PROTO` - Default 'http', use 'https' for SSL
* `DB_USER` - If configured, the database admin username
* `DB_PASS` - If configured, the database admin's password

#### Bitcoind Options
* `BITCOIND_HOST` - Bitcoind hostname
* `BITCOIND_PORT` - Bitcoind RPC port
* `BITCOIND_USER` - RPC username (set in bitcoin.conf)
* `BITCOIND_PASS` - RPC password (set in bitcoin.conf)

#### Baron Options (mandatory)
* `BARON_API_KEY` - Secret api key, used to post invoices to Baron <sup>[1]</sup>
* `PORT` - Baron listens on this TCP port
* `TRUST_PROXY` - Set to `true` if Baron is behind a reverse proxy, see note below
* `PUBLIC_URL` - Should match Baron's public URL (protocol, hostname and optional port)
* `ADMIN_EMAILS` - Comma separated list of Baron admin email addresses
* `SENDER_EMAIL` - Outgoing email from Baron use this address
* `SMTP_HOST` - SMTP Host for sending outgoing email
* `SMTP_USER` - SMTP login username
* `SMTP_PASS` - SMTP login password
* `SMTP_PORT` - SMTP port (default 465)

#### Baron Options (optional)
* `APP_TITLE` - Default title in invoices and payment views (default to 'Baron', can be overridden per-invoice)
* `CHAIN_EXPLORER_URL` - Address prior to /txid in explorer (defaults to blockr.io)
* `TICKER_URL` - Address to alternate ticker (default https://www.bitstamp.net/api/ticker/)
* `LOG_FILE_ENABLED` - Enables logging to file
* `LOG_FILE` - Path of the file that Baron should log to
* `LOG_LEVEL` - The logging level. Supports: trace, debug, info, warn, error, fatal
* `MIN_BTC` - Minimum BTC amount for invoice line items (default 0.00001 BTC)
* `MIN_USD` - Minimum USD amount for invoice line items (default 0.01 USD)
* `SPOTRATE_VALID_FOR_MINUTES` - BTC/USD exchange rate frozen for this duration (default 5 minutes)
* `TRACK_PAYMENT_UNTIL_CONF` - Stop watching payments for double-spend (default 100 confirmations)

**NOTES**
* Most properties have sane default values, see [config.js](https://github.com/slickage/baron/blob/master/config.js) for defaults.
* The `BARON_API_KEY` is a shared secret between Baron and applications who post invoices.
* Support for USD invoices is experimental at this time. If payments for fiat invoices are made while Baron is down, it cannot retrieve an accurate exchange rate when starting back up. Baron will record the latest exchange rate it was aware of before going down.

#### Reverse Proxy Configuration

You must use a reverse proxy as you will need SSL to protect the security of Baron.  [nginx](http://nginx.org/) `proxy_pass` is most frequently used for this purpose.  This example nginx configuration snippet forwards requests to a SSL virtualhost, and then to Baron running on localhost:8080.
```
server {
  listen       443;
  server_name  baron.example.com;
  ssl on;
  ssl_certificate_key /etc/pki/tls/private/baron.example.com.key;
  ssl_certificate     /etc/pki/tls/certs/baron.example.com.pem;
  location / {
    proxy_pass http://localhost:8080;
    proxy_set_header        Host             $host;
    proxy_set_header        X-Forwarded-For  $proxy_add_x_forwarded_for;
  }
}
```

When using a remote proxy you must enable Baron's `TRUST_PROXY` option.  Baron will then be able to ascertain the client IP address from the **X-Forwarded-For** header.

### Example Bitcoin Configuration
Modify bitcoin's [bitcoin.conf](https://en.bitcoin.it/wiki/Running_Bitcoin#Bitcoin.conf_Configuration_File):
```sh
# (optional) connects bitcoin client to testnet
testnet=1

# allows json-rpc api calls from Baron
server=1

# these should match your config or .env bitcoind username and password
rpcuser=username
rpcpassword=password

# tells bitcoind to post wallet/block notifications to baron
# the addresses below should match baron's address and port.
walletnotify=curl -o /dev/null -s -H "Content-Type: application/json" --data "{ \"txid\": \"%s\", \"api_key\": \"youshouldreallychangethis\" }" http://localhost:8080/walletnotify
blocknotify=curl -o /dev/null -s -H "Content-Type: application/json" --data "{ \"blockhash\": \"%s\", \"api_key\": \"youshouldreallychangethis\" }" http://localhost:8080/blocknotify

```

**NOTES**
* Baron is entirely reliant upon walletnotify to learn of transactions.  Be sure to customize the two instances of `api_key` within bitcoin.conf to match the `BARON_API_KEY` configuration of Baron.  Additionally the `/walletnotify` and `/blocknotify` URL's must be correct to the hostname and port of your Baron instance and network accessible from the bitcoind.  Please be certain to protect the network between bitcoind and Baron by running it on localhost, within a private network, or VPN.

### Running Baron
Both bitcoind and CouchDB must be running and Baron must be correctly configured to reach these external services.

Running Baron with [node](http://nodejs.org).  Note that the environment variables must be set by wrapper shell script, systemd `EnvironmentFile` or foreman `.env` file. Also note that Baron uses [bunyan](https://github.com/trentm/node-bunyan) for logging and the default stdout is JSON. To enable a human readable stdout, Baron output needs to be piped through the [bunyan CLI](https://github.com/trentm/node-bunyan#cli-usage) tool.

```sh
$ node server.js | ./node_modules/.bin/bunyan -o short
```

Running Baron with [foreman](https://github.com/ddollar/foreman) and [nodemon](https://github.com/remy/nodemon)
```sh
$ foreman start -f Procfile-dev
```

## Important Note about USD Support

Baron makes an effort to support USD-denominated invoices and to record the USD-value at the time of the transaction to help facilitate business accounting records. These features work relatively well but with caveats.

* Baron has two issues described below when dealing with payments that happened during downtime.  While these issues are hypothetically problematic, in practice it may only rarely happen because downtime is extremely rare and a user is highly unlikely to pay when they are unable to load the payment page.
 * Baron has no way of knowing the true time when the 0-conf payment actually occurred if bitcoind was down.  The best Baron can do is to guess from the blocktime. This is problematic because as the Bitcoin protocol does not guarantee that the blocktime is true, and even if it were true it could be an indeterminate time after the actual 0-conf payment. (We could consider querying one or more explorers to obtain the transaction's first seen time.  We are hesitant to add additional external data sources as it would complicate the code for a rare corner case.) TODO: Baron does not yet actually use the transaction blocktime when recovering from downtime, this will be fixed in Issue #56.
 * Since Baron was not recording ticker rates during downtime, it has no way of knowing the exchange rate at the time of the payment.  In general Baron uses the most recent ticker rate prior to the transaction time.  This could be substantially different from the true exchange rate if downtime was long.
* The Volume Weighted Average may differ from your idea of the appropriate market price at a given moment. Baron grabs the USD/BTC exchange rate every 5 minutes from Bitstamp's API.  For the sake of simplicity it uses Bitstamp's volume weighted average price (vwap). The vwap changes slowly so querying every 5 minutes is usually adequate for the purpose of minimizing the rate growth of the ticker database.  The trouble with this is at times of major market movement the vwap may differ from what people consider to be an appropriate market price.  We are willing to consider alternative methods to obtain price data or to allow supplying your own method in configuration.

## Security

Posting an invoice to Baron or the webhook callbacks to inform apps of payment activity can expose shared secrets to hostile attackers if that intra-app communication is trasmitted without encryption over a public network. An eavesdropper who steals the `api_key` can cause trouble for the Baron deployment.  If an attacker steals the webhook `token` they could possibly fool the application into believing a payment has occurred when it really did not.

Ideally the app and Baron would be on the same local network. If separated by a public network you are highly advised protect the communication between the two apps with HTTP SSL or VPN.

## Additional Information

### Invoices
![Invoice Screenshot](http://i.imgur.com/zSEXWwx.png)
Invoices allow a person to receive payment for goods or services in BTC. The invoice can be created in USD for a fixed price invoice or in BTC. USD invoices are converted to BTC at time of payment using the current exchange rate for BTC. 

After an invoice is created, it can be viewed by going to the /invoices/:invoiceId route. For example:
```sh
http://localhost:8080/invoices/8c945af08f257c1417f4c21992586d33
```

### Invoice Data Model
Invoices have the following properties:
* `api_key` - The API key for Baron to verify that invoice creator is trusted <sup>[1]</sup>
* `currency` - Currency of the invoice, can be either USD or BTC
* `min_confirmations` - Minimum confirmations before a payment is considered paid
* `title` - ***(optional)*** Title to display at the top of invoices
* `text`- ***(optional)*** Text to display at the bottom of invoices, may include HTML links
* `expiration`- ***(optional)*** Expiration time for invoice (unix timestamp)
* `webhooks` - ***(optional)*** An object containing event webhooks <sup>[2]</sup>
* `metadata` - ***(optional)*** Container for arbitrary fields, the entire object is passed back to your app in the webhooks.  This can be helpful for apps that do not track invoice ID's.
  * `id` - ***(special)*** If provided, a submission with an identical metadata.id will return the existing matching invoice instead of creating a new invoice.
* `line_items` - Array storing line items
  * `description` - Line item description text
  * `quantity` - Quantity of the item purchased
  * `amount` - The unit cost of the line item <sup>[3]</sup>

**NOTES**
* <sup>[1]</sup> The api_key is not stored with the invoice, it is just used for Baron to verify that the invoice creator is trusted.  The api_key of the submitted invoice is compared against the `baronAPIKey` property in config.js.
* <sup>[2]</sup> See the [Webhooks](#webhooks) section below for a more detailed description
* <sup>[3]</sup> Line item amounts are stored in whatever currency the invoice is set to.

An example of a new Invoice object:
```js
var newInvoice = {
    "api_key" : "268f84b93a69bbdf4c5f37dd67196eac75fdcda86dad301cc3fb4aed0670c2cb",
    "currency" : "BTC",
    "min_confirmations" : 3,
    "expiration" : 1399997753000, // Optional
    "webhooks" : { // Optional
      "token" : "268f84b93a69bbd",
      "paid" : { "url": "http://example.com/notifypaid" }
    },
    "metadata" : { // Optional
      "id" : "someuser@example.com"
    },
    "line_items" : [
        {
            "description" : "Foo",
            "quantity" : 2,
            "amount" : 0.125
        }, 
        {
            "description" : "Bar",
            "quantity" : 1,
            "amount" : 2.5
        }
    ]
};
```

### Creating an Invoice
Invoices can be created by doing a **POST** of the newInvoice object to /invoices route. For example:
```sh
http://localhost:8080/invoices
```

### Payments
![Payment Screenshot](http://i.imgur.com/2uKMutF.png)
Payments are created when the 'Pay Now' button on an invoice is clicked. User's are redirected to a view that displays the payment information such as amount due, address and QR Code for fulfillment of the invoice.

When a user's payment reaches the invoice's minimum confirmations, the payment is considered to be in the 'paid' status. Baron also handles other payment statuses:

| Status   | Description                                                          |
|----------|----------------------------------------------------------------------|
|`Paid`    | When the received payment fully pays off an invoice                  |
|`Overpaid`| When the received payment pays more than the invoice required        |
|`Parital` | When the received payment pays less than the invoice required        |
|`Unpaid`  | Payments are unpaid when initially created                           |
|`Pending` | Payments are pending until they reach the invoices min confirmations |
|`Invalid` | Payments that have been reorged or double spent                      |

Payments can be viewed by going to the /pay/:invoiceId route. For example:
```sh
http://localhost:8080/pay/8c945af08f257c1417f4c21992586d33
```

### Advanced Payment Handling
Baron is able to handle when a bitcoin transaction is reorged, double spent, or mutated. Admins will be emailed if Baron detects an invalid transaction. This is an example of an invoice with an invalid transaction:
![Invalid Payment Screenshot](http://i.imgur.com/xPTm4Le.png)

Baron is also able to handle partial payments. When a payment only partially fulfills an invoice the user can click the 'Pay Now' button again, this will create a new payment with the remaining balance. If the user has script enabled the payment page will automatically refresh with an updated remaining balance and payment address. Alternatively user's can also send multiple payments to the same address. 

This is an example of an invoice that was paid in full by two separate payments:
![Partial Payment Screenshot](http://i.imgur.com/eG1SAaM.png)

## Webhooks
Baron is capable of doing a ***POST*** to a url when a payment event occurs. A payment event is when a payment goes from one status to another. If a payment was to go from `unpaid` to `paid` status this would trigger the webhook stored in `newInvoice.webhooks.paid`. Here is a full list of supported webhooks:

```js
var newInvoice = {
  //...
  "webhooks": {
    "token": "93a69bbdf4c5f37dd6"
    "paid": { "url": "http://example.com/notifypaid" },
    "partial": { "url": "http://example.com/notifypartial" },
    "invalid": { "url": "http://example.com/notifyinvalid" },
    "pending": { "url": "http://example.com/notifypending" }
  }
  //...
};
```
* `token` - Secret token is posted to the webhook.  This is typically used to authenticate the connection when Baron posts the status notification to the webhook.  Identifying information about the Invoice may optionally be passed within the `metadata` field, described above.
* `url` - The url Baron should ***POST*** to when the payment event occurs

### Webhook Verification
The app notified by the webhook can trust the incoming payment notification because it contains a matching webhook `token` that was set when the Invoice was created. Further information about the Invoice can optionally be queried from Baron via the `/api/invoices/:invoiceId` route.  For example, the Invoice can be verified as paid if `is_paid` is `true`.  Note that this intra-app communication can be at risk if transmitted unencrypted over the Internet.
