import { StockQuote } from '../types/smc';
import { getMarketStatus, MarketStatus } from '../utils/marketHours';

export interface TickUpdate {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  tickDirection: 'up' | 'down';
  timestamp: number;
}

type TickListener = (update: TickUpdate) => void;

interface AssetState {
  baseQuote: StockQuote;
  currentPrice: number;
}

// ตารางช่วงราคา (Tick Size) อย่างเป็นทางการของตลาดหลักทรัพย์แห่งประเทศไทย (SET)
function getSetTickSize(price: number): number {
  if (price < 2.00) return 0.01;      // ต่ำกว่า 2 บาท: ขยับช่องละ 0.01
  if (price < 5.00) return 0.02;      // 2 ถึง < 5 บาท: ขยับช่องละ 0.02
  if (price < 10.00) return 0.05;     // 5 ถึง < 10 บาท: ขยับช่องละ 0.05
  if (price < 25.00) return 0.10;     // 10 ถึง < 25 บาท: ขยับช่องละ 0.10
  if (price < 100.00) return 0.25;    // 25 ถึง < 100 บาท: ขยับช่องละ 0.25
  if (price < 200.00) return 0.50;    // 100 ถึง < 200 บาท: ขยับช่องละ 0.50 ⭐
  if (price < 400.00) return 1.00;    // 200 ถึง < 400 บาท: ขยับช่องละ 1.00
  return 2.00;                        // 400 บาทขึ้นไป: ขยับช่องละ 2.00
}

class RealtimeTickerEngine {
  private activeSymbol: string = '';
  private assets: Map<string, AssetState> = new Map();
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<TickListener> = new Set();
  private isRunning: boolean = false;

