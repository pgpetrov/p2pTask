'use strict';

const readline = require('readline');
const net = require('net');
const toPort = require('hash-to-port');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const serverPort = 8124;

const myName = process.argv[2];
const trace = process.argv[3] || 0;
const roomName = process.argv[4] || 'room1';
const serverIp = process.argv[5] || '172.30.50.78';// '192.168.0.97'my home network ip
const peers = {};
let history = [];
let isHost;
let mainServerSocket;

const myPort = toPort(myName);

console.log(`myPort is ${myPort}`);

const broadcast = function (msg) {
  history.push(msg);
  Object.keys(peers).forEach((key) => {
    peers[key].clientSocket.write(`${msg};`);
  });
  if (trace) console.log(Object.keys(peers));
};

const populateAndPrintHistory = function (h) {
  history = h;
  history.forEach((x) => { console.log(x); });
};

const populateAndConnectToAllPeers = function (objArray, hostSocket) {
  objArray.forEach((x) => {
    // peers[x] = {};
    peers[x.ipPort] = {
      name: x.name,
    };
  });
  Object.keys(peers).forEach((x, i) => {
    // Don't connect to host.
    if (i === 0) {
      peers[x].clientSocket = hostSocket;
    } else {
      const s = new net.Socket();
      if (trace) console.log('inside for -> ' + x);
      const thisHost = x.split(':')[0];
      const thisPort = x.split(':')[1];
      s.connect({ port: thisPort, host: thisHost }, () => {
        if (trace) console.log('inside connect -> ' + x);
        peers[x].clientSocket = s;
        s.write(`IAM|client|${myName}|${myPort};`);
        s.on('data', (data) => {
          const myData = data.toString();
          myData.split(';').forEach((splitData) => {
            if (splitData.length > 0) {
              console.log(splitData);
              history.push(splitData);
            }
          });
        });
        s.on('close', () => {
          console.log(`system> ${peers[x].name} disconnected`);
          history.push(`system> ${peers[x].name} disconnected`);
          delete peers[x];
        });
      });
    }
  });
};

