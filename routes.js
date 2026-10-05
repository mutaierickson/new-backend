const catalogRoutes = require('./routes/catalog');
const salesRoutes = require('./routes/sales');
const paymentRoutes = require('./routes/payments');
const reportRoutes = require('./routes/reports');
const smsRoutes = require('./routes/sms');
const returnRoutes = require('./routes/returns');
const voidRoutes = require('./routes/voids');
const stockRoutes = require('./routes/stock');

function registerRoutes(app, { startStkWatcher }) {
  app.use('/api', catalogRoutes);
  app.use('/api', salesRoutes);
  app.use('/api', returnRoutes);
  app.use('/api', voidRoutes);
  app.use('/api', stockRoutes);
  app.use('/api', paymentRoutes({ startStkWatcher }));
  app.use('/api', reportRoutes);
  app.use('/api', smsRoutes);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
  });
}

module.exports = { registerRoutes };
