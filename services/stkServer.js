const { WebSocketServer } = require('ws');

function attachMpesaRealtime(server, mpesa) {
  const stkClients = new Map();
  const stkWatchers = new Map();

  const broadcastStk = (event) => {
    if (!event?.checkoutRequestId) return;
    const sockets = stkClients.get(event.checkoutRequestId);
    if (!sockets) return;
    const payload = JSON.stringify(event);
    for (const ws of sockets) {
      if (ws.readyState === 1) ws.send(payload);
    }
  };

  mpesa.setOnUpdate(broadcastStk);

  const startStkWatcher = (checkoutRequestId) => {
    if (!checkoutRequestId || stkWatchers.has(checkoutRequestId)) return;
    const started = Date.now();
    let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const record = await mpesa.queryStkStatus(checkoutRequestId);
        if (!record || record.status !== 'pending' || Date.now() - started > 95_000) {
          clearInterval(timer);
          stkWatchers.delete(checkoutRequestId);
          if (record && record.status === 'pending') mpesa.markTimedOut(checkoutRequestId);
        }
      } catch (error) {
        console.error('STK watcher error:', error.message);
      } finally {
        inFlight = false;
      }
    }, 3000);
    stkWatchers.set(checkoutRequestId, timer);
  };

  const wss = new WebSocketServer({ server, path: '/ws/mpesa' });
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type !== 'subscribe' || !msg.checkoutRequestId) return;
        ws.checkoutRequestId = msg.checkoutRequestId;
        if (!stkClients.has(msg.checkoutRequestId)) stkClients.set(msg.checkoutRequestId, new Set());
        stkClients.get(msg.checkoutRequestId).add(ws);
        const current = mpesa.getStk(msg.checkoutRequestId);
        if (current) ws.send(JSON.stringify(mpesa.toClientEvent(current)));
      } catch (error) {
        console.error('WebSocket message error:', error.message);
      }
    });
    ws.on('close', () => {
      const id = ws.checkoutRequestId;
      if (!id || !stkClients.has(id)) return;
      const sockets = stkClients.get(id);
      sockets.delete(ws);
      if (sockets.size === 0) stkClients.delete(id);
    });
  });

  return { startStkWatcher };
}

module.exports = { attachMpesaRealtime };
