const { allQuery, logAudit } = require('../db');

function list() {
  return allQuery(
    `SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 100`
  );
}

module.exports = { list, log: logAudit };