  public subscribe(listener: TickListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private cleanKey(symbol: string): string {
    const clean = symbol.replace(/\.BK$/i, '').toUpperCase();
    if (['GC=F', 'XAUUSD', 'GOLDUSD'].includes(clean)) return 'GOLD';
    return clean;
  }

  /**
   * Set or update all quotes for the entire watchlist (e.g. from /api/stocks/m7)
   */
  public setAllBaseQuotes(quotes: StockQuote[]) {
    if (!quotes || quotes.length === 0) return;
    quotes.forEach((q) => {
      if (!q.price || q.price <= 0) return;
      const key = this.cleanKey(q.symbol);
      const existing = this.assets.get(key);
      if (!existing) {
        this.assets.set(key, { baseQuote: q, currentPrice: q.price });
      } else {
        existing.baseQuote = q;
        if (existing.currentPrice <= 0) {
          existing.currentPrice = q.price;
        }
      }
    });

    if (!this.isRunning && this.assets.size > 0) {
      this.start();
    }
  }

  /**
   * Set or update active stock & baseline quote from official Yahoo Finance API
   */
  public setBaseQuote(symbol: string, quote: StockQuote) {
    if (!quote || quote.price <= 0) return;

    this.activeSymbol = symbol;
    const key = this.cleanKey(symbol);
    const existing = this.assets.get(key);

    if (!existing) {
      this.assets.set(key, { baseQuote: quote, currentPrice: quote.price });
      this.notify(symbol, quote, quote.price, 'up');
    } else {
      existing.baseQuote = quote;
      if (existing.currentPrice <= 0) {
        existing.currentPrice = quote.price;
      }
    }

    if (!this.isRunning) {
      this.start();
    }
  }

  public start() {
    if (this.timer) clearInterval(this.timer);
    this.isRunning = true;

    // Organic tick interval ~1100ms
    this.timer = setInterval(() => {
      this.tick();
    }, 1100);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  private tick() {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (this.assets.size === 0) return;

    // 1. Always tick the currently active stock (for chart & real-time price line)
    const activeKey = this.cleanKey(this.activeSymbol);
    const activeState = this.assets.get(activeKey);
    if (activeState && activeState.baseQuote.price > 0) {
      this.tickAsset(this.activeSymbol || activeState.baseQuote.symbol, activeState);
    }

    // 2. Stagger 1 watchlist asset by 450ms for natural organic movement without CPU burst
    const allKeys = Array.from(this.assets.keys());
    if (allKeys.length > 1) {
      const candidates = allKeys.filter((k) => k !== activeKey);
      if (candidates.length > 0) {
        const randomKey = candidates[Math.floor(Math.random() * candidates.length)];
        setTimeout(() => {
          if (typeof document !== 'undefined' && document.hidden) return;
          const state = this.assets.get(randomKey);
          if (state && state.baseQuote.price > 0) {
            this.tickAsset(state.baseQuote.symbol, state);
          }
        }, 450);
      }
    }
  }

  public getMarketStatus(symbol: string): MarketStatus {
    return getMarketStatus(symbol);
  }

  private tickAsset(symbol: string, asset: AssetState) {
    // 🛡️ ตรวจสอบเวลาเปิด-ปิดตลาดจริง: ตลาดปิด = ห้ามขยับราคาเด็ดขาด
    const status = getMarketStatus(symbol);
    if (!status.isOpen) {
      if (asset.currentPrice !== asset.baseQuote.price && asset.baseQuote.price > 0) {
        asset.currentPrice = asset.baseQuote.price;
        this.notify(symbol, asset.baseQuote, asset.baseQuote.price, 'up');
      }
      return;
    }

    const base = asset.baseQuote.price;
    const cleanSym = this.cleanKey(symbol);
    const isThai = symbol.endsWith('.BK') || ['KBANK', 'SCB', 'TISCO', 'BBL', 'PTT', 'CPALL', 'AOT', 'GULF', 'DELTA'].includes(cleanSym);
    const isGold = cleanSym === 'GOLD';

    // Realistic micro-tick step based on asset type
    let step = 0.05;
    if (isGold) {
      const steps = [0.10, 0.15, 0.20, 0.30, 0.40];
      step = steps[Math.floor(Math.random() * steps.length)];
    } else if (isThai) {
      // ใช้ Tick Size ตามเกณฑ์จริงของตลาดหลักทรัพย์แห่งประเทศไทย (SET)
      step = getSetTickSize(asset.currentPrice || base);
    } else if (base >= 400) {
      step = Number(((Math.random() * 0.15) + 0.05).toFixed(2));
    } else if (base >= 100) {
      step = Number(((Math.random() * 0.08) + 0.02).toFixed(2));
    } else {
      step = Number(((Math.random() * 0.04) + 0.01).toFixed(2));
    }

    // Mean-reversion random walk: bound maximum drift to ±0.15% from official base
    const maxDrift = Math.max(step * 2, base * 0.0015);
    const currentDrift = asset.currentPrice - base;
    const ratio = Math.max(-1, Math.min(1, currentDrift / maxDrift));

    const pUp = 0.50 - (0.42 * ratio);
    const goesUp = Math.random() < pUp;

    let nextPrice = goesUp ? asset.currentPrice + step : asset.currentPrice - step;

    // Hard clamp to 0.25% max deviation from official anchor
    const hardLimit = Math.max(step * 3, base * 0.0025);
    if (nextPrice > base + hardLimit) nextPrice = base + hardLimit;
    if (nextPrice < base - hardLimit) nextPrice = base - hardLimit;

    if (isThai) {
      // Snap strictly to valid SET tick size interval
      const tick = getSetTickSize(nextPrice);
      nextPrice = Number((Math.round(nextPrice / tick) * tick).toFixed(2));
      // Ensure it never stays exactly equal due to rounding
      if (nextPrice === asset.currentPrice) {
        nextPrice = goesUp ? Number((asset.currentPrice + tick).toFixed(2)) : Number((asset.currentPrice - tick).toFixed(2));
      }
    } else {
      nextPrice = Number(nextPrice.toFixed(2));
    }

    const direction: 'up' | 'down' = nextPrice >= asset.currentPrice ? 'up' : 'down';
    asset.currentPrice = nextPrice;

    this.notify(symbol, asset.baseQuote, nextPrice, direction);
  }

  private notify(symbol: string, baseQuote: StockQuote, price: number, direction: 'up' | 'down') {
    const prevClose = baseQuote.price - baseQuote.change;
    const validPrevClose = prevClose > 0 ? prevClose : price;
    const change = Number((price - validPrevClose).toFixed(2));
    const changePercent = Number((((price - validPrevClose) / validPrevClose) * 100).toFixed(2));
    const high = Math.max(baseQuote.high || price, price);
    const low = Math.min(baseQuote.low || price, price);

    const update: TickUpdate = {
      symbol,
      price,
      change,
      changePercent,
      high,
      low,
      tickDirection: direction,
      timestamp: Date.now(),
    };

    this.listeners.forEach((fn) => {
      try {
        fn(update);
      } catch (err) {
        console.error('Tick listener error:', err);
      }
    });
  }
}

export const realtimeTicker = new RealtimeTickerEngine();
