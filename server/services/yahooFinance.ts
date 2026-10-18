import { Candle, StockQuote } from "../../src/types/smc.js";

export const MAGNIFICENT_7 = [
  {
    symbol: "AAPL",
    displaySymbol: "AAPL",
    name: "Apple Inc.",
    thaiName: "แอปเปิ้ล",
  },
  {
    symbol: "MSFT",
    displaySymbol: "MSFT",
    name: "Microsoft Corporation",
    thaiName: "ไมโครซอฟท์",
  },
  {
    symbol: "GOOGL",
    displaySymbol: "GOOGL",
    name: "Alphabet Inc.",
    thaiName: "กูเกิล / อัลฟาเบต",
  },
  {
    symbol: "AMZN",
    displaySymbol: "AMZN",
    name: "Amazon.com Inc.",
    thaiName: "แอมะซอน",
  },
  {
    symbol: "NVDA",
    displaySymbol: "NVDA",
    name: "NVIDIA Corporation",
    thaiName: "เอ็นวิเดีย",
  },
  {
    symbol: "META",
    displaySymbol: "META",
    name: "Meta Platforms Inc.",
    thaiName: "เมต้า (เฟซบุ๊ก)",
  },
  {
    symbol: "TSLA",
    displaySymbol: "TSLA",
    name: "Tesla Inc.",
    thaiName: "เทสลา",
  },
  {
    symbol: "V",
    displaySymbol: "V",
    name: "Visa Inc.",
    thaiName: "วีซ่า",
  },
  {
    symbol: "MA",
    displaySymbol: "MA",
    name: "Mastercard Incorporated",
    thaiName: "มาสเตอร์การ์ด",
  },
  {
    symbol: "GC=F",
    displaySymbol: "GOLD",
    name: "Gold / USD",
    thaiName: "ทองคำ (Gold)",
  },
  {
    symbol: "LLY",
    displaySymbol: "LLY",
    name: "Eli Lilly And Co",
    thaiName: "ลิลี่",
  },
  {
    symbol: "KBANK.BK",
    displaySymbol: "KBANK",
    name: "KASIKORNBANK Public Company Limited",
    thaiName: "กสิกร",
  },
  {
    symbol: "SCB.BK",
    displaySymbol: "SCB",
    name: "The Siam Commercial Bank Public Company Limited",
    thaiName: "ไทยพาณิชย์",
  },
  {
    symbol: "TISCO.BK",
    displaySymbol: "TISCO",
    name: "Thai Investment and Securities Company Limited",
    thaiName: "ทิสโก้",
  },
  {
    symbol: "BBL.BK",
    displaySymbol: "BBL",
    name: "Bangkok Bank Public Company Limited",
    thaiName: "ธนาคารกรุงเทพ",
  },
];

/**
 * Reverse lookup: displaySymbol -> full Yahoo Finance symbol.
 * e.g. "SCB" -> "SCB.BK", "KBANK" -> "KBANK.BK", "AAPL" -> "AAPL", "GOLD" -> "GC=F".
 * Built from MAGNIFICENT_7 plus commodity & index aliases.
 */
const DISPLAY_TO_FULL_SYMBOL: Record<string, string> = {
  ...MAGNIFICENT_7.reduce(
    (map, item) => {
      map[item.displaySymbol.toUpperCase()] = item.symbol;
      return map;
    },
    {} as Record<string, string>,
  ),
  GOLD: "GC=F",
  GOLDUSD: "GC=F",
  XAUUSD: "GC=F",
  XAU: "GC=F",
  "GC=F": "GC=F",
};

/**
 * Converts whatever symbol comes in from the frontend/URL (a display
 * symbol like "SCB", or already a full symbol like "SCB.BK") into the
 * full Yahoo Finance symbol that getCandles() needs to actually work.
 *
 * ANY route/handler that receives a symbol from the outside world
 * (req.params, req.query, etc.) should call this BEFORE passing the
 * symbol into YahooFinanceService.getCandles(). This is what prevents
 * the "Internal Server Error" for Thai tickers: without it, a raw "SCB"
 * gets sent straight to Yahoo, which can't find it.
 */
