const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const port = 3199;
let child;
let tempDirectory;
let sessionCookie;

function api(route, options = {}, cookie = sessionCookie) {
  return fetch(`http://127.0.0.1:${port}${route}`, { ...options, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) } });
}

test.before(async () => {
  tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-'));
  const storePath = path.join(tempDirectory, 'store.json');
  fs.copyFileSync(path.join('data', 'store.seed.json'), storePath);
  child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), PULSE_STORE_PATH: storePath, PULSE_DISABLE_TICKS: '1' }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${port}/api/bootstrap`);
      const login = await api('/api/auth/demo', { method: 'POST', body: '{}' }, null);
      sessionCookie = login.headers.get('set-cookie').split(';')[0]; return;
    } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  throw new Error('Server did not start');
});

test.after(() => { child?.kill(); fs.rmSync(tempDirectory, { recursive: true, force: true }); });

test('bootstrap exposes transparent freshness and stock-relative scores', async () => {
  const response = await api('/api/bootstrap');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.market.delayMinutes, 1);
  assert.ok(data.instruments.some(stock => stock.score > 0 && stock.scoringMode === 'personal-baseline'));
  assert.ok(data.instruments.every(stock => Number.isFinite(stock.sinceReviewPct)));
  assert.ok(data.watchlists.length > 0);
});

test('protected data requires an authenticated session', async () => {
  const response = await api('/api/bootstrap', {}, null);
  assert.equal(response.status, 401);
});

test('registration creates an isolated account that can log in again', async () => {
  const registration = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'New Investor', email: 'investor@example.com', password: 'careful-pass-123' }) }, null);
  assert.equal(registration.status, 201);
  const registeredCookie = registration.headers.get('set-cookie').split(';')[0];
  const registered = await api('/api/bootstrap', {}, registeredCookie).then(value => value.json());
  assert.equal(registered.user.email, 'investor@example.com');
  assert.equal(registered.watchlists[0].symbolIds.length, 3);
  const demo = await api('/api/bootstrap').then(value => value.json());
  assert.equal(demo.watchlists[0].symbolIds.length, 6);
  const restoredResponse = await api('/api/account/reset', { method: 'POST', body: JSON.stringify({ version: registered.version }) }, registeredCookie);
  assert.equal(restoredResponse.status, 200);
  const restored = await restoredResponse.json();
  assert.deepEqual(restored.watchlists.map(item => item.id), ['core', 'earnings']);

  await api('/api/auth/logout', { method: 'POST', body: '{}' }, registeredCookie);
  const loggedOut = await api('/api/bootstrap', {}, registeredCookie);
  assert.equal(loggedOut.status, 401);
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'investor@example.com', password: 'careful-pass-123' }) }, null);
  assert.equal(login.status, 200);
});

test('stale mutation is rejected instead of overwriting state', async () => {
  const data = await api('/api/bootstrap').then(value => value.json());
  const first = await api('/api/watchlists', { method: 'POST', body: JSON.stringify({ name: 'Concurrency test', version: data.version }) });
  assert.equal(first.status, 201);
  const stale = await api('/api/watchlists', { method: 'POST', body: JSON.stringify({ name: 'Should fail', version: data.version }) });
  assert.equal(stale.status, 409);
});

test('watchlists can be created, renamed, and deleted', async () => {
  const before = await api('/api/bootstrap').then(value => value.json());
  const createdResponse = await api('/api/watchlists', { method: 'POST', body: JSON.stringify({ name: 'Temporary list', version: before.version }) });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json(); const list = created.watchlists.find(item => item.name === 'Temporary list');
  const renamedResponse = await api(`/api/watchlists/${list.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Renamed list', version: created.version }) });
  assert.equal(renamedResponse.status, 200);
  const renamed = await renamedResponse.json();
  assert.equal(renamed.watchlists.find(item => item.id === list.id).name, 'Renamed list');
  const deletedResponse = await api(`/api/watchlists/${list.id}`, { method: 'DELETE', body: JSON.stringify({ version: renamed.version }) });
  assert.equal(deletedResponse.status, 200);
  const deleted = await deletedResponse.json();
  assert.ok(!deleted.watchlists.some(item => item.id === list.id));
});

test('profile updates persist with validation and versioning', async () => {
  const before = await api('/api/bootstrap').then(value => value.json());
  const response = await api('/api/profile', { method: 'PATCH', body: JSON.stringify({ name: 'Dia Rao', email: 'dia@example.com', version: before.version }) });
  assert.equal(response.status, 200);
  const after = await api('/api/bootstrap').then(value => value.json());
  assert.equal(after.user.name, 'Dia Rao');
  assert.equal(after.user.email, 'dia@example.com');
});

test('reviewing stores observations and clears the attention queue', async () => {
  const before = await api('/api/bootstrap').then(value => value.json());
  assert.ok(before.instruments.some(stock => stock.signals.length));
  const response = await api('/api/review', { method: 'POST', body: JSON.stringify({ version: before.version }) });
  assert.equal(response.status, 200);
  const after = await api('/api/bootstrap').then(value => value.json());
  assert.ok(after.instruments.every(stock => stock.signals.length === 0));
});

test('demo reset restores seeded watchlists and attention signals', async () => {
  const before = await api('/api/bootstrap').then(value => value.json());
  const response = await api('/api/account/reset', { method: 'POST', body: JSON.stringify({ version: before.version }) });
  assert.equal(response.status, 200);
  const reset = await response.json();
  assert.deepEqual(reset.watchlists.map(item => item.id), ['core', 'earnings']);
  assert.ok(reset.instruments.some(stock => stock.signals.length));
});

test('path traversal is not served', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/..%2Fserver.js`);
  assert.notEqual(response.status, 200);
});
