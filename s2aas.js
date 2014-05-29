
// Requester's bitcoin address
// Hardcoded for now
var myBtcAddress = 'mnDWsWKiyPwKFDpSGJDTvMbFiAG8CZNTgg'
var myPrivateKey = '91dTHBam7ryXrqtzqnL46ksGyvEMs4EZvzu4zrEWFWAEguSovKY';

var sensorRepository = 'http://213.165.92.187:3000'


// Needed to connect to secured websocket server
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
// Require websocket client. 
// Later used to get instant payment notification.
var WebSocketClient = require('websocket').client;
var request = require('request');

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.use(express.static(__dirname+'/public'));

io.on('connection', function(socket){
  console.log('Client connected');
  socket.on('createTx', function(data) {
    sensor = JSON.parse(data);
    console.log(data);
    var receiverAddr = sensor.btcAddress;
    var amount = sensor.price;
    amount += amount*0.1
    get_unspent_txo(function(err, unspent) {
    if (err) {
        console.log(err);
    }
    else {
        create_tx(receiverAddr,amount,unspent,function(tx) {
            push_tx(tx);
            console.log(tx);
        });
    }
})
  })
});

http.listen(3001, function(){
  console.log('listening on *:3001');
});




var bitcore = require('bitcore');
var Transaction = bitcore.Transaction;
var Address = bitcore.Address;
var networks = bitcore.networks;
var WalletKey = bitcore.WalletKey;

var s = new WalletKey({
      network: networks.testnet,
});
s.fromObj({ priv: myPrivateKey});
var o = s.storeObj();



var pushTxEndpoint = 'http://tbtc.blockr.io/api/v1/tx/push';
var unspentTxoEndpoint = 'http://tbtc.blockr.io/api/v1/address/unspent/';
var wsNotificationEndpoint = 'wss://ws.biteasy.com/testnet/v1';

// --------------------------------------------------------
// Unconfirmed tx notification via websocket
// --------------------------------------------------------
var client = new WebSocketClient();

client.on('connectFailed', function(error) {
    console.log('Connect Error: ' + error.toString());
});

client.on('connect', function(connection) {
    console.log('WebSocket client connected');
    connection.on('error', function(error) {
        console.log("Connection Error: " + error.toString());
    });
    connection.on('close', function() {
        console.log('echo-protocol Connection Closed');
    });
    connection.on('message', function(message) {
    	var message = message.utf8Data;
        console.log(JSON.stringify(message));
    	message = message.toString();
    	message = message.replace(/\\/g, '');
    	message = JSON.parse(message);
        console.log(Date.now()+': Received message of typ: '+message.event );
        if (message.event == 'transactions:create') {
            var sender = message.data.inputs[0].from_address;
            var data = message.data.outputs;
            for(var i = 0; i<data.length; i++) {
            	if (data[i].to_address == myBtcAddress) {
            		console.log(Date.now()+': Received '+data[i].value+' satoshis from '+sender)
            	}
			}
        }
    });
    // Request notification if unconfirmed transaction
    // entailing btcAddress appears on the network
    function requestPaymentNotification(btcAddress) {
        if (connection.connected) {
            var json = {
    			"event": "transactions:create",
    			"filters": {
        			"addresses": [btcAddress],
        			"confidence": "UNCONFIRMED"
    			}
			}
            connection.sendUTF(JSON.stringify(json));
            //setTimeout(sendNumber, 1000);
        }
    }
    requestPaymentNotification(myBtcAddress);
});

client.connect(wsNotificationEndpoint);
// --------------------------------------------------------

// --------------------------------------------------------
// Create tx to pay sensor and publish it to network
// --------------------------------------------------------

// Get unspent tx outputs
function get_unspent_txo(callback) {
    request({
        url: unspentTxoEndpoint+myBtcAddress,
        json: true
    }, function (error, response, body) {

        if (!error && response.statusCode === 200) {
            //console.log(JSON.stringify(body)) // Print the json response
            var unspent = body.data.unspent;
            var address = body.data.address;
            if (unspent.length > 0) {
                for (i=0;i<unspent.length;i++) { 
                    unspent[i].address = address;
                    unspent[i] = JSON.stringify(unspent[i]);
                    unspent[i] = unspent[i].replace(/"tx":/g, '"txid":');
                    unspent[i] = unspent[i].replace(/"n":/g, '"vout":');
                    unspent[i] = unspent[i].replace(/"script":/g, '"scriptPubKey":');
                    unspent[i] = JSON.parse(unspent[i]);
                }    
                callback(null,unspent);
            }
            else {
                callback(new Error('No unspent transactions outputs.'),null);
            }
        }
        else {
            callback(error,null);
        }
    })
}

// Publishing tx to network
function push_tx(tx) {
    request({
        url: pushTxEndpoint,
        method: 'POST',
        json: {"hex": tx},
        },     
        function (error, response, body) {
            // if (!error && response.statusCode == 200) {
            //     console.log(body.id) // Print the shortened url.
            // }
            console.log(Date.now()+': Publishing transaction...\n'+
                        'Status code: '+response.statusCode+'\n'+ 
                        ' Body: '+JSON.stringify(body)+'\n'+
                        ' Error: '+JSON.stringify(error)+'\n');
        }
    )
}

// Create tx

function create_tx(receiverAddr,amount,unspent,callback) {
    var TransactionBuilder = bitcore.TransactionBuilder;
    var outs = [{
            address: receiverAddr,
            amount: amount
          }];
    var opts = {
        remainderOut: {
            address: myBtcAddress
        },
        fee: amout*0.1
    }
    var keys = [];
    keys.push(o.priv); 

    var tx = new TransactionBuilder(opts)
            .setUnspent(unspent)
            .setOutputs(outs)
            .sign(keys)
            .build();  
    
    //console.log(tx);
    callback(tx.serialize().toString('hex'));
}

