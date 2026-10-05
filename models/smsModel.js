const { allQuery, runQuery } = require('../db');

function listCampaigns() {
  return allQuery(
    `SELECT c.id, c.user_id, u.username, c.title, c.message, c.recipient_count, c.sent_count, c.failed_count, c.status, c.created_at
     FROM sms_campaigns c LEFT JOIN users u ON u.id = c.user_id
     ORDER BY c.created_at DESC LIMIT 30`
  );
}

async function createCampaign({ userId, title, message, recipientCount }) {
  const inserted = await runQuery(
    `INSERT INTO sms_campaigns (user_id, title, message, recipient_count, sent_count, failed_count, status) VALUES (?, ?, ?, ?, 0, 0, ?) RETURNING id`,
    [userId || null, title, message, recipientCount, 'sending']
  );
  return inserted.id;
}

function recordMessage({ campaignId, customerId, phone, ok, providerRef, error }) {
  return runQuery(
    `INSERT INTO sms_messages (campaign_id, customer_id, phone, status, provider_ref, error) VALUES (?, ?, ?, ?, ?, ?)`,
    [campaignId, customerId || null, phone, ok ? 'sent' : 'failed', providerRef || null, error]
  );
}

function finishCampaign(campaignId, { sent, failed, status }) {
  return runQuery(
    `UPDATE sms_campaigns SET sent_count = ?, failed_count = ?, status = ? WHERE id = ?`,
    [sent, failed, status, campaignId]
  );
}

module.exports = { listCampaigns, createCampaign, recordMessage, finishCampaign };
