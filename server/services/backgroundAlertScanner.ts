import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { YahooFinanceService, MAGNIFICENT_7, resolveFullSymbol } from './yahooFinance.js';
import { SmcEngine } from './smcEngine.js';
import { NotificationService, DispatchAlertPayload } from './notificationService.js';

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
   * Analyzes 1D SMC setups for all watchlist stocks and caches levels
   */
  public static async refreshSetups() {
    if (this.isRefreshingSetups) return;
    this.isRefreshingSetups = true;
    console.log('[BackgroundScanner] Refreshing 1D SMC trade setups for all watchlist stocks...');

    for (const item of MAGNIFICENT_7) {
      try {
        const fullSym = resolveFullSymbol(item.displaySymbol);
        const candles = await YahooFinanceService.getCandles(fullSym, '1d').catch(() => []);
        if (candles.length >= 15) {
          const smcResult = SmcEngine.analyze(item.displaySymbol, item.name, '1d', candles);
          const luxSetup = smcResult.summary.luxAlgoTradeSetup;
          const simplePlan = smcResult.summary.simpleTradePlan;

          const buyMin = luxSetup?.entryZone?.min ?? simplePlan?.buyZone.minPrice ?? 0;
          const buyMax = luxSetup?.entryZone?.max ?? simplePlan?.buyZone.maxPrice ?? 0;
          const slPrice = luxSetup?.stopLoss?.price ?? simplePlan?.cutLoss.price ?? 0;
          const tp1Price = luxSetup?.takeProfit1?.price ?? simplePlan?.sellZone?.minPrice ?? 0;
          const tp2Price = luxSetup?.takeProfit2?.price ?? simplePlan?.sellZone?.maxPrice ?? simplePlan?.sellTargets.target1Year.price ?? 0;
          const rr = luxSetup?.riskRewardRatio ?? simplePlan?.riskRewardRatio ?? 1.76;

          const currentPrice = candles[candles.length - 1].close;

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
            confidenceScore: 78,
            timeframe: '1d',
            lastUpdated: Date.now(),
            isNearTp: tp2Price > 0 && currentPrice >= tp2Price * 0.98,
            isReachedTp: tp2Price > 0 && currentPrice >= tp2Price,
            inBuyZone: currentPrice >= buyMin * 0.995 && currentPrice <= buyMax * 1.005
          });
        }
      } catch (err: any) {
        console.warn(`[BackgroundScanner] Error calculating setup for ${item.displaySymbol}:`, err.message);
      }
    }

    this.isRefreshingSetups = false;
    console.log(`[BackgroundScanner] Setups cached for ${this.setups.size} stocks.`);
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

        // ─────────────────────────────────────────────────────────────
        // 1. EVALUATE TP ALERT (ใกล้ถึงเป้า TP ตั้งแต่ -2%)
        // ─────────────────────────────────────────────────────────────
        const isNearTp = tpPrice > 0 && currentPrice >= (tpPrice * 0.98);
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

            console.log(`[BackgroundScanner] 🎯 SINGLE TP ALERT TRIGGERED: ${sym} at $${currentPrice} (Target: $${tpPrice})`);

            const alertPayload: DispatchAlertPayload = {
              symbol: sym,
              companyName: setup.name,
              currentPrice,
              buyZoneMin: buyMin,
              buyZoneMax: buyMax,
              targetPrice6M: setup.takeProfit1Price,
              targetPrice1Y: tpPrice,
              stopLossPrice: setup.stopLossPrice,
              confidenceScore: 78,
              volumeBuyRatio: 55,
              volumeDelta: 1000000,
              wickRejection: false,
              timeframe: '1D SMC (Background)',
              alertType: 'TP',
              sellZoneMin: setup.takeProfit1Price,
              sellZoneMax: tpPrice,
              notes: `🎯 ใกล้ถึงโซน TP (เตือนตั้งแต่ -2%): ราคา $${currentPrice.toFixed(2)} เข้าใกล้เป้าสถาบัน $${tpPrice.toFixed(2)}`,
              multiTimeframe: {
                alignmentText: '✓ ตรวจจับอัตโนมัติจากโมเดล LuxAlgo SMC 1D (แจ้งเตือนเบื้องหลัง)',
                items: [
                  { tf: '1D', label: 'รายวัน', score: 78, badge: '🟢 เข้าใกล้โซนทำกำไร TP', trend: 'BULLISH' }
                ]
              }
            };

            this.dispatchAlert(alertPayload, cfg);
          }
        } else {
          setup.isNearTp = false;
          setup.isReachedTp = false;

          // Hysteresis reset: only reset when price drops below 95% of TP
          if (tpPrice > 0 && currentPrice < tpPrice * 0.95 && this.triggeredStates.has(tpKey)) {
            console.log(`[BackgroundScanner] Resetting TP alert state for ${sym} (price fell to $${currentPrice})`);
            this.triggeredStates.delete(tpKey);
            this.saveStateToDisk();
          }
        }

        // ─────────────────────────────────────────────────────────────
        // 2. EVALUATE BUY ZONE ALERT (เข้าสู่โซนช้อนซื้อสถาบัน)
        // ─────────────────────────────────────────────────────────────
        const inBuyZone = buyMin > 0 && currentPrice >= buyMin * 0.995 && currentPrice <= buyMax * 1.005;
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

            console.log(`[BackgroundScanner] 🟢 SINGLE BUY ALERT TRIGGERED: ${sym} in zone $${buyMin} - $${buyMax}`);

            const alertPayload: DispatchAlertPayload = {
              symbol: sym,
              companyName: setup.name,
              currentPrice,
              buyZoneMin: buyMin,
              buyZoneMax: buyMax,
              targetPrice6M: setup.takeProfit1Price,
              targetPrice1Y: tpPrice,
              stopLossPrice: setup.stopLossPrice,
              confidenceScore: 78,
              volumeBuyRatio: 55,
              volumeDelta: 1000000,
              wickRejection: false,
              timeframe: '1D SMC (Background)',
              alertType: 'BUY',
              sellZoneMin: setup.takeProfit1Price,
              sellZoneMax: tpPrice,
              notes: `🟢 จุดเข้าซื้อสถาบัน: ราคา $${currentPrice.toFixed(2)} ย่อแตะโซน Discount OTE $${buyMin.toFixed(2)} - $${buyMax.toFixed(2)}`,
              multiTimeframe: {
                alignmentText: '✓ ตรวจจับอัตโนมัติจากโมเดล LuxAlgo SMC 1D (แจ้งเตือนเบื้องหลัง)',
                items: [
                  { tf: '1D', label: 'รายวัน', score: 78, badge: '🟢 เข้าซื้อได้ โอกาสกำไรสูง', trend: 'BULLISH' }
                ]
              }
            };

            this.dispatchAlert(alertPayload, cfg);
          }
        } else {
          setup.inBuyZone = false;

          // Reset when price moves out of buy zone
          if (buyMax > 0 && (currentPrice > buyMax * 1.03 || (setup.stopLossPrice > 0 && currentPrice < setup.stopLossPrice)) && this.triggeredStates.has(buyKey)) {
            console.log(`[BackgroundScanner] Resetting BUY alert state for ${sym} (price moved to $${currentPrice})`);
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
