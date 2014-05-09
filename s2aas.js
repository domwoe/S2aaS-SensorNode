
// Sensor's bitcoin address
// Hardcoded for now
var btcAddress = 'mxjr2jvmbNFjQHA8qQ7FkE7jCX7E1jqWrK'

// Needed to connect to secured websocket server
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
// Require websocket client. Later used to get instant payment notification.
var WebSocketClient = require('websocket').client;

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
    	message = message.toString();
    	message = message.replace(/\\/g, '');
    	message = JSON.parse(message);
        console.log('Received message of typ: '+message.event );
        if (message.event == 'transactions:create') {
            var sender = message.data.inputs[0].from_address;
            var data = message.data.outputs;
            for(var i = 0; i<data.length; i++) {
            	if (data[i].to_address == btcAddress) {
            		console.log('Received '+data[i].value+' satoshis from '+sender)
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
    requestPaymentNotification(btcAddress);
});

client.connect('wss://ws.biteasy.com/testnet/v1');