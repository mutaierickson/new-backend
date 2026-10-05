const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) {}

const BASE_URL = (process.env.SMS_BASE_URL || 'https://quicksms.advantasms.com').replace(/\/$/, '');

const credentials = () => {
  const apikey = process.env.SMS_API_KEY;
  const partnerID = process.env.SMS_PARTNER_ID;
  const shortcode = process.env.SMS_SHORTCODE;
  if (!apikey || !partnerID || !shortcode) {
    throw new Error('SMS is not configured. Set SMS_API_KEY, SMS_PARTNER_ID, and SMS_SHORTCODE in .env');
  }
  return { apikey, partnerID, shortcode };
};

const isConfigured = () => Boolean(process.env.SMS_API_KEY && process.env.SMS_PARTNER_ID && process.env.SMS_SHORTCODE);

const parseJson = (text, status) => {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `SMS provider returned HTTP ${status}`);
  }
};

const requestJson = async (path, { method = 'POST', body, query } = {}) => {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null) url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12_000)
  });
  const data = parseJson(await res.text(), res.status);
  if (!res.ok) {
    throw new Error(data['response-description'] || data.message || `SMS provider returned HTTP ${res.status}`);
  }
  return data;
};

const providerError = (error) => {
  const code = error.cause?.code || error.code;
  if (error.name === 'TimeoutError' || code === 'ENOTFOUND' || code === 'ECONNREFUSED' || /fetch failed/i.test(error.message)) {
    return new Error('Could not reach the SMS provider. Check this computer can access the internet.');
  }
  return error;
};

const responseCode = (row) => Number(row?.['respose-code'] ?? row?.['response-code'] ?? row?.responsecode ?? 0);

const isSuccess = (row) => {
  const code = responseCode(row);
  const desc = String(row?.['response-description'] || row?.message || '').toLowerCase();
  return code === 200 || desc.includes('success');
};

const pickCredit = (data) => {
  const nested = Array.isArray(data?.responses) ? data.responses[0] : data;
  const raw = nested?.credit ?? nested?.balance ?? nested?.sms_balance ?? nested?.smsbalance ?? data?.credit ?? data?.balance;
  if (raw == null || raw === '') return null;
  const value = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
};

const getBalance = async () => {
  try {
    const { apikey, partnerID, shortcode } = credentials();
    let data;
    try {
      data = await requestJson('/api/services/getbalance', { method: 'GET', query: { apikey, partnerID } });
    } catch {
      data = await requestJson('/api/services/getbalance/', { method: 'POST', body: { apikey, partnerID } });
    }
    const code = responseCode(data);
    if (code && code !== 200) {
      throw new Error(data['response-description'] || 'Could not read SMS balance');
    }
    return {
      configured: true,
      shortcode,
      remaining: pickCredit(data),
      balance: pickCredit(data)
    };
  } catch (error) {
    throw providerError(error);
  }
};

const sendBulk = async (phones, message) => {
  try {
    const { apikey, partnerID, shortcode } = credentials();
    const unique = [...new Set(phones)];
    const results = [];
    const chunkSize = 20;

    for (let i = 0; i < unique.length; i += chunkSize) {
      const chunk = unique.slice(i, i + chunkSize);
      const payload = {
        count: chunk.length,
        smslist: chunk.map((mobile, index) => ({
          partnerID,
          apikey,
          pass_type: 'plain',
          clientsmsid: Date.now() + i + index,
          mobile,
          message,
          shortcode
        }))
      };
      const data = await requestJson('/api/services/sendbulk/', { method: 'POST', body: payload });
      const rows = Array.isArray(data.responses) ? data.responses : Array.isArray(data) ? data : [data];
      chunk.forEach((mobile, index) => {
        const row = rows.find((item) => String(item.mobile || '').replace(/\D/g, '').endsWith(mobile.slice(-9))) || rows[index] || {};
        results.push({
          phone: mobile,
          ok: isSuccess(row),
          provider_ref: String(row.messageid || row.messageId || row.clientsmsid || ''),
          error: isSuccess(row) ? null : (row['response-description'] || row.message || 'Not sent')
        });
      });
    }

    return results;
  } catch (error) {
    throw providerError(error);
  }
};

module.exports = { isConfigured, getBalance, sendBulk };
