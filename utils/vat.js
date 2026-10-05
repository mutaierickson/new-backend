const { n } = require('./http');

const VAT_RATE = 16;

const splitInclusive = (total, rate = VAT_RATE) => {
  const gross = Math.round(n(total) * 100) / 100;
  const vat_amount = Math.round((gross * rate) / (100 + rate) * 100) / 100;
  return {
    rate,
    vat_amount,
    net: Math.round((gross - vat_amount) * 100) / 100
  };
};

module.exports = { VAT_RATE, splitInclusive };