const server = net.createServer((c) => {
  const connectionIp = c.remoteAddress.split(':')[3];
  let connectionPort = '';
  let comingFromServer = false;

  // someone connected to us
  c.on('data', (data) => {
    const myData = data.toString();
    if (trace) console.log(myData);
    myData.split(';').forEach((splitData) => {
      const type = splitData.split('|')[0];
      switch (type) {
        case 'newGuest': {
          if (comingFromServer) {
            const newGuestIp = splitData.split('|')[1];
            const newGuestName = splitData.split('|')[2];
            const newGuestPort = splitData.split('|')[3];
            const guestSocket = new net.Socket();
            guestSocket.connect({ port: newGuestPort, host: newGuestIp }, () => {
              if (trace) console.log('inside connect -> ' + newGuestIp);

              if (trace) console.log(newGuestIp);

              guestSocket.on('data', (chatData) => {
                const myChatData = chatData.toString();
                myChatData.split(';').forEach((mySplitChatData) => {
                  if (mySplitChatData.length > 0) {
                    console.log(mySplitChatData);
                    history.push(mySplitChatData);
                  }
                });
              });

              guestSocket.on('error', (err) => {
                if (trace) console.log('guest socket error -> ' + err);
              });

              guestSocket.on('close', () => {
                if (trace) console.log('inside close -> ' + newGuestIp);
                if (trace) console.log(Object.keys(peers));
                console.log('system> ' + peers[newGuestIp + ':' + newGuestPort].name + ' disconnected');
                history.push('system> ' + peers[newGuestIp + ':' + newGuestPort].name + ' disconnected');
                delete peers[newGuestIp+':' + newGuestPort];
                mainServerSocket.write(`disconnected|${newGuestIp}|${newGuestPort};`);
              });
              // send IAM message to help the client distinguish the connection
              guestSocket.write(`IAM|client|${myName}|${myPort};`);
              // send all peer ips till now. Probably we have to do it different way if we need names though.
              const arrToSend = [];
              Object.keys(peers).forEach((x) => {
                arrToSend.push({
                  ipPort: x,
                  name: peers[x].name,
                });
              });

              guestSocket.write((`historyPeers|${JSON.stringify(history)}|${JSON.stringify(arrToSend)};`), () => {
                peers[newGuestIp + ':' + newGuestPort] = {
                  clientSocket: guestSocket,
                  name: newGuestName,
                };
                console.log('system> ' + peers[newGuestIp + ':' + newGuestPort].name + ' connected');
                broadcast('system> ' + peers[newGuestIp + ':' + newGuestPort].name + ' connected');
              });
            });
          }
          break;
        }
        case 'historyPeers': {
          // Send all peer ips till now. Probably we have to do it different way if we need names though.
          populateAndPrintHistory(JSON.parse(splitData.split('|')[1]));
          populateAndConnectToAllPeers(JSON.parse(splitData.split('|')[2]), c);
          break;
        }
        case 'BECOMINGHOST': {
          // Command from server that we are promote to host.
          if (comingFromServer) {
            isHost = true;
            console.log(`system> ${myName} is host`);
            broadcast(`system> ${myName} is host`);
          }
          break;
        }
        case 'IAM': {
          // Command from everyone stating his name and port.
          comingFromServer = splitData.split('|')[1] === 'server';
          if (!comingFromServer) {
            connectionPort = splitData.split('|')[3];
            peers[connectionIp + ':' + connectionPort] = {
              name: splitData.split('|')[2],
              clientSocket: c,
            };
          } else {
            mainServerSocket = c;
          }
          break;
        }
        default:
          // Just chat.
          if (splitData.length > 0) {
            console.log(splitData);
            history.push(splitData);
          }
      }
    });
  });

  c.on('close', () => {
    if (trace) {
      console.log('-------');
      console.log(connectionIp + ':' + connectionPort);
      console.log(Object.keys(peers));
      console.log('-------');
    }
    if (peers[connectionIp + ':' + connectionPort]) {
      const name = peers[connectionIp + ':' + connectionPort].name;
      if (trace) console.log(name);
      delete peers[connectionIp + ':' + connectionPort];
      if (trace) console.log(name);
      if (trace) console.log('some server socket end');
      if (trace) console.log(Object.keys(peers).forEach((x) => { console.log(x + ' -> ' + peers[x].name); }));
      console.log(`system> ${name} disconnected`);
      history.push(`system> ${name} disconnected`);
    }

    if (isHost) {
      mainServerSocket.write(`disconnected|${connectionIp}|${connectionPort};`);
    }
  });
});

server.listen(myPort, () => {
  console.log('server bound');
});

server.on('error', (err) => {
  console.log(`server error ${err}`);
  throw err;
});

rl.on('line', (input) => {
  if (input === 'exit') {
    Object.keys(peers).forEach((key) => {
      peers[key].clientSocket.end();
      peers[key].clientSocket.destroy();
    });
    server.close();
    process.exit();
  } else {
    broadcast(`${myName}: ${input}`);
  }
});

const client = new net.Socket();
// connect to server
client.connect({ port: serverPort, host: serverIp }, () => {
  // get response from the server.
  client.on('data', (data) => {
    const myData = data.toString();
    myData.split(';').forEach((spitData) => {
      const type = spitData.split('|')[0];
      switch (type) {
        case 'host': {
          console.log(`system> ${myName} is host`);
          broadcast(`system> ${myName} is host`);
          isHost = true;
          break;
        }
        case 'guest': {
          const ip = spitData.split('|')[2];
          const port = spitData.split('|')[4];
          const name = spitData.split('|')[3];
          // just save the hostip and name among the peers
          peers[ip + ':' + port] = {
            name: name,
          };
          // we do nothing more here. Server will notify the host about us.
          break;
        }
        default:
      }
      client.end();
      client.destroy();
    });
  });
  // Say we are new client. State name and room.
  client.write(`new|${myName}|${roomName}|${myPort};`);
});
