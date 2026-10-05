const tokenCache = { accessToken: null, expiresAt: 0 }
let tokenPromise = null
const stkStore = new Map()
let onUpdate = null
const STK_TTL_MS = 15 * 60 * 1000

const RESULT_MESSAGES = {
  0: {
    status: 'success',
    reason: 'success',
    message: 'Payment received. Completing the sale...'
  },
  1: {
    status: 'failed',
    reason: 'insufficient_funds',
    message: 'Insufficient funds. Ask the customer to top up M-Pesa and try again.'
  },
  1001: {
    status: 'failed',
    reason: 'insufficient_funds',
    message: 'Unable to complete this payment. The customer may have insufficient funds.'
  },
  1019: {
    status: 'failed',
    reason: 'timeout',
    message: 'The M-Pesa request expired. Send a new prompt.'
  },
  1025: {
    status: 'failed',
    reason: 'failed',
    message: 'Could not send the prompt to this number. Check the phone number.'
  },
  1032: {
    status: 'cancelled',
    reason: 'cancelled',
    message: 'The customer cancelled the M-Pesa prompt.'
  },
  1037: {
    status: 'failed',
    reason: 'timeout',
    message: 'The prompt timed out. The customer did not enter their PIN in time.'
  },
  2001: {
    status: 'failed',
    reason: 'wrong_pin',
    message: 'Wrong M-Pesa PIN. Ask the customer to try again.'
  }
}

