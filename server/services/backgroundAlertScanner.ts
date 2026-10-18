import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { YahooFinanceService, MAGNIFICENT_7, resolveFullSymbol } from './yahooFinance.js';
import { SmcEngine } from './smcEngine.js';
import { NotificationService, DispatchAlertPayload, MultiTfAlertItem } from './notificationService.js';
import { Candle } from '../../src/types/smc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../data');
const TRIGGERED_FILE = path.join(DATA_DIR, 'triggeredAlerts.json');
const HISTORY_FILE = path.join(DATA_DIR, 'alertHistory.json');
const CONFIG_FILE = path.join(DATA_DIR, 'alertConfig.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface WatchlistStockSetup {
  symbol: string;
  displaySymbol: string;
  name: string;
  thaiName: string;
  currentPrice: number;
  buyZoneMin: number;
  buyZoneMax: number;
  stopLossPrice: number;
  takeProfit1Price: number;
  takeProfit2Price: number;
  rrRatio: number;
  confidenceScore: number;
  timeframe: string;
  lastUpdated: number;
  isNearTp: boolean;
  isReachedTp: boolean;
  inBuyZone: boolean;
  volumeBuyRatio?: number;
  multiTimeframe?: {
    alignmentText: string;
    items: MultiTfAlertItem[];
  };
}

export interface TriggeredState {
  symbol: string;
  type: 'BUY' | 'TP';
  triggeredAt: number;
  price: number;
  targetPrice: number;
}

export class BackgroundAlertScanner {
  private static setups: Map<string, WatchlistStockSetup> = new Map();
  private static triggeredStates: Map<string, TriggeredState> = new Map();
  private static alertHistory: any[] = [];
  private static timer: NodeJS.Timeout | null = null;
  private static isScanning: boolean = false;
  private static isRefreshingSetups: boolean = false;

  public static async init() {
    this.loadStateFromDisk();
    await this.refreshSetups();
    this.start();
  }

