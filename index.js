const path = require('path');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const mpesa = require('./services/mpesa');
const { startDatabase } = require('./db');
const { registerRoutes } = require('./routes');
const { attachMpesaRealtime } = require('./services/stkServer');

const app = express();
const port = Number(process.env.PORT) || 3001;
const server = http.createServer(app);
const { startStkWatcher } = attachMpesaRealtime(server, mpesa);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
registerRoutes(app, { startStkWatcher });

startDatabase().catch((err) => {
  console.error('Database startup error:', err);
  process.exit(1);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});
