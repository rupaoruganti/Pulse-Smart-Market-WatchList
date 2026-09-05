const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuote, fetchTwelveDataQuotes } = require('../market-data');

test('normalizes provider strings into a safe numeric quote', () => {
  const quote = normalizeQuote('SBIN', { close: '812.25', previous_close: '801.80', open: '803.10', high: '815', low: '800', volume: '15100000', timestamp: '1788480000' });
  assert.equal(quote.price, 812.25);
  assert.equal(quote.volume, 15100000);
  assert.match(quote.asOf, /^2026-/);
});

test('rejects invalid or provider-error quotes', () => {
  assert.equal(normalizeQuote('SBIN', { status: 'error' }), null);
  assert.equal(normalizeQuote('SBIN', { close: 'not-a-price' }), null);
});

test('requests NSE symbols in one batch without exposing the key in output', async () => {
  let requestedUrl;
  const fakeFetch = async url => { requestedUrl = String(url); return new Response(JSON.stringify({ 'RELIANCE:NSE': { close: '1420.50', previous_close: '1400', volume: '10000000' }, 'SBIN:NSE': { close: '810.25', previous_close: '800', volume: '12000000' } }), { status: 200 }); };
  const quotes = await fetchTwelveDataQuotes('secret-test-key', ['RELIANCE', 'SBIN'], fakeFetch);
  assert.equal(quotes.length, 2);
  assert.match(requestedUrl, /RELIANCE%3ANSE%2CSBIN%3ANSE/);
  assert.ok(!JSON.stringify(quotes).includes('secret-test-key'));
});
