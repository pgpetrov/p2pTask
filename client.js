"use strict";

var readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const serverPort = 8124;
var toPort = require('hash-to-port');

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

const myPort = toPort(myName);

console.log("myPort is "+myPort);

var net = require('net')

server = net.createServer((c) => {
  let connectionIp = c.remoteAddress.split(':')[3];
  var connectionPort = "";
  var comingFromServer = false;

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
            var newGuestPort = data.split('|')[3];
            var guestSocket = new net.Socket();
            guestSocket.connect({port: newGuestPort, host: newGuestIp}, function() {
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
                 console.log("system> "+peers[newGuestIp+":"+newGuestPort].name+" disconnected");
                 history.push("system> "+peers[newGuestIp+":"+newGuestPort].name+" disconnected");
                 delete peers[newGuestIp+":"+newGuestPort];
                 mainServerSocket.write("disconnected|" + newGuestIp + "|" + newGuestPort + ";");
              });
              // send IAM message to help the client distinguish the connection
              guestSocket.write("IAM|client|" + myName + "|" + myPort + ";");
              // send all peer ips till now. Probably we have to do it different way if we need names though.
              let arrToSend = [];
              Object.keys(peers).forEach((x, i) => {
                arrToSend.push({
                  ipPort : x,
                  name : peers[x].name
                });
              });

              guestSocket.write(("historyPeers|"+JSON.stringify(history) + "|" + JSON.stringify(arrToSend) + ";"), function(){
                  peers[newGuestIp + ":" + newGuestPort] = {
                    clientSocket : guestSocket,
                    name : newGuestName
                  };
                  console.log("system> "+peers[newGuestIp + ":" + newGuestPort].name+" connected");
                  broadcast("system> "+peers[newGuestIp + ":" + newGuestPort].name+" connected");
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
        case "IAM":
          // Command from everyone stating his name and port.
          comingFromServer = data.split('|')[1] == "server";
          if (!comingFromServer) {
            connectionPort = data.split('|')[3];
            peers[connectionIp + ":" + connectionPort] = {
              name : data.split('|')[2],
              clientSocket : c
            }
          } else {
            mainServerSocket = c;
          }
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
    if (trace) {
      console.log("-------");
      console.log(connectionIp+":"+connectionPort);
      console.log(Object.keys(peers));
      console.log("-------");
    }

    if (peers[connectionIp+":"+connectionPort]) {
      var name = peers[connectionIp+":"+connectionPort].name;
      if (trace) console.log(name);
      delete peers[connectionIp+":"+connectionPort];
    }
    if (trace) console.log(name);
    if (trace) console.log("some server socket end");
    if (trace) console.log(Object.keys(peers).forEach(function(x,i){console.log(x + " -> " + peers[x].name);}));
    console.log("system> "+name+" disconnected");
    history.push("system> "+name+" disconnected");

    if (isHost) {
      mainServerSocket.write("disconnected|" + connectionIp + "|" + connectionPort + ";");
    }

  });
});

server.listen(myPort, () => {
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
  if (trace) console.log(Object.keys(peers));
}

var populateAndPrintHistory = function(h){
    history = h;
    history.forEach((x) => {console.log(x)});
}

var populateAndConnectToAllPeers = function(objArray,  hostSocket) {
  objArray.forEach(function(x) {
    // peers[x] = {};
    peers[x.ipPort] = {
      name : x.name
    };
  });
  Object.keys(peers).forEach(function(x,i) {
    // Don't connect to host.
    if (i == 0) {
      peers[x].clientSocket = hostSocket;
    } else {
      let s = new net.Socket();
      if (trace) console.log("inside for -> " + x);
      let thisHost = x.split(":")[0];
      let thisPort = x.split(":")[1];
      s.connect({port: thisPort, host: thisHost}, function() {
          if (trace) console.log("inside connect -> " + x);
          peers[x].clientSocket = s;
          s.write("IAM|client|"+myName + "|" + myPort + ";");
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
client.connect({port: serverPort, host: serverIp}, function() {
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
          isHost = true;
          break;
        case "guest":
          let ip = data.split('|')[2];
          let port = data.split('|')[4];
          let name = data.split('|')[3];
          //just save the hostip and name among the peers
          peers[ip + ":" + port] = {
            name : name
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
  client.write("new|" + myName + "|" + roomName + "|" + myPort +";");
});
