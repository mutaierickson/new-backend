const normalizeBarcode = (raw) => String(raw || '').trim().replace(/\s+/g, '').toUpperCase();

module.exports = { normalizeBarcode };
