import {
  Candle,
  SwingPoint,
  MarketStructureBreak,
  OrderBlock,
  FairValueGap,
  PremiumDiscount,
  LiquidityLevel,
  SmcAnalysisResult,
  SmcSummary,
  SimpleTradePlan,
  SellZone,
  HoldAdvice,
  BiasType,
  StructureBreakType,
  VolumeAnalysis
} from '../../src/types/smc.js';

export class SmcEngine {
  /**
   * Main entry point to compute all SMC indicators for a given set of candles.
   */
  public static analyze(
    symbol: string,
    name: string,
    timeframe: string,
    candles: Candle[]
  ): SmcAnalysisResult {
    if (!candles || candles.length < 15) {
      throw new Error(`Insufficient candle data for ${symbol}: requires at least 15 candles.`);
    }

    // Enrich all candles with Buy/Sell Volume decomposition
    for (const c of candles) {
      const decomp = this.calculateCandleVolumeDecomposition(c);
      c.buyVolume = decomp.buyVolume;
      c.sellVolume = decomp.sellVolume;
      c.buyRatio = decomp.buyRatio;
      c.sellRatio = decomp.sellRatio;
      c.delta = decomp.delta;
    }

    const volumeAnalysis = this.computeVolumeAnalysis(candles);
    const atr = this.calculateAtr(candles, 14);

    const internalLength = 5;
    const swingLength = Math.min(50, Math.max(12, Math.floor(candles.length / 5)));

    // LuxAlgo: Calculate both internal structure swings (len = 5) and major swing structure (len = 50)
    const internalSwings = this.calculateSwings(candles, internalLength, true);
    const swingPoints = this.calculateSwings(candles, swingLength, false);
    const allSwings = [...internalSwings, ...swingPoints].sort((a, b) => a.index - b.index);

    const { breaks, orderBlocks, strongWeakLevels, currentTrend, internalTrend } =
      this.calculateStructureAndOrderBlocks(candles, internalSwings, swingPoints, atr);

    const fvgs = this.calculateFairValueGaps(candles, atr);
    const premiumDiscount = this.calculatePremiumDiscount(candles, swingPoints.length > 0 ? swingPoints : internalSwings);
    const liquidityLevels = this.calculateLiquidityLevels(candles, atr);

    const summary = this.generateSummary(
      symbol,
      candles,
      breaks,
      orderBlocks,
      fvgs,
      premiumDiscount,
      allSwings,
      liquidityLevels,
      volumeAnalysis,
      strongWeakLevels,
      currentTrend,
      internalTrend,
      swingLength,
      internalLength
    );

    return {
      symbol,
      name,
      timeframe,
      currency: 'USD',
      candles,
      swings: allSwings,
      breaks,
      orderBlocks,
      fvgs,
      premiumDiscount,
      liquidityLevels,
      summary
    };
  }

  /**
   * Calculates Average True Range (ATR) matching Pine Script ta.atr(14).
   */
  public static calculateAtr(candles: Candle[], length: number = 14): number[] {
    const atr: number[] = new Array(candles.length).fill(0);
    if (!candles || candles.length === 0) return atr;
    if (candles.length === 1) {
      atr[0] = candles[0].high - candles[0].low;
      return atr;
    }

    const tr: number[] = [candles[0].high - candles[0].low];
    for (let i = 1; i < candles.length; i++) {
      const h = candles[i].high;
      const l = candles[i].low;
      const prevC = candles[i - 1].close;
      tr.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
    }

    const p = Math.min(length, tr.length);
    let sum = 0;
    for (let i = 0; i < p; i++) sum += tr[i];
    atr[p - 1] = sum / p;

    for (let i = p; i < candles.length; i++) {
      atr[i] = (atr[i - 1] * (length - 1) + tr[i]) / length;
    }
    for (let i = 0; i < p - 1; i++) {
      atr[i] = atr[p - 1] || tr[i];
    }
    return atr;
  }

  /**
   * Identifies Swing Highs and Swing Lows with LuxAlgo labels (HH, LH, HL, LL).
   */
  private static calculateSwings(candles: Candle[], length: number, isInternal: boolean): SwingPoint[] {
    const swings: SwingPoint[] = [];
    let lastHighPrice: number | null = null;
    let lastLowPrice: number | null = null;

    for (let i = length; i < candles.length - length; i++) {
      const current = candles[i];
      let isHigh = true;
      let isLow = true;

      for (let j = 1; j <= length; j++) {
        if (candles[i - j].high >= current.high || candles[i + j].high > current.high) {
          isHigh = false;
        }
        if (candles[i - j].low <= current.low || candles[i + j].low < current.low) {
          isLow = false;
        }
      }

      if (isHigh) {
        let label = 'HH';
        if (lastHighPrice !== null) {
          label = current.high > lastHighPrice ? 'HH' : 'LH';
        }
        lastHighPrice = current.high;

        swings.push({
          type: 'high',
          price: current.high,
          time: current.time,
          index: i,
          isInternal,
          label
        });
      }

      if (isLow) {
        let label = 'LL';
        if (lastLowPrice !== null) {
          label = current.low < lastLowPrice ? 'LL' : 'HL';
        }
        lastLowPrice = current.low;

        swings.push({
          type: 'low',
          price: current.low,
          time: current.time,
          index: i,
          isInternal,
          label
        });
      }
    }

    return swings.sort((a, b) => a.index - b.index);
  }

  /**
   * Analyzes Market Structure (BOS & CHoCH) and Order Blocks (OB) matching LuxAlgo Pine Script specifications:
   * - Internal Structure: length = 5, dashed line
   * - Swing Structure: length = 50, solid line
   * - Strong/Weak High & Low points
   * - Internal and Swing Order Blocks with ATR filter & mitigation tracking
   */
  private static calculateStructureAndOrderBlocks(
    candles: Candle[],
    internalSwings: SwingPoint[],
    swingPoints: SwingPoint[],
    atr: number[]
  ): {
    breaks: MarketStructureBreak[];
    orderBlocks: OrderBlock[];
    strongWeakLevels: { strongHigh?: number; weakHigh?: number; strongLow?: number; weakLow?: number };
    currentTrend: 'bullish' | 'bearish';
    internalTrend: 'bullish' | 'bearish';
  } {
    const breaks: MarketStructureBreak[] = [];
    const orderBlocks: OrderBlock[] = [];

    let trend: 'bullish' | 'bearish' = 'bullish';
    let itrend: 'bullish' | 'bearish' = 'bullish';

    let lastTop: SwingPoint | null = null;
    let lastBtm: SwingPoint | null = null;
    let lastItop: SwingPoint | null = null;
    let lastIbtm: SwingPoint | null = null;

    let topCross = true;
    let btmCross = true;
    let itopCross = true;
    let ibtmCross = true;

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const prevCandle = candles[i - 1] || candle;

      // 1. Update confirmed Major Swings (swingLength)
      const confirmedSwings = swingPoints.filter(s => s.index <= i - 2);
      const highs = confirmedSwings.filter(s => s.type === 'high');
      const lows = confirmedSwings.filter(s => s.type === 'low');

      if (highs.length > 0 && (!lastTop || highs[highs.length - 1].index !== lastTop.index)) {
        lastTop = highs[highs.length - 1];
        topCross = true;
      }
      if (lows.length > 0 && (!lastBtm || lows[lows.length - 1].index !== lastBtm.index)) {
        lastBtm = lows[lows.length - 1];
        btmCross = true;
      }

      // 2. Update confirmed Internal Swings (len = 5)
      const confirmedInternal = internalSwings.filter(s => s.index <= i - 2);
      const iHighs = confirmedInternal.filter(s => s.type === 'high');
      const iLows = confirmedInternal.filter(s => s.type === 'low');

      if (iHighs.length > 0 && (!lastItop || iHighs[iHighs.length - 1].index !== lastItop.index)) {
        lastItop = iHighs[iHighs.length - 1];
        itopCross = true;
      }
      if (iLows.length > 0 && (!lastIbtm || iLows[iLows.length - 1].index !== lastIbtm.index)) {
        lastIbtm = iLows[iLows.length - 1];
        ibtmCross = true;
      }

      // ──────────────────────────────────────────
      // INTERNAL BULLISH BREAK (ta.crossover(close, itop_y))
      // ──────────────────────────────────────────
      if (lastItop && itopCross && candle.close > lastItop.price && prevCandle.close <= lastItop.price && i > lastItop.index) {
        const isChoch = itrend === 'bearish';
        const type: StructureBreakType = isChoch ? 'CHoCH' : 'BOS';

        breaks.push({
          type,
          bias: 'bullish',
          price: lastItop.price,
          time: candle.time,
          sourceTime: lastItop.time,
          sourceIndex: lastItop.index,
          breakIndex: i,
          isInternal: true
        });

        // Detect Internal Bullish Order Block (ob_coord)
        const ob = this.extractLuxOrderBlock(candles, lastItop.index, i, 'bullish', true, atr);
        if (ob) orderBlocks.push(ob);

        itopCross = false;
        itrend = 'bullish';
      }

      // ──────────────────────────────────────────
      // INTERNAL BEARISH BREAK (ta.crossunder(close, ibtm_y))
      // ──────────────────────────────────────────
      if (lastIbtm && ibtmCross && candle.close < lastIbtm.price && prevCandle.close >= lastIbtm.price && i > lastIbtm.index) {
        const isChoch = itrend === 'bullish';
        const type: StructureBreakType = isChoch ? 'CHoCH' : 'BOS';

        breaks.push({
          type,
          bias: 'bearish',
          price: lastIbtm.price,
          time: candle.time,
          sourceTime: lastIbtm.time,
          sourceIndex: lastIbtm.index,
          breakIndex: i,
          isInternal: true
        });

        // Detect Internal Bearish Order Block (ob_coord)
        const ob = this.extractLuxOrderBlock(candles, lastIbtm.index, i, 'bearish', true, atr);
        if (ob) orderBlocks.push(ob);

        ibtmCross = false;
        itrend = 'bearish';
      }

      // ──────────────────────────────────────────
      // SWING BULLISH BREAK (ta.crossover(close, top_y))
      // ──────────────────────────────────────────
      if (lastTop && topCross && candle.close > lastTop.price && prevCandle.close <= lastTop.price && i > lastTop.index) {
        const isChoch = trend === 'bearish';
        const type: StructureBreakType = isChoch ? 'CHoCH' : 'BOS';

        breaks.push({
          type,
          bias: 'bullish',
          price: lastTop.price,
          time: candle.time,
          sourceTime: lastTop.time,
          sourceIndex: lastTop.index,
          breakIndex: i,
          isInternal: false
        });

        // Detect Swing Bullish Order Block (ob_coord)
        const ob = this.extractLuxOrderBlock(candles, lastTop.index, i, 'bullish', false, atr);
        if (ob) orderBlocks.push(ob);

        topCross = false;
        trend = 'bullish';
      }

      // ──────────────────────────────────────────
      // SWING BEARISH BREAK (ta.crossunder(close, btm_y))
      // ──────────────────────────────────────────
      if (lastBtm && btmCross && candle.close < lastBtm.price && prevCandle.close >= lastBtm.price && i > lastBtm.index) {
        const isChoch = trend === 'bullish';
        const type: StructureBreakType = isChoch ? 'CHoCH' : 'BOS';

        breaks.push({
          type,
          bias: 'bearish',
          price: lastBtm.price,
          time: candle.time,
          sourceTime: lastBtm.time,
          sourceIndex: lastBtm.index,
          breakIndex: i,
          isInternal: false
        });

        // Detect Swing Bearish Order Block (ob_coord)
        const ob = this.extractLuxOrderBlock(candles, lastBtm.index, i, 'bearish', false, atr);
        if (ob) orderBlocks.push(ob);

        btmCross = false;
        trend = 'bearish';
      }
    }

