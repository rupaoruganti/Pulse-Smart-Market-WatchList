const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { scoreStock } = require('./scoring');
const { fetchTwelveDataQuotes } = require('./market-data');
const { createRepository } = require('./persistence');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.PULSE_HOST || '127.0.0.1';
const ROOT = __dirname;
const STORE_PATH = process.env.PULSE_STORE_PATH || path.join(ROOT, 'data', 'store.json');
const repository = createRepository({ root: ROOT, storePath: STORE_PATH });
const clients = new Set();
const sessions = new Map();
const loginAttempts = new Map();
let marketAsOf = new Date().toISOString();
let tickSequence = 0;
const twelveDataKey = process.env.TWELVE_DATA_API_KEY;
let providerHealthy = false;
let marketMeta = { status: 'demo', label: 'Demo feed', source: 'Simulated NSE data', delayMinutes: 1, staleAfterSeconds: 120, isDemo: true };

const instruments = {
  RELIANCE: { symbol: 'RELIANCE', name: 'Reliance Industries', exchange: 'NSE', sector: 'Energy', price: 1416.40, previousClose: 1381.25, open: 1390.00, high: 1422.80, low: 1385.10, volume: 18.4, avgVolume: 9.2, week52High: 1608.80, week52Low: 1115.55, spark: [1372,1380,1378,1391,1398,1394,1405,1411,1408,1416] },
  HDFCBANK: { symbol: 'HDFCBANK', name: 'HDFC Bank', exchange: 'NSE', sector: 'Financials', price: 1678.90, previousClose: 1691.70, open: 1694.00, high: 1698.40, low: 1672.15, volume: 6.3, avgVolume: 7.1, week52High: 1880.00, week52Low: 1354.35, spark: [1693,1691,1688,1690,1684,1681,1686,1680,1676,1679] },
  ZOMATO: { symbol: 'ZOMATO', name: 'Eternal', exchange: 'NSE', sector: 'Consumer', price: 331.75, previousClose: 318.30, open: 320.20, high: 333.40, low: 319.10, volume: 62.8, avgVolume: 27.5, week52High: 334.20, week52Low: 194.80, spark: [317,319,321,320,324,326,325,329,330,332] },
  TCS: { symbol: 'TCS', name: 'Tata Consultancy Services', exchange: 'NSE', sector: 'Technology', price: 3071.20, previousClose: 3095.60, open: 3098.00, high: 3104.25, low: 3058.80, volume: 2.1, avgVolume: 2.4, week52High: 4592.25, week52Low: 3056.05, spark: [3100,3092,3086,3090,3081,3078,3080,3074,3068,3071] },
  INFY: { symbol: 'INFY', name: 'Infosys', exchange: 'NSE', sector: 'Technology', price: 1498.60, previousClose: 1489.10, open: 1490.00, high: 1506.40, low: 1487.35, volume: 5.8, avgVolume: 6.0, week52High: 2006.80, week52Low: 1307.00, spark: [1488,1491,1494,1492,1497,1501,1499,1503,1496,1499] },
  TATAMOTORS: { symbol: 'TATAMOTORS', name: 'Tata Motors', exchange: 'NSE', sector: 'Automobile', price: 714.35, previousClose: 735.20, open: 732.00, high: 734.10, low: 709.80, volume: 21.9, avgVolume: 12.6, week52High: 1179.00, week52Low: 542.55, spark: [736,732,729,725,727,721,718,720,712,714] },
  ICICIBANK: { symbol: 'ICICIBANK', name: 'ICICI Bank', exchange: 'NSE', sector: 'Financials', price: 1441.10, previousClose: 1430.75, open: 1432.50, high: 1448.00, low: 1428.80, volume: 8.2, avgVolume: 7.8, week52High: 1471.90, week52Low: 1142.00, spark: [1430,1434,1432,1437,1439,1436,1442,1445,1439,1441] },
  SBIN: { symbol: 'SBIN', name: 'State Bank of India', exchange: 'NSE', sector: 'Financials', price: 808.55, previousClose: 801.80, open: 803.10, high: 812.25, low: 800.40, volume: 15.1, avgVolume: 14.8, week52High: 912.00, week52Low: 680.00, spark: [801,803,805,804,808,806,810,812,809,809] },
  BHARTIARTL: { symbol: 'BHARTIARTL', name: 'Bharti Airtel', exchange: 'NSE', sector: 'Telecom', price: 1924.30, previousClose: 1908.15, open: 1911.00, high: 1932.40, low: 1904.20, volume: 4.8, avgVolume: 5.2, week52High: 2010.00, week52Low: 1422.20, spark: [1904,1909,1913,1910,1918,1921,1917,1926,1930,1924] },
  LT: { symbol: 'LT', name: 'Larsen & Toubro', exchange: 'NSE', sector: 'Industrials', price: 3682.75, previousClose: 3651.40, open: 3658.00, high: 3698.20, low: 3646.15, volume: 1.7, avgVolume: 1.9, week52High: 3963.50, week52Low: 2965.30, spark: [3648,3655,3660,3656,3669,3674,3671,3688,3691,3683] },
  MARUTI: { symbol: 'MARUTI', name: 'Maruti Suzuki India', exchange: 'NSE', sector: 'Automobile', price: 12648.00, previousClose: 12722.35, open: 12710.00, high: 12748.00, low: 12620.40, volume: 0.42, avgVolume: 0.48, week52High: 13680.00, week52Low: 10420.00, spark: [12731,12718,12725,12696,12682,12691,12670,12661,12639,12648] },
  SUNPHARMA: { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical', exchange: 'NSE', sector: 'Healthcare', price: 1712.55, previousClose: 1694.80, open: 1698.00, high: 1718.90, low: 1691.20, volume: 2.6, avgVolume: 2.3, week52High: 1960.35, week52Low: 1548.00, spark: [1692,1698,1701,1699,1707,1705,1711,1715,1709,1713] }
};

function freshDemoState() {
  const timestamp = '2026-09-04T03:45:00.000Z';
  return {
    lastReviewedAt: timestamp,
    lastReviewedSnapshots: {
      RELIANCE: { price: 1381.25, volume: 9.2, high: 1394.4, low: 1372.1, timestamp },
      HDFCBANK: { price: 1691.7, volume: 7.1, high: 1704.2, low: 1682.5, timestamp },
      ZOMATO: { price: 318.3, volume: 27.5, high: 323.8, low: 313.4, timestamp },
      TCS: { price: 3095.6, volume: 2.4, high: 3122.4, low: 3078.7, timestamp },
      INFY: { price: 1489.1, volume: 6, high: 1502.2, low: 1476.4, timestamp },
      TATAMOTORS: { price: 735.2, volume: 12.6, high: 742.8, low: 727.1, timestamp }
    },
    watchlists: [
      { id: 'core', name: 'My watchlist', symbolIds: ['RELIANCE', 'HDFCBANK', 'ZOMATO', 'TCS', 'INFY', 'TATAMOTORS'] },
      { id: 'earnings', name: 'Earnings radar', symbolIds: ['TCS', 'INFY', 'HDFCBANK'] }
    ]
  };
}

function json(res, status, responseBody, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(responseBody)); }
function body(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 100_000) req.destroy(); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } }); req.on('error', reject); }); }
function broadcast(event, payload) { for (const client of clients) client.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); }

