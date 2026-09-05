const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createJsonRepository } = require('../persistence');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-repository-'));
  const seedPath = path.join(directory, 'seed.json');
  const storePath = path.join(directory, 'store.json');
  fs.writeFileSync(seedPath, JSON.stringify({ version: 1, accounts: [{ id: 'demo-user', user: { id: 'demo-user', name: 'Pulse Demo', email: 'demo@example.com' }, watchlists: [], lastReviewedSnapshots: {} }] }));
  return { directory, repository: createJsonRepository({ storePath, seedPath }) };
}

test('repository creates runtime state from the committed seed', async t => {
  const { directory, repository } = fixture();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await repository.initialize();
  const record = await repository.findById('demo-user');
  assert.equal(record.account.user.email, 'demo@example.com');
  assert.equal(record.version, 1);
});

test('repository persists account rows and enforces unique email addresses', async t => {
  const { directory, repository } = fixture();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await repository.initialize();
  const account = { id: 'account-2', user: { id: 'user-2', name: 'Test User', email: 'test@example.com' }, watchlists: [], lastReviewedSnapshots: {} };
  const created = await repository.create(account);
  assert.equal(created.version, 2);
  assert.equal((await repository.findByEmail('test@example.com')).account.id, 'account-2');
  await assert.rejects(() => repository.create({ ...account, id: 'account-3' }), { status: 409 });
});

test('repository rejects stale optimistic writes', async t => {
  const { directory, repository } = fixture();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await repository.initialize();
  const record = await repository.findById('demo-user');
  record.account.user.name = 'Updated Demo';
  const saved = await repository.update(record.account, record.version);
  assert.equal(saved.version, 2);
  await assert.rejects(() => repository.update(record.account, record.version), { status: 409 });
});
