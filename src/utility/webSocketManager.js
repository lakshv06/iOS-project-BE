const wsMap = new Map();

function addConnection(deviceIdentifier, ws) {
  console.log(`Adding connection for deviceIdentifier: ${deviceIdentifier}`);
  wsMap.set(deviceIdentifier, ws);
}

function removeConnection(deviceIdentifier) {
  wsMap.delete(deviceIdentifier);
}

function getConnection(deviceIdentifier) {
  console.log(`Getting connection for deviceIdentifier: ${deviceIdentifier}`);
  return wsMap.get(deviceIdentifier);
}

export { addConnection, removeConnection, getConnection };