function cookies(req) { return Object.fromEntries(String(req.headers.cookie || '').split(';').map(value => value.trim().split('=').map(decodeURIComponent)).filter(parts => parts.length === 2)); }
async function authenticated(req) {
  const token = cookies(req).pulse_session; const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) { if (token) sessions.delete(token); return null; }
  return repository.findById(session.accountId);
}
function sessionCookie(token, clear = false) { return `pulse_session=${clear ? '' : token}; HttpOnly; SameSite=Strict; Path=/; ${clear ? 'Max-Age=0' : 'Max-Age=28800'}`; }
function createSession(accountId) { const token = crypto.randomBytes(32).toString('base64url'); sessions.set(token, { accountId, expiresAt: Date.now() + 8 * 60 * 60 * 1000 }); return token; }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') }; }
function validPassword(password, account) { if (!account.passwordHash || !account.passwordSalt) return false; const candidate = Buffer.from(hashPassword(password, account.passwordSalt).hash, 'hex'); const expected = Buffer.from(account.passwordHash, 'hex'); return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected); }
function bootstrap(account, version) {
  return { version, user: account.user, lastReviewedAt: account.lastReviewedAt, watchlists: account.watchlists, market: { ...marketMeta, asOf: marketAsOf }, instruments: Object.values(instruments).map(stock => scoreStock(stock, account.lastReviewedSnapshots?.[stock.symbol])) };
}

async function saveAccount(account, expectedVersion) {
  const saved = await repository.update(account, expectedVersion);
  broadcast('store', { accountId: account.id, version: saved.version });
  return saved;
}

function rateLimited(req, email) {
  const key = `${req.socket.remoteAddress}:${email}`; const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter(time => now - time < 60_000);
  recent.push(now); loginAttempts.set(key, recent);
  return recent.length > 5;
}

