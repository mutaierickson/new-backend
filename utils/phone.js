const normalizeKenyanPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) return `254${digits}`;
  throw new Error('Enter a valid Kenyan number, e.g. 07XX XXX XXX');
};

const parsePhoneList = (value) => {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,;]+/);
  const seen = new Set();
  const phones = [];
  const invalid = [];
  for (const entry of raw) {
    const trimmed = String(entry || '').trim();
    if (!trimmed) continue;
    try {
      const phone = normalizeKenyanPhone(trimmed);
      if (seen.has(phone)) continue;
      seen.add(phone);
      phones.push(phone);
    } catch {
      invalid.push(trimmed);
    }
  }
  return { phones, invalid };
};

module.exports = { normalizeKenyanPhone, parsePhoneList };
