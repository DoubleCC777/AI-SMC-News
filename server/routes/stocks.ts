import { Router, Request, Response } from 'express';
import { YahooFinanceService, MAGNIFICENT_7, resolveFullSymbol } from '../services/yahooFinance.js';
import { SmcEngine } from '../services/smcEngine.js';
import { StockNewsService } from '../services/stockNews.js';

const router = Router();

// GET /api/stocks/m7 - Overview quotes for all 7 Magnificent stocks
router.get('/m7', async (req: Request, res: Response) => {
  try {
    const quotes = await YahooFinanceService.getMagnificent7Quotes();
    res.json({
      success: true,
      timestamp: Date.now(),
      data: quotes
    });
  } catch (error: any) {
    console.error('Error fetching M7 quotes:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch M7 quotes'
    });
  }
});

// GET /api/stocks/:symbol/news - International headlines translated into Thai
router.get('/:symbol/news', async (req: Request, res: Response) => {
  try {
    const symbol = String(req.params.symbol).toUpperCase();
    const news = await StockNewsService.getNews(symbol);
    res.json({ success: true, timestamp: Date.now(), data: news });
  } catch (error: any) {
    console.error(`Error fetching news for ${req.params.symbol}:`, error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch stock news' });
  }
});

// GET /api/stocks/:symbol/multi-tf - Parallel SMC analysis for 1h, 4h, and 1d
router.get('/:symbol/multi-tf', async (req: Request, res: Response) => {
  try {
    const symbol = String(req.params.symbol).toUpperCase();
    const fullSymbol = resolveFullSymbol(symbol);
    const stockInfo = MAGNIFICENT_7.find(
      s => s.symbol.toUpperCase() === fullSymbol.toUpperCase() || s.displaySymbol.toUpperCase() === symbol
    ) || {
      symbol,
      displaySymbol: symbol,
      name: symbol,
      thaiName: symbol
    };

    const [candles1h, candles4h, candles1d] = await Promise.all([
      YahooFinanceService.getCandles(fullSymbol, '1h').catch(() => []),
      YahooFinanceService.getCandles(fullSymbol, '4h').catch(() => []),
      YahooFinanceService.getCandles(fullSymbol, '1d').catch(() => [])
    ]);

    const smc1h = candles1h.length > 0 ? SmcEngine.analyze(symbol, stockInfo.name, '1h', candles1h) : null;
    const smc4h = candles4h.length > 0 ? SmcEngine.analyze(symbol, stockInfo.name, '4h', candles4h) : null;
    const smc1d = candles1d.length > 0 ? SmcEngine.analyze(symbol, stockInfo.name, '1d', candles1d) : null;

    res.json({
      success: true,
      data: {
        '1h': smc1h,
        '4h': smc4h,
        '1d': smc1d
      }
    });
  } catch (error: any) {
    console.error(`Error in multi-tf analysis for ${req.params.symbol}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze multi-timeframe'
    });
  }
});

// GET /api/stocks/:symbol/quote - Ultra-fast real-time single quote
router.get('/:symbol/quote', async (req: Request, res: Response) => {
  try {
    const symbol = String(req.params.symbol).toUpperCase();
    const quote = await YahooFinanceService.getSingleQuote(symbol);
    if (!quote) {
      return res.status(404).json({
        success: false,
        error: `Quote not found for ${symbol}`
      });
    }
    res.json({
      success: true,
      timestamp: Date.now(),
      data: quote
    });
  } catch (error: any) {
    console.error(`Error fetching real-time quote for ${req.params.symbol}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch quote'
    });
  }
});

// GET /api/stocks/:symbol - Detailed SMC analysis for a specific stock
router.get('/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = String(req.params.symbol).toUpperCase();
    const timeframe = (req.query.timeframe as string) || '1d';
    const fullSymbol = resolveFullSymbol(symbol);

    const stockInfo = MAGNIFICENT_7.find(
      s => s.symbol.toUpperCase() === fullSymbol.toUpperCase() || s.displaySymbol.toUpperCase() === symbol
    ) || {
      symbol,
      displaySymbol: symbol,
      name: symbol,
      thaiName: symbol
    };

    const candles = await YahooFinanceService.getCandles(fullSymbol, timeframe);
    const displaySym = stockInfo.displaySymbol || symbol.replace(/\.BK$/, '');
    const smcResult = SmcEngine.analyze(displaySym, stockInfo.name, timeframe, candles);

    res.json({
      success: true,
      data: smcResult
    });
  } catch (error: any) {
    console.error(`Error analyzing stock ${req.params.symbol}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze stock'
    });
  }
});

export default router;
