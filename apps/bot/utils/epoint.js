/**
 * Epoint (epoint.az) API client for the bot side: charging saved cards on renewal.
 * The website does the first payment and receives callbacks (apps/web/lib/epoint.ts).
 *
 * Every request is `data` (base64 JSON) + `signature` = base64(sha1_raw(private + data + private)).
 * Saved-card payments only accept AZN, so all plans are priced in AZN.
 * Keep prices in sync with apps/web/lib/billing.ts.
 */
const crypto = require('crypto');

const BASE_URL = 'https://epoint.az';

// Plan prices in AZN, as strings so they go over the wire exactly
const EPOINT_PRICES = {
    plus: { monthly: '2.49', yearly: '19.99' },
    pro: { monthly: '3.49', yearly: '26.99' },
};

function priceFor(plan, cycle) {
    return EPOINT_PRICES[plan]?.[cycle] || null;
}

function sign(data, privateKey = process.env.EPOINT_PRIVATE_KEY) {
    return crypto.createHash('sha1').update(`${privateKey}${data}${privateKey}`, 'utf8').digest('base64');
}

function encode(payload) {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

/** Checks a callback's signature and returns its decoded JSON, or null. */
function verifyAndDecode(data, signature, privateKey = process.env.EPOINT_PRIVATE_KEY) {
    if (!privateKey || typeof data !== 'string' || typeof signature !== 'string') return null;
    const expected = Buffer.from(sign(data, privateKey));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
    try {
        return JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    } catch (_) {
        return null;
    }
}

function configured() {
    return Boolean(process.env.EPOINT_PUBLIC_KEY && process.env.EPOINT_PRIVATE_KEY);
}

/** POSTs a signed request. Resolves to Epoint's JSON reply; throws on network or non-JSON errors. */
async function post(path, params, { fetchImpl = fetch, timeoutMs = 30000 } = {}) {
    const data = encode({ public_key: process.env.EPOINT_PUBLIC_KEY, ...params });
    const res = await fetchImpl(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data, signature: sign(data) }).toString(),
        signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch (_) {
        throw new Error(`Epoint ${path} returned HTTP ${res.status} without JSON`);
    }
}

/** Charges a saved card. Resolves to Epoint's reply ({ status: 'success' | 'failed', ... }). */
function chargeSavedCard({ cardId, orderId, amount, description, language = 'en' }, options) {
    return post('/api/1/execute-pay', {
        language,
        card_id: cardId,
        order_id: orderId,
        amount,
        currency: 'AZN',
        description,
    }, options);
}

module.exports = {
    EPOINT_PRICES,
    priceFor,
    sign,
    encode,
    verifyAndDecode,
    configured,
    post,
    chargeSavedCard,
};
