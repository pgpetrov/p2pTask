"use strict";
const net = require('net');
var rooms = {};
/**
* Setup server for initial registration for all the users.
* Expects and responds to message new|<clientName>|<clientRoom>
* Responds with guest|ip|hostip or host|ip
* Cloeses the socket. If Host connects to him after.
*
**/

const server = net.createServer((c) => {
  c.on('data', function(data) {
    data = data.toString();
    data.split(';').forEach(function(data) {
      console.log("server incoming -> " + data);
      var type = data.split('|')[0];
      //type|name|clientRoom
      switch (type) {
        case "new":
            let clientName = data.split('|')[1];
            let clientRoom = data.split('|')[2];
            let guestIp = c.remoteAddress.split(':')[3];
            let guestPort = data.split('|')[3];

            if (!rooms[clientRoom]) {
              //respond you are host now and send your ip. will be needed later. Closes the socket
              c.write(("host|"+guestIp + ";"), function() {c.end();c.destroy();});

              rooms[clientRoom] = {
                name : clientName,
                hostIp : guestIp,
                hostPort : guestPort,
                hostSocket : {},
                roomGuests : []
              };

              setupHostConnection(guestIp, clientName, clientRoom, guestPort);

            } else {
              // SENDING PORT
              c.write("guest|" + guestIp + "|" + rooms[clientRoom].hostIp + "|" + rooms[clientRoom].name + "|" + rooms[clientRoom].hostPort + ";");
              console.log("pushing " + clientName + " with ip " + guestIp + " and port " + guestPort);
              //guest came for this room. Send him the host ip.
              rooms[clientRoom].roomGuests.push({
                name : clientName,
                guestIp : guestIp,
                guestPort : guestPort
              });
              // SENDING PORT
              rooms[clientRoom].hostSocket.write(("newGuest|" + guestIp + "|" + clientName + "|" + guestPort +";"), function(){c.end();c.destroy();});
            }
          break;
        default:
          if (data.length > 0) {
            console.log(data);
          }
      }
    });
  });
});

// Function used when new host is chosen. Sets an event on close of that host to call self.
var setupHostConnection = function(guestIp, clientName, clientRoom, hostPort) {

  var clientToHost = new net.Socket();
  clientToHost.connect({port: hostPort, host: guestIp}, function() {
    console.log("connected to host");
    //update the host socket for that room
    rooms[clientRoom].hostSocket = clientToHost;
    clientToHost.write("IAM|server;")
    //On host disconnect
    clientToHost.on('close', function() {
      console.log("OUCH host " + clientName + " for room " + clientRoom + " disconnected!");
      console.log(rooms[clientRoom].roomGuests);
      // Handle hosts disconnect
      if (rooms[clientRoom].roomGuests.length > 0) {
        //get the first guest and promote
        rooms[clientRoom].name = rooms[clientRoom].roomGuests[0].name;
        rooms[clientRoom].hostIp = rooms[clientRoom].roomGuests[0].guestIp;
        rooms[clientRoom].hostPort = rooms[clientRoom].roomGuests[0].guestPort;
        rooms[clientRoom].roomGuests.splice(0,1);
        console.log( rooms[clientRoom].name + " promoted to host for room " + clientRoom + "!");

        var client = new net.Socket();

        client.connect({port: rooms[clientRoom].hostPort, host: rooms[clientRoom].hostIp}, function() {
          client.write("IAM|server;")
          // Tell first guest he is the Host now.
          client.write("BECOMINGHOST|"+rooms[clientRoom].hostIp + ";");
          setupHostConnection(rooms[clientRoom].hostIp, rooms[clientRoom].name, clientRoom, rooms[clientRoom].hostPort);
        });
        rooms[clientRoom].hostSocket=client;
      } else {
        console.log("Destroying " + clientRoom + " as no one is left!");
        // host left and no more guests. drop room.
        rooms[clientRoom] = undefined;
      }
    });

    // after connected to the host all messages we expect from him are regarding some guest disconnect.
    clientToHost.on('data', function(data) {
      data = data.toString();
      data.split(';').forEach(function(data) {
        var type = data.split('|')[0];
        if (type == "disconnected") {
          console.log("Host reports client disconnect: " + data);
          console.log(rooms[clientRoom].roomGuests);
          let removeIp = data.split('|')[1];
          let removePort = data.split('|')[2];
          rooms[clientRoom].roomGuests.every(function(x,i){
            if((x.guestIp == removeIp) && (x.guestPort == removePort)) {
              rooms[clientRoom].roomGuests.splice(i,1);
              return false;
            }
            return true;
          });
          console.log(rooms[clientRoom].roomGuests);
        }
      });
    });

  });




}


server.on('error', (err) => {
  throw err;
});
server.listen(8124, () => {
  console.log('server bound');
});
