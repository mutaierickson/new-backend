const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function makeReceiptCode(orderId) {
  const id = Number(orderId)
  const body = id.toString(36).toUpperCase().padStart(5, '0')
  const check = ALPHABET[id % ALPHABET.length]
  return `ED-${body}${check}`
}

function makeReturnCode(returnId) {
  const id = Number(returnId)
  const body = id.toString(36).toUpperCase().padStart(5, '0')
  const check = ALPHABET[id % ALPHABET.length]
  return `RT-${body}${check}`
}

function parseReceiptLookup(raw) {
  const value = String(raw || '').trim().toUpperCase().replace(/^#/, '').replace(/\s+/g, '')
  if (!value) return null
  if (/^\d+$/.test(value)) return { id: Number(value) }

  const match = value.match(/^ED-?([0-9A-Z]{5})([0-9A-Z])$/)
  if (match) {
    const id = parseInt(match[1], 36)
    if (Number.isFinite(id) && makeReceiptCode(id) === `ED-${match[1]}${match[2]}`) {
      return { id, code: makeReceiptCode(id) }
    }
  }

  return { code: value }
}

module.exports = { makeReceiptCode, makeReturnCode, parseReceiptLookup }
