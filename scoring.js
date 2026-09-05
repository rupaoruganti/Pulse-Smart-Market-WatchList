const behavior = {
  RELIANCE: { meanMove: 1.20, moveStdDev: 0.65, volumeStdDev: 0.35, meanRange: 1.90, rangeStdDev: 0.50, priorHigh: 1410.00, priorLow: 1368.20 },
  HDFCBANK: { meanMove: 0.85, moveStdDev: 0.45, volumeStdDev: 0.30, meanRange: 1.25, rangeStdDev: 0.38, priorHigh: 1708.10, priorLow: 1675.20 },
  ZOMATO: { meanMove: 2.00, moveStdDev: 0.90, volumeStdDev: 0.40, meanRange: 2.70, rangeStdDev: 0.75, priorHigh: 328.00, priorLow: 310.40 },
  TCS: { meanMove: 1.10, moveStdDev: 0.55, volumeStdDev: 0.32, meanRange: 1.45, rangeStdDev: 0.42, priorHigh: 3130.00, priorLow: 3060.00 },
  INFY: { meanMove: 1.15, moveStdDev: 0.52, volumeStdDev: 0.31, meanRange: 1.55, rangeStdDev: 0.44, priorHigh: 1512.00, priorLow: 1474.00 },
  TATAMOTORS: { meanMove: 1.70, moveStdDev: 0.80, volumeStdDev: 0.40, meanRange: 2.20, rangeStdDev: 0.65, priorHigh: 744.00, priorLow: 720.00 },
  ICICIBANK: { meanMove: 0.90, moveStdDev: 0.44, volumeStdDev: 0.28, meanRange: 1.30, rangeStdDev: 0.36, priorHigh: 1450.00, priorLow: 1422.00 },
  SBIN: { meanMove: 1.25, moveStdDev: 0.58, volumeStdDev: 0.34, meanRange: 1.70, rangeStdDev: 0.48, priorHigh: 815.00, priorLow: 795.00 },
  BHARTIARTL: { meanMove: 1.10, moveStdDev: 0.50, volumeStdDev: 0.32, meanRange: 1.55, rangeStdDev: 0.42, priorHigh: 1935.00, priorLow: 1898.00 },
  LT: { meanMove: 1.20, moveStdDev: 0.56, volumeStdDev: 0.34, meanRange: 1.65, rangeStdDev: 0.46, priorHigh: 3705.00, priorLow: 3638.00 },
  MARUTI: { meanMove: 1.05, moveStdDev: 0.48, volumeStdDev: 0.30, meanRange: 1.40, rangeStdDev: 0.40, priorHigh: 12760.00, priorLow: 12600.00 },
  SUNPHARMA: { meanMove: 1.00, moveStdDev: 0.46, volumeStdDev: 0.31, meanRange: 1.45, rangeStdDev: 0.41, priorHigh: 1722.00, priorLow: 1688.00 }
};

function clamp(value, minimum = 0, maximum = 4) {
  return Math.min(maximum, Math.max(minimum, value));
}

function money(value) {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sameObservation(stock, snapshot) {
  return snapshot && ['price', 'volume', 'high', 'low'].every(key => Number(snapshot[key]) === Number(stock[key]));
}

function scoreStock(stock, snapshot, profile = behavior[stock.symbol]) {
  if (!profile) throw new Error(`No behavior profile for ${stock.symbol}`);
  const change = stock.price - stock.previousClose;
  const changePct = change / stock.previousClose * 100;
  const volumeRatio = stock.avgVolume >= 0.1 ? stock.volume / stock.avgVolume : 0;
  const baselinePrice = snapshot?.price || stock.previousClose;
  const sinceReviewPct = (stock.price - baselinePrice) / baselinePrice * 100;
  const rangePct = (stock.high - stock.low) / stock.previousClose * 100;

  // Corporate actions are separated from market-interest signals to avoid false urgency.
  if (Math.abs(sinceReviewPct) >= 35 && !sameObservation(stock, snapshot)) {
    return { ...stock, change, changePct, volumeRatio, sinceReviewPct, score: 0, scoringMode: snapshot ? 'personal-baseline' : 'fallback', signals: [{ type: 'corporate-action', contribution: 0, label: 'Possible corporate action', detail: 'Large discontinuity detected; price adjustment needs verification' }] };
  }

  const priceZ = clamp((Math.abs(sinceReviewPct) - profile.meanMove) / profile.moveStdDev);
  const currentVolumeZ = volumeRatio ? Math.max(0, (volumeRatio - 1) / profile.volumeStdDev) : 0;
  const baselineVolumeRatio = snapshot && stock.avgVolume >= 0.1 ? snapshot.volume / stock.avgVolume : 1;
  const baselineVolumeZ = Math.max(0, (baselineVolumeRatio - 1) / profile.volumeStdDev);
  const volumeZ = snapshot ? clamp(currentVolumeZ - baselineVolumeZ) : clamp(currentVolumeZ);
  const currentVolatilityZ = Math.max(0, (rangePct - profile.meanRange) / profile.rangeStdDev);
  const baselineRangePct = snapshot ? (snapshot.high - snapshot.low) / stock.previousClose * 100 : profile.meanRange;
  const baselineVolatilityZ = Math.max(0, (baselineRangePct - profile.meanRange) / profile.rangeStdDev);
  const volatilityZ = snapshot ? clamp(currentVolatilityZ - baselineVolatilityZ) : clamp(currentVolatilityZ);
  const crossedHigh = baselinePrice <= profile.priorHigh && stock.price > profile.priorHigh;
  const crossedLow = baselinePrice >= profile.priorLow && stock.price < profile.priorLow;
  const breachBoost = crossedHigh || crossedLow ? 2 : 0;
  const score = 0.45 * priceZ + 0.30 * volumeZ + 0.15 * breachBoost + 0.10 * volatilityZ;
  const signals = [];

  if (priceZ >= 1.5) signals.push({ type: 'price', contribution: 0.45 * priceZ, label: `${sinceReviewPct > 0 ? 'Up' : 'Down'} ${Math.abs(sinceReviewPct).toFixed(1)}% since review`, detail: `${priceZ.toFixed(1)}× standard deviations beyond its usual move` });
  if (volumeZ >= 1.5) signals.push({ type: 'volume', contribution: 0.30 * volumeZ, label: `${volumeRatio.toFixed(1)}× usual volume`, detail: 'Activity increased unusually since your last review' });
  if (crossedHigh) signals.push({ type: 'level', contribution: 0.30, label: `Crossed ₹${money(profile.priorHigh)}`, detail: 'Moved above the previous session’s high' });
  if (crossedLow) signals.push({ type: 'level', contribution: 0.30, label: `Fell below ₹${money(profile.priorLow)}`, detail: 'Moved below the previous session’s low' });
  if (volatilityZ >= 2) signals.push({ type: 'volatility', contribution: 0.10 * volatilityZ, label: 'Unusually volatile', detail: `Today’s range is ${rangePct.toFixed(1)}%, wider than normal` });
  signals.sort((a, b) => b.contribution - a.contribution);
  const isMeaningful = score >= 1.15 && signals.length > 0 && !sameObservation(stock, snapshot);

  return { ...stock, change, changePct, volumeRatio, sinceReviewPct, score: isMeaningful ? Number(score.toFixed(2)) : 0, signals: isMeaningful ? signals : [], scoringMode: snapshot ? 'personal-baseline' : 'fallback' };
}

module.exports = { behavior, scoreStock };