  private static loadStateFromDisk() {
    try {
      if (fs.existsSync(TRIGGERED_FILE)) {
        const raw = fs.readFileSync(TRIGGERED_FILE, 'utf-8');
        const parsed: Record<string, TriggeredState> = JSON.parse(raw);
        this.triggeredStates = new Map(Object.entries(parsed));
      }
    } catch (e) {
      console.warn('[BackgroundScanner] Failed to read triggeredAlerts.json:', e);
    }

    try {
      if (fs.existsSync(HISTORY_FILE)) {
        const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
        this.alertHistory = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[BackgroundScanner] Failed to read alertHistory.json:', e);
    }
  }

  private static saveStateToDisk() {
    try {
      const obj: Record<string, TriggeredState> = {};
      this.triggeredStates.forEach((val, key) => {
        obj[key] = val;
      });
      fs.writeFileSync(TRIGGERED_FILE, JSON.stringify(obj, null, 2), 'utf-8');
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.alertHistory.slice(0, 50), null, 2), 'utf-8');
    } catch (e) {
      console.warn('[BackgroundScanner] Failed to write states to disk:', e);
    }
  }

  private static getConfig(): any {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      }
    } catch (e) {
      // fallback
    }
    return {
      soundEnabled: true,
      inAppEnabled: true,
      discordEnabled: false,
      telegramEnabled: false,
      lineEnabled: false,
      lineBotEnabled: false,
      minConfidenceScore: 75
    };
  }

  /**
   * Computes individual timeframe score (0-100) and SMC metrics
   */
  public static computeTfScore(
    symbol: string,
    name: string,
    tf: string,
    candles: Candle[],
    currentPrice: number,
    fallbackSmc?: any
  ): { score: number; badge: string; trend: string; buyRatio: number } {
    let smc = fallbackSmc;
    if (candles && candles.length >= 15) {
      try {
        smc = SmcEngine.analyze(symbol, name, tf, candles);
      } catch (e) {
        // use fallbackSmc if error
      }
    }

    if (!smc) {
      return {
        score: 50,
        badge: '🔴 ไม่ควรเข้า เสี่ยงสูง',
        trend: 'NEUTRAL',
        buyRatio: 50
      };
    }

    const pd = smc.premiumDiscount || {
      high: currentPrice * 1.05,
      low: currentPrice * 0.95,
      equilibrium: currentPrice
    };
    const rangeSpan = Math.max(0.01, pd.high - pd.low);
    const rawPct = ((currentPrice - pd.low) / rangeSpan) * 100;
    const zonePct = Math.min(100, Math.max(0, Math.round(rawPct)));

    // 1. Trend scoring (max 25)
    const bias = smc.summary?.overallBias || 'NEUTRAL';
    let scoreTrend = 12;
    if (bias === 'STRONG_BULLISH') scoreTrend = 25;
    else if (bias === 'BULLISH') scoreTrend = 20;
    else if (bias === 'NEUTRAL') scoreTrend = 12;
    else if (bias === 'BEARISH') scoreTrend = 5;
    else scoreTrend = 1;

    // 2. Zone scoring (max 35)
    let scoreZone = 10;
    if (zonePct <= 30) scoreZone = 35;
    else if (zonePct <= 50) scoreZone = Math.round(24 + ((50 - zonePct) / 20) * 11);
    else if (zonePct <= 65) scoreZone = Math.round(14 + ((65 - zonePct) / 15) * 10);
    else if (zonePct <= 80) scoreZone = Math.round(5 + ((80 - zonePct) / 15) * 9);
    else scoreZone = Math.max(0, Math.round(5 - ((zonePct - 80) / 20) * 5));

    // 3. Demand / Supply proximity (max 20)
    let scoreDemand = 8;
    const demand = smc.summary?.nearestDemand;
    const supply = smc.summary?.nearestSupply;
    if (demand) {
      const distToDemand = ((currentPrice - demand.top) / currentPrice) * 100;
      if (currentPrice >= demand.bottom && currentPrice <= demand.top * 1.015) {
        scoreDemand = 20;
      } else if (distToDemand > 0 && distToDemand <= 2.5) {
        scoreDemand = 16;
      } else if (distToDemand > 0 && distToDemand <= 5.0) {
        scoreDemand = 12;
      }
    }
    if (supply) {
      const distToSupply = ((supply.bottom - currentPrice) / currentPrice) * 100;
      if (distToSupply <= 1.5) {
        scoreDemand = Math.max(0, scoreDemand - 10);
      }
    }

    // 4. Volume Flow scoring (max 20)
    const volAnalysis = smc.summary?.volumeAnalysis;
    const buyRatio = volAnalysis?.buyRatio ?? 50;
    let scoreVolume = 11;
    if (buyRatio >= 62) scoreVolume = 20;
    else if (buyRatio >= 54) scoreVolume = 16;
    else if (buyRatio >= 47) scoreVolume = 11;
    else if (buyRatio >= 38) scoreVolume = 6;
    else scoreVolume = 2;

    const rawScore = Math.round(scoreZone + scoreTrend + scoreDemand + scoreVolume);
    const score = Math.min(99, Math.max(15, rawScore));

    let badge = '🔴 ไม่ควรเข้า เสี่ยงสูง';
    if (score >= 75) badge = '🟢 เข้าซื้อได้ โอกาสกำไรสูง';
    else if (score >= 65) badge = '🟡 ทยอยสะสม แบ่งไม้เข้าซื้อ';
    else if (score >= 51) badge = '🟠 ควรรอย่อ ห้ามไล่ราคา';

    return {
      score,
      badge,
      trend: bias,
      buyRatio
    };
  }

  /**
   * Analyzes 3-Timeframe SMC setups (1H, 4H, 1D) for all watchlist stocks and caches levels
   */
  public static async refreshSetups() {
    if (this.isRefreshingSetups) return;
    this.isRefreshingSetups = true;
    console.log('[BackgroundScanner] Refreshing 3-Timeframe SMC trade setups (1H, 4H, 1D) for all watchlist stocks...');

    for (const item of MAGNIFICENT_7) {
      try {
        const fullSym = resolveFullSymbol(item.displaySymbol);
        const [candles1h, candles4h, candles1d] = await Promise.all([
          YahooFinanceService.getCandles(fullSym, '1h').catch(() => []),
          YahooFinanceService.getCandles(fullSym, '4h').catch(() => []),
          YahooFinanceService.getCandles(fullSym, '1d').catch(() => [])
        ]);

        if (candles1d.length >= 15) {
          const currentPrice = candles1d[candles1d.length - 1].close;
          const smcResult1d = SmcEngine.analyze(item.displaySymbol, item.name, '1d', candles1d);
          const luxSetup = smcResult1d.summary.luxAlgoTradeSetup;
          const simplePlan = smcResult1d.summary.simpleTradePlan;

          let buyMin: number;
          let buyMax: number;
          let slPrice: number;
          let tp1Price: number;
          let tp2Price: number;

          const planCutLoss = simplePlan?.cutLoss?.price ?? Number((currentPrice * 0.92).toFixed(2));
          const planSellMax = simplePlan?.sellZone?.maxPrice ?? simplePlan?.sellTargets?.target1Year?.price ?? Number((currentPrice * 1.25).toFixed(2));
          const planSellMin = simplePlan?.sellZone?.minPrice ?? simplePlan?.sellTargets?.target1Year?.price ?? Number((currentPrice * 1.15).toFixed(2));
          const planBuyMin = simplePlan?.buyZone?.minPrice ?? Number((currentPrice * 0.95).toFixed(2));
          const planBuyMax = simplePlan?.buyZone?.maxPrice ?? Number((currentPrice * 0.98).toFixed(2));

          if (luxSetup && luxSetup.setupType === 'LONG' && luxSetup.entryZone) {
            buyMin = luxSetup.entryZone.min;
            buyMax = luxSetup.entryZone.max;
            slPrice = (luxSetup.stopLoss?.price && luxSetup.stopLoss.price < buyMin) ? luxSetup.stopLoss.price : planCutLoss;
            tp2Price = (luxSetup.takeProfit2?.price && luxSetup.takeProfit2.price > currentPrice) ? luxSetup.takeProfit2.price : planSellMax;
            tp1Price = (luxSetup.takeProfit1?.price && luxSetup.takeProfit1.price > buyMax && luxSetup.takeProfit1.price < tp2Price) ? luxSetup.takeProfit1.price : planSellMin;
          } else {
            buyMin = planBuyMin;
            buyMax = planBuyMax;
            slPrice = planCutLoss;
            tp1Price = planSellMin;
            tp2Price = planSellMax;
          }

          // Strict spot trading sanity checks:
          if (slPrice >= buyMin) slPrice = Number((buyMin * 0.95).toFixed(2));
          if (tp2Price <= currentPrice) tp2Price = Number((Math.max(currentPrice * 1.15, planSellMax)).toFixed(2));
          if (tp1Price <= currentPrice) tp1Price = Number(((buyMax + tp2Price) / 2).toFixed(2));

          const rr = Number(Math.max(1.1, (tp2Price - buyMax) / Math.max(0.01, buyMax - slPrice)).toFixed(2));

          // Compute individual scores for all 3 timeframes
          const res1h = this.computeTfScore(item.displaySymbol, item.name, '1h', candles1h, currentPrice, smcResult1d);
          const res4h = this.computeTfScore(item.displaySymbol, item.name, '4h', candles4h, currentPrice, smcResult1d);
          const res1d = this.computeTfScore(item.displaySymbol, item.name, '1d', candles1d, currentPrice, smcResult1d);

          // Formula: Average of 3 Timeframes (วิเคราะห์หารสาม)
          const avgScore = Math.round((res1h.score + res4h.score + res1d.score) / 3);

          const alignmentCount = [res1h.score, res4h.score, res1d.score].filter(s => s >= 65).length;
          const alignmentText = alignmentCount === 3
            ? '✓ สัญญาณสอดคล้องสมบูรณ์ 3/3 Timeframes (1D + 4H + 1H ทรงเดียวกับสถาบัน)'
            : `✓ สัญญาณสอดคล้อง ${alignmentCount}/3 Timeframes (1D, 4H, 1H)`;

          const multiTimeframe = {
            alignmentText,
            items: [
              { tf: '1H', label: '1 ชม.', score: res1h.score, badge: res1h.badge, trend: res1h.trend, buyRatio: res1h.buyRatio },
              { tf: '4H', label: '4 ชม.', score: res4h.score, badge: res4h.badge, trend: res4h.trend, buyRatio: res4h.buyRatio },
              { tf: '1D', label: 'รายวัน', score: res1d.score, badge: res1d.badge, trend: res1d.trend, buyRatio: res1d.buyRatio }
            ]
          };

          const isNearTp = tp2Price > currentPrice * 0.95 && currentPrice >= (tp2Price * 0.98) && currentPrice <= (tp2Price * 1.05) && tp2Price > buyMax;
          const isReachedTp = currentPrice >= tp2Price && tp2Price > buyMax;
          const inBuyZone = buyMin > 0 && currentPrice >= (buyMin * 0.99) && currentPrice <= (buyMax * 1.01);

          this.setups.set(item.displaySymbol.toUpperCase(), {
            symbol: item.displaySymbol,
            displaySymbol: item.displaySymbol,
            name: item.name,
            thaiName: item.thaiName,
            currentPrice,
            buyZoneMin: buyMin,
            buyZoneMax: buyMax,
            stopLossPrice: slPrice,
            takeProfit1Price: tp1Price,
            takeProfit2Price: tp2Price,
            rrRatio: rr,
            confidenceScore: avgScore, // Average of 3 timeframes (หารสาม)
            timeframe: '3-TF CONFLUENCE (1D/4H/1H)',
            lastUpdated: Date.now(),
            isNearTp,
            isReachedTp,
            inBuyZone,
            volumeBuyRatio: res1d.buyRatio,
            multiTimeframe
          });
        }
      } catch (err: any) {
        console.warn(`[BackgroundScanner] Error calculating setup for ${item.displaySymbol}:`, err.message);
      }
    }

    this.isRefreshingSetups = false;
    console.log(`[BackgroundScanner] Setups cached for ${this.setups.size} stocks with 3-Timeframe MTF.`);
  }

  /**
   * Starts periodic polling (default: every 20 seconds)
   */
  public static start(intervalMs: number = 20000) {
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(async () => {
      await this.poll();
    }, intervalMs);

    // Refresh setups every 30 minutes
    setInterval(async () => {
      await this.refreshSetups();
    }, 30 * 60 * 1000);

    console.log(`[BackgroundScanner] Background monitor started. Polling all watchlist stocks every ${intervalMs / 1000}s.`);
  }

  public static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Polls latest quotes for all watchlist stocks and triggers alerts if hit
   */
  public static async poll() {
    if (this.isScanning) return;
    this.isScanning = true;

    try {
      const quotes = await YahooFinanceService.getMagnificent7Quotes();
      const cfg = this.getConfig();

      for (const quote of quotes) {
        const sym = quote.symbol.replace(/\.BK$/i, '').toUpperCase();
        const setup = this.setups.get(sym);
        if (!setup || quote.price <= 0) continue;

        const currentPrice = quote.price;
        setup.currentPrice = currentPrice;
        setup.lastUpdated = Date.now();

        const tpPrice = setup.takeProfit2Price;
        const buyMin = setup.buyZoneMin;
        const buyMax = setup.buyZoneMax;
        const isThai = sym.endsWith('.BK') || ['KBANK', 'SCB', 'TISCO', 'BBL', 'PTT', 'CPALL', 'AOT', 'DELTA', 'GULF'].includes(sym);
        const curr = isThai ? '฿' : '$';

        // ─────────────────────────────────────────────────────────────
        // 1. EVALUATE TP ALERT (ใกล้ถึงเป้า TP ตั้งแต่ -2%)
        // ─────────────────────────────────────────────────────────────
        const isNearTp = tpPrice > currentPrice * 0.95 && currentPrice >= (tpPrice * 0.98) && currentPrice <= (tpPrice * 1.05) && tpPrice > buyMax;
        const tpKey = `${sym}-TP`;

        if (isNearTp) {
          setup.isNearTp = true;
          setup.isReachedTp = currentPrice >= tpPrice;

          // STRICT CHECK: Alert ONLY ONCE per trigger cycle!
          if (!this.triggeredStates.has(tpKey)) {
            // Trigger alert now!
            const state: TriggeredState = {
              symbol: sym,
              type: 'TP',
              triggeredAt: Date.now(),
              price: currentPrice,
              targetPrice: tpPrice
            };
            this.triggeredStates.set(tpKey, state);
            this.saveStateToDisk();

            console.log(`[BackgroundScanner] 🎯 SINGLE TP ALERT TRIGGERED: ${sym} at ${curr}${currentPrice} (Target: ${curr}${tpPrice})`);

            const alertPayload: DispatchAlertPayload = {
              symbol: sym,
              companyName: setup.name,
              currentPrice,
              buyZoneMin: buyMin,
              buyZoneMax: buyMax,
              targetPrice6M: setup.takeProfit1Price,
              targetPrice1Y: tpPrice,
              stopLossPrice: setup.stopLossPrice,
              confidenceScore: setup.confidenceScore, // วิเคราะห์หารสาม!
              volumeBuyRatio: setup.volumeBuyRatio || 55,
              volumeDelta: 1000000,
              wickRejection: false,
              timeframe: '3-TF CONFLUENCE (1D/4H/1H)',
              alertType: 'TP',
              sellZoneMin: setup.takeProfit1Price,
              sellZoneMax: tpPrice,
              notes: `🎯 ใกล้ถึงโซน TP (เตือนตั้งแต่ -2%): ราคา ${curr}${currentPrice.toFixed(2)} เข้าใกล้เป้าสถาบัน ${curr}${tpPrice.toFixed(2)}`,
              multiTimeframe: setup.multiTimeframe
            };

            this.dispatchAlert(alertPayload, cfg);
          }
        } else {
          setup.isNearTp = false;
          setup.isReachedTp = false;

          // Hysteresis reset: only reset when price drops below 95% of TP
          if (tpPrice > 0 && (currentPrice < tpPrice * 0.95 || currentPrice > tpPrice * 1.06) && this.triggeredStates.has(tpKey)) {
            console.log(`[BackgroundScanner] Resetting TP alert state for ${sym} (price fell to ${curr}${currentPrice})`);
            this.triggeredStates.delete(tpKey);
            this.saveStateToDisk();
          }
        }

        // ─────────────────────────────────────────────────────────────
        // 2. EVALUATE BUY ZONE ALERT (เข้าสู่โซนช้อนซื้อสถาบัน)
        // ─────────────────────────────────────────────────────────────
        const inBuyZone = buyMin > 0 && currentPrice >= (buyMin * 0.99) && currentPrice <= (buyMax * 1.01);
        const buyKey = `${sym}-BUY`;

        if (inBuyZone) {
          setup.inBuyZone = true;

          // STRICT CHECK: Alert ONLY ONCE per trigger cycle!
          if (!this.triggeredStates.has(buyKey)) {
            const state: TriggeredState = {
              symbol: sym,
              type: 'BUY',
              triggeredAt: Date.now(),
              price: currentPrice,
              targetPrice: buyMin
            };
            this.triggeredStates.set(buyKey, state);
            this.saveStateToDisk();

            console.log(`[BackgroundScanner] 🟢 SINGLE BUY ALERT TRIGGERED: ${sym} in zone ${curr}${buyMin} - ${curr}${buyMax}`);

            const alertPayload: DispatchAlertPayload = {
              symbol: sym,
              companyName: setup.name,
              currentPrice,
              buyZoneMin: buyMin,
              buyZoneMax: buyMax,
              targetPrice6M: setup.takeProfit1Price,
              targetPrice1Y: tpPrice,
              stopLossPrice: setup.stopLossPrice,
              confidenceScore: setup.confidenceScore, // วิเคราะห์หารสาม!
              volumeBuyRatio: setup.volumeBuyRatio || 55,
              volumeDelta: 1000000,
              wickRejection: false,
              timeframe: '3-TF CONFLUENCE (1D/4H/1H)',
              alertType: 'BUY',
              sellZoneMin: setup.takeProfit1Price,
              sellZoneMax: tpPrice,
              notes: `🟢 จุดเข้าซื้อสถาบัน: ราคา ${curr}${currentPrice.toFixed(2)} ย่อแตะโซน Discount OTE ${curr}${buyMin.toFixed(2)} - ${curr}${buyMax.toFixed(2)}`,
              multiTimeframe: setup.multiTimeframe
            };

            this.dispatchAlert(alertPayload, cfg);
          }
        } else {
          setup.inBuyZone = false;

          // Reset when price moves out of buy zone
          if (buyMax > 0 && (currentPrice > buyMax * 1.03 || (setup.stopLossPrice > 0 && currentPrice < setup.stopLossPrice)) && this.triggeredStates.has(buyKey)) {
            console.log(`[BackgroundScanner] Resetting BUY alert state for ${sym} (price moved to ${curr}${currentPrice})`);
            this.triggeredStates.delete(buyKey);
            this.saveStateToDisk();
          }
        }
      }
    } catch (err: any) {
      console.warn('[BackgroundScanner] Poll error:', err.message);
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Immediately analyzes and dispatches a full 3-timeframe alert for a specified stock
   */
  public static async sendStockAlertNow(symbol: string, alertType: 'BUY' | 'TP' = 'TP'): Promise<any> {
    const sym = symbol.replace(/\.BK$/i, '').toUpperCase();
    let setup = this.setups.get(sym);
    if (!setup) {
      await this.refreshSetups();
      setup = this.setups.get(sym);
    }
    if (!setup) {
      throw new Error(`ไม่พบข้อมูล Setup สำหรับหุ้น ${symbol}`);
    }

    const cfg = this.getConfig();
    const isTp = alertType === 'TP';
    const isThai = sym.endsWith('.BK') || ['KBANK', 'SCB', 'TISCO', 'BBL', 'PTT', 'CPALL', 'AOT', 'DELTA', 'GULF'].includes(sym);
    const curr = isThai ? '฿' : '$';

    const payload: DispatchAlertPayload = {
      symbol: sym,
      companyName: setup.name,
      currentPrice: setup.currentPrice,
      buyZoneMin: setup.buyZoneMin,
      buyZoneMax: setup.buyZoneMax,
      targetPrice6M: setup.takeProfit1Price,
      targetPrice1Y: setup.takeProfit2Price,
      stopLossPrice: setup.stopLossPrice,
      confidenceScore: setup.confidenceScore, // วิเคราะห์หารสาม!
      volumeBuyRatio: setup.volumeBuyRatio || 55,
      volumeDelta: 1000000,
      wickRejection: false,
      timeframe: '3-TF CONFLUENCE (1D/4H/1H)',
      alertType: isTp ? 'TP' : 'BUY',
      sellZoneMin: setup.takeProfit1Price,
      sellZoneMax: setup.takeProfit2Price,
      notes: isTp
        ? `🎯 ใกล้ถึงโซน TP (เตือนตั้งแต่ -2%): ราคา ${curr}${setup.currentPrice.toFixed(2)} เข้าใกล้เป้าสถาบัน ${curr}${setup.takeProfit2Price.toFixed(2)}`
        : `🟢 จุดเข้าซื้อสถาบัน: ราคา ${curr}${setup.currentPrice.toFixed(2)} ย่อแตะโซน Discount OTE ${curr}${setup.buyZoneMin.toFixed(2)} - ${curr}${setup.buyZoneMax.toFixed(2)}`,
      multiTimeframe: setup.multiTimeframe
    };

    await this.dispatchAlert(payload, cfg);
    return payload;
  }

  /**
   * Dispatches alert to external services (Discord, Telegram, LINE) and stores in history
   */
  private static async dispatchAlert(alert: DispatchAlertPayload, cfg: any) {
    const isTp = alert.alertType === 'TP';
    const alertItem = {
      id: `alert-${isTp ? 'tp' : 'buy'}-${alert.symbol}-${Date.now()}`,
      timestamp: Date.now(),
      symbol: alert.symbol,
      companyName: alert.companyName,
      currentPrice: alert.currentPrice,
      buyZoneMin: alert.buyZoneMin,
      buyZoneMax: alert.buyZoneMax,
      targetPrice6M: alert.targetPrice6M || 0,
      targetPrice1Y: alert.targetPrice1Y,
      stopLossPrice: alert.stopLossPrice,
      confidenceScore: alert.confidenceScore,
      volumeBuyRatio: alert.volumeBuyRatio,
      volumeDelta: alert.volumeDelta,
      wickRejection: alert.wickRejection,
      timeframe: alert.timeframe,
      alertType: alert.alertType,
      sellZoneMin: alert.sellZoneMin,
      sellZoneMax: alert.sellZoneMax,
      title: isTp
        ? `🎯 ใกล้ถึงโซน TP: ${alert.symbol} ราคา $${alert.currentPrice.toFixed(2)} เข้าใกล้เป้า $${alert.targetPrice1Y.toFixed(2)} (เตือนตั้งแต่ -2%)`
        : `🟢 จุดซื้อสถาบัน: ${alert.symbol} ย่อแตะโซนช้อน $${alert.buyZoneMin.toFixed(2)}–$${alert.buyZoneMax.toFixed(2)}`,
      message: isTp
        ? `ราคา $${alert.currentPrice.toFixed(2)} เข้าใกล้โซนทำกำไร Take Profit (TP: $${alert.targetPrice1Y.toFixed(2)}) แนะนำเตรียมทยอยแบ่งขาย (เตือนแค่ครั้งเดียว)`
        : `ราคา $${alert.currentPrice.toFixed(2)} เข้าสู่โซน OTE Discount สถาบัน Smart Money เรียบร้อยแล้ว (เตือนแค่ครั้งเดียว)`,
      read: false,
      multiTimeframe: alert.multiTimeframe
    };

    this.alertHistory = [alertItem, ...this.alertHistory].slice(0, 50);
    this.saveStateToDisk();

    // Send Discord
    if (cfg.discordEnabled && cfg.discordWebhookUrl) {
      NotificationService.sendDiscord(cfg.discordWebhookUrl, alert).catch(e => console.warn('[Discord Alert Error]:', e.message));
    }

    // Send Telegram
    if (cfg.telegramEnabled && cfg.telegramBotToken && cfg.telegramChatId) {
      NotificationService.sendTelegram(cfg.telegramBotToken, cfg.telegramChatId, alert).catch(e => console.warn('[Telegram Alert Error]:', e.message));
    }

    // Send LINE Notify
    if (cfg.lineEnabled && cfg.lineNotifyToken) {
      NotificationService.sendLine(cfg.lineNotifyToken, alert).catch(e => console.warn('[LINE Alert Error]:', e.message));
    }

    // Send LINE Bot
    if (cfg.lineBotEnabled && cfg.lineBotChannelToken && cfg.lineBotUserId) {
      NotificationService.sendLineBot(cfg.lineBotChannelToken, cfg.lineBotUserId, alert).catch(e => console.warn('[LINE Bot Alert Error]:', e.message));
    }
  }

  public static getWatchlistSetups(): WatchlistStockSetup[] {
    return Array.from(this.setups.values());
  }

  public static getAlertHistory(): any[] {
    return [...this.alertHistory];
  }

  public static addManualAlert(alertItem: any) {
    this.alertHistory = [alertItem, ...this.alertHistory].slice(0, 50);
    this.saveStateToDisk();
  }

  public static resetTriggeredState(symbol?: string, type?: string) {
    if (symbol && type) {
      this.triggeredStates.delete(`${symbol.toUpperCase()}-${type.toUpperCase()}`);
    } else if (symbol) {
      this.triggeredStates.delete(`${symbol.toUpperCase()}-TP`);
      this.triggeredStates.delete(`${symbol.toUpperCase()}-BUY`);
    } else {
      this.triggeredStates.clear();
    }
    this.saveStateToDisk();
  }
}
