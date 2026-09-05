const symbolMap = {
  RELIANCE: 'RELIANCE:NSE', HDFCBANK: 'HDFCBANK:NSE', ZOMATO: 'ETERNAL:NSE', TCS: 'TCS:NSE',
  INFY: 'INFY:NSE', TATAMOTORS: 'TATAMOTORS:NSE', ICICIBANK: 'ICICIBANK:NSE', SBIN: 'SBIN:NSE',
  BHARTIARTL: 'BHARTIARTL:NSE', LT: 'LT:NSE', MARUTI: 'MARUTI:NSE', SUNPHARMA: 'SUNPHARMA:NSE'
};

function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; }

function normalizeQuote(symbol, quote) {
  if (!quote || quote.status === 'error') return null;
  const price = number(quote.close ?? quote.price);
  if (!price || price <= 0) return null;
  const timestamp = number(quote.timestamp);
  return {
    symbol,
    price,
    previousClose: number(quote.previous_close),
    open: number(quote.open), high: number(quote.high), low: number(quote.low), volume: number(quote.volume),
    asOf: timestamp ? new Date(timestamp * 1000).toISOString() : quote.datetime ? new Date(quote.datetime).toISOString() : new Date().toISOString()
  };
}

async function fetchTwelveDataQuotes(apiKey, symbols, fetchImpl = fetch) {
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY is not configured');
  const requested = symbols.map(symbol => symbolMap[symbol]).filter(Boolean);
  const url = new URL('https://api.twelvedata.com/quote');
  url.searchParams.set('symbol', requested.join(',')); url.searchParams.set('apikey', apiKey);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8_000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Twelve Data returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.status === 'error') throw new Error(payload.message || 'Twelve Data rejected the request');
  const quotes = symbols.map((symbol, index) => normalizeQuote(symbol, payload[requested[index]] || payload[symbol] || (symbols.length === 1 ? payload : null))).filter(Boolean);
  if (!quotes.length) throw new Error('Twelve Data returned no usable quotes');
  return quotes;
}

module.exports = { symbolMap, normalizeQuote, fetchTwelveDataQuotes };
