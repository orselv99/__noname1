const WebSocket = require('ws');
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InNpZ25hbHVzZXJfMTAyOTM3MTMwNEBleGFtcGxlLmNvbSIsImV4cCI6MTc2NzM3OTQ4MywiaWF0IjoxNzY3Mzc1ODgzLCJzYWx0IjoiSGxzWVBoQm1henkxdDJxVEpUVE1tY28zbVZNaWErMU5saHBWSHNyTnV1QT0iLCJ1c2VyX2lkIjoiYWQwMGMwZGYtZTBhNy00N2U4LWJiOGYtOGZkNTE2NGIwYzgyIn0.GLB7qRted-XGmnX5CcFTbaL0gQpCJgI2WEmayc5-quo';
const wsUrl = 'ws://localhost:8080/api/v1/ws/signaling?token=' + token;

console.log('Connecting to ' + wsUrl);
const ws = new WebSocket(wsUrl);

ws.on('open', function open() {
  console.log('WS Open');
  // Send a signal
  ws.send(JSON.stringify({
    type: 1, // OFFER
    target_peer_id: 'some_other_id',
    sdp: 'dummy_sdp',
    ice_candidate: 'dummy_ice'
  }));
  
  // Close after short delay
  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 1000);
});

ws.on('message', function incoming(data) {
  console.log('WS Message: ' + data);
});

ws.on('error', function error(err) {
  console.error('WS Error: ' + err);
  process.exit(1);
});
