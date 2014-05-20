# Baron [![Gitter chat](http://img.shields.io/badge/gitter-slickage%2Fbaron-1dce73.svg?style=flat)](https://gitter.im/slickage/baron)[![Build Status](http://img.shields.io/travis/slickage/baron.svg?style=flat)](https://travis-ci.org/slickage/baron)
Baron is a bitcoin payment processor that makes it easy to manage bitcoin transactions. 

* Allows for invoice creation in USD or BTC
* Invoice balances created in USD are converted to BTC at time of payment
* Records BTC exchange rates when payments are made
* Keeps a history of all invoices and payments

## External Dependencies
* [node](http://nodejs.org)
* [couchdb](http://wiki.apache.org/couchdb/Installation)
* [bitcoin](https://bitcoin.org/en/download)
* [insight-api](https://github.com/bitpay/insight-api)
* [foreman](https://github.com/ddollar/foreman)
* [nodemon](https://github.com/remy/nodemon)

## Installation and Running
Clone the repository:
```sh
$ git clone https://github.com/slickage/baron.git
```

Change directories to Baron and install dependencies:
```sh
$ npm install
```

### Baron Configuration
Configurations can be changed in the config.js file in the root of Baron.
```js
var config = {
  couchdb: {
    url: process.env.DB_URL || 'http://localhost:5984',
    name: process.env.DB_NAME || 'baron'
  },
  bitcoind:  {
    host: process.env.BITCOIND_HOST || 'localhost',
    port: process.env.BITCOIND_PORT || 18332,
    user: process.env.BITCOIND_USER || 'username',
    pass: process.env.BITCOIND_PASS || 'password'
  },
  insight: {
    host: process.env.INSIGHT_HOST || 'localhost',
    port: process.env.INSIGHT_PORT || '3001',
    protocol: process.env.INSIGHT_PROTOCOL || 'http'
  },
  port: process.env.PORT || 8080,
  baronAPIKey: process.env.BARON_API_KEY || 'youshouldreallychangethis',
  chainExplorerUrl: process.env.CHAIN_EXPLORER_URL || 'http://tbtc.blockr.io/tx/info',
  updateWatchListInterval: process.env.UPDATE_WATCH_LIST_INTERVAL || 15000,
  lastBlockJobInterval: process.env.LAST_BLOCK_JOB_INTERVAL || 15000,
  webhooksJobInterval: process.env.WEBHOOKS_JOB_INTERVAL || 15000,
  paymentValidForMinutes: process.env.PAYMENT_VALID_FOR_MINUTES || 5,
  trackPaymentUntilConf: process.env.TRACK_PAYMENT_UNTIL_CONF || 100
};
```

* `couchdb` - Database connection configs
* `bitcoind` - Bitcoin client connetion configs
* `insight` - Insight connection configs
* `port` - The port that Baron should run on
* `baronAPIKey` - A secret key that is used to validate invoice creation <sup>[1]</sup>
* `chainExplorerUrl` - A link to the tx route of a chain explorer
* `updateWatchListInterval` - How often the watched payments job should run in ms
* `lastBlockJobInterval` - How often the last block job should run in ms
* `webhooksJobInterval` - How often the webhooks job should run in ms
* `paymentValidForMinutes` - How long before exchange rate refreshes for payment
* `trackPaymentUntilConf` - How long to watch payments for before no longer updating

**NOTES:** 
* <sup>[1]</sup> The `baronAPIKey` can be generated using `node generatetoken.js stringToHash`. 
* Properties in config.js can be overriden using a [.env](http://ddollar.github.io/foreman/#ENVIRONMENT) file and [foreman](https://github.com/ddollar/foreman).

### Bitcoin Configuration
Modify bitcoin's [bitcoin.conf](https://en.bitcoin.it/wiki/Running_Bitcoin#Bitcoin.conf_Configuration_File):
```sh
# (optional) connects bitcoin client to testnet
testnet=1

# allows json-rpc api calls from Baron
server=1

# these should match your config or .env bitcoind username and password
rpcuser=username
rpcpassword=password
```

### Running Baron
First ensure that both insight-api and bitcoin are running and that their connection properties are correctly set in Baron's config.

Running Baron with [node](http://nodejs.org)
```sh
$ node server.js
```

Running Baron with [foreman](https://github.com/ddollar/foreman) and [nodemon](https://github.com/remy/nodemon)
```sh
$ foreman start -f Procfile-dev
```

## Additional Information

### Invoices
![Invoice Screenshot](http://i.imgur.com/9tmBLZL.png)
Invoices allow a person to receive payment for goods or services in BTC. The invoice can be created in USD for a fixed price invoice or in BTC. USD invoices are converted to BTC at time of payment using the current exchange rate for BTC. 

After an invoice is created, it can be viewed by going to the /invoices/:invoiceId route. For example:
```sh
http://localhost:8080/invoices/8c945af08f257c1417f4c21992586d33
```

### Invoice Data Model
Invoices have the following properties:
* `access_token` - The API key for Baron to verify that invoice creator is trusted <sup>[1]</sup>
* `currency` - Currency of the invoice, can be either USD or BTC
* `min_confirmations` - Minimum confirmations before a payment is considered paid
* `expiration` ***(optional)*** - Expiration time for invoice (unix timestamp)
* `webhooks` - ***(optional)*** An object containing event webhooks <sup>[2]</sup>
* `line_items` - Array storing line items
  * `description` - Line item description text
  * `quantity` - Quantity of the item purchased
  * `amount` - The unit cost of the line item <sup>[3]</sup>

**NOTES:**
* <sup>[1]</sup> The access token is not stored with the invoice, it is just used for Baron to verify that the invoice creator is trusted. This access token must match the `baronAPIKey` property in config.js.
* <sup>[2]</sup> See the [Webhooks](#webhooks) section below for a more detailed description
* <sup>[3]</sup> Line item amounts are stored in whatever currency the invoice is set to.

An example of a new Invoice object:
```js
var newInvoice = {
    "access_token" : "268f84b93a69bbdf4c5f37dd67196eac75fdcda86dad301cc3fb4aed0670c2cb",
    "currency" : "BTC",
    "min_confirmations" : 3,
    "expiration" : 1399997753000, // Optional
    "webhooks" : { // Optional
      "paid": { "url": "http://somesite.com/notifypaid", "token": "268f84b93a69bbd" }
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
![Payment Screenshot](http://i.imgur.com/ipEhRmg.png)
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

### Payment Data Model
Payments have the following properties:
* `invoice_id` - Invoice that this payment is associated with
* `address` - Address to send BTC to
* `amount_paid` - Stores the amount that was paid (Always stored in BTC)
* `expected_amount` - Stores the amount that the payment expects to receive
* `block_hash` - Stores the blockhash that the transaction was confirmed into
* `spot_rate` - Stores the exchange rate at the time of payment
* `status` - The status of this payment (paid, unpaid, partial, overpaid, pending, invalid)
* `tx_id` - Stores the transaction ID from bitcoind
* `watched` - Indicates if the payment is actively being watched by Baron
* `created` - Time the payment was created
* `paid_timestamp` - Time that payment became 'paid' status
* `reorg_history` - When applicable, contains the history of block hashes that the transaction was reorged out of
* `double_spent_history` - When applicable, contains the history of transaction ID's that double spent this payment

**NOTE:** This is just for reference, all payments are created and handled internally by Baron.

### Advanced Payment Handling
Baron is able to handle when a bitcoin transaction is reorged, double spent, or mutated. For example:
![Invalid Payment Screenshot](http://i.imgur.com/YzszBcQ.png)

Baron is also able to handle partial payments. When a payment only partially fulfills an invoice the user can click the 'Pay Now' button again, this will create a new payment with the remaining balance. If the user has script enabled the payment page will automatically refresh with an updated remaining balance and payment address. Alternatively user's can also send multiple payments to the same address. 

This is an example of an invoice that was paid in full by two separate payments:
![Partial Payment Screenshot](http://i.imgur.com/sKAsBFu.png)

### Webhooks
Baron is capable of doing a ***POST*** to a url when a payment event occurs. A payment event is when a payment goes from one status to anther. If a payment was to go from `unpaid` to `paid` status this would trigger the webhook stored in `newInvoice.webhooks.paid`. Here is a full list of supported webhooks:

```js
var newInvoice = {
  //...
  "webhooks": {
    "paid": { "url": "http://somesite.com/notifypaid", "token": "93a69bbdf4c5f37dd6" }
    "partial": { "url": "http://somesite.com/notifypartial", "token": "93a69bbdf4c5f37dd6" }
    "invalid": { "url": "http://somesite.com/notifyinvalid", "token": "93a69bbdf4c5f37dd6" }
    "pending": { "url": "http://somesite.com/notifypending", "token": "93a69bbdf4c5f37dd6" }
  }
  //...
};
```

* `url` - The url Baron should ***POST*** to when the payment event occurs
* `token` - A token that the invoice creating app is aware of

## Webhook Tokens
We're making some changes to webhook tokens, please check back later...

## License
MIT
