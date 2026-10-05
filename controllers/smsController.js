const sms = require('../services/sms');
const smsModel = require('../models/smsModel');
const auditModel = require('../models/auditModel');
const { listCustomers } = require('../models/customerModel');
const { parsePhoneList } = require('../utils/phone');

const MAX_MESSAGE_LENGTH = 480;

async function status(_req, res) {
  if (!sms.isConfigured()) {
    return res.json({ configured: false, remaining: null, balance: null, shortcode: null });
  }
  try {
    res.json(await sms.getBalance());
  } catch (error) {
    res.json({
      configured: true,
      remaining: null,
      balance: null,
      shortcode: process.env.SMS_SHORTCODE || null,
      error: error.message
    });
  }
}

async function campaigns(_req, res) {
  res.json(await smsModel.listCampaigns());
}

async function sendBulk(req, res) {
  if (!sms.isConfigured()) {
    return res.status(400).json({ error: 'SMS is not configured. Add SMS_API_KEY, SMS_PARTNER_ID, and SMS_SHORTCODE to .env' });
  }
  const { title, message, customer_ids = [], extra_phones = '', send_all = false, user_id } = req.body || {};
  const text = String(message || '').trim();
  if (!text) return res.status(400).json({ error: 'Message is required' });
  if (text.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)` });

  const saved = await listCustomers();
  const selected = send_all
    ? saved
    : saved.filter((row) => customer_ids.map(Number).includes(Number(row.id)));
  const extra = parsePhoneList(extra_phones);
  const recipients = new Map();
  for (const row of selected) recipients.set(row.phone, { phone: row.phone, customer_id: row.id, name: row.name });
  for (const phone of extra.phones) {
    if (!recipients.has(phone)) recipients.set(phone, { phone, customer_id: null, name: null });
  }

  if (!recipients.size) {
    return res.status(400).json({ error: extra.invalid.length ? `No valid numbers. Could not use: ${extra.invalid.join(', ')}` : 'Select customers or paste phone numbers' });
  }

  const phones = [...recipients.keys()];
  const campaignId = await smsModel.createCampaign({ userId: user_id, title: title || 'Offer', message: text, recipientCount: phones.length });

  const results = await sms.sendBulk(phones, text);
  let sent = 0;
  let failed = 0;
  for (const result of results) {
    if (result.ok) sent += 1;
    else failed += 1;
    const meta = recipients.get(result.phone) || {};
    await smsModel.recordMessage({
      campaignId,
      customerId: meta.customer_id,
      phone: result.phone,
      ok: result.ok,
      providerRef: result.provider_ref,
      error: result.error
    });
  }

  const campaignStatus = failed && !sent ? 'failed' : failed ? 'partial' : 'sent';
  await smsModel.finishCampaign(campaignId, { sent, failed, status: campaignStatus });
  await auditModel.log(user_id, 'SEND_BULK_SMS', { campaign_id: campaignId, recipient_count: phones.length, sent, failed, title: title || 'Offer' });

  let remaining = null;
  try {
    remaining = (await sms.getBalance()).remaining;
  } catch (_) {}

  res.json({
    id: campaignId,
    recipient_count: phones.length,
    sent_count: sent,
    failed_count: failed,
    invalid: extra.invalid,
    remaining,
    status: campaignStatus
  });
}

module.exports = { status, campaigns, sendBulk };
