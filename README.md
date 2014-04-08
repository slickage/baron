Baron
=========

Baron is a bitcoin payment processor that makes it easy to manage bitcoin transactions. 

* Allows for invoice creation in USD or BTC
* Invoice balances created in USD are converted to BTC at time of payment
* Records BTC exchange rates when payments are made
* Keeps a history of all invoices and payments

## Information

### Invoices

Invoices allow a person to receive payment for goods or services in BTC. The invoice can be created in USD for a fixed price invoice or in BTC. USD invoices are converted to BTC at time of payment using the current exchange rate for BTC. 

Invoices can be viewed by going to the /invoices/:invoiceId route. For example:
```sh
http://localhost:8080/invoices/305148c3f6b5c3944bbc92b8772b502f
```

### Invoice Data Model

Invoices have the following properties:
* ```currency``` - Can be either USD or BTC.
* ```min_confirmations``` - Minimum confirmations before a payment is considered paid
* ```balance_due``` - The total balance due for the invoice
* ```expiration``` ***(optional)*** - Expiration time for invoice (unix timestamp)
* ```line_items``` - Array storing line items
  * ```description``` - Line item description text
  * ```quantity``` - Quantity of the item purchased
  * ```amount``` - The unit cost of the line item

**NOTE:** Balance due and line item amounts are stored in whatever currency the invoice is set to. Expiration is an optional property that will make an invoice expire given unix timestamp.

An example of a new Invoice object:
```js
var newInvoice = {
    "currency" : "BTC",
    "min_confirmations" : 3,
    "balance_due" : 2.75,
    "expiration" : 1395827470173,
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
### Creating/Retrieving an Invoice

Invoices can be created by doing a **POST** of the newInvoice object to the following url:
```sh
http://localhost:8080/invoices
```

Alternatively, if Baron is being used as a module, invoices can be created internally using:

```js
baron.createInvoice(newInvoice, function(err, doc) {
  if (err) {
    res.write(err);
    res.end();
  }
  else {
    // Success
  }
});
```

Invoices with payments can be queried by invoiceId using:
```js
baron.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
  if (err) {
    res.write(err);
    res.end();
  }
  else {
    // Success
    console.log(invoice);
    console.log(paymentsArr)
  }
});
```

### Payments

Payments are created when an invoice is sent to another user and they click the 'Pay Now' button. This button takes the user to a view which has a payment address and QR Code to fufill the payment.

When the user's payment reaches the invoice's minimum confirmations, the payment is considered to be in the 'paid' status and the invoice is considered paid in full.

Payments can be viewed by going to the /pay/:invoiceId route. For example:
```sh
http://localhost:8080/pay/305148c3f6b5c3944bbc92b8772b502f
```

### Payment Data Model

Payments have the following properties:
* ```invoice_id``` - Invoice that this payment is associated with
* ```address``` - Address to send BTC to
* ```amount_paid``` - Stores the amount that was paid (Always stored in BTC)
* ```spot_rate``` - Stores the exchange rate at the time of payment
* ```status``` - The status of this payment (paid, unpaid, partial, overpaid, pending)
* ```tx_id``` - Stores the transaction ID from bitcoind
* ```ntx_id``` - Stores the normalized transaction ID from bitcoind
* ```created``` - Time the payment was created
* ```paid_timestamp``` - Time that payment became 'paid' status

**NOTE:** Payments are created and handled internally.

## Requirements

* [node](http://nodejs.org)
* [couchdb](http://wiki.apache.org/couchdb/Installation)
* [bitcoin](https://bitcoin.org/en/download)

## Installation

Clone the repository:
```sh
$ git clone https://github.com/slickage/baron.git
```

Change directories to baron and install dependencies:
```sh
$ npm install
```

Create 'baron' database in couchdb and then push views:
```sh
$ couchapp push couchapp.js http://localhost:5984/baron
```

Create a .env file and add bitcoin username and pass:
```sh
BITCOIND_USER=username
BITCOIND_PASS=password
```

Modify bitcoin's bitcoin.conf:
```sh
discover=0 # for testing, not for production
testnet=1 # for testing, not for production
server=1 # allows json-rpc api calls

# these should match your .env username and password
rpcuser=username
rpcpassword=password
```

Run baron
```sh
$ node server.js
```

Run baron with [foreman](https://github.com/ddollar/foreman) and [nodemon](https://github.com/remy/nodemon)
```sh
$ foreman start -f Procfile-dev
```

## Using Baron as a module

Baron can be run standalone or as a module of an existing node app. If an application is already using couchdb, Baron can easily be added as a dependency. 

Note: To use Baron as an extension of an existing application, that application must be using express with the ejs view engine.

Add the following properties to the main application's config.js:
```sh
  port: process.env.PORT || 8080,
  dbUrl: process.env.DB_URL || 'http://localhost:5984',
  bitcoind:  {
    host: process.env.BITCOIND_HOST || 'localhost',
    port: Number(process.env.BITCOIND_PORT) || 18332,
    user: process.env.BITCOIND_USER || 'username',
    pass: process.env.BITCOIND_PASS || 'password'
  }
```

Require Baron and initialize
```js
var express = require('express');
var app = express();
app.set('view engine', 'ejs');
app.use(express.bodyParser());

// Local config containing baron properties
var config = require('./config.js');

// Require baron and pass in your local config
var baron = require('baron')(config);

// Call baron init method and pass in your existing express app
baron.init(app);
```