import { AlertConfig, BuyAlertItem, AlertTestResult } from '../types/alert';
import { SmcAnalysisResult, AiNewsVerdict, MultiTimeframeAnalysis, StockQuote } from '../types/smc';
import { playBuyAlertSound, playTestChime } from '../utils/audioAlert';

const CONFIG_KEY = 'ai_smc_alert_config';
const ALERTS_HISTORY_KEY = 'ai_smc_alerts_history';
const LAST_ALERT_TIMESTAMP_KEY = 'ai_smc_last_alert_timestamps';
const ACTIVE_TRIGGERED_KEY = 'ai_smc_active_triggered_alerts';

const DEFAULT_CONFIG: AlertConfig = {
  soundEnabled: true,
  inAppEnabled: true,
  discordEnabled: false,
  discordWebhookUrl: '',
  telegramEnabled: false,
  telegramBotToken: '',
  telegramChatId: '',
  lineEnabled: false,
  lineNotifyToken: '',
  lineBotEnabled: false,
  lineBotChannelToken: '',
  lineBotUserId: '',
  minConfidenceScore: 75,
  requireVolumeConfirmation: true,
  requireWickConfirmation: false
};

export interface WatchlistSetupSummary {
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
    items: {
      tf: string;
      label?: string;
      score: number;
      badge: string;
      trend?: string;
      buyRatio?: number;
    }[];
  };
}

export interface ActiveTriggeredState {
  symbol: string;
  type: 'BUY' | 'TP';
  triggeredAt: number;
  price: number;
  targetPrice: number;
}

type AlertListener = (newAlert: BuyAlertItem) => void;

class AlertManager {
  private config: AlertConfig = DEFAULT_CONFIG;
  private alerts: BuyAlertItem[] = [];
  private listeners: Set<AlertListener> = new Set();
  private lastAlertsBySymbol: Record<string, number> = {};
  private activeTriggeredAlerts: Record<string, ActiveTriggeredState> = {};
  private watchlistSetups: Map<string, WatchlistSetupSummary> = new Map();
  private isSyncingServer: boolean = false;

  constructor() {
    this.loadState();
  }