const getBaseUrl = () => (process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke').replace(/\/$/, '')
const getShortcode = () => process.env.MPESA_SHORTCODE || process.env.TILL_NO
const getPasskey = () => process.env.MPESA_PASSKEY
const getTransactionType = () => process.env.MPESA_TRANSACTIONTYPE || 'CustomerPayBillOnline'

const pad = (value) => String(value).padStart(2, '0')

const getTimestamp = () => {
  const d = new Date()
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

const getPassword = (timestamp) => {
  const shortcode = getShortcode()
  const passkey = getPasskey()
  if (!shortcode || !passkey) {
    throw new Error('M-Pesa shortcode or passkey is not configured')
  }
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64')
}

const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.startsWith('254') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`
  if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) return `254${digits}`
  throw new Error('Enter a valid Kenyan M-Pesa number, e.g. 07XX XXX XXX')
}

const interpretResult = (resultCode, resultDesc = '') => {
  const mapped = RESULT_MESSAGES[Number(resultCode)]
  if (mapped) return { ...mapped, resultCode: Number(resultCode) }

  const desc = String(resultDesc || '').toLowerCase()
  if (desc.includes('cancel')) {
    return { status: 'cancelled', reason: 'cancelled', message: 'The customer cancelled the M-Pesa prompt.', resultCode }
  }
  if (desc.includes('insufficient') || desc.includes('balance')) {
    return {
      status: 'failed',
      reason: 'insufficient_funds',
      message: 'Insufficient funds. Ask the customer to top up M-Pesa and try again.',
      resultCode
    }
  }
  if (desc.includes('pin')) {
    return { status: 'failed', reason: 'wrong_pin', message: 'Wrong M-Pesa PIN. Ask the customer to try again.', resultCode }
  }
  if (desc.includes('timeout') || desc.includes('timed out') || desc.includes('did not respond')) {
    return {
      status: 'failed',
      reason: 'timeout',
      message: 'The prompt timed out. The customer did not enter their PIN in time.',
      resultCode
    }
  }

  return {
    status: 'failed',
    reason: 'failed',
    message: resultDesc || 'M-Pesa payment was not completed',
    resultCode
  }
}

const toClientEvent = (record) => ({
  type: 'stk',
  checkoutRequestId: record.checkoutRequestId,
  status: record.status,
  reason: record.reason || (record.status === 'pending' ? 'pending' : 'failed'),
  resultCode: record.resultCode ?? null,
  message: record.resultDesc,
  mpesaReceipt: record.mpesaReceipt || null
})

const fetchAccessToken = async () => {
  const key = process.env.MPESA_CONSUMER_KEY
  const secret = process.env.MPESA_CONSUMER_SECRET
  if (!key || !secret) {
    throw new Error('M-Pesa consumer key/secret is not configured')
  }

  const credentials = Buffer.from(`${key}:${secret}`).toString('base64')
  const res = await fetch(`${getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` }
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(data.errorMessage || data.error_description || 'Failed to get M-Pesa access token')
  }

  tokenCache.accessToken = data.access_token
  tokenCache.expiresAt = Date.now() + Math.max(30, Number(data.expires_in || 3599) - 60) * 1000
  return tokenCache.accessToken
}

const getAccessToken = async () => {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken
  }
  if (!tokenPromise) {
    tokenPromise = fetchAccessToken().finally(() => {
      tokenPromise = null
    })
  }
  return tokenPromise
}

const pruneStkStore = () => {
  const cutoff = Date.now() - STK_TTL_MS
  for (const [id, record] of stkStore) {
    if ((record.updatedAt || 0) < cutoff) stkStore.delete(id)
  }
}

const saveStk = (checkoutRequestId, payload) => {
  if (stkStore.size > 200) pruneStkStore()
  const current = stkStore.get(checkoutRequestId) || {}
  const next = { ...current, ...payload, checkoutRequestId, updatedAt: Date.now() }
  stkStore.set(checkoutRequestId, next)
  if (typeof onUpdate === 'function') onUpdate(toClientEvent(next))
  return next
}

const getStk = (checkoutRequestId) => stkStore.get(checkoutRequestId) || null

const setOnUpdate = (handler) => {
  onUpdate = handler
}

const initiateStkPush = async ({ phone, amount, accountReference, description, callbackUrl }) => {
  const partyA = normalizePhone(phone)
  const shortcode = getShortcode()
  const timestamp = getTimestamp()
  const token = await getAccessToken()
  const roundedAmount = Math.max(1, Math.round(Number(amount) || 0))

  const body = {
    BusinessShortCode: shortcode,
    Password: getPassword(timestamp),
    Timestamp: timestamp,
    TransactionType: getTransactionType(),
    Amount: roundedAmount,
    PartyA: partyA,
    PartyB: shortcode,
    PhoneNumber: partyA,
    CallBackURL: callbackUrl,
    AccountReference: (accountReference || 'ESSENTIALS').slice(0, 12),
    TransactionDesc: (description || 'Store payment').slice(0, 13)
  }

  const res = await fetch(`${getBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  const data = await res.json()
  if (!res.ok || String(data.ResponseCode) !== '0') {
    throw new Error(data.errorMessage || data.CustomerMessage || data.ResponseDescription || 'Failed to send M-Pesa prompt')
  }

  return saveStk(data.CheckoutRequestID, {
    checkoutRequestId: data.CheckoutRequestID,
    merchantRequestId: data.MerchantRequestID,
    phone: partyA,
    amount: roundedAmount,
    status: 'pending',
    reason: 'pending',
    resultDesc: 'Prompt sent. Ask the customer to enter their M-Pesa PIN.'
  })
}

const queryStkStatus = async (checkoutRequestId) => {
  const existing = getStk(checkoutRequestId)
  if (existing && (existing.status === 'success' || existing.status === 'failed' || existing.status === 'cancelled')) {
    return existing
  }

  const shortcode = getShortcode()
  const timestamp = getTimestamp()
  const token = await getAccessToken()

  const res = await fetch(`${getBaseUrl()}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: getPassword(timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    })
  })
  const data = await res.json()

  const resultCode = data.ResultCode !== undefined ? Number(data.ResultCode) : null
  const processing =
    data.errorCode === '500.001.1001' ||
    resultCode === 4999 ||
    /being processed|request is being processed/i.test(`${data.errorMessage || ''} ${data.ResultDesc || ''}`)

  if (processing || resultCode === null) {
    return saveStk(checkoutRequestId, {
      status: 'pending',
      reason: 'pending',
      resultDesc: existing?.resultDesc || 'Waiting for the customer to enter their M-Pesa PIN...'
    })
  }

  const interpreted = interpretResult(resultCode, data.ResultDesc || data.errorMessage)
  return saveStk(checkoutRequestId, {
    status: interpreted.status,
    reason: interpreted.reason,
    resultCode: interpreted.resultCode,
    resultDesc: interpreted.message
  })
}

const applyCallback = (stkCallback = {}) => {
  const checkoutRequestId = stkCallback.CheckoutRequestID
  if (!checkoutRequestId) return null

  const resultCode = Number(stkCallback.ResultCode)
  const items = stkCallback.CallbackMetadata?.Item || []
  const getItem = (name) => items.find((item) => item.Name === name)?.Value
  const interpreted = interpretResult(resultCode, stkCallback.ResultDesc)

  if (interpreted.status === 'success') {
    return saveStk(checkoutRequestId, {
      status: 'success',
      reason: 'success',
      resultCode,
      resultDesc: interpreted.message,
      mpesaReceipt: getItem('MpesaReceiptNumber') || null,
      amount: getItem('Amount') || getStk(checkoutRequestId)?.amount,
      phone: String(getItem('PhoneNumber') || getStk(checkoutRequestId)?.phone || '')
    })
  }

  return saveStk(checkoutRequestId, {
    status: interpreted.status,
    reason: interpreted.reason,
    resultCode,
    resultDesc: interpreted.message
  })
}

const markTimedOut = (checkoutRequestId) => {
  const existing = getStk(checkoutRequestId)
  if (!existing || existing.status !== 'pending') return existing
  const interpreted = interpretResult(1037)
  return saveStk(checkoutRequestId, {
    status: interpreted.status,
    reason: interpreted.reason,
    resultCode: 1037,
    resultDesc: interpreted.message
  })
}

module.exports = {
  normalizePhone,
  initiateStkPush,
  queryStkStatus,
  applyCallback,
  getStk,
  setOnUpdate,
  toClientEvent,
  markTimedOut
}
