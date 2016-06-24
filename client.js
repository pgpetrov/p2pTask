"use strict";

var readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

var myName = process.argv[2]
  , trace =  process.argv[3] || 0
  , roomName = process.argv[4] || "room1"
  , serverIp = process.argv[5] || "172.30.50.78" //"192.168.0.97"my home network ip
  , peers = {}
  , history = []
  , myIp
  , server
  , isHost
  , mainServerSocket;

var net = require('net')

server = net.createServer((c) => {
  let comingIp = c.remoteAddress.split(':')[3];
  var comingFromServer = comingIp == serverIp;
  if (trace) console.log(comingIp);
  if(!comingFromServer) {
    // we have new connection not coming from the server. Record it.
    if (!peers[comingIp]) {
      peers[comingIp] = {
        clientSocket : c
      };
    }
  } else {
    // We will need this if we are host.
    mainServerSocket = c;
  }

  // someone connected to us
  c.on('data', function(data){
    data = data.toString();
    if (trace) console.log(data);
    data.split(';').forEach(function(data) {
      var type = data.split('|')[0];
      switch (type) {
        case "newGuest":
          if (comingFromServer) {
            var newGuestIp = data.split('|')[1];
            var newGuestName = data.split('|')[2];
            var guestSocket = new net.Socket();
            //TODO newGusetIp invvalid
            guestSocket.connect({port: 8125, host: newGuestIp}, function() {
              if (trace) console.log("inside connect -> " + newGuestIp);

              if (trace) console.log(newGuestIp);


              guestSocket.on('data', function(data){
                data = data.toString();
                data.split(';').forEach(function(data) {
                  if (data.length > 0) {
                    console.log(data);
                    history.push(data);
                  }
                });
              });

              guestSocket.on('error', function(err){
                 if (trace) console.log("guest socket error -> " + err);
              });

              guestSocket.on('close', function(){
                  if (trace) console.log("inside close -> " + newGuestIp);
                  if (trace) console.log(Object.keys(peers));
                 // peers[newGuestIp].name
                 console.log("system> "+peers[newGuestIp].name+" disconnected");
                 history.push("system> "+peers[newGuestIp].name+" disconnected");
                 delete peers[newGuestIp];
                 mainServerSocket.write("disconnected|" + newGuestIp + ";");
              });

              //send all peer ips till now. Probably we have to do it different way if we need names though.
              guestSocket.write(("historyPeers|"+JSON.stringify(history) + "|" + JSON.stringify(Object.keys(peers)) + ";"), function(){
                  peers[newGuestIp] = {
                    clientSocket : guestSocket,
                    name : newGuestName
                  };
                  console.log("system> "+peers[newGuestIp].name+" connected");
                  broadcast("system> "+peers[newGuestIp].name+" connected");
              });
            });
          }
          break;
        case "historyPeers":
          // Send all peer ips till now. Probably we have to do it different way if we need names though.
          populateAndPrintHistory(JSON.parse(data.split('|')[1]));
          populateAndConnectToAllPeers(JSON.parse(data.split('|')[2]), c);
          break;
        case "BECOMINGHOST":
          // Command from server that we are promote to host.
          if (comingFromServer) {
            isHost = true;
            console.log("system> "+myName+" is host");
            broadcast("system> "+myName+" is host");
          }
          break;
        case "MYNAMEIS":
          // Command from everyone stating his name.
          peers[comingIp].name = data.split('|')[1];
          break;
        default:
          // Just chat.
          if (data.length > 0) {
            console.log(data);
            history.push(data);
          }
      }

    })
  });

  c.on('close', function(){
    var name = peers[comingIp].name;
    if (trace) console.log(name);;
    if (peers[comingIp]) {
     delete peers[comingIp];
    }
    if (trace) console.log(name);
    if (trace) console.log("some server socket end");
    if (trace) console.log(Object.keys(peers).forEach(function(x,i){console.log(x + " -> " + peers[x].name);}));
    console.log("system> "+name+" disconnected");
    broadcast("system> "+name+" disconnected");
  });
});

server.listen(8125, () => {
  console.log('server bound');
});

server.on('error', (err) => {
  console.log("server error " + err);
  throw err;
});


rl.on('line', (input) => {
  if (input == "exit") {
    Object.keys(peers).forEach(function(key, idx) {
      peers[key].clientSocket.end();
      peers[key].clientSocket.destroy();
    });
    server.close();
    process.exit();
  } else {
    broadcast(myName + ": " + input);
  }
});


var broadcast = function (msg){
  history.push(msg);
  Object.keys(peers).forEach(function(key, idx) {
    peers[key].clientSocket.write(msg+";");
  });
}

var populateAndPrintHistory = function(h){
    history = h;
    history.forEach((x) => {console.log(x)});
}

var populateAndConnectToAllPeers = function(ipArray,  hostSocket) {
  ipArray.forEach(function(x) {
    peers[x] = {};
  });
  Object.keys(peers).forEach(function(x,i) {
    // Don't connect to host.
    if (i == 0) {
      peers[x].clientSocket = hostSocket;
    } else {
      let s = new net.Socket();
      if (trace) console.log("inside for -> " + x);
      s.connect({port: 8125, host: x}, function() {
          if (trace) console.log("inside connect -> " + x);
          peers[x].clientSocket = s;
          s.write("MYNAMEIS|"+myName);
          s.on('data', function(data){
            data = data.toString();
            data.split(';').forEach(function(data) {
              if (data.length > 0) {
                console.log(data);
                history.push(data);
              }
            });
          });
          s.on('close', function(){
            //peers[x].name
            console.log("system> "+peers[x].name+" disconnected");
            history.push("system> "+peers[x].name+" disconnected");
            delete peers[x];
          });
        });
    }
  });
}


var client = new net.Socket();
//connect to server
client.connect({port: 8124, host: serverIp}, function() {
  // get response from the server.
  client.on('data', function(data) {
    data = data.toString();
    data.split(';').forEach(function(data) {
      var type = data.split('|')[0];
      myIp = data.split('|')[1];
      switch (type) {
        case "host":
          console.log("system> " + myName + " is host");
          broadcast("system> " + myName + " is host");
          break;
        case "guest":
          //just save the hostip among the peers
          peers[data.split('|')[2]] = {
            name : data.split('|')[3]
          };
          //we do nothing more here. Server will notify the host about us.
          break;
        default:
      }
      client.end();
      client.destroy();
    });
  });
  // Say we are new client. State name and room.
  client.write("new|" + myName + "|" + roomName + ";");
});