function advanceDemoMarket(isFallback = false) {
  tickSequence += 1;
  Object.values(instruments).forEach((stock, index) => {
    // A bounded deterministic wave keeps demos reproducible while exercising live-data paths.
    const movement = Math.sin(tickSequence * 0.83 + index * 1.37) * 0.0009;
    stock.price = Number((stock.price * (1 + movement)).toFixed(2));
    stock.high = Math.max(stock.high, stock.price);
    stock.low = Math.min(stock.low, stock.price);
    stock.volume = Number((stock.volume + stock.avgVolume * (0.0015 + index * 0.0001)).toFixed(3));
    stock.spark = [...stock.spark.slice(1), stock.price];
  });
  marketAsOf = new Date().toISOString();
  marketMeta = { status: 'demo', label: isFallback ? 'Simulation fallback' : 'Demo feed', source: isFallback ? 'Simulator · provider unavailable' : 'Simulated NSE data', delayMinutes: 1, staleAfterSeconds: 120, isDemo: true };
  broadcast('market', { asOf: marketAsOf, sequence: tickSequence });
}

async function refreshProviderMarket() {
  try {
    const quotes = await fetchTwelveDataQuotes(twelveDataKey, Object.keys(instruments));
    for (const quote of quotes) {
      const stock = instruments[quote.symbol]; if (!stock) continue;
      stock.price = quote.price;
      if (quote.previousClose) stock.previousClose = quote.previousClose;
      if (quote.open) stock.open = quote.open;
      if (quote.high) stock.high = quote.high;
      if (quote.low) stock.low = quote.low;
      if (quote.volume != null) stock.volume = Number((quote.volume / 1_000_000).toFixed(3));
      stock.spark = [...stock.spark.slice(1), stock.price];
    }
    marketAsOf = quotes.map(item => item.asOf).sort().at(-1) || new Date().toISOString();
    marketMeta = { status: 'provider', label: 'Provider feed', source: 'Twelve Data · NSE', delayMinutes: null, staleAfterSeconds: 120, isDemo: false };
    providerHealthy = true; broadcast('market', { asOf: marketAsOf, provider: 'twelve-data' });
  } catch (error) {
    providerHealthy = false;
    marketMeta = { status: 'fallback', label: 'Provider unavailable', source: 'Twelve Data · retrying', delayMinutes: null, staleAfterSeconds: 120, isDemo: false, warning: error.message };
    broadcast('market', { asOf: marketAsOf, provider: 'twelve-data', unavailable: true });
  }
}

