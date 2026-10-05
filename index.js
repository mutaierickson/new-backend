const path = require('path');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const mpesa = require('./services/mpesa');
const { startDatabase, isReady, getStatus } = require('./db');
const { registerRoutes } = require('./routes');
const { attachMpesaRealtime } = require('./services/stkServer');

const app = express();
const port = Number(process.env.PORT) || 3001;
const server = http.createServer(app);
const { startStkWatcher } = attachMpesaRealtime(server, mpesa);

app.set('trust proxy', 1); // Render terminates HTTPS at its proxy; keeps req.protocol = 'https'.
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Health check: always answers, even if the database is down, so Render sees the port.
const health = (req, res) => {
  const status = getStatus();
  res.status(isReady() ? 200 : 503).json({ status: isReady() ? 'ok' : 'degraded', ...status });
};
app.get('/', (req, res) => res.json({ service: 'essentials-backend', ...getStatus() }));
app.get('/health', health);
app.get('/api/health', health);

// The M-Pesa callback doesn't touch the DB; everything else under /api needs it.
app.use('/api', (req, res, next) => {
  if (isReady() || /mpesa(\/stkpush)?\/callback/.test(req.path)) return next();
  res.status(503).json({ error: 'Database not ready', ...getStatus() });
});

registerRoutes(app, { startStkWatcher });

// Start listening immediately so Render's port scan succeeds regardless of DB state.
server.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});

// Connect to the database, retrying in the background instead of exiting the process.
const RETRY_MS = 15_000;
const connectDatabase = async () => {
  try {
    await startDatabase();
    console.log('Database ready.');
  } catch (err) {
    console.error(`Database startup error: ${err.message}`);
    console.error(`Retrying database connection in ${RETRY_MS / 1000}s...`);
    setTimeout(connectDatabase, RETRY_MS);
  }
};
connectDatabase();

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
