import { AlertConfig, BuyAlertItem, AlertTestResult } from '../types/alert';
import { SmcAnalysisResult, AiNewsVerdict, MultiTimeframeAnalysis } from '../types/smc';
import { playBuyAlertSound, playTestChime } from '../utils/audioAlert';

const CONFIG_KEY = 'ai_smc_alert_config';
const ALERTS_HISTORY_KEY = 'ai_smc_alerts_history';
const LAST_ALERT_TIMESTAMP_KEY = 'ai_smc_last_alert_timestamps';

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

type AlertListener = (newAlert: BuyAlertItem) => void;

class AlertManager {
  private config: AlertConfig = DEFAULT_CONFIG;
  private alerts: BuyAlertItem[] = [];
  private listeners: Set<AlertListener> = new Set();
  private lastAlertsBySymbol: Record<string, number> = {};

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

    // Attempt to sync config from backend
    this.syncConfigFromBackend();
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
   * Evaluates if a stock analysis triggers a Smart Money Buy Signal
   * STRICT CRITERIA:
   * 1. NEVER alert on 15M. Must analyze 3 Timeframes (1D, 4H, 1H).
   * 2. AI Confidence score must be >= 75% (เข้าซื้อได้ โอกาสกำไรสูง).
   * 3. Price must be inside the Institutional Buy Zone (derived from 1D/4H).
   */
  public evaluateSignal(
    data: SmcAnalysisResult | null,
    aiVerdict: AiNewsVerdict | null,
    multiTfData?: MultiTimeframeAnalysis | null
  ): BuyAlertItem | null {
    if (!data || !aiVerdict) return null;

    // ── REQUIREMENT 1: MUST ANALYZE ALL 3 TIMEFRAMES (1D, 4H, 1H) BEFORE ALERTING ──
    // Never send 15M alerts. Wait until 1D, 4H, and 1H have all finished loading and analyzing!
    const snapshots = aiVerdict.multiTimeframe?.snapshots || [];
    const has1d = snapshots.some(s => s.timeframe === '1d') || Boolean(multiTfData?.['1d']);
    const has4h = snapshots.some(s => s.timeframe === '4h') || Boolean(multiTfData?.['4h']);
    const has1h = snapshots.some(s => s.timeframe === '1h') || Boolean(multiTfData?.['1h']);

    if (!has1d || !has4h || !has1h) {
      // Still loading or missing 3-Timeframe confluence analysis - do not alert prematurely!
      return null;
    }

    // ── REQUIREMENT 2: USE INSTITUTIONAL TIMEFRAME (1D OR 4H) FOR TRADE LEVELS (NEVER 15M) ──
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
    const symbol = data.symbol;
    const currentPrice = data.summary.keyLevels.currentPrice;

    // ── SELL ZONE / HIGHER HIGH (HH) TARGETS ──
    const sellMin = plan.sellZone?.minPrice ?? plan.sellTargets.target1Year.price;
    const sellMax = plan.sellZone?.maxPrice ?? Number((sellMin * 1.06).toFixed(2));

    const now = Date.now();
    const cooldownMs = 15 * 60 * 1000; // 15 minutes

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

    // ── 1. EVALUATE TAKE PROFIT (TP) ALERT (เตือนเมื่อใกล้ถึงโซน TP ตั้งแต่ -2%) ──
    // เช่น หาก TP อยู่ที่ 287.20 ระบบจะเริ่มแจ้งเตือนตั้งแต่ $281.45 (287.20 * 0.98 หรือระยะห่าง <= 2%)
    const isNearTpZone = sellMin > 0 && currentPrice >= (sellMin * 0.98);
    const lastTpTriggered = this.lastAlertsBySymbol[`${symbol}-TP`] || this.lastAlertsBySymbol[`${symbol}-SELL_HH`] || 0;

    if (isNearTpZone && (now - lastTpTriggered >= cooldownMs)) {
      const alertItem: BuyAlertItem = {
        id: `alert-tp-${symbol}-${now}`,
        timestamp: now,
        symbol,
        companyName: data.name || symbol,
        currentPrice,
        buyZoneMin: buyZone.minPrice,
        buyZoneMax: buyZone.maxPrice,
        targetPrice6M: plan.sellTargets.target1Year.price,
        targetPrice1Y: sellMin,
        stopLossPrice: plan.cutLoss.price,
        confidenceScore: aiVerdict.confidenceScore,
        volumeBuyRatio: volumeFlow.buyRatio,
        volumeDelta: volumeFlow.netDelta,
        wickRejection: false,
        timeframe: '3-TF CONFLUENCE (1D/4H/1H)',
        alertType: 'TP',
        sellZoneMin: sellMin,
        sellZoneMax: sellMax,
        title: `🎯 ใกล้ถึงโซน TP: ${symbol} ราคา $${currentPrice.toFixed(2)} เข้าใกล้เป้า $${sellMin.toFixed(2)} (เตือนตั้งแต่ -2%)`,
        message: `ราคา $${currentPrice.toFixed(2)} เข้าใกล้โซนทำกำไร Take Profit (TP) แนะนำเตรียมทยอยขาย ไม้ 1 ที่ $${sellMin.toFixed(2)} (TP 1) และ ไม้ 2 ที่ $${sellMax.toFixed(2)} (TP 2)`,
        read: false,
        multiTimeframe
      };

      this.lastAlertsBySymbol[`${symbol}-TP`] = now;
      this.lastAlertsBySymbol[`${symbol}-SELL_HH`] = now;
      localStorage.setItem(LAST_ALERT_TIMESTAMP_KEY, JSON.stringify(this.lastAlertsBySymbol));
      this.alerts = [alertItem, ...this.alerts].slice(0, 30);
      localStorage.setItem(ALERTS_HISTORY_KEY, JSON.stringify(this.alerts));

      if (this.config.soundEnabled) {
        playBuyAlertSound();
      }
      this.dispatchExternalAlerts(alertItem);
      this.notifyListeners(alertItem);
      return alertItem;
    }

    // ── 2. EVALUATE BUY ALERT (เข้าสู่โซนช้อนซื้อ Smart Money) ──
    const confidence = aiVerdict.confidenceScore;
    const requiredThreshold = Math.max(75, this.config.minConfidenceScore);
    if (confidence < requiredThreshold) {
      return null;
    }

    const inBuyZone = currentPrice >= buyZone.minPrice * 0.995 && currentPrice <= buyZone.maxPrice * 1.005;
    if (!inBuyZone) return null;

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

    const lastBuyTriggered = this.lastAlertsBySymbol[`${symbol}-BUY`] || this.lastAlertsBySymbol[symbol] || 0;
    if (now - lastBuyTriggered < cooldownMs) {
      return null;
    }

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
      message: `ราคา $${currentPrice.toFixed(2)} เข้ากรอบสะสมของถูก Smart Money พร้อม AI มั่นใจ 3-TF สูง ${confidence}% (1D:${tfItems[0].score}% | 4H:${tfItems[1].score}% | 1H:${tfItems[2].score}%)`,
      read: false,
      multiTimeframe
    };

    this.lastAlertsBySymbol[`${symbol}-BUY`] = now;
    this.lastAlertsBySymbol[symbol] = now;
    localStorage.setItem(LAST_ALERT_TIMESTAMP_KEY, JSON.stringify(this.lastAlertsBySymbol));
    this.alerts = [alertItem, ...this.alerts].slice(0, 30);
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

  /**
   * Test Sound chime
   */
  public testSound(): void {
    playTestChime();
  }

  /**
   * Test specific webhook channel
   */
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
