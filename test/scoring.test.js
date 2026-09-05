const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreStock } = require('../scoring');

const profile = { meanMove: 1, moveStdDev: 0.5, volumeStdDev: 0.4, meanRange: 2, rangeStdDev: 0.5, priorHigh: 110, priorLow: 90 };
const normal = { symbol: 'TEST', price: 101, previousClose: 100, high: 102, low: 100, volume: 10, avgVolume: 10 };

test('quiet observations stay below the noise floor', () => {
  const result = scoreStock(normal, { price: 100, high: 102, low: 100, volume: 10 }, profile);
  assert.equal(result.score, 0);
  assert.deepEqual(result.signals, []);
});

test('an abnormal price move and volume increase produce explainable signals', () => {
  const result = scoreStock({ ...normal, price: 106, high: 107, volume: 25 }, { price: 100, high: 102, low: 100, volume: 10 }, profile);
  assert.ok(result.score >= 1.15);
  assert.equal(result.signals[0].type, 'price');
  assert.ok(result.signals.some(signal => signal.type === 'volume'));
});

test('an acknowledged persistent anomaly does not immediately resurface', () => {
  const unusual = { ...normal, price: 106, high: 107, volume: 25 };
  const result = scoreStock(unusual, { price: 106, high: 107, low: 100, volume: 25 }, profile);
  assert.deepEqual(result.signals, []);
});

test('an acknowledged anomaly resurfaces only after meaningful re-escalation', () => {
  const snapshot = { price: 106, high: 107, low: 100, volume: 25 };
  const partialIncrease = scoreStock({ ...normal, price: 106, high: 107, volume: 27 }, snapshot, profile);
  assert.deepEqual(partialIncrease.signals, []);

  const renewedSpike = scoreStock({ ...normal, price: 106, high: 107, volume: 50 }, snapshot, profile);
  assert.ok(renewedSpike.score >= 1.15);
  assert.ok(renewedSpike.signals.some(signal => signal.type === 'volume'));
});

test('a split-like discontinuity is separated from attention scoring', () => {
  const result = scoreStock({ ...normal, price: 50, low: 49 }, { price: 100, high: 102, low: 98, volume: 10 }, profile);
  assert.equal(result.score, 0);
  assert.equal(result.signals[0].type, 'corporate-action');
});
