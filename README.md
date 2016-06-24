# p2pTask

## Server
- Server for the new clients to register. To start ```node server.js```
  - On initial connecting expects format: new|<name>|roomname.
  - Responds for guest guest|guestIp|hostIp|hostName. Then brakes the connection.
  - Responds for host host|hostip. Then brakes the connection

- If the connector is chosen for host the server then initiates connection to him.
  Using this connection he sends "newGuest|guestIp|guestName message on new guest entering his room.

## Client
- Client to start in order to enter the chat. To start ```node client <name> [<1/0(debug on/off)> <roomName(default room1)> <serverIp>]```
  - Each client has all the capabilities to be host.
