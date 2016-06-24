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
            if (!rooms[clientRoom]) {
              //respond you are host now and send your ip. will be needed later. Closes the socket
              c.write(("host|"+guestIp + ";"), function() {c.destroy()});

              rooms[clientRoom] = {
                name : clientName,
                hostIp : guestIp,
                hostSocket : {},
                roomGuests : []
              };

              setupHostConnection(guestIp, clientName, clientRoom);

            } else {

              c.write("guest|" + guestIp + "|" + rooms[clientRoom].hostIp + "|" + rooms[clientRoom].name + ";");
              console.log("pushing " + clientName + " with ip " + guestIp);
              //guest came for this room. Send him the host ip.
              rooms[clientRoom].roomGuests.push({
                name : clientName,
                guestIp : guestIp
              });
              rooms[clientRoom].hostSocket.write(("newGuest|" + guestIp + "|" + clientName + ";"), function(){c.end()});
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
var setupHostConnection = function(guestIp, clientName, clientRoom) {

  var clientToHost = new net.Socket();
  clientToHost.connect({port: 8125, host: guestIp}, function() {
    console.log("connected to host");
    //update the host socket for that room
    rooms[clientRoom].hostSocket = clientToHost;

    //On host disconnect
    clientToHost.on('close', function() {
      console.log("OUCH host " + clientName + " for room " + clientRoom + " disconnected!");
      console.log(rooms[clientRoom].roomGuests);
      // Handle hosts disconnect
      if (rooms[clientRoom].roomGuests.length > 0) {
        //get the first guest and promote
        rooms[clientRoom].name = rooms[clientRoom].roomGuests[0].name;
        rooms[clientRoom].hostIp = rooms[clientRoom].roomGuests[0].guestIp;
        rooms[clientRoom].roomGuests.splice(0,1);
        console.log( rooms[clientRoom].name + " promoted to host for room " + clientRoom + "!");

        var client = new net.Socket();

        client.connect({port: 8125, host: rooms[clientRoom].hostIp}, function() {
          // Tell first guest he is the Host now.
          client.write("BECOMINGHOST|"+rooms[clientRoom].hostIp + ";");

          setupHostConnection(rooms[clientRoom].hostIp, rooms[clientRoom].name, clientRoom);
          // client.on("data", handleHostLogic(client));
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
          rooms[clientRoom].roomGuests.every(function(x,i){
            if(x.guestIp == removeIp) {
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
