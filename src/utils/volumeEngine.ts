import { Candle, VolumeAnalysis } from '../types/smc';

/**
 * Decomposes candle volume into Buy and Sell components using Price-Action & Wick Analysis
 */
export function calculateCandleVolumeDecomposition(c: Candle): {
  buyVolume: number;
  sellVolume: number;
  buyRatio: number;
  sellRatio: number;
  delta: number;
} {
  const v = c.volume || 0;
  const range = c.high - c.low;
  if (range <= 0 || v <= 0) {
    const half = Math.round(v / 2);
    return {
      buyVolume: half,
      sellVolume: v - half,
      buyRatio: 50,
      sellRatio: 50,
      delta: 0,
    };
  }

  // 1. Close Location Value (-1.0 to +1.0)
  const clv = (2 * c.close - c.high - c.low) / range;

  // 2. Candle Body Direction & Proportion (-1.0 to +1.0)
  const bodyFraction = (c.close - c.open) / range;

  // 3. Upper vs Lower Wick Absorption Force (-1.0 to +1.0)
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const upperWick = c.high - Math.max(c.open, c.close);
  const wickForce = (lowerWick - upperWick) / range;

  // 4. Combined Institutional Flow Force (-1.0 to +1.0)
  const force = 0.5 * clv + 0.3 * bodyFraction + 0.2 * wickForce;

  // Convert to buy ratio (bounded between 5% and 95% for realistic institutional trading)
  const rawRatio = (force + 1) / 2;
  const buyRatio = Math.max(5, Math.min(95, Math.round(rawRatio * 100)));
  const sellRatio = 100 - buyRatio;

  const buyVolume = Math.round((v * buyRatio) / 100);
  const sellVolume = v - buyVolume;
  const delta = buyVolume - sellVolume;

  return { buyVolume, sellVolume, buyRatio, sellRatio, delta };
}

/**
 * Calculates rolling volume flow (Buy vs Sell Volume) across recent candles
 */
export function computeVolumeAnalysis(candles: Candle[]): VolumeAnalysis {
  if (!candles || candles.length === 0) {
    return {
      recentBuyVolume: 0,
      recentSellVolume: 0,
      recentTotalVolume: 0,
      buyRatio: 50,
      sellRatio: 50,
      netDelta: 0,
      bias: 'NEUTRAL',
      biasLabel: 'แรงซื้อ-ขายสมดุล 🟡',
      scoreContribution: 10,
    };
  }

  const windowCandles = candles.slice(-20);
  let totalBuy = 0;
  let totalSell = 0;

  for (const c of windowCandles) {
    const decomp = (c.buyRatio !== undefined && c.buyVolume !== undefined)
      ? { buyVolume: c.buyVolume, sellVolume: c.sellVolume || 0, buyRatio: c.buyRatio, sellRatio: c.sellRatio || (100 - c.buyRatio), delta: c.delta || 0 }
      : calculateCandleVolumeDecomposition(c);

    c.buyVolume = decomp.buyVolume;
    c.sellVolume = decomp.sellVolume;
    c.buyRatio = decomp.buyRatio;
    c.sellRatio = decomp.sellRatio;
    c.delta = decomp.delta;

    totalBuy += decomp.buyVolume;
    totalSell += decomp.sellVolume;
  }

  const totalVol = totalBuy + totalSell;
  const buyRatio = totalVol > 0 ? Math.round((totalBuy / totalVol) * 100) : 50;
  const sellRatio = 100 - buyRatio;
  const netDelta = totalBuy - totalSell;

  let bias: VolumeAnalysis['bias'] = 'NEUTRAL';
  let biasLabel = 'แรงซื้อ-ขายสมดุล 🟡';
  let scoreContribution = 10;

  if (buyRatio >= 62) {
    bias = 'STRONG_BUY';
    biasLabel = 'แรงซื้อคุมตลาดหนาแน่น 🟢🟢';
    scoreContribution = 20;
  } else if (buyRatio >= 54) {
    bias = 'MODERATE_BUY';
    biasLabel = 'แรงซื้อได้เปรียบ 🟢';
    scoreContribution = 16;
  } else if (buyRatio >= 47) {
    bias = 'NEUTRAL';
    biasLabel = 'แรงซื้อ-ขายทรงตัว 🟡';
    scoreContribution = 11;
  } else if (buyRatio >= 38) {
    bias = 'MODERATE_SELL';
    biasLabel = 'แรงขายเริ่มกดดัน 🔴';
    scoreContribution = 6;
  } else {
    bias = 'STRONG_SELL';
    biasLabel = 'แรงขายเททิ้งรุนแรง 🔴🔴';
    scoreContribution = 2;
  }

  const latest = windowCandles[windowCandles.length - 1];
  const latestDecomp = (latest.buyRatio !== undefined)
    ? { buyVolume: latest.buyVolume || 0, sellVolume: latest.sellVolume || 0, buyRatio: latest.buyRatio, sellRatio: latest.sellRatio || (100 - latest.buyRatio), delta: latest.delta || 0 }
    : calculateCandleVolumeDecomposition(latest);

  return {
    recentBuyVolume: totalBuy,
    recentSellVolume: totalSell,
    recentTotalVolume: totalVol,
    buyRatio,
    sellRatio,
    netDelta,
    bias,
    biasLabel,
    scoreContribution,
    latestCandle: {
      buyRatio: latestDecomp.buyRatio,
      sellRatio: latestDecomp.sellRatio,
      buyVolume: latestDecomp.buyVolume,
      sellVolume: latestDecomp.sellVolume,
      delta: latestDecomp.delta
    }
  };
}