    // ──────────────────────────────────────────
    // MITIGATION & INVALIDATION TRACKING FOR ORDER BLOCKS
    // ──────────────────────────────────────────
    for (const ob of orderBlocks) {
      ob.endIndex = candles.length - 1;
      for (let k = ob.startIndex + 1; k < candles.length; k++) {
        const c = candles[k];
        if (ob.type === 'bullish') {
          // Mitigated if price retraces into top
          if (c.low <= ob.top) {
            ob.mitigated = true;
            ob.mitigatedTime = c.time;
            ob.endTime = c.time;
            ob.endIndex = k;
            break;
          }
        } else {
          // Bearish OB mitigated if price rises into bottom
          if (c.high >= ob.bottom) {
            ob.mitigated = true;
            ob.mitigatedTime = c.time;
            ob.endTime = c.time;
            ob.endIndex = k;
            break;
          }
        }
      }
    }

    // ──────────────────────────────────────────
    // STRONG / WEAK HIGH & LOW POINTS (LuxAlgo logic)
    // ──────────────────────────────────────────
    const strongWeakLevels: { strongHigh?: number; weakHigh?: number; strongLow?: number; weakLow?: number } = {};
    if (lastTop && lastBtm) {
      if (trend === 'bullish') {
        // In an uptrend: swing low is defended (Strong Low), swing high is target (Weak High)
        strongWeakLevels.strongLow = lastBtm.price;
        strongWeakLevels.weakHigh = lastTop.price;
        lastBtm.strengthLabel = 'Strong Low';
        lastTop.strengthLabel = 'Weak High';
      } else {
        // In a downtrend: swing high is defended (Strong High), swing low is target (Weak Low)
        strongWeakLevels.strongHigh = lastTop.price;
        strongWeakLevels.weakLow = lastBtm.price;
        lastTop.strengthLabel = 'Strong High';
        lastBtm.strengthLabel = 'Weak Low';
      }
    }