async function api(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/auth/demo') {
    const record = await repository.findById('demo-user');
    if (!record) return json(res, 404, { error: 'Demo account is unavailable.' });
    const token = createSession(record.account.id);
    return json(res, 200, bootstrap(record.account, record.version), { 'Set-Cookie': sessionCookie(token) });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const input = await body(req);
    const name = String(input.name || '').trim().slice(0, 50);
    const email = String(input.email || '').trim().toLowerCase().slice(0, 100);
    const password = String(input.password || '');
    if (name.length < 2) return json(res, 422, { error: 'Enter a name with at least 2 characters.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 422, { error: 'Enter a valid email address.' });
    if (password.length < 8 || password.length > 128) return json(res, 422, { error: 'Password must contain 8 to 128 characters.' });
    if (await repository.findByEmail(email)) return json(res, 409, { error: 'An account with this email already exists.' });
    const passwordData = hashPassword(password);
    const account = { id: crypto.randomUUID(), user: { id: crypto.randomUUID(), name, email, accountType: 'Personal account' }, passwordSalt: passwordData.salt, passwordHash: passwordData.hash, lastReviewedAt: new Date().toISOString(), lastReviewedSnapshots: {}, watchlists: [{ id: crypto.randomUUID(), name: 'My watchlist', symbolIds: ['RELIANCE', 'HDFCBANK', 'TCS'] }] };
    const saved = await repository.create(account); const token = createSession(account.id);
    broadcast('store', { accountId: account.id, version: saved.version });
    return json(res, 201, bootstrap(saved.account, saved.version), { 'Set-Cookie': sessionCookie(token) });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const input = await body(req);
    const email = String(input.email || '').trim().toLowerCase(); const password = String(input.password || '');
    if (rateLimited(req, email)) return json(res, 429, { error: 'Too many attempts. Wait one minute and try again.' });
    const record = await repository.findByEmail(email); const account = record?.account;
    if (!account || !validPassword(password, account)) return json(res, 401, { error: 'Email or password is incorrect.' });
    loginAttempts.delete(`${req.socket.remoteAddress}:${email}`); const token = createSession(account.id);
    return json(res, 200, bootstrap(account, record.version), { 'Set-Cookie': sessionCookie(token) });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = cookies(req).pulse_session; if (token) sessions.delete(token);
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', true) });
  }

  const auth = await authenticated(req);
  if (!auth) return json(res, 401, { error: 'Please sign in to continue.' });
  const { account, version } = auth;
  if (req.method === 'GET' && url.pathname === '/api/bootstrap') return json(res, 200, bootstrap(account, version));
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: connected\ndata: {}\n\n`); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (req.method === 'POST' && url.pathname === '/api/watchlists') {
    const input = await body(req);
    const name = String(input.name || '').trim().slice(0, 40);
    if (!name) return json(res, 422, { error: 'Watchlist name is required.' });
    account.watchlists.push({ id: crypto.randomUUID(), name, symbolIds: [] });
    const saved = await saveAccount(account, input.version); return json(res, 201, bootstrap(saved.account, saved.version));
  }
  if (req.method === 'PATCH' && url.pathname === '/api/profile') {
    const input = await body(req);
    const name = String(input.name || '').trim().slice(0, 50);
    const email = String(input.email || '').trim().toLowerCase().slice(0, 100);
    if (name.length < 2) return json(res, 422, { error: 'Enter a name with at least 2 characters.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 422, { error: 'Enter a valid email address.' });
    const owner = await repository.findByEmail(email);
    if (owner && owner.account.id !== account.id) return json(res, 409, { error: 'That email is already in use.' });
    account.user = { ...account.user, name, email };
    const saved = await saveAccount(account, input.version); return json(res, 200, bootstrap(saved.account, saved.version));
  }
  if (req.method === 'POST' && ['/api/account/reset', '/api/demo/reset'].includes(url.pathname)) {
    const input = await body(req);
    Object.assign(account, freshDemoState());
    const saved = await saveAccount(account, input.version); return json(res, 200, bootstrap(saved.account, saved.version));
  }
  const itemMatch = url.pathname.match(/^\/api\/watchlists\/([^/]+)\/items\/([^/]+)$/);
  if (itemMatch && ['PUT', 'DELETE'].includes(req.method)) {
    const [, listId, symbol] = itemMatch; const input = await body(req);
    const list = account.watchlists.find(item => item.id === listId);
    if (!list) return json(res, 404, { error: 'Watchlist not found.' });
    if (!instruments[symbol]) return json(res, 404, { error: 'Instrument not found.' });
    if (req.method === 'PUT' && !list.symbolIds.includes(symbol)) list.symbolIds.push(symbol);
    if (req.method === 'DELETE') list.symbolIds = list.symbolIds.filter(id => id !== symbol);
    const saved = await saveAccount(account, input.version); return json(res, 200, bootstrap(saved.account, saved.version));
  }
  const listMatch = url.pathname.match(/^\/api\/watchlists\/([^/]+)$/);
  if (listMatch && req.method === 'PATCH') {
    const input = await body(req); const list = account.watchlists.find(item => item.id === listMatch[1]);
    if (!list) return json(res, 404, { error: 'Watchlist not found.' });
    const name = String(input.name || '').trim().slice(0, 40);
    if (!name) return json(res, 422, { error: 'Watchlist name is required.' });
    if (account.watchlists.some(item => item.id !== list.id && item.name.toLowerCase() === name.toLowerCase())) return json(res, 409, { error: 'A watchlist with that name already exists.' });
    list.name = name; const saved = await saveAccount(account, input.version); return json(res, 200, bootstrap(saved.account, saved.version));
  }
  if (listMatch && req.method === 'DELETE') {
    const input = await body(req);
    if (account.watchlists.length === 1) return json(res, 422, { error: 'Keep at least one watchlist.' });
    account.watchlists = account.watchlists.filter(item => item.id !== listMatch[1]);
    const saved = await saveAccount(account, input.version); return json(res, 200, bootstrap(saved.account, saved.version));
  }
  if (req.method === 'POST' && url.pathname === '/api/review') {
    const input = await body(req); account.lastReviewedAt = new Date().toISOString();
    account.lastReviewedSnapshots = Object.fromEntries(Object.values(instruments).map(stock => [stock.symbol, { price: stock.price, volume: stock.volume, high: stock.high, low: stock.low, timestamp: account.lastReviewedAt }]));
    const saved = await saveAccount(account, input.version); return json(res, 200, bootstrap(saved.account, saved.version));
  }
  return json(res, 404, { error: 'Not found' });
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.resolve(ROOT, 'public', relative);
    if (!file.startsWith(path.resolve(ROOT, 'public'))) return json(res, 403, { error: 'Forbidden' });
    fs.readFile(file, (error, data) => { if (error) return json(res, 404, { error: 'Not found' }); res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); });
  } catch (error) { json(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong.' }); }
});

async function start() {
  await repository.initialize();
  server.listen(PORT, HOST, () => console.log(`Pulse is running at http://localhost:${PORT} · ${repository.kind} persistence`));
  if (process.env.PULSE_DISABLE_TICKS !== '1') {
    if (twelveDataKey) { refreshProviderMarket(); setInterval(refreshProviderMarket, 60_000); setInterval(() => { if (!providerHealthy) advanceDemoMarket(true); }, 8_000); }
    else setInterval(advanceDemoMarket, 8_000);
  }
}

start().catch(error => {
  console.error(`Pulse failed to start: ${error.message}`);
  process.exitCode = 1;
});