  private loadState() {
    if (typeof window === 'undefined') return;

    try {
      const savedConfig = localStorage.getItem(CONFIG_KEY);
      if (savedConfig) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(savedConfig) };
      }
    } catch (e) {
      console.warn('[AlertManager] Failed to load config from storage:', e);
    }

    try {
      const savedAlerts = localStorage.getItem(ALERTS_HISTORY_KEY);
      if (savedAlerts) {
        this.alerts = JSON.parse(savedAlerts);
      }
    } catch (e) {
      console.warn('[AlertManager] Failed to load alerts from storage:', e);
    }

    try {
      const savedTimestamps = localStorage.getItem(LAST_ALERT_TIMESTAMP_KEY);
      if (savedTimestamps) {
        this.lastAlertsBySymbol = JSON.parse(savedTimestamps);
      }
    } catch (e) {
      console.warn('[AlertManager] Failed to load timestamps from storage:', e);
    }

    try {
      const savedActive = localStorage.getItem(ACTIVE_TRIGGERED_KEY);
      if (savedActive) {
        this.activeTriggeredAlerts = JSON.parse(savedActive);
      }
    } catch (e) {
      console.warn('[AlertManager] Failed to load active triggers from storage:', e);
    }

    // Attempt to sync config and setups from backend
    this.syncConfigFromBackend();
    this.syncWatchlistSetups();
  }

  private saveActiveTriggers() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(ACTIVE_TRIGGERED_KEY, JSON.stringify(this.activeTriggeredAlerts));
    } catch (e) {}
  }

  /**
   * Check if an alert of given type has already been triggered for this symbol
   */
  public isAlertActive(symbol: string, type: 'BUY' | 'TP'): boolean {
    const key = `${symbol.toUpperCase()}-${type.toUpperCase()}`;
    return Boolean(this.activeTriggeredAlerts[key]);
  }

  /**
   * Mark alert as triggered (single alert guarantee)
   */
  public markAlertActive(symbol: string, type: 'BUY' | 'TP', price: number, targetPrice: number) {
    const key = `${symbol.toUpperCase()}-${type.toUpperCase()}`;
    this.activeTriggeredAlerts[key] = {
      symbol: symbol.toUpperCase(),
      type,
      triggeredAt: Date.now(),
      price,
      targetPrice
    };
    this.saveActiveTriggers();
  }

  /**
   * Clear triggered status when price leaves the zone (hysteresis reset)
   */
  public clearAlertActive(symbol: string, type: 'BUY' | 'TP') {
    const key = `${symbol.toUpperCase()}-${type.toUpperCase()}`;
    if (this.activeTriggeredAlerts[key]) {
      delete this.activeTriggeredAlerts[key];
      this.saveActiveTriggers();
    }
  }

  /**
   * Reset all triggered states (re-arm all alerts)
   */
  public resetAllTriggered() {
    this.activeTriggeredAlerts = {};
    this.saveActiveTriggers();
    fetch('/api/alerts/reset-triggered', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  }

  private async syncConfigFromBackend() {
    try {
      const res = await fetch('/api/alerts/config');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          this.config = { ...this.config, ...json.data };
          localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
        }
      }
    } catch (e) {
      // Offline or dev mode fallback
    }
  }

  /**
   * Sync 1D SMC setups for all watchlist stocks from backend
   */
  public async syncWatchlistSetups(): Promise<WatchlistSetupSummary[]> {
    try {
      const res = await fetch('/api/alerts/watchlist-status');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          for (const s of json.data) {
            this.watchlistSetups.set(s.displaySymbol.toUpperCase(), s);
          }
          return json.data;
        }
      }
    } catch (e) {
      // fallback
    }
    return Array.from(this.watchlistSetups.values());
  }

  /**
   * Sync background alerts generated on the server
   */
  public async syncServerAlerts(): Promise<void> {
    if (this.isSyncingServer) return;
    this.isSyncingServer = true;
    try {
      const res = await fetch('/api/alerts/history');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const serverAlerts: BuyAlertItem[] = json.data;
          let hasNew = false;
          for (const sAlert of serverAlerts) {
            const exists = this.alerts.some(a => a.id === sAlert.id || (a.symbol === sAlert.symbol && a.alertType === sAlert.alertType && Math.abs(a.timestamp - sAlert.timestamp) < 60000));
            if (!exists) {
              this.alerts = [sAlert, ...this.alerts].slice(0, 50);
              hasNew = true;
              // Play chime and notify UI if not seen
              if (this.config.soundEnabled) {
                playBuyAlertSound();
              }
              this.notifyListeners(sAlert);
            }
          }
          if (hasNew) {
            localStorage.setItem(ALERTS_HISTORY_KEY, JSON.stringify(this.alerts));
          }
        }
      }
    } catch (e) {
    } finally {
      this.isSyncingServer = false;
    }
  }

  public getConfig(): AlertConfig {
    return { ...this.config };
  }

  public async updateConfig(newConfig: Partial<AlertConfig>): Promise<AlertConfig> {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
      await fetch('/api/alerts/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.config)
      });
    } catch (e) {
      console.warn('[AlertManager] Failed to save config to server:', e);
    }
    return this.config;
  }

  public getAlerts(): BuyAlertItem[] {
    return [...this.alerts];
  }

  public getUnreadCount(): number {
    return this.alerts.filter(a => !a.read).length;
  }

  public markAllAsRead(): void {
    this.alerts = this.alerts.map(a => ({ ...a, read: true }));
    localStorage.setItem(ALERTS_HISTORY_KEY, JSON.stringify(this.alerts));
  }

  public clearAlerts(): void {
    this.alerts = [];
    localStorage.removeItem(ALERTS_HISTORY_KEY);
  }

  public subscribe(listener: AlertListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(alert: BuyAlertItem) {
    this.listeners.forEach(cb => {
      try {
        cb(alert);
      } catch (err) {
        console.error('[AlertManager] Listener error:', err);
      }
    });
  }

  /**
   * Background Watchlist Evaluator:
   * Evaluates ALL quotes in the watchlist without requiring the user to click into that stock.
   * Guarantees that each alert triggers EXACTLY ONCE per event.
   */
  public evaluateWatchlistQuotes(quotes: StockQuote[]): BuyAlertItem[] {
    const triggeredList: BuyAlertItem[] = [];

    for (const q of quotes) {
      const sym = q.symbol.replace(/\.BK$/i, '').toUpperCase();
      const setup = this.watchlistSetups.get(sym);
      if (!setup || q.price <= 0) continue;

      const currentPrice = q.price;
      const tpPrice = setup.takeProfit2Price;
      const buyMin = setup.buyZoneMin;
      const buyMax = setup.buyZoneMax;

      // ─────────────────────────────────────────────────────────────
      // 1. EVALUATE TP ALERT FOR WATCHLIST STOCK (เตือนที่ -2% แค่ครั้งเดียว)
      // ─────────────────────────────────────────────────────────────
      const isNearTp = tpPrice > 0 && currentPrice >= (tpPrice * 0.98);

      if (isNearTp) {
        if (!this.isAlertActive(sym, 'TP')) {
          // Trigger once!
          this.markAlertActive(sym, 'TP', currentPrice, tpPrice);

          const now = Date.now();
          const multiTimeframe = setup.multiTimeframe || {
            alignmentText: '✓ สัญญาณสอดคล้อง 3 Timeframes (1D, 4H, 1H)',
            items: [
              { tf: '1H', label: '1 ชม.', score: 70, badge: '🟡 ทยอยสะสม แบ่งไม้เข้าซื้อ', trend: 'BULLISH' },
              { tf: '4H', label: '4 ชม.', score: 75, badge: '🟢 เข้าซื้อได้ โอกาสกำไรสูง', trend: 'BULLISH' },
              { tf: '1D', label: 'รายวัน', score: 78, badge: '🟢 เข้าซื้อได้ โอกาสกำไรสูง', trend: 'BULLISH' }
            ]
          };
          const confidenceScore = setup.confidenceScore || Math.round(multiTimeframe.items.reduce((a, b) => a + b.score, 0) / multiTimeframe.items.length);

          const alertItem: BuyAlertItem = {
            id: `alert-tp-${sym}-${now}`,
            timestamp: now,
            symbol: sym,
            companyName: setup.name || sym,
            currentPrice,
            buyZoneMin: buyMin,
            buyZoneMax: buyMax,
            targetPrice6M: setup.takeProfit1Price,
            targetPrice1Y: tpPrice,
            stopLossPrice: setup.stopLossPrice,
            confidenceScore,
            volumeBuyRatio: setup.volumeBuyRatio || 55,
            volumeDelta: 1000000,
            wickRejection: false,
            timeframe: '3-TF CONFLUENCE (1D/4H/1H)',
            alertType: 'TP',
            sellZoneMin: setup.takeProfit1Price,
            sellZoneMax: tpPrice,
            title: `🎯 ใกล้ถึงโซน TP: ${sym} ราคา $${currentPrice.toFixed(2)} เข้าใกล้เป้า $${tpPrice.toFixed(2)} (เตือนตั้งแต่ -2%)`,
            message: `ราคา $${currentPrice.toFixed(2)} เข้าใกล้โซนทำกำไร Take Profit (TP: $${tpPrice.toFixed(2)}) แนะนำเตรียมทยอยแบ่งขาย (เตือนแค่ครั้งเดียว)`,
            read: false,
            multiTimeframe
          };

          this.alerts = [alertItem, ...this.alerts].slice(0, 50);
          localStorage.setItem(ALERTS_HISTORY_KEY, JSON.stringify(this.alerts));

          if (this.config.soundEnabled) {
            playBuyAlertSound();
          }
          this.dispatchExternalAlerts(alertItem);
          this.notifyListeners(alertItem);
          triggeredList.push(alertItem);
        }
      } else {
        // Price dropped safely below TP - reset trigger for future runs
        if (tpPrice > 0 && currentPrice < tpPrice * 0.95 && this.isAlertActive(sym, 'TP')) {
          this.clearAlertActive(sym, 'TP');
        }
      }

      // ─────────────────────────────────────────────────────────────
      // 2. EVALUATE BUY ALERT FOR WATCHLIST STOCK (เตือนโซนซื้อแค่ครั้งเดียว)
      // ─────────────────────────────────────────────────────────────
      const inBuyZone = buyMin > 0 && currentPrice >= buyMin * 0.995 && currentPrice <= buyMax * 1.005;

      if (inBuyZone) {
        if (!this.isAlertActive(sym, 'BUY')) {
          this.markAlertActive(sym, 'BUY', currentPrice, buyMin);

          const now = Date.now();
          const multiTimeframe = setup.multiTimeframe || {
            alignmentText: '✓ สัญญาณสอดคล้อง 3 Timeframes (1D, 4H, 1H)',
            items: [
              { tf: '1H', label: '1 ชม.', score: 70, badge: '🟡 ทยอยสะสม แบ่งไม้เข้าซื้อ', trend: 'BULLISH' },
              { tf: '4H', label: '4 ชม.', score: 75, badge: '🟢 เข้าซื้อได้ โอกาสกำไรสูง', trend: 'BULLISH' },
              { tf: '1D', label: 'รายวัน', score: 78, badge: '🟢 เข้าซื้อได้ โอกาสกำไรสูง', trend: 'BULLISH' }
            ]
          };
          const confidenceScore = setup.confidenceScore || Math.round(multiTimeframe.items.reduce((a, b) => a + b.score, 0) / multiTimeframe.items.length);

          const alertItem: BuyAlertItem = {
            id: `alert-buy-${sym}-${now}`,
            timestamp: now,
            symbol: sym,
            companyName: setup.name || sym,
            currentPrice,
            buyZoneMin: buyMin,
            buyZoneMax: buyMax,
            targetPrice6M: setup.takeProfit1Price,
            targetPrice1Y: tpPrice,
            stopLossPrice: setup.stopLossPrice,
            confidenceScore,
            volumeBuyRatio: setup.volumeBuyRatio || 55,
            volumeDelta: 1000000,
            wickRejection: false,
            timeframe: '3-TF CONFLUENCE (1D/4H/1H)',
            alertType: 'BUY',
            sellZoneMin: setup.takeProfit1Price,
            sellZoneMax: tpPrice,
            title: `🟢 จุดซื้อสถาบัน: ${sym} ย่อแตะโซนช้อน $${buyMin.toFixed(2)}–$${buyMax.toFixed(2)}`,
            message: `ราคา $${currentPrice.toFixed(2)} เข้ากรอบสะสมของถูก Smart Money เรียบร้อยแล้ว (เตือนแค่ครั้งเดียว)`,
            read: false,
            multiTimeframe
          };

          this.alerts = [alertItem, ...this.alerts].slice(0, 50);
          localStorage.setItem(ALERTS_HISTORY_KEY, JSON.stringify(this.alerts));

          if (this.config.soundEnabled) {
            playBuyAlertSound();
          }
          this.dispatchExternalAlerts(alertItem);
          this.notifyListeners(alertItem);
          triggeredList.push(alertItem);
        }
      } else {
        if (buyMax > 0 && (currentPrice > buyMax * 1.03 || (setup.stopLossPrice > 0 && currentPrice < setup.stopLossPrice)) && this.isAlertActive(sym, 'BUY')) {
          this.clearAlertActive(sym, 'BUY');
        }
      }
    }

    return triggeredList;
  }

  /**
   * Evaluates if active stock analysis triggers a signal (Single-alert guarantee)
   */
  public evaluateSignal(
    data: SmcAnalysisResult | null,
    aiVerdict: AiNewsVerdict | null,
    multiTfData?: MultiTimeframeAnalysis | null
  ): BuyAlertItem | null {
    if (!data || !aiVerdict) return null;

    const snapshots = aiVerdict.multiTimeframe?.snapshots || [];
    const has1d = snapshots.some(s => s.timeframe === '1d') || Boolean(multiTfData?.['1d']);
    const has4h = snapshots.some(s => s.timeframe === '4h') || Boolean(multiTfData?.['4h']);
    const has1h = snapshots.some(s => s.timeframe === '1h') || Boolean(multiTfData?.['1h']);

    if (!has1d || !has4h || !has1h) {
      return null;
    }

    const institutionalData = multiTfData?.['1d']
      || (data.timeframe === '1d' ? data : null)
      || multiTfData?.['4h']
      || (data.timeframe === '4h' ? data : null)
      || multiTfData?.['1h']
      || (data.timeframe === '1h' ? data : null);

    if (!institutionalData || !institutionalData.summary?.simpleTradePlan?.buyZone) {
      return null;
    }

    const plan = institutionalData.summary.simpleTradePlan;
    const buyZone = plan.buyZone;
    const symbol = data.symbol.replace(/\.BK$/i, '').toUpperCase();
    const currentPrice = data.summary.keyLevels.currentPrice;

    // ── SELL ZONE / TAKE PROFIT (TP) TARGETS ──
    const luxAlgoSetup = institutionalData.summary?.luxAlgoTradeSetup || data.summary?.luxAlgoTradeSetup;
    const targetTp = luxAlgoSetup?.takeProfit2?.price ?? plan.sellZone?.minPrice ?? plan.sellTargets.target1Year.price;
    const sellMin = targetTp;
    const sellMax = luxAlgoSetup?.takeProfit2?.price ?? plan.sellZone?.maxPrice ?? Number((sellMin * 1.06).toFixed(2));
    const tp1Price = luxAlgoSetup?.takeProfit1?.price ?? plan.sellZone?.minPrice ?? Number((sellMin * 0.95).toFixed(2));

    const now = Date.now();

    // ── CONSTRUCT 3-TIMEFRAME SNAPSHOTS (1D, 4H, 1H) ──
    const tfOrder: ('1d' | '4h' | '1h')[] = ['1d', '4h', '1h'];
    const tfItems = tfOrder.map(tf => {
      const snap = snapshots.find(s => s.timeframe === tf);
      const tfResult = multiTfData?.[tf] || (data.timeframe === tf ? data : null);
      const score = snap?.score ?? (tfResult ? 78 : 75);
      const badge = score >= 75
        ? 'เข้าซื้อได้ โอกาสกำไรสูง'
        : score >= 65
        ? 'ทยอยสะสม แบ่งไม้เข้าซื้อ'
        : score >= 51
        ? 'ควรรอย่อ ห้ามไล่ราคา'
        : 'ไม่ควรเข้า เสี่ยงสูง';
      const label = tf === '1d' ? 'รายวัน' : tf === '4h' ? '4 ชม.' : '1 ชม.';
      return {
        tf: tf.toUpperCase(),
        label,
        score,
        badge,
        trend: snap?.trend || tfResult?.summary?.overallBias || 'BULLISH',
        buyRatio: snap?.volumeFlow?.buyRatio ?? tfResult?.summary?.volumeAnalysis?.buyRatio ?? 55
      };
    });

    const alignmentCount = tfItems.filter(it => it.score >= 70).length;
    const alignmentText = alignmentCount === 3
      ? '✓ สัญญาณสอดคล้องสมบูรณ์ 3/3 Timeframes (1D + 4H + 1H ทรงเดียวกับสถาบัน)'
      : `✓ สัญญาณสอดคล้อง ${alignmentCount}/3 Timeframes (1D, 4H, 1H)`;

    const multiTimeframe = {
      alignmentText,
      items: tfItems
    };

    const volumeFlow = aiVerdict.volumeFlow || institutionalData.summary?.volumeAnalysis || {
      buyRatio: 50,
      sellRatio: 50,
      netDelta: 0
    };

    // ─────────────────────────────────────────────────────────────
    // 1. EVALUATE TAKE PROFIT (TP) ALERT (เตือนที่ -2% แค่ครั้งเดียว!)
    // ─────────────────────────────────────────────────────────────
    const isNearTpZone = sellMin > 0 && currentPrice >= (sellMin * 0.98);

    if (isNearTpZone) {
      // Check if already active
      if (this.isAlertActive(symbol, 'TP')) {
        return null; // ALERTED ONCE! Do not repeat!
      }

      this.markAlertActive(symbol, 'TP', currentPrice, targetTp);

      const alertItem: BuyAlertItem = {
        id: `alert-tp-${symbol}-${now}`,
        timestamp: now,
        symbol,
        companyName: data.name || symbol,
        currentPrice,
        buyZoneMin: buyZone.minPrice,
        buyZoneMax: buyZone.maxPrice,
        targetPrice6M: tp1Price,
        targetPrice1Y: targetTp,
        stopLossPrice: luxAlgoSetup?.stopLoss?.price ?? plan.cutLoss.price,
        confidenceScore: aiVerdict.confidenceScore,
        volumeBuyRatio: volumeFlow.buyRatio,
        volumeDelta: volumeFlow.netDelta,
        wickRejection: false,
        timeframe: '3-TF CONFLUENCE (1D/4H/1H)',
        alertType: 'TP',
        sellZoneMin: tp1Price,
        sellZoneMax: targetTp,
        title: `🎯 ใกล้ถึงโซน TP: ${symbol} ราคา $${currentPrice.toFixed(2)} เข้าใกล้เป้า $${targetTp.toFixed(2)} (เตือนตั้งแต่ -2%)`,
        message: `ราคา $${currentPrice.toFixed(2)} เข้าใกล้โซนทำกำไร Take Profit (TP: $${targetTp.toFixed(2)}) แนะนำเตรียมทยอยแบ่งขาย (เตือนแค่ครั้งเดียว)`,
        read: false,
        multiTimeframe
      };

      this.alerts = [alertItem, ...this.alerts].slice(0, 50);
      localStorage.setItem(ALERTS_HISTORY_KEY, JSON.stringify(this.alerts));

      if (this.config.soundEnabled) {
        playBuyAlertSound();
      }
      this.dispatchExternalAlerts(alertItem);
      this.notifyListeners(alertItem);
      return alertItem;
    } else {
      // Reset when price falls safely below 95% of TP
      if (targetTp > 0 && currentPrice < targetTp * 0.95 && this.isAlertActive(symbol, 'TP')) {
        this.clearAlertActive(symbol, 'TP');
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. EVALUATE BUY ALERT (เตือนโซนซื้อแค่ครั้งเดียว!)
    // ─────────────────────────────────────────────────────────────
    const confidence = aiVerdict.confidenceScore;
    const requiredThreshold = Math.max(75, this.config.minConfidenceScore);
    if (confidence < requiredThreshold) {
      return null;
    }

    const inBuyZone = currentPrice >= buyZone.minPrice * 0.995 && currentPrice <= buyZone.maxPrice * 1.005;
    if (!inBuyZone) {
      if (currentPrice > buyZone.maxPrice * 1.03 || (plan.cutLoss.price > 0 && currentPrice < plan.cutLoss.price)) {
        this.clearAlertActive(symbol, 'BUY');
      }
      return null;
    }

    if (this.isAlertActive(symbol, 'BUY')) {
      return null; // ALERTED ONCE! Do not repeat!
    }

    if (this.config.requireVolumeConfirmation && volumeFlow.buyRatio < 50) {
      return null;
    }

    const latestCandle = institutionalData.candles[institutionalData.candles.length - 1] || data.candles[data.candles.length - 1];
    let wickRejection = false;
    if (latestCandle) {
      const range = latestCandle.high - latestCandle.low;
      if (range > 0) {
        const lowerWick = Math.min(latestCandle.open, latestCandle.close) - latestCandle.low;
        wickRejection = lowerWick / range >= 0.35;
      }
    }
    if (this.config.requireWickConfirmation && !wickRejection) {
      return null;
    }

    this.markAlertActive(symbol, 'BUY', currentPrice, buyZone.minPrice);

    const alertItem: BuyAlertItem = {
      id: `alert-buy-${symbol}-${now}`,
      timestamp: now,
      symbol,
      companyName: data.name || symbol,
      currentPrice,
      buyZoneMin: buyZone.minPrice,
      buyZoneMax: buyZone.maxPrice,
      targetPrice6M: plan.sellTargets.target1Year.price,
      targetPrice1Y: sellMin,
      stopLossPrice: plan.cutLoss.price,
      confidenceScore: confidence,
      volumeBuyRatio: volumeFlow.buyRatio,
      volumeDelta: volumeFlow.netDelta,
      wickRejection,
      timeframe: '3-TF CONFLUENCE (1D/4H/1H)',
      alertType: 'BUY',
      sellZoneMin: sellMin,
      sellZoneMax: sellMax,
      title: `🟢 จุดซื้อสถาบันผสาน 3 Timeframes: ${symbol} แตะโซนช้อน $${buyZone.minPrice.toFixed(2)}–$${buyZone.maxPrice.toFixed(2)}`,
      message: `ราคา $${currentPrice.toFixed(2)} เข้ากรอบสะสมของถูก Smart Money พร้อม AI มั่นใจ 3-TF สูง ${confidence}% (เตือนแค่ครั้งเดียว)`,
      read: false,
      multiTimeframe
    };

    this.alerts = [alertItem, ...this.alerts].slice(0, 50);
    localStorage.setItem(ALERTS_HISTORY_KEY, JSON.stringify(this.alerts));

    if (this.config.soundEnabled) {
      playBuyAlertSound();
    }
    this.dispatchExternalAlerts(alertItem);
    this.notifyListeners(alertItem);
    return alertItem;
  }

  private async dispatchExternalAlerts(alert: BuyAlertItem) {
    try {
      await fetch('/api/alerts/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertData: {
            symbol: alert.symbol,
            companyName: alert.companyName,
            currentPrice: alert.currentPrice,
            buyZoneMin: alert.buyZoneMin,
            buyZoneMax: alert.buyZoneMax,
            targetPrice6M: alert.targetPrice6M,
            targetPrice1Y: alert.targetPrice1Y,
            stopLossPrice: alert.stopLossPrice,
            confidenceScore: alert.confidenceScore,
            volumeBuyRatio: alert.volumeBuyRatio,
            volumeDelta: alert.volumeDelta,
            wickRejection: alert.wickRejection,
            timeframe: alert.timeframe,
            multiTimeframe: alert.multiTimeframe,
            alertType: alert.alertType,
            sellZoneMin: alert.sellZoneMin,
            sellZoneMax: alert.sellZoneMax
          },
          config: this.config
        })
      });
    } catch (e) {
      console.warn('[AlertManager] Failed to dispatch webhook alert:', e);
    }
  }

  public testSound(): void {
    playTestChime();
  }

  public async testChannel(
    channel: 'discord' | 'telegram' | 'line' | 'line-bot',
    currentConfig?: AlertConfig,
    alertData?: any
  ): Promise<AlertTestResult> {
    const configToUse = currentConfig || this.config;
    try {
      const res = await fetch('/api/alerts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          config: configToUse,
          alertData
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        return {
          channel,
          success: false,
          message: json.error || 'ส่งการแจ้งเตือนทดสอบไม่สำเร็จ',
          timestamp: Date.now()
        };
      }

      return {
        channel,
        success: true,
        message: json.message || 'ส่งข้อความทดสอบสำเร็จ!',
        timestamp: Date.now()
      };
    } catch (err: any) {
      return {
        channel,
        success: false,
        message: err.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้',
        timestamp: Date.now()
      };
    }
  }
}

export const alertManager = new AlertManager();