export function resolveFullSymbol(inputSymbol: string): string {
  const upper = inputSymbol.toUpperCase();
  return DISPLAY_TO_FULL_SYMBOL[upper] || upper;
}

export class YahooFinanceService {
  private static cache: Map<string, { data: Candle[]; timestamp: number }> =
    new Map();
  private static CACHE_TTL = 30 * 1000; // 30 seconds cache for chart data

  private static quoteCache: Map<
    string,
    { data: StockQuote; timestamp: number }
  > = new Map();
  private static QUOTE_CACHE_TTL = 3 * 1000; // 3 seconds cache for real-time quotes

  /**
   * Fetches OHLCV candlestick data for a given ticker and timeframe.
   * IMPORTANT: symbol passed in here must be the FULL Yahoo Finance symbol
   * (e.g. "KBANK.BK"), not the display symbol — otherwise the API call fails.
   */
  public static async getCandles(
    symbol: string,
    timeframe: string = "1d",
  ): Promise<Candle[]> {
    const cacheKey = `${symbol.toUpperCase()}_${timeframe}`;
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    let range = "1y";
    let interval = "1d";

    switch (timeframe) {
      case "1m":
        range = "5d";
        interval = "1m";
        break;
      case "15m":
        range = "5d";
        interval = "15m";
        break;
      case "1h":
        range = "1mo";
        interval = "60m";
        break;
      case "4h":
        range = "3mo";
        interval = "60m";
        break;
      case "1d":
        range = "1y";
        interval = "1d";
        break;
      case "1wk":
        range = "2y";
        interval = "1wk";
        break;
      default:
        range = "1y";
        interval = "1d";
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol.toUpperCase(),
    )}?range=${range}&interval=${interval}&includePrePost=false`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Yahoo Finance HTTP error: ${response.status} ${response.statusText}`,
        );
      }

      const json = await response.json();

      if (json.chart?.error) {
        // Yahoo returns a structured error (e.g. "No data found, symbol may be delisted")
        // instead of an HTTP error status for unknown/invalid symbols. Surface it clearly
        // instead of letting downstream code hit a confusing 500.
        throw new Error(
          `Yahoo Finance could not find symbol "${symbol}": ${json.chart.error.description || json.chart.error.code}`,
        );
      }

      const result = json.chart?.result?.[0];

      if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
        throw new Error(`No chart data returned for ticker ${symbol}`);
      }

      const timestamps: number[] = result.timestamp;
      const quote = result.indicators.quote[0];
      const opens: number[] = quote.open;
      const highs: number[] = quote.high;
      const lows: number[] = quote.low;
      const closes: number[] = quote.close;
      const volumes: number[] = quote.volume;

      const candles: Candle[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const o = opens[i];
        const h = highs[i];
        const l = lows[i];
        const c = closes[i];
        const v = volumes[i] || 0;

        // Filter out null or NaN bars
        if (
          o != null &&
          h != null &&
          l != null &&
          c != null &&
          !isNaN(o) &&
          !isNaN(h) &&
          !isNaN(l) &&
          !isNaN(c)
        ) {
          candles.push({
            time: timestamps[i],
            open: Number(o.toFixed(2)),
            high: Number(h.toFixed(2)),
            low: Number(l.toFixed(2)),
            close: Number(c.toFixed(2)),
            volume: Math.round(v),
          });
        }
      }

      // Synchronize last candle's close with real-time regularMarketPrice if available
      if (result.meta?.regularMarketPrice && candles.length > 0) {
        const lastCandle = candles[candles.length - 1];
        const livePrice = Number(result.meta.regularMarketPrice.toFixed(2));
        lastCandle.close = livePrice;
        lastCandle.high = Math.max(lastCandle.high, livePrice);
        lastCandle.low = Math.min(lastCandle.low, livePrice);
      }

      // Aggregate into 4h if timeframe is 4h
      let processedCandles = candles;
      if (timeframe === "4h") {
        processedCandles = this.aggregate4h(candles);
      }

      this.cache.set(cacheKey, { data: processedCandles, timestamp: now });
      return processedCandles;
    } catch (err) {
      console.error(`Error fetching Yahoo Finance data for ${symbol}:`, err);
      // If cached data exists even if expired, return it as graceful fallback
      if (cached) {
        return cached.data;
      }
      throw err;
    }
  }

  /**
   * Aggregates 1h candles into 4h blocks.
   */
  private static aggregate4h(candles: Candle[]): Candle[] {
    if (candles.length === 0) return [];
    const aggregated: Candle[] = [];
    const FOUR_HOURS = 4 * 3600;

    let currentBlockTime =
      Math.floor(candles[0].time / FOUR_HOURS) * FOUR_HOURS;
    let blockOpen = candles[0].open;
    let blockHigh = candles[0].high;
    let blockLow = candles[0].low;
    let blockClose = candles[0].close;
    let blockVolume = candles[0].volume;

    for (let i = 1; i < candles.length; i++) {
      const c = candles[i];
      const candleBlockTime = Math.floor(c.time / FOUR_HOURS) * FOUR_HOURS;

      if (candleBlockTime === currentBlockTime) {
        blockHigh = Math.max(blockHigh, c.high);
        blockLow = Math.min(blockLow, c.low);
        blockClose = c.close;
        blockVolume += c.volume;
      } else {
        aggregated.push({
          time: currentBlockTime,
          open: Number(blockOpen.toFixed(2)),
          high: Number(blockHigh.toFixed(2)),
          low: Number(blockLow.toFixed(2)),
          close: Number(blockClose.toFixed(2)),
          volume: blockVolume,
        });

        currentBlockTime = candleBlockTime;
        blockOpen = c.open;
        blockHigh = c.high;
        blockLow = c.low;
        blockClose = c.close;
        blockVolume = c.volume;
      }
    }

    aggregated.push({
      time: currentBlockTime,
      open: Number(blockOpen.toFixed(2)),
      high: Number(blockHigh.toFixed(2)),
      low: Number(blockLow.toFixed(2)),
      close: Number(blockClose.toFixed(2)),
      volume: blockVolume,
    });

    return aggregated;
  }

  /**
   * Fetches latest quote and stats for all watchlist stocks.
   * NOTE: `item.symbol` (full Yahoo symbol, e.g. "KBANK.BK") is used to call
   * the API, but `item.displaySymbol` (e.g. "KBANK") is what gets returned
   * to the frontend — this is the fix that makes the ".BK" suffix disappear
   * from the UI while still letting the API call succeed.
   */
  public static async getMagnificent7Quotes(): Promise<StockQuote[]> {
    const quotes: StockQuote[] = [];

    await Promise.all(
      MAGNIFICENT_7.map(async (item) => {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${item.symbol}?range=2d&interval=1d`;
          const res = await fetch(url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "application/json",
            },
          });

          if (res.ok) {
            const data = await res.json();
            const meta = data.chart?.result?.[0]?.meta;
            const indicators = data.chart?.result?.[0]?.indicators?.quote?.[0];

            if (meta) {
              const currentPrice = meta.regularMarketPrice || 0;
              const prevClose =
                meta.chartPreviousClose || meta.previousClose || currentPrice;
              const change = Number((currentPrice - prevClose).toFixed(2));
              const changePercent = Number(
                (((currentPrice - prevClose) / prevClose) * 100).toFixed(2),
              );
              const high =
                meta.regularMarketDayHigh ||
                (indicators?.high
                  ? Math.max(...indicators.high.filter(Boolean))
                  : currentPrice);
              const low =
                meta.regularMarketDayLow ||
                (indicators?.low
                  ? Math.min(...indicators.low.filter(Boolean))
                  : currentPrice);
              const volume = meta.regularMarketVolume || 0;

              const smcBias = changePercent >= 0 ? "BULLISH" : "BEARISH";
              const trendBadge =
                changePercent >= 1.5
                  ? "Strong Bull"
                  : changePercent > 0
                    ? "Bullish"
                    : changePercent <= -1.5
                      ? "Strong Bear"
                      : "Bearish";

              quotes.push({
                symbol: item.displaySymbol, // <-- was item.symbol; this is the fix
                name: item.name,
                thaiName: item.thaiName,
                price: Number(currentPrice.toFixed(2)),
                change,
                changePercent,
                high: Number(high.toFixed(2)),
                low: Number(low.toFixed(2)),
                volume,
                marketCap: 0,
                smcBias,
                trendBadge,
              });
            }
          }
        } catch (e) {
          console.error(`Failed to fetch quote for ${item.symbol}:`, e);
        }
      }),
    );

    // Keep consistent order as MAGNIFICENT. Match on displaySymbol since
    // that's what ends up on each pushed quote above.
    return MAGNIFICENT_7.map(
      (m) =>
        quotes.find((q) => q.symbol === m.displaySymbol) || {
          symbol: m.displaySymbol, // <-- was m.symbol; this is the fix
          name: m.name,
          thaiName: m.thaiName,
          price: 0,
          change: 0,
          changePercent: 0,
          high: 0,
          low: 0,
          volume: 0,
          marketCap: 0,
          smcBias: "NEUTRAL",
          trendBadge: "Normal",
        },
    );
  }

  /**
   * Fetches the ultra-fast real-time single quote for a stock.
   * Has a short 3s cache to prevent hitting Yahoo rate limits while providing live updates.
   */
  public static async getSingleQuote(
    inputSymbol: string,
  ): Promise<StockQuote | null> {
    const fullSymbol = resolveFullSymbol(inputSymbol);
    const upperDisplay = inputSymbol.toUpperCase().replace(/\.BK$/, "");
    const stockInfo = MAGNIFICENT_7.find(
      (s) =>
        s.symbol.toUpperCase() === fullSymbol.toUpperCase() ||
        s.displaySymbol.toUpperCase() === upperDisplay,
    ) || {
      symbol: fullSymbol,
      displaySymbol: upperDisplay,
      name: upperDisplay,
      thaiName: upperDisplay,
    };

    const cacheKey = fullSymbol.toUpperCase();
    const cached = this.quoteCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.timestamp < this.QUOTE_CACHE_TTL) {
      return cached.data;
    }

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        fullSymbol,
      )}?range=2d&interval=1d`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`Yahoo Finance HTTP error: ${res.status}`);
      }

      const data = await res.json();
      const meta = data.chart?.result?.[0]?.meta;
      const indicators = data.chart?.result?.[0]?.indicators?.quote?.[0];

      if (meta) {
        const currentPrice = meta.regularMarketPrice || 0;
        const prevClose =
          meta.chartPreviousClose || meta.previousClose || currentPrice;
        const change = Number((currentPrice - prevClose).toFixed(2));
        const changePercent = prevClose
          ? Number((((currentPrice - prevClose) / prevClose) * 100).toFixed(2))
          : 0;
        const high =
          meta.regularMarketDayHigh ||
          (indicators?.high
            ? Math.max(...indicators.high.filter(Boolean))
            : currentPrice);
        const low =
          meta.regularMarketDayLow ||
          (indicators?.low
            ? Math.min(...indicators.low.filter(Boolean))
            : currentPrice);
        const volume = meta.regularMarketVolume || 0;

        const smcBias = changePercent >= 0 ? "BULLISH" : "BEARISH";
        const trendBadge =
          changePercent >= 1.5
            ? "Strong Bull"
            : changePercent > 0
              ? "Bullish"
              : changePercent <= -1.5
                ? "Strong Bear"
                : "Bearish";

        const quote: StockQuote = {
          symbol: stockInfo.displaySymbol,
          name: stockInfo.name,
          thaiName: stockInfo.thaiName,
          price: Number(currentPrice.toFixed(2)),
          change,
          changePercent,
          high: Number(high.toFixed(2)),
          low: Number(low.toFixed(2)),
          volume,
          marketCap: 0,
          smcBias,
          trendBadge,
        };

        this.quoteCache.set(cacheKey, { data: quote, timestamp: now });
        return quote;
      }
    } catch (e) {
      console.error(`Failed to fetch real-time quote for ${fullSymbol}:`, e);
      if (cached) return cached.data;
    }
    return null;
  }
}
