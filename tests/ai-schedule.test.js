// tests/ai-schedule.test.js
const assert = require('assert');
const { checkRateLimit, clientKey } = require('../api/_rate-limit.js');

// 1. Tests unitaires de checkRateLimit et clientKey
console.log('--- Test checkRateLimit & clientKey ---');

const store = new Map();
const t0 = 1000000;
for (let i = 0; i < 8; i++) {
  const res = checkRateLimit(store, 'test-ip', t0 + i * 1000);
  assert.strictEqual(res.ok, true, `Call ${i + 1} should be ok`);
}
const res9 = checkRateLimit(store, 'test-ip', t0 + 8000);
assert.strictEqual(res9.ok, false, 'Call 9 should be rate limited');
assert(res9.retryAfterSec > 0, 'retryAfterSec should be > 0');

const resAfter = checkRateLimit(store, 'test-ip', t0 + 600001);
assert.strictEqual(resAfter.ok, true, 'Call after windowMs should be ok');
console.log('ok: checkRateLimit sliding window');

assert.strictEqual(clientKey({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }), '1.2.3.4');
assert.strictEqual(clientKey({ 'x-real-ip': '9.8.7.6' }), '9.8.7.6');
assert.strictEqual(clientKey({}), 'unknown');
console.log('ok: clientKey headers parsing');

// Helper pour simuler req et res pour api/ai-schedule.js
function mockReqRes(options = {}) {
  const headers = Object.assign({
    host: 'localhost:3000',
    origin: 'http://localhost:3000',
    'x-forwarded-for': '127.0.0.1'
  }, options.headers || {});

  const req = {
    method: options.method || 'POST',
    headers,
    body: options.body !== undefined ? options.body : {
      prompt: 'Test prompt',
      images: ['data:image/jpeg;base64,dGVzdA==']
    }
  };

  let statusCode = 200;
  let responseData = null;
  const resHeaders = {};

  const res = {
    status: (code) => { statusCode = code; return res; },
    setHeader: (k, v) => { resHeaders[k.toLowerCase()] = v; },
    send: (data) => { responseData = data; },
    end: () => {},
    getStatus: () => statusCode,
    getData: () => {
      try { return JSON.parse(responseData); } catch (e) { return responseData; }
    },
    getHeaders: () => resHeaders
  };

  return { req, res };
}

async function runHandlerTests() {
  const handler = require('../api/ai-schedule.js');

  console.log('--- Test Handler Edge Cases ---');

  // Test 1: OPTIONS method -> 204
  {
    const { req, res } = mockReqRes({ method: 'OPTIONS' });
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 204, 'OPTIONS should return 204');
    console.log('ok: OPTIONS returns 204');
  }

  // Test 2: Method not allowed (GET) -> 405
  {
    const { req, res } = mockReqRes({ method: 'GET' });
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 405, 'GET should return 405');
    console.log('ok: GET returns 405');
  }

  // Test 3: Foreign origin -> 403
  {
    const { req, res } = mockReqRes({
      headers: { origin: 'http://evil.com', host: 'pcsios.app' }
    });
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 403, 'Foreign origin should return 403');
    console.log('ok: Foreign origin returns 403');
  }

  // Test 4: Content-Length > 4MB -> 413
  {
    const { req, res } = mockReqRes({
      headers: { 'content-length': String(5 * 1024 * 1024) }
    });
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 413, 'Large body should return 413');
    console.log('ok: Content-Length > 4MB returns 413');
  }

  // Test 5: Invalid JSON body -> 400
  {
    const { req, res } = mockReqRes({ body: '{invalid-json' });
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 400, 'Invalid JSON should return 400');
    console.log('ok: Invalid JSON returns 400');
  }

  // Test 6: Missing images -> 400
  {
    const { req, res } = mockReqRes({ body: { prompt: 'hello', images: [] } });
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 400, 'Missing images should return 400');
    console.log('ok: Missing images returns 400');
  }

  // Test 7: No API keys in env -> 503
  {
    const origEnv = process.env;
    process.env = {};
    const { req, res } = mockReqRes({
      headers: { 'x-forwarded-for': '192.168.1.1' }
    });
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 503, 'No API keys should return 503');
    process.env = origEnv;
    console.log('ok: No API keys in env returns 503');
  }

  // Test 8: Rate limit in handler -> 9th request returns 429
  {
    process.env = { GEMINI_API_KEY: 'test-key-12345678901234567890' };
    const testIp = '10.0.0.99';
    let hit429 = false;

    // Mock global.fetch so it doesn't fail on valid API key
    const origFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"kind":"edt","events":[]}' }] } }] })
    });

    for (let i = 0; i < 9; i++) {
      const { req, res } = mockReqRes({
        headers: { 'x-forwarded-for': testIp }
      });
      await handler(req, res);
      if (i < 8) {
        assert.notStrictEqual(res.getStatus(), 429, `Call ${i + 1} must not be 429`);
      } else {
        assert.strictEqual(res.getStatus(), 429, '9th call must be 429');
        assert(/trop de demandes/i.test(res.getData().error), 'Error must contain "Trop de demandes"');
        hit429 = true;
      }
    }
    assert(hit429, 'Rate limit 429 was triggered');
    global.fetch = origFetch;
    console.log('ok: Rate limiter in handler triggers 429 on 9th request');
  }

  // Test 9: Gemini upstream error (e.g. 404) mapped to 502
  {
    process.env = { GEMINI_API_KEY: 'test-key-12345678901234567890' };
    const origFetch = global.fetch;
    let sentRequestBody = null;
    const requestedUrls = [];

    global.fetch = async (url, opts) => {
      requestedUrls.push(url);
      sentRequestBody = JSON.parse(opts.body);
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'model not found' } })
      };
    };

    const { req, res } = mockReqRes({
      headers: { 'x-forwarded-for': '10.0.0.55' }
    });
    await handler(req, res);

    assert.strictEqual(res.getStatus(), 502, 'Upstream 404 must be mapped to 502');
    assert(requestedUrls.length >= 2, 'Should have attempted at least 2 models');
    assert(requestedUrls[0].includes('gemini-3.5-flash-lite'), 'First model must be gemini-3.5-flash-lite');
    assert(requestedUrls[1].includes('gemini-3.8-flash'), 'Second model must be gemini-3.8-flash');
    assert(sentRequestBody.generationConfig.responseSchema.properties.kind, 'Schema must contain kind');
    assert(sentRequestBody.generationConfig.responseSchema.properties.events, 'Schema must contain events');

    global.fetch = origFetch;
    console.log('ok: Upstream error mapped to 502 and universal schema verified');
  }

  console.log('ALL AI-SCHEDULE TESTS PASSED !');
}

runHandlerTests().catch(err => {
  console.error(err);
  process.exit(1);
});