    return {
      breaks,
      orderBlocks,
      strongWeakLevels,
      currentTrend: trend,
      internalTrend: itrend
    };
  }

  /**
   * Helper extracting Order Block coordinates matching LuxAlgo `ob_coord`:
   * Searches backward between breakout bar and pivot:
   * - Bullish OB: bar with minimum low
   * - Bearish OB: bar with maximum high
   * - Filtered by ATR threshold: (high - low) < atr * 2
   */
  private static extractLuxOrderBlock(
    candles: Candle[],
    fromIndex: number,
    toIndex: number,
    type: 'bullish' | 'bearish',
    isInternal: boolean,
    atr: number[]
  ): OrderBlock | null {
    const start = Math.min(toIndex - 1, candles.length - 1);
    const end = Math.max(0, fromIndex);

    let bestCandle: Candle | null = null;
    let bestIndex = fromIndex;

    if (type === 'bullish') {
      let minLow = Infinity;
      for (let k = start; k >= end; k--) {
        const c = candles[k];
        const barAtr = atr[k] || (c.high - c.low);
        if ((c.high - c.low) < barAtr * 2) {
          if (c.low < minLow) {
            minLow = c.low;
            bestCandle = c;
            bestIndex = k;
          }
        }
      }
    } else {
      let maxHigh = -Infinity;
      for (let k = start; k >= end; k--) {
        const c = candles[k];
        const barAtr = atr[k] || (c.high - c.low);
        if ((c.high - c.low) < barAtr * 2) {
          if (c.high > maxHigh) {
            maxHigh = c.high;
            bestCandle = c;
            bestIndex = k;
          }
        }
      }
    }

    if (!bestCandle) {
      bestCandle = candles[fromIndex];
      bestIndex = fromIndex;
    }
    if (!bestCandle) return null;

    const top = type === 'bullish'
      ? Math.max(bestCandle.open, bestCandle.high)
      : bestCandle.high;
    const bottom = type === 'bullish'
      ? bestCandle.low
      : Math.min(bestCandle.open, bestCandle.low);

    return {
      id: `ob-${isInternal ? 'int' : 'swg'}-${type}-${bestCandle.time}`,
      type,
      top: Number(top.toFixed(2)),
      bottom: Number(bottom.toFixed(2)),
      startTime: bestCandle.time,
      endTime: candles[candles.length - 1].time,
      startIndex: bestIndex,
      endIndex: candles.length - 1,
      mitigated: false,
      volume: bestCandle.volume,
      strength: isInternal ? 3 : 5,
      isInternal
    };
  }

  /**
   * Calculates Fair Value Gaps (FVG) matching LuxAlgo:
   * Bullish: c3.low > c1.high && c2.close > c1.high
   * Bearish: c3.high < c1.low && c2.close < c1.low
   */
  private static calculateFairValueGaps(candles: Candle[], atr: number[]): FairValueGap[] {
    const fvgs: FairValueGap[] = [];

    for (let i = 2; i < candles.length; i++) {
      const c1 = candles[i - 2];
      const c2 = candles[i - 1];
      const c3 = candles[i];
      const curAtr = atr[i - 1] || (c2.high - c2.low);

      // Bullish FVG
      if (c3.low > c1.high && c2.close > c1.high) {
        const gapTop = c3.low;
        const gapBottom = c1.high;
        const height = gapTop - gapBottom;

        if (height > curAtr * 0.1) {
          const fvg: FairValueGap = {
            id: `fvg-bull-${c2.time}`,
            type: 'bullish',
            top: Number(gapTop.toFixed(2)),
            bottom: Number(gapBottom.toFixed(2)),
            startTime: c2.time,
            endTime: candles[candles.length - 1].time,
            startIndex: i - 1,
            endIndex: candles.length - 1,
            mitigated: false,
            fillPercent: 0
          };

          for (let k = i + 1; k < candles.length; k++) {
            const next = candles[k];
            if (next.low <= gapBottom) {
              fvg.mitigated = true;
              fvg.fillPercent = 100;
              fvg.endTime = next.time;
              fvg.endIndex = k;
              break;
            } else if (next.low < gapTop) {
              const filled = gapTop - next.low;
              const pct = Math.min(100, Math.round((filled / height) * 100));
              if (pct > fvg.fillPercent) fvg.fillPercent = pct;
              if (fvg.fillPercent >= 80) {
                fvg.mitigated = true;
                fvg.endTime = next.time;
                fvg.endIndex = k;
                break;
              }
            }
          }
          fvgs.push(fvg);
        }
      }

      // Bearish FVG
      if (c3.high < c1.low && c2.close < c1.low) {
        const gapTop = c1.low;
        const gapBottom = c3.high;
        const height = gapTop - gapBottom;

        if (height > curAtr * 0.1) {
          const fvg: FairValueGap = {
            id: `fvg-bear-${c2.time}`,
            type: 'bearish',
            top: Number(gapTop.toFixed(2)),
            bottom: Number(gapBottom.toFixed(2)),
            startTime: c2.time,
            endTime: candles[candles.length - 1].time,
            startIndex: i - 1,
            endIndex: candles.length - 1,
            mitigated: false,
            fillPercent: 0
          };

          for (let k = i + 1; k < candles.length; k++) {
            const next = candles[k];
            if (next.high >= gapTop) {
              fvg.mitigated = true;
              fvg.fillPercent = 100;
              fvg.endTime = next.time;
              fvg.endIndex = k;
              break;
            } else if (next.high > gapBottom) {
              const filled = next.high - gapBottom;
              const pct = Math.min(100, Math.round((filled / height) * 100));
              if (pct > fvg.fillPercent) fvg.fillPercent = pct;
              if (fvg.fillPercent >= 80) {
                fvg.mitigated = true;
                fvg.endTime = next.time;
                fvg.endIndex = k;
                break;
              }
            }
          }
          fvgs.push(fvg);
        }
      }
    }

    return fvgs;
  }

  /**
   * Calculates Premium, Equilibrium & Discount Zones matching LuxAlgo:
   * trail_up = swing high, trail_dn = swing low
   * avg = (trail_up + trail_dn) / 2
   * Premium: .95 * trail_up + .05 * trail_dn to trail_up
   * Equilibrium: .475 * trail_up + .525 * trail_dn to .525 * trail_up + .475 * trail_dn
   * Discount: trail_dn to .95 * trail_dn + .05 * trail_up
   */
  private static calculatePremiumDiscount(
    candles: Candle[],
    swings: SwingPoint[]
  ): PremiumDiscount {
    const currentPrice = candles[candles.length - 1].close;

    const highs = swings.filter(s => s.type === 'high');
    const lows = swings.filter(s => s.type === 'low');

    const recentCandles = candles.slice(-50);
    let highest = Math.max(...recentCandles.map(c => c.high));
    let lowest = Math.min(...recentCandles.map(c => c.low));

    if (highs.length > 0) highest = Math.max(highest, highs[highs.length - 1].price);
    if (lows.length > 0) lowest = Math.min(lowest, lows[lows.length - 1].price);

    const equilibrium = Number(((highest + lowest) / 2).toFixed(2));
    const eqUpper = 0.525 * highest + 0.475 * lowest;
    const eqLower = 0.475 * highest + 0.525 * lowest;

    let currentZone: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM' = 'EQUILIBRIUM';
    if (currentPrice > eqUpper) {
      currentZone = 'PREMIUM';
    } else if (currentPrice < eqLower) {
      currentZone = 'DISCOUNT';
    }

    return {
      high: Number(highest.toFixed(2)),
      low: Number(lowest.toFixed(2)),
      equilibrium,
      premiumZone: {
        from: Number((0.95 * highest + 0.05 * lowest).toFixed(2)),
        to: Number(highest.toFixed(2))
      },
      discountZone: {
        from: Number(lowest.toFixed(2)),
        to: Number((0.95 * lowest + 0.05 * highest).toFixed(2))
      },
      currentZone
    };
  }

  /**
   * Detects Equal Highs (EQH) and Equal Lows (EQL) matching LuxAlgo Pine Script:
   * eq_len = 3, threshold = atr * 0.1
   */
  private static calculateLiquidityLevels(
    candles: Candle[],
    atr: number[]
  ): LiquidityLevel[] {
    const levels: LiquidityLevel[] = [];
    const eqLen = 3;

    // Detect pivot highs and lows with length 3
    const pivotHighs: { price: number; index: number; time: number }[] = [];
    const pivotLows: { price: number; index: number; time: number }[] = [];

    for (let i = eqLen; i < candles.length - eqLen; i++) {
      const c = candles[i];
      let isHigh = true;
      let isLow = true;

      for (let j = 1; j <= eqLen; j++) {
        if (candles[i - j].high >= c.high || candles[i + j].high > c.high) isHigh = false;
        if (candles[i - j].low <= c.low || candles[i + j].low < c.low) isLow = false;
      }

      if (isHigh) pivotHighs.push({ price: c.high, index: i, time: c.time });
      if (isLow) pivotLows.push({ price: c.low, index: i, time: c.time });
    }

    // EQH detection: abs(top - prev_top) < atr * 0.1
    for (let i = 0; i < pivotHighs.length - 1; i++) {
      const h1 = pivotHighs[i];
      const h2 = pivotHighs[i + 1];
      const curAtr = atr[h2.index] || (candles[h2.index].high - candles[h2.index].low);
      const threshold = Math.max(curAtr * 0.1, h1.price * 0.0015);

      if (Math.abs(h1.price - h2.price) <= threshold) {
        levels.push({
          type: 'EQH',
          price: Number(((h1.price + h2.price) / 2).toFixed(2)),
          time: h2.time,
          label: 'EQH (Buy-Side Liquidity BSL)'
        });
      }
    }

    // EQL detection: abs(btm - prev_btm) < atr * 0.1
    for (let i = 0; i < pivotLows.length - 1; i++) {
      const l1 = pivotLows[i];
      const l2 = pivotLows[i + 1];
      const curAtr = atr[l2.index] || (candles[l2.index].high - candles[l2.index].low);
      const threshold = Math.max(curAtr * 0.1, l1.price * 0.0015);

      if (Math.abs(l1.price - l2.price) <= threshold) {
        levels.push({
          type: 'EQL',
          price: Number(((l1.price + l2.price) / 2).toFixed(2)),
          time: l2.time,
          label: 'EQL (Sell-Side Liquidity SSL)'
        });
      }
    }

    return levels;
  }

  /**
   * Generates AI SMC trading summary with Thai descriptions and actionable levels.
   */
  private static generateSummary(
    symbol: string,
    candles: Candle[],
    breaks: MarketStructureBreak[],
    orderBlocks: OrderBlock[],
    fvgs: FairValueGap[],
    premiumDiscount: PremiumDiscount,
    swings: SwingPoint[] = [],
    liquidityLevels: LiquidityLevel[] = [],
    volumeAnalysis?: VolumeAnalysis,
    strongWeakLevels?: { strongHigh?: number; weakHigh?: number; strongLow?: number; weakLow?: number },
    trendBias: 'bullish' | 'bearish' = 'bullish',
    internalTrend: 'bullish' | 'bearish' = 'bullish',
    swingLength: number = 50,
    internalLength: number = 5
  ): SmcSummary {
    const latestCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2] || latestCandle;
    const currentPrice = Number(latestCandle.close.toFixed(2));
    const change24h = Number((latestCandle.close - prevCandle.close).toFixed(2));
    const changePercent = Number((((latestCandle.close - prevCandle.close) / prevCandle.close) * 100).toFixed(2));

    // Determine nearest unmitigated Order Blocks
    const unmitigatedBullishOBs = orderBlocks
      .filter(ob => ob.type === 'bullish' && !ob.mitigated && ob.top <= currentPrice)
      .sort((a, b) => b.top - a.top); // Highest demand below current price

    const unmitigatedBearishOBs = orderBlocks
      .filter(ob => ob.type === 'bearish' && !ob.mitigated && ob.bottom >= currentPrice)
      .sort((a, b) => a.bottom - b.bottom); // Lowest supply above current price

    const nearestDemand = unmitigatedBullishOBs[0] || null;
    const nearestSupply = unmitigatedBearishOBs[0] || null;

    // Nearest unmitigated FVG
    const unmitigatedFvgs = fvgs
      .filter(f => !f.mitigated)
      .sort((a, b) => Math.abs(a.top - currentPrice) - Math.abs(b.top - currentPrice));
    const nearestFvg = unmitigatedFvgs[0] || null;

    // Last structure break
    const latestBreak = breaks.length > 0 ? breaks[breaks.length - 1] : null;

    // Determine overall bias
    let score = 0;
    if (latestBreak) {
      if (latestBreak.bias === 'bullish') score += latestBreak.type === 'CHoCH' ? 2 : 1;
      else score -= latestBreak.type === 'CHoCH' ? 2 : 1;
    }
    if (premiumDiscount.currentZone === 'DISCOUNT') score += 1; // Good for buys
    if (premiumDiscount.currentZone === 'PREMIUM') score -= 1; // Good for sells

    let overallBias: SmcSummary['overallBias'] = 'NEUTRAL';
    if (score >= 2) overallBias = 'STRONG_BULLISH';
    else if (score === 1) overallBias = 'BULLISH';
    else if (score <= -2) overallBias = 'STRONG_BEARISH';
    else if (score === -1) overallBias = 'BEARISH';

    const currentTrend = latestBreak
      ? `${latestBreak.bias === 'bullish' ? 'ขาขึ้น (Uptrend)' : 'ขาลง (Downtrend)'} ยืนยันโดย ${latestBreak.type} ล่าสุด`
      : 'แกว่งตัวในกรอบ (Consolidation)';

    const strongWeakText = strongWeakLevels?.strongLow
      ? ` | แนวรับสถาบันหลัก (Strong Low): $${strongWeakLevels.strongLow.toFixed(2)}`
      : strongWeakLevels?.strongHigh
      ? ` | แนวต้านสถาบันหลัก (Strong High): $${strongWeakLevels.strongHigh.toFixed(2)}`
      : '';

    const latestStructure = latestBreak
      ? `${latestBreak.isInternal ? 'Internal ' : 'Swing '}${latestBreak.type} (${latestBreak.bias === 'bullish' ? 'Bullish' : 'Bearish'}) ที่ระดับ $${latestBreak.price.toFixed(2)}`
      : 'ยังไม่มีสัญญาณ Break โครงสร้างที่ชัดเจน';

    const zoneStatus =
      premiumDiscount.currentZone === 'DISCOUNT'
        ? `โซน Discount (ราคาต่ำกว่า Equilibrium $${premiumDiscount.equilibrium}) เป็นโซนที่สถาบันมักสะสมของ`
        : premiumDiscount.currentZone === 'PREMIUM'
        ? `โซน Premium (ราคาสูงกว่า Equilibrium $${premiumDiscount.equilibrium}) เป็นโซนที่มีความเสี่ยงสูง ระวังสถาบันเทขาย`
        : `โซน Equilibrium ($${premiumDiscount.equilibrium}) กึ่งกลางสมดุลของราคา`;

    // Generate Thai strategic insights
    let thaiAnalysis = '';
    let tradingActionAdvice = '';

    const support1 = nearestDemand ? nearestDemand.bottom : premiumDiscount.low;
    const resistance1 = nearestSupply ? nearestSupply.top : premiumDiscount.high;
    const slSuggestion = Number((support1 * 0.985).toFixed(2));
    const tpSuggestion = Number((resistance1 * 0.995).toFixed(2));
    let tradeSetup: SmcSummary['tradeSetup'] = {
      direction: 'WAIT', entryLow: null, entryHigh: null, stopLoss: null, takeProfit: null,
      riskReward: null, confidence: 45, note: 'รอให้เกิด BOS หรือ CHoCH ที่ชัดเจนก่อนเปิดสถานะ'
    };

    // ──────────────────────────────────────────
    // LUXALGO SMC: INSTITUTIONAL ENTRY & EXIT BLUEPRINT (จุดเข้า - จุดออก ตามโมเดล LuxAlgo SMC)
    // ──────────────────────────────────────────
    let luxAlgoTradeSetup: SmcSummary['luxAlgoTradeSetup'];

    if (overallBias === 'STRONG_BULLISH' || overallBias === 'BULLISH' || trendBias === 'bullish') {
      const pdRange = premiumDiscount.high - premiumDiscount.low;
      // โซนจุดเข้าสะสม Discount OTE Golden Pocket สถาบัน (ระดับความน่าเข้า 75%+)
      const oteMax = Number((premiumDiscount.high - pdRange * 0.618).toFixed(2));
      const oteMin = Number((premiumDiscount.high - pdRange * 0.705).toFixed(2));
      const entryMin = nearestDemand ? nearestDemand.bottom : (strongWeakLevels?.strongLow ? Number(Math.max(strongWeakLevels.strongLow, oteMin).toFixed(2)) : oteMin);
      const entryMax = nearestDemand ? nearestDemand.top : oteMax;
      const avgEntry = (entryMin + entryMax) / 2;

      const slPrice = strongWeakLevels?.strongLow
        ? Number((strongWeakLevels.strongLow * 0.99).toFixed(2))
        : Number((entryMin * 0.985).toFixed(2));
      const lossPct = Number((((slPrice - avgEntry) / avgEntry) * 100).toFixed(1));

      const tp1Price = Number(premiumDiscount.equilibrium.toFixed(2));
      const tp1Gain = Number((((tp1Price - avgEntry) / avgEntry) * 100).toFixed(1));

      const tp2Price = strongWeakLevels?.weakHigh
        ? Number(strongWeakLevels.weakHigh.toFixed(2))
        : Number((resistance1 * 0.995).toFixed(2));
      const tp2Gain = Number((((tp2Price - avgEntry) / avgEntry) * 100).toFixed(1));

      const rr = Number(Math.max(0.1, (tp2Price - avgEntry) / Math.max(0.01, avgEntry - slPrice)).toFixed(2));

      luxAlgoTradeSetup = {
        setupType: 'LONG',
        title: '🟢 แผนเข้าซื้อสะสม (Bullish Long Setup): ย่อรับใน Discount Zone สถาบัน',
        theme: 'emerald',
        entryZone: {
          min: entryMin,
          max: entryMax,
          label: nearestDemand ? 'Bullish Order Block (Demand สถาบัน)' : 'Discount Zone (< 50% Equilibrium)',
          rationale: nearestDemand
            ? `ดักซื้อในกรอบ Bullish OB $${entryMin.toFixed(2)} - $${entryMax.toFixed(2)} ซึ่งเป็นฐานที่ Smart Money กวาดสภาพคล่องแล้วผลักราคาขึ้น`
            : `ดักซื้อในโซนได้เปรียบต้นทุน Discount Zone ต่ำกว่า $${premiumDiscount.equilibrium.toFixed(2)}`
        },
        stopLoss: {
          price: slPrice,
          label: strongWeakLevels?.strongLow ? '🛡️ ใต้ Strong Low สถาบัน' : '🛑 ต่ำกว่าขอบล่าง Order Block',
          lossPercent: lossPct,
          rationale: strongWeakLevels?.strongLow
            ? `หากราคาปิดหลุด Strong Low $${strongWeakLevels.strongLow.toFixed(2)} โครงสร้างขาขึ้นของ LuxAlgo จะเสียทรงทันที (Invalidation) ต้องคัทลอสรักษาเงินต้น`
            : `หากหลุด $${slPrice.toFixed(2)} ให้ถอยทันทีเพื่อความปลอดภัย`
        },
        takeProfit1: {
          price: tp1Price,
          label: '⚖️ TP1: 50% Equilibrium (จุดสมดุลราคา)',
          gainPercent: tp1Gain,
          rationale: `จุดสมดุลราคาแฟร์แวลู $${tp1Price.toFixed(2)} แนะนำแบ่งล็อกกำไรไม้แรก 50% และเลื่อน Stop Loss มาที่จุดคุ้มทุน (Breakeven)`
        },
        takeProfit2: {
          price: tp2Price,
          label: strongWeakLevels?.weakHigh ? '🎯 TP2: Weak High (เป้าหมายสถาบัน)' : '🎯 TP2: แนวต้านสวิงไฮเดิม',
          gainPercent: tp2Gain,
          rationale: strongWeakLevels?.weakHigh
            ? `Weak High $${tp2Price.toFixed(2)} คือเป้าหมายอัลกอริทึมของ Smart Money ที่มี Buy-Side Liquidity หนาแน่น ดักขายทำกำไรคำโตก่อนราคาพักฐาน`
            : `เป้าหมายขายทำกำไรที่แนวต้านหลัก $${tp2Price.toFixed(2)}`
        },
        riskRewardRatio: rr,
        confirmationChecklist: [
          `โครงสร้าง Swing Trend เป็นขาขึ้น หรือมีสัญญาณ iCHoCH / iBOS ยืนยัน`,
          `ราคาพักตัวลงมาในโซน Discount ต่ำกว่าจุดสมดุล $${premiumDiscount.equilibrium.toFixed(2)}`,
          `มีปฏิกิริยาดีดตัว (Rejection/Absorption) ในโซน Bullish Order Block`,
          `ตั้ง Stop Loss ต่ำกว่า 🛡️ Strong Low ($${slPrice.toFixed(2)}) เพื่อความเสี่ยงต่ำที่สุด`,
          `เป้าหมายหลักมุ่งหน้าสู่ 🎯 Weak High ($${tp2Price.toFixed(2)})`
        ]
      };

      const entryText = nearestDemand
        ? `จุดเข้าซื้อที่ได้เปรียบ: แนะนำรอย่อตัวลงมาทดสอบโซน Bullish Order Block ที่ $${nearestDemand.bottom.toFixed(2)} – $${nearestDemand.top.toFixed(2)} ในโซน Discount`
        : `จุดเข้าซื้อที่ได้เปรียบ: ควรรอย่อตัวต่ำกว่าจุดสมดุล Equilibrium $${premiumDiscount.equilibrium.toFixed(2)}`;
      const slText = strongWeakLevels?.strongLow
        ? `จุดตัดขาดทุน (SL): ต่ำกว่าแนวรับสถาบัน 🛡️ Strong Low ที่ $${(strongWeakLevels.strongLow * 0.99).toFixed(2)} (หากหลุดจะเสียทรงทันที Invalidation)`
        : `จุดตัดขาดทุน (SL): ต่ำกว่า $${slSuggestion}`;
      const tpText = strongWeakLevels?.weakHigh
        ? `จุดออกทำกำไร (TP): เป้าหมายแรกที่ Equilibrium $${premiumDiscount.equilibrium.toFixed(2)} (+${tp1Gain}%) และเป้าหมายหลักคำโตที่ 🎯 Weak High $${strongWeakLevels.weakHigh.toFixed(2)} (+${tp2Gain}%)`
        : `จุดออกทำกำไร (TP): แนวต้าน Supply ที่ $${tpSuggestion}`;

      thaiAnalysis = `วิเคราะห์โครงสร้างตามโมเดล Smart Money Concepts (SMC) [LuxAlgo]: หุ้น ${symbol} อยู่ในแนวโน้มขาขึ้น ล่าสุดเกิด ${latestStructure} ยืนยันแรงซื้อสะสมของ Smart Money ปัจจุบันราคาอยู่ที่ $${currentPrice} (${zoneStatus})${strongWeakText}.\n\n🎯 สรุปจุดเข้า-จุดออก LuxAlgo:\n• ${entryText}\n• ${slText}\n• ${tpText}\n• อัตราส่วนความคุ้มค่า (R:R Ratio): 1 : ${rr}`;

      if (nearestDemand) {
        const entryLow = nearestDemand.bottom;
        const entryHigh = nearestDemand.top;
        const entryMid = (entryLow + entryHigh) / 2;
        const stopLoss = slPrice;
        const takeProfit = tp2Price;
        const riskReward = rr;
        tradeSetup = {
          direction: 'LONG', entryLow: Number(entryLow.toFixed(2)), entryHigh: Number(entryHigh.toFixed(2)), stopLoss, takeProfit,
          riskReward, confidence: overallBias === 'STRONG_BULLISH' ? 82 : 72,
          note: riskReward >= 1.5 ? 'รอราคาเข้าพื้นที่ Demand ก่อน เพื่อให้ความเสี่ยงต่อผลตอบแทนเหมาะสม' : 'โซนนี้มี R:R จำกัด ควรรอราคาเข้าลึกขึ้นก่อน'
        };
        tradingActionAdvice = `กลยุทธ์ Long Setup: ควรรอย่อตัวลงมาทดสอบโซน Bullish Order Block ที่ $${nearestDemand.bottom.toFixed(2)} - $${nearestDemand.top.toFixed(2)} เพื่อหาจังหวะเข้าซื้อ โดยตั้ง Stop Loss ต่ำกว่า Strong Low $${slPrice.toFixed(2)} และมีเป้าหมายทำกำไร (TP) ที่ Weak High $${tp2Price.toFixed(2)}`;
      } else {
        tradingActionAdvice = `กลยุทธ์ Long Setup: รอดูการพักตัวเข้าสู่โซน Discount ต่ำกว่า $${premiumDiscount.equilibrium} เพื่อความได้เปรียบทาง Risk:Reward ไม่แนะนำให้ไล่ราคาในโซน Premium`;
      }
    } else if (overallBias === 'STRONG_BEARISH' || overallBias === 'BEARISH' || trendBias === 'bearish') {
      const entryMin = nearestSupply ? nearestSupply.bottom : Number((premiumDiscount.equilibrium * 1.01).toFixed(2));
      const entryMax = nearestSupply ? nearestSupply.top : Number((premiumDiscount.equilibrium * 1.05).toFixed(2));
      const avgEntry = (entryMin + entryMax) / 2;

      const slPrice = strongWeakLevels?.strongHigh
        ? Number((strongWeakLevels.strongHigh * 1.01).toFixed(2))
        : Number((entryMax * 1.015).toFixed(2));
      const lossPct = Number((((slPrice - avgEntry) / avgEntry) * 100).toFixed(1));

      const tp1Price = Number(premiumDiscount.equilibrium.toFixed(2));
      const tp1Gain = Number((((avgEntry - tp1Price) / avgEntry) * 100).toFixed(1));

      const tp2Price = strongWeakLevels?.weakLow
        ? Number(strongWeakLevels.weakLow.toFixed(2))
        : Number((support1 * 1.005).toFixed(2));
      const tp2Gain = Number((((avgEntry - tp2Price) / avgEntry) * 100).toFixed(1));

      const rr = Number(Math.max(0.1, (avgEntry - tp2Price) / Math.max(0.01, slPrice - avgEntry)).toFixed(2));

      luxAlgoTradeSetup = {
        setupType: 'SHORT',
        title: '🔴 แผนขายลดพอร์ต / Short Setup: ดักขายใน Premium Zone สถาบัน',
        theme: 'rose',
        entryZone: {
          min: entryMin,
          max: entryMax,
          label: nearestSupply ? 'Bearish Order Block (Supply สถาบัน)' : 'Premium Zone (> 50% Equilibrium)',
          rationale: nearestSupply
            ? `จุดดักขายทำกำไรลดพอร์ต หรือเปิด Short เมื่อราคารีบาวด์ทดสอบ Bearish OB $${entryMin.toFixed(2)} - $${entryMax.toFixed(2)}`
            : `จุดขายในโซนของแพง Premium Zone สูงกว่า $${premiumDiscount.equilibrium.toFixed(2)}`
        },
        stopLoss: {
          price: slPrice,
          label: strongWeakLevels?.strongHigh ? '🛡️ เหนือ Strong High สถาบัน' : '🛑 สูงกว่าขอบบน Order Block',
          lossPercent: lossPct,
          rationale: strongWeakLevels?.strongHigh
            ? `หากราคาทะลุ Strong High $${strongWeakLevels.strongHigh.toFixed(2)} โครงสร้างขาลงจะถูกทำลายทันที (Bullish CHoCH Invalidation) ต้องยอมแพ้`
            : `ตัดขาดทุนหากราคาทะลุ $${slPrice.toFixed(2)}`
        },
        takeProfit1: {
          price: tp1Price,
          label: '⚖️ TP1: 50% Equilibrium (จุดสมดุลราคา)',
          gainPercent: tp1Gain,
          rationale: `จุดสมดุลราคา $${tp1Price.toFixed(2)} ทยอยแบ่งปิดทำกำไร 50%`
        },
        takeProfit2: {
          price: tp2Price,
          label: strongWeakLevels?.weakLow ? '🎯 TP2: Weak Low (เป้าหมายขาลง)' : '🎯 TP2: แนวรับสวิงโลว์เดิม',
          gainPercent: tp2Gain,
          rationale: strongWeakLevels?.weakLow
            ? `Weak Low $${tp2Price.toFixed(2)} คือเป้าหมายอัลกอริทึมที่ Smart Money จะกวาด Sell-Side Liquidity`
            : `เป้าหมายปิดกำไรที่แนวรับ $${tp2Price.toFixed(2)}`
        },
        riskRewardRatio: rr,
        confirmationChecklist: [
          `โครงสร้าง Swing Trend เป็นขาลง หรือมีสัญญาณ Bearish Break ยืนยัน`,
          `ราคารีบาวด์เข้าสู่โซนของแพง Premium Zone เหนือ $${premiumDiscount.equilibrium.toFixed(2)}`,
          `พบแรงปฏิเสธราคาใน Bearish Order Block หรือ Bearish FVG`,
          `ตั้ง Stop Loss เหนือ 🛡️ Strong High ($${slPrice.toFixed(2)})`,
          `เป้าหมายหลักมุ่งหน้าสู่ 🎯 Weak Low ($${tp2Price.toFixed(2)})`
        ]
      };

      const entryText = nearestSupply
        ? `จุดขาย/Short: ดักขายเมื่อราคารีบาวด์เข้าสู่ Bearish Order Block ที่ $${nearestSupply.bottom.toFixed(2)} – $${nearestSupply.top.toFixed(2)} ในโซน Premium`
        : `จุดขาย/ลดพอร์ต: ขายในโซน Premium สูงกว่า $${premiumDiscount.equilibrium.toFixed(2)}`;
      const slText = strongWeakLevels?.strongHigh
        ? `จุดตัดขาดทุน (SL): เหนือแนวต้านสถาบัน 🛡️ Strong High ที่ $${(strongWeakLevels.strongHigh * 1.01).toFixed(2)}`
        : `จุดตัดขาดทุน (SL): สูงกว่า $${entryMax * 1.015}`;
      const tpText = strongWeakLevels?.weakLow
        ? `จุดออกทำกำไร (TP): เป้าหมายแรกที่ Equilibrium $${premiumDiscount.equilibrium.toFixed(2)} และเป้าหมายขาลงที่ 🎯 Weak Low $${strongWeakLevels.weakLow.toFixed(2)}`
        : `จุดออกทำกำไร (TP): แนวรับถัดไปที่ $${support1.toFixed(2)}`;

      thaiAnalysis = `วิเคราะห์โครงสร้างตามโมเดล Smart Money Concepts (SMC) [LuxAlgo]: หุ้น ${symbol} มีแรงกดดันฝั่งขายเป็นหลัก ล่าสุดเกิด ${latestStructure} ยืนยันการควบคุมของสถาบันฝั่ง Sell ปัจจุบันราคาอยู่ที่ $${currentPrice} (${zoneStatus})${strongWeakText}.\n\n🎯 สรุปจุดเข้า-จุดออก LuxAlgo:\n• ${entryText}\n• ${slText}\n• ${tpText}\n• อัตราส่วนความคุ้มค่า (R:R Ratio): 1 : ${rr}`;

      if (nearestSupply) {
        const entryLow = nearestSupply.bottom;
        const entryHigh = nearestSupply.top;
        const stopLoss = slPrice;
        const takeProfit = tp2Price;
        const riskReward = rr;
        tradeSetup = {
          direction: 'SHORT', entryLow: Number(entryLow.toFixed(2)), entryHigh: Number(entryHigh.toFixed(2)), stopLoss, takeProfit,
          riskReward, confidence: overallBias === 'STRONG_BEARISH' ? 82 : 72,
          note: riskReward >= 1.5 ? 'รอราคารีบาวด์เข้าสู่ Supply ก่อน เพื่อให้จุดตัดขาดทุนอยู่ใกล้' : 'โซนนี้มี R:R จำกัด ควรรอราคาเข้าใกล้ Supply มากขึ้น'
        };
        tradingActionAdvice = `กลยุทธ์ Short/เฝ้าระวัง: หากราคารีบาวด์ขึ้นทดสอบ Bearish Order Block ที่ $${nearestSupply.bottom.toFixed(2)} - $${nearestSupply.top.toFixed(2)} สามารถพิจารณาเป็นจุดขายหรือ Short โดยตั้ง Stop Loss เหนือ Strong High $${slPrice.toFixed(2)} และมีเป้าหมายทำกำไรที่ Weak Low $${tp2Price.toFixed(2)}`;
      } else {
        tradingActionAdvice = `กลยุทธ์: แนะนำชะลอการเข้าซื้อ รอให้เกิด Bullish CHoCH กลับตัวยืนยันบนโครงสร้างราคาก่อน`;
      }
    } else {
      luxAlgoTradeSetup = {
        setupType: 'WAIT',
        title: '🟡 แผนรอสัญญาณ (Wait & See): ราคากำลังบีบตัวรอบจุด Equilibrium',
        theme: 'amber',
        entryZone: {
          min: premiumDiscount.low,
          max: premiumDiscount.high,
          label: 'กรอบสะสมพลัง Equilibrium',
          rationale: `ราคายังแกว่งตัวรอบจุดสมดุล $${premiumDiscount.equilibrium.toFixed(2)} ยังไม่เลือกข้าง ควรรอให้เกิด BOS ชัดเจนก่อน`
        },
        stopLoss: {
          price: Number((premiumDiscount.low * 0.985).toFixed(2)),
          label: 'ฐานกรอบสวิงล่าง',
          lossPercent: 2.5,
          rationale: 'จุดหลุดกรอบสะสม'
        },
        takeProfit1: {
          price: Number(premiumDiscount.equilibrium.toFixed(2)),
          label: 'จุดกึ่งกลางกรอบ',
          gainPercent: 2.0,
          rationale: 'สมดุลราคา'
        },
        takeProfit2: {
          price: Number(premiumDiscount.high.toFixed(2)),
          label: 'ยอดกรอบสวิงบน',
          gainPercent: 4.5,
          rationale: 'แนวต้านบน'
        },
        riskRewardRatio: 1.5,
        confirmationChecklist: [
          `รอให้แท่งเทียนปิดทะลุกรอบสวิง (Break of Structure BOS)`,
          `สังเกตการสร้าง Order Block ฝั่งที่ชนะ`,
          `รอเข้าในจังหวะ Retracement ครั้งแรก`
        ]
      };
      thaiAnalysis = `วิเคราะห์โครงสร้างตามโมเดล Smart Money Concepts (SMC) [LuxAlgo]: หุ้น ${symbol} อยู่ในช่วงพักตัวสะสมพลังรอบจุด Equilibrium $${premiumDiscount.equilibrium} ยังไม่มีทิศทางที่ชัดเจนจาก Smart Money${strongWeakText}. ควรรอสัญญาณ BOS หรือ CHoCH ก่อนเปิดสถานะ`;
      tradingActionAdvice = `กลยุทธ์: แนะนำ Wait & See รอราคาเลือกข้างหรือรอให้เกิดการเบรก BOS / CHoCH ชัดเจนก่อนเข้าเทรด`;
    }

    // ==========================================
    // แผนซื้อ-ขาย แม่นยำระดับสถาบัน (Institutional Precision Trade Plan)
    // วิเคราะห์ผสาน: Active Dealing Range + OTE Fibonacci + Order Block / FVG + Liquidity Target
    // ==========================================

    // 1. ระบุ Active Swing Dealing Range (กรอบสวิงปัจจุบันที่ยังมีผลต่อการเทรด)
    const swingHighs = swings.filter(s => s.type === 'high').sort((a, b) => a.index - b.index);
    const swingLows = swings.filter(s => s.type === 'low').sort((a, b) => a.index - b.index);

    const recent50 = candles.slice(-50);
    const highest50 = Math.max(...recent50.map(c => c.high));
    const activeHigh = swingHighs.length > 0
      ? Math.max(highest50, swingHighs[swingHighs.length - 1].price)
      : highest50;

    const lowest50 = Math.min(...recent50.map(c => c.low));
    const validLowsBelow = swingLows.filter(l => l.price <= currentPrice * 0.985);
    const activeLow = validLowsBelow.length > 0
      ? validLowsBelow[validLowsBelow.length - 1].price
      : Math.min(lowest50, currentPrice * 0.92);

    const activeRange = Math.max(0.01, activeHigh - activeLow);

    // 2. คำนวณระดับ Fibonacci Retracement & Optimal Trade Entry (OTE)
    // 0.382 = Shallow Retest (พักตัวตื้นในรอบขาขึ้นแรง)
    // 0.500 = Equilibrium (จุดสมดุล Fair Value)
    // 0.618 = Golden Pocket (จุดช้อนซื้อยอดนิยมของสถาบัน)
    // 0.786 = Deep Discount OTE (จุดได้เปรียบต้นทุนสูงสุด)
    const fib382 = Number((activeHigh - activeRange * 0.382).toFixed(2));
    const fib500 = Number((activeHigh - activeRange * 0.500).toFixed(2));
    const fib618 = Number((activeHigh - activeRange * 0.618).toFixed(2));
    const fib786 = Number((activeHigh - activeRange * 0.786).toFixed(2));

    // 3. กำหนดกรอบเข้าสะสม (Buy Zone) และการแบ่งไม้ 1 และ ไม้ 2
    // 3. กำหนดกรอบเข้าสะสม (Buy Zone) และการแบ่งไม้ 1 และ ไม้ 2 อิงจุดวิเคราะห์ความน่าเข้า 75%+ สถาบัน (LuxAlgo SMC & Fibonacci OTE)
    let buyMax: number;
    let buyMin: number;
    let buyZoneRationale = '';

    if (luxAlgoTradeSetup && luxAlgoTradeSetup.setupType === 'LONG' && luxAlgoTradeSetup.entryZone) {
      buyMin = Number(luxAlgoTradeSetup.entryZone.min.toFixed(2));
      buyMax = Number(luxAlgoTradeSetup.entryZone.max.toFixed(2));
      buyZoneRationale = `อิงโซนจุดเข้าสะสม LuxAlgo SMC (จุดวิเคราะห์ความน่าเข้า 75%+) $${buyMin} – $${buyMax}`;
    } else if (nearestDemand && nearestDemand.top <= currentPrice * 1.05 && nearestDemand.top >= activeLow) {
      // กรณีมี Demand Order Block ที่ชัดเจน
      buyMax = Number(nearestDemand.top.toFixed(2));
      buyMin = Number(Math.max(nearestDemand.bottom, fib786).toFixed(2));
      buyZoneRationale = `อิงฐาน Bullish Order Block สถาบัน (น่าเข้า 75%+) $${buyMin} – $${buyMax} ผสาน Fibonacci OTE Golden Pocket`;
    } else if (nearestFvg && nearestFvg.type === 'bullish' && nearestFvg.top <= currentPrice * 1.05 && nearestFvg.top >= activeLow) {
      // กรณีมี Fair Value Gap (FVG)
      buyMax = Number(nearestFvg.top.toFixed(2));
      buyMin = Number(Math.max(nearestFvg.bottom, fib618).toFixed(2));
      buyZoneRationale = `อิงช่องว่างสภาพคล่อง Bullish FVG (น่าเข้า 75%+) $${buyMin} – $${buyMax} ร่วมกับแนวรับ OTE`;
    } else {
      // โซนสมดุล Fibonacci Golden Pocket 0.500 - 0.618 (ระดับความน่าเข้า 75%+)
      buyMax = Number(fib500.toFixed(2));
      buyMin = Number(fib618.toFixed(2));
      buyZoneRationale = `อิงจุดย่อตัวสมดุล Optimal Trade Entry (Fibonacci 0.500 – 0.618 Golden Pocket น่าเข้า 75%+) ของรอบคลื่นสวิง $${activeLow.toFixed(2)} – $${activeHigh.toFixed(2)}`;
    }

    // Safety checks: buyMax ต้องมากกว่า buyMin เสมอ
    if (buyMax < buyMin) {
      const temp = buyMax;
      buyMax = buyMin;
      buyMin = temp;
    }
    if (buyMax <= buyMin) {
      buyMax = Number((buyMin * 1.04).toFixed(2));
    }

    const tranche1Price = Number(buyMax.toFixed(2));
    const tranche2Price = Number(buyMin.toFixed(2));
    const avgEntry = Number(((tranche1Price + tranche2Price) / 2).toFixed(2));

    // กำหนดสถานะคำแนะนำภาษาคน
    let planStatus: SimpleTradePlan['status'] = 'WAIT_DIP';
    let statusBadge = 'ใจเย็นๆ รอย่อก่อน (อย่าเพิ่งรีบซื้อ)';
    let statusDescription = `ราคาปัจจุบัน ($${currentPrice.toFixed(2)}) ลอยสูงในโซน Premium หากรีบซื้อตอนนี้จะเสียเปรียบต้นทุน ควรรอดักซื้อในกรอบ Buy Zone $${buyMin} – $${buyMax}`;
    let themeColor: SimpleTradePlan['themeColor'] = 'amber';

    if (currentPrice <= buyMax * 1.025) {
      planStatus = 'BUY_NOW';
      statusBadge = 'ทยอยสะสมซื้อได้เลย (โซนของดีราคาลด)';
      statusDescription = `ราคาปัจจุบัน ($${currentPrice.toFixed(2)}) ย่อตัวลงมาอยู่ในโซนสะสมต้นทุนสถาบันแล้ว เหมาะกับการเริ่มเข้าซื้อสะสมเพื่อถือยาว 6-12 เดือน`;
      themeColor = 'emerald';
    } else if (currentPrice >= activeHigh * 0.985) {
      planStatus = 'TAKE_PROFIT_NOW';
      statusBadge = 'ถึงจุดขายทำกำไร (ราคาแพงมากแล้ว)';
      statusDescription = `ราคาปัจจุบัน ($${currentPrice.toFixed(2)}) วิ่งชนแนวต้านใหญ่ของรอบแล้ว หากมีหุ้นอยู่แนะนำให้ทยอยขายทำกำไรเอาเงินเข้ากระเป๋า`;
      themeColor = 'rose';
    } else if (overallBias === 'STRONG_BULLISH' || overallBias === 'BULLISH') {
      planStatus = 'HOLD_FOR_PROFIT';
      statusBadge = 'ถือต่อ รอกำไรตามเป้า (หรือรอย่อรับเพิ่ม)';
      statusDescription = `แนวโน้มใหญ่ยังคงแข็งแกร่ง หากมีหุ้นในมืออยู่แล้วให้ถือต่อสบายๆ มุ่งหน้าสู่เป้าหมาย แต่หากยังไม่มีของ ควรรอดักซื้อตามราคาไม้ที่แนะนำ`;
      themeColor = 'blue';
    }

    // 4. จุดออกขายทำกำไร 1 ปี (1Y Target) & การประเมิน "โซนแรงขายสูง ดักเด้งลงแรง" (High-Pressure Supply Wall)
    // คัดกรองเฉพาะ Supply Block ระดับมหภาค, จุด Sweep Liquidity รอบใหญ่, และ Fibonacci Golden Expansion 1.618x+
    
    // คำนวณ Fibonacci Extensions
    const fibExt1618 = activeHigh + activeRange * 0.618;
    const fibExt2000 = activeHigh + activeRange * 1.000;

    // หา Institutional Supply Blocks ที่อยู่ระดับเป้าหมาย 1 ปี (ขั้นต่ำ +20% ขึ้นไปจากต้นทุน หรือเหนือจุด High เดิม)
    const macroSupplyBlocks = orderBlocks
      .filter(ob => ob.type === 'bearish' && ob.bottom >= Math.max(avgEntry * 1.20, activeHigh * 0.98))
      .sort((a, b) => a.bottom - b.bottom);
    const macroSupply = macroSupplyBlocks[0] || null;

    // หาจุดดักกวาดสภาพคล่อง Buy-Side Liquidity (EQH) รอบใหญ่ 1 ปี (ขั้นต่ำ +20% ขึ้นไป)
    const macroBsl = liquidityLevels
      .filter(l => l.type === 'EQH' && l.price >= Math.max(avgEntry * 1.20, currentPrice * 1.15))
      .sort((a, b) => a.price - b.price)[0] || null;

    let sellMin: number;
    let sellMax: number;
    let sellZoneRationale = '';

    if (macroSupply) {
      sellMin = Number(macroSupply.bottom.toFixed(2));
      sellMax = Number(Math.max(macroSupply.top, macroSupply.bottom * 1.05, fibExt1618).toFixed(2));
      sellZoneRationale = `กำแพงแรงขายสถาบัน Bearish Supply Block $${sellMin} – $${sellMax} (จุดดักเทขายสถาบันหนาแน่น มีโอกาสเด้งกลับตัวลงแรง)`;
    } else if (macroBsl) {
      sellMin = Number(macroBsl.price.toFixed(2));
      sellMax = Number(Math.max(fibExt1618, macroBsl.price * 1.06).toFixed(2));
      sellZoneRationale = `จุดกวาดสภาพคล่อง Buy-Side Liquidity (EQH) $${sellMin} – $${sellMax} (โซนสถาบันดักปล่อยของทุบราคาพักฐานแรง)`;
    } else {
      sellMin = Number(Math.max(fibExt1618, avgEntry * 1.28).toFixed(2));
      sellMax = Number(Math.max(fibExt2000, sellMin * 1.06).toFixed(2));
      sellZoneRationale = `กรอบเป้าหมาย Fibonacci Golden Expansion 1.618x–2.000x $${sellMin} – $${sellMax} (ระดับ Exhaustion รอบใหญ่ 1 ปี เสี่ยงแรงเทขายทำกำไรเด้งลงแรง)`;
    }

    // รับประกันว่าโซนขาย 1 ปี ต้องให้ผลตอบแทนอย่างน้อย +25% จากต้นทุนเฉลี่ย
    if (sellMin < avgEntry * 1.25) {
      sellMin = Number((avgEntry * 1.25).toFixed(2));
      if (sellMax <= sellMin) {
        sellMax = Number((sellMin * 1.06).toFixed(2));
      }
      sellZoneRationale = `เป้าหมายขยายตัวรอบสวิงใหญ่ 1 ปี (+25% ขั้นต่ำ) $${sellMin} – $${sellMax} (โซนแรงขายสูง)`;
    }

    if (sellMax <= sellMin) {
      sellMax = Number((sellMin * 1.05).toFixed(2));
    }

    // เป้าหมาย 1 ปี (1Y Target) ใช้ขอบล่างของโซนแรงขายสูงเป็นจุดแรกที่สถาบันเริ่มเทขาย
    const tp1YearPrice = Number(sellMin.toFixed(2));
    const gain1Year = Number((((tp1YearPrice - avgEntry) / avgEntry) * 100).toFixed(1));
    const tp1YearRationale = sellZoneRationale;

    const sellZone: SellZone = {
      minPrice: sellMin,
      maxPrice: sellMax,
      label: '🎯 โซนขายทำกำไร 1 ปี (แรงขายสูง ดักเด้งลงแรง)',
      rationale: sellZoneRationale
    };

    // ★ การประเมิน "ควรถือต่อดีกว่า" vs "ถึงโซนแรงขายสูง 1Y แล้ว" (Hold Advice)
    const higherTarget = Number(sellMax.toFixed(2));
    const higherGainPercent = Number((((higherTarget - currentPrice) / currentPrice) * 100).toFixed(1));
    const toSellMinPercent = Number((((sellMin - currentPrice) / currentPrice) * 100).toFixed(1));

    let holdDecision: HoldAdvice['decision'] = 'HOLD_FOR_HIGHER';
    let holdActionTitle = '';
    let holdBadgeText = '';
    let holdTheme: HoldAdvice['theme'] = 'emerald';
    let holdReason = '';
    let holdActionPlan = '';

    if (currentPrice >= sellMin * 0.985) {
      // 1. ราคาขึ้นมาถึงหรือประชิดโซนแรงขายสูง 1 ปีแล้ว
      holdDecision = 'SELL_ZONE_REACHED';
      holdActionTitle = 'ถึงโซนแรงขายสูงแล้ว (ระวังเด้งกลับตัวแรง / ทยอยล็อกกำไร)';
      holdBadgeText = '🔴 ถึงโซนแรงขายสูง 1Y (ดักเด้งลงแรง)';
      holdTheme = 'rose';
      holdReason = `ราคาปัจจุบัน ($${currentPrice.toFixed(2)}) วิ่งขึ้นมาชนกรอบโซนขายสถาบัน ($${sellMin} – $${sellMax}) ซึ่งมีแรงขายดักรอหนาแน่น เสี่ยงต่อการถูกเทขายเด้งกลับตัวลงแรง ไม่ควรฝืนถือเต็มพอร์ต`;
      holdActionPlan = `ทยอยแบ่งขายล็อกกำไร 50% - 70% เอาเงินเข้ากระเป๋าทันที ส่วนที่เหลือ 30% ให้เลื่อนจุด Stop Loss ขึ้นมาบังทุน (Trailing Stop)`;
    } else if (currentPrice <= buyMax * 1.025) {
      // 2. ราคาอยู่ในโซนช้อนซื้อ
      holdDecision = 'ACCUMULATE_MORE';
      holdActionTitle = 'โซนสะสมของถูก (ควรถือ / ทยอยซื้อสะสม)';
      holdBadgeText = '🟢 โซนของถูก (ควรถือ/สะสม)';
      holdTheme = 'cyan';
      holdReason = `ราคาปัจจุบัน ($${currentPrice.toFixed(2)}) ย่อตัวอยู่ในโซนสะสมต้นทุนสถาบัน ($${buyMin} – $${buyMax}) ยังห่างจากโซนแรงขายสูง 1 ปี อีกมาก (${toSellMinPercent > 0 ? '+' + toSellMinPercent + '%' : ''})`;
      holdActionPlan = `หากยังไม่มีของให้ทยอยเข้าซื้อสะสมตามไม้ หากมีของอยู่แล้วควรถือต่อสบายๆ ไม่ต้องตกใจแรงเหวี่ยงระยะสั้นเพื่อรอทำกำไรในโซนแรงขายสูง 1 ปี`;
    } else {
      // 3. ราคาวิ่งขึ้นและยังไม่ถึงโซนขายจริง -> ควรถือต่อดีกว่า!
      holdDecision = 'HOLD_FOR_HIGHER';
      holdActionTitle = 'ควรถือต่อดีกว่า (รันเทรนด์สู่เป้าขาย 1Y)';
      holdBadgeText = `🟢 ควรถือต่อดีกว่า (เป้าแรงขายสูง $${sellMin})`;
      holdTheme = 'emerald';
      holdReason = `ราคาปัจจุบัน ($${currentPrice.toFixed(2)}) ยังไม่ถึงโซนแรงขายสูง ($${sellMin} – $${sellMax}) โครงสร้างตลาดยังเป็นขาขึ้นต่อเนื่องและยังมี Upside ให้วิ่งขึ้นไปได้อีก +${higherGainPercent}% ควรถือต่อเพื่อทำกำไรก้อนใหญ่ดีกว่ารีบขายหมู`;
      holdActionPlan = `ควรถือรันเทรนด์ต่ออย่างมั่นใจ รอราคาขึ้นไปทดสอบโซนแรงขายสูง $${sellMin} – $${sellMax} แล้วค่อยพิจารณาขายทำกำไร`;
    }

    const holdAdvice: HoldAdvice = {
      decision: holdDecision,
      actionTitle: holdActionTitle,
      badgeText: holdBadgeText,
      theme: holdTheme,
      reason: holdReason,
      higherTarget,
      higherGainPercent,
      actionPlan: holdActionPlan
    };

    // 5. คำนวณจุดตัดขาดทุน (Stop Loss / Cut Loss) อิง Structural Invalidation
    const structuralFloor = nearestDemand ? Math.min(nearestDemand.bottom, activeLow) : Math.min(buyMin, activeLow);
    let cutLossPrice = Number((structuralFloor * 0.985).toFixed(2));
    if (cutLossPrice >= buyMin * 0.99) {
      cutLossPrice = Number((buyMin * 0.94).toFixed(2));
    }
    const lossPercent = Number((((cutLossPrice - avgEntry) / avgEntry) * 100).toFixed(1));
    const cutLossRationale = `จุดเสียทรงโครงสร้างราคา (Structural Invalidation) ต่ำกว่าแนวรับสถาบัน $${structuralFloor.toFixed(2)} (หากหลุดจุดนี้ ให้ตัดขาดทุนรักษาเงินต้นทันที)`;

    // Risk : Reward Ratio อิงเป้าหมาย 1 ปี
    const riskRewardRatio = Number((gain1Year / Math.max(0.1, Math.abs(lossPercent))).toFixed(2));

    const simpleTradePlan: SimpleTradePlan = {
      status: planStatus,
      statusBadge,
      statusDescription,
      themeColor,
      sellZone,
      holdAdvice,
      buyZone: {
        minPrice: buyMin,
        maxPrice: buyMax,
        tranche1: {
          label: 'ไม้ที่ 1 (ซื้อ 50%)',
          price: tranche1Price,
          advice: `เข้าซื้อไม้แรกเมื่อราคาย่อมาแตะ $${tranche1Price} (ดักแนวรับแรก ป้องกันตกรถ)`
        },
        tranche2: {
          label: 'ไม้ที่ 2 (ซื้ออีก 50%)',
          price: tranche2Price,
          advice: `หากราคาย่อลึกลงมาถึง $${tranche2Price} ให้ซื้อไม้สอง (ฐานสะสม OTE Golden Pocket สถาบัน)`
        }
      },
      sellTargets: {
        target6Month: {
          price: tp1YearPrice,
          gainPercent: gain1Year,
          note: `เป้าหมาย 1 ปี โซนแรงขายสถาบันหนาแน่น ดักขายทำกำไรคำโตก่อนเด้งกลับตัวลงแรง (${tp1YearRationale})`
        },
        target1Year: {
          price: tp1YearPrice,
          gainPercent: gain1Year,
          note: `เป้าหมายใหญ่รอบ 1 ปี โซนแรงขายสถาบันหนาแน่น ดักขายทำกำไรคำโตก่อนเด้งกลับตัวลงแรง (${tp1YearRationale})`
        }
      },
      cutLoss: {
        price: cutLossPrice,
        lossPercent,
        note: `${cutLossRationale}`
      },
      riskRewardRatio,
      plainThaiSummary: `สรุปกลยุทธ์ ${symbol}: ${holdActionTitle} — ${holdReason} โดยมีช่วงราคาควรเข้าซื้อที่ $${buyMin} – $${buyMax} และโซนขายทำกำไร 1 ปี (แรงขายสูง) ที่ $${sellMin} – $${sellMax} (เป้าหมายกำไร +${higherGainPercent}%) จุดตัดขาดทุนที่ $${cutLossPrice} ครับ`,
      methodology: {
        buyZoneRationale,
        targetRationale: `เป้าหมาย 1Y (โซนแรงขายสูง): ${sellZoneRationale}`,
        cutLossRationale,
        activeRange: {
          high: Number(activeHigh.toFixed(2)),
          low: Number(activeLow.toFixed(2)),
          span: Number(activeRange.toFixed(2))
        },
        fibOte: {
          fib382,
          fib500,
          fib618,
          fib786
        },
        fibExpansion: {
          ext1272: Number((activeHigh + activeRange * 0.272).toFixed(2)),
          ext1618: Number((activeHigh + activeRange * 0.618).toFixed(2))
        }
      }
    };

    return {
      overallBias,
      currentTrend,
      latestStructure,
      zoneStatus,
      nearestDemand,
      nearestSupply,
      nearestFvg,
      thaiAnalysis,
      tradingActionAdvice,
      tradeSetup,
      simpleTradePlan,
      luxAlgoTradeSetup,
      volumeAnalysis,
      keyLevels: {
        currentPrice,
        change24h,
        changePercent,
        support1: Number(support1.toFixed(2)),
        resistance1: Number(resistance1.toFixed(2)),
        slSuggestion,
        tpSuggestion
      },
      luxAlgoMetadata: {
        engine: 'Smart Money Concepts (SMC) [LuxAlgo]',
        scriptUrl: 'https://th.tradingview.com/v/CnB3fSph/',
        swingLength,
        internalLength,
        currentTrend: trendBias,
        internalTrend,
        strongHigh: strongWeakLevels?.strongHigh,
        weakHigh: strongWeakLevels?.weakHigh,
        strongLow: strongWeakLevels?.strongLow,
        weakLow: strongWeakLevels?.weakLow
      }
    };
  }

  /**
   * Decomposes intra-candle volume into Buy and Sell components using Price-Action & Wick Analysis
   */
  public static calculateCandleVolumeDecomposition(c: Candle): {
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
  public static computeVolumeAnalysis(candles: Candle[]): VolumeAnalysis {
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
        : this.calculateCandleVolumeDecomposition(c);

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
      : this.calculateCandleVolumeDecomposition(latest);

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
}
