const { loadDashboard } = require('../models/dashboardModel');

async function show(req, res) {
  res.json(await loadDashboard(req.query.user_id));
}

module.exports = { show };
