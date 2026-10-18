import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { IndicatorSettings } from './components/IndicatorControls';
import { SmcChart } from './components/SmcChart';
import { SmcAnalysisPanel } from './components/SmcAnalysisPanel';
import { fetchM7Quotes, fetchStockAnalysis, fetchStockNews, fetchMultiTimeframeAnalysis, fetchStockQuote } from './services/api';
import { StockNewsItem, StockQuote, SmcAnalysisResult, MultiTimeframeAnalysis } from './types/smc';
import { analyzeNewsAndSmcConfluence } from './utils/aiNewsAdvisor';
import { alertManager } from './services/alertManager';
import { realtimeTicker } from './services/realtimeTicker';
import { AlertToast } from './components/AlertToast';
import { AlertCircle, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('AAPL');
  const [liveQuote, setLiveQuote] = useState<StockQuote | null>(null);
  const [timeframe, setTimeframe] = useState<string>('1d');
  const [analysisData, setAnalysisData] = useState<SmcAnalysisResult | null>(null);
  const [multiTfData, setMultiTfData] = useState<MultiTimeframeAnalysis | null>(null);
  const [news, setNews] = useState<StockNewsItem[]>([]);

  const [isLoadingQuotes, setIsLoadingQuotes] = useState<boolean>(false);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [indicatorSettings, setIndicatorSettings] = useState<IndicatorSettings>({
    showStructure: true,
    showOrderBlocks: true,
    showFvgs: true,
    showPremiumDiscount: true,
    showMitigated: false,
    showRealtimePriceLine: true,
  });

  // Fetch M7 overview quotes
  const loadQuotes = useCallback(async () => {
    try {
      setIsLoadingQuotes(true);
      const data = await fetchM7Quotes();
      setQuotes(data);
      setLastUpdated(new Date());

      // Register all watchlist stocks in the real-time ticker engine
      realtimeTicker.setAllBaseQuotes(data);

      // If active stock exists in returned data, initialize baseline for live ticker
      const cleanSelected = selectedSymbol.replace(/\.BK$/i, '').toUpperCase();
      const currentQuote = data.find((q) => {
        const qClean = q.symbol.replace(/\.BK$/i, '').toUpperCase();
        return (
          qClean === cleanSelected ||
          (['GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(qClean) &&
            ['GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(cleanSelected))
        );
      });
      if (currentQuote && currentQuote.price > 0) {
        realtimeTicker.setBaseQuote(selectedSymbol, currentQuote);
      }
    } catch (err: any) {
      console.error('Failed to load quotes:', err);
    } finally {
      setIsLoadingQuotes(false);
    }
  }, [selectedSymbol]);

  const loadNews = useCallback(async (symbol: string) => {
    try {
      setNews(await fetchStockNews(symbol));
    } catch (err: any) {
      console.error('Failed to load news:', err);
    }
  }, []);

  const loadMultiTf = useCallback(async (symbol: string) => {
    try {
      const data = await fetchMultiTimeframeAnalysis(symbol);
      setMultiTfData(data);
    } catch (err: any) {
      console.error('Failed to load multi-timeframe analysis:', err);
    }
  }, []);

  // Fetch detailed stock chart + SMC analysis
  const loadAnalysis = useCallback(async (symbol: string, tf: string) => {
    try {
      setIsLoadingAnalysis(true);
      setError(null);
      const res = await fetchStockAnalysis(symbol, tf);
      setAnalysisData(res);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Failed to load analysis:', err);
      setError(err.message || 'ไม่สามารถโหลดข้อมูลการวิเคราะห์ได้');
    } finally {
      setIsLoadingAnalysis(false);
    }
  }, []);

  // Ultra-fast Real-time Single Quote Polling for selected stock from official Yahoo API
  const pollRealtimeQuote = useCallback(async (symbol: string) => {
    try {
      const quote = await fetchStockQuote(symbol);
      if (quote && quote.price > 0) {
        const cleanReq = symbol.replace(/\.BK$/i, '').toUpperCase();
        const cleanQuote = quote.symbol.replace(/\.BK$/i, '').toUpperCase();
        const isMatch =
          cleanReq === cleanQuote ||
          (['GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(cleanReq) &&
            ['GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(cleanQuote));

        // Update ticker anchor baseline immediately
        realtimeTicker.setBaseQuote(symbol, quote);

        // Update liveQuote if it matches the current request
        if (isMatch) {
          setLiveQuote(quote);
        }

        // Update quotes array so M7Bar and tabs reflect official quote
        setQuotes((prevQuotes) => {
          if (!prevQuotes || prevQuotes.length === 0) return prevQuotes;
          return prevQuotes.map((q) => {
            const qClean = q.symbol.replace(/\.BK$/i, '').toUpperCase();
            const isTabMatch =
              qClean === cleanQuote ||
              (['GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(qClean) &&
                ['GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(cleanQuote));
            return isTabMatch ? { ...q, ...quote } : q;
          });
        });
      }
    } catch {
      // Silent catch on network jitter
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadQuotes();
    loadAnalysis(selectedSymbol, timeframe);
    loadNews(selectedSymbol);
    loadMultiTf(selectedSymbol);
  }, []);

  // High-Frequency Real-time Micro-Tick Stream Subscription (Multi-Asset Heartbeat)
  useEffect(() => {
    const unsubscribe = realtimeTicker.subscribe((tick) => {
      const cleanSelected = selectedSymbol.replace(/\.BK$/i, '').toUpperCase();
      const cleanTickSym = tick.symbol.replace(/\.BK$/i, '').toUpperCase();
      const isSelectedMatch =
        cleanSelected === cleanTickSym ||
        (['GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(cleanSelected) &&
          ['GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(cleanTickSym));

      // 1. If this tick is for the currently selected stock, update liveQuote (which drives SmcChart)
      if (isSelectedMatch) {
        setLiveQuote((prev) => ({
          symbol: tick.symbol,
          name: prev?.name || tick.symbol,
          thaiName: prev?.thaiName || tick.symbol,
          price: tick.price,
          change: tick.change,
          changePercent: tick.changePercent,
          high: tick.high,
          low: tick.low,
          volume: prev?.volume || 0,
          marketCap: prev?.marketCap || 0,
          smcBias: tick.changePercent >= 0 ? 'BULLISH' : 'BEARISH',
          trendBadge: prev?.trendBadge || '',
        }));
      }

      // 2. ALWAYS update quotes array for the ticking stock so ALL stocks in M7Bar move in real-time!
      setQuotes((prevQuotes) => {
        if (!prevQuotes || prevQuotes.length === 0) return prevQuotes;
        return prevQuotes.map((q) => {
          const qClean = q.symbol.replace(/\.BK$/i, '').toUpperCase();
          const isTabMatch =
            qClean === cleanTickSym ||
            (['GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(qClean) &&
              ['GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(cleanTickSym));
          return isTabMatch
            ? {
                ...q,
                price: tick.price,
                change: tick.change,
                changePercent: tick.changePercent,
                high: Math.max(q.high || 0, tick.high),
                low: Math.min(q.low || 999999, tick.low),
              }
            : q;
        });
      });
    });

    return () => {
      unsubscribe();
    };
  }, [selectedSymbol]);

  // Real-time quote polling: every 3.5 seconds for the active stock
  useEffect(() => {
    pollRealtimeQuote(selectedSymbol);

    const quoteInterval = setInterval(() => {
      if (!document.hidden) {
        pollRealtimeQuote(selectedSymbol);
      }
    }, 3500);

    // Refresh full watchlist overview every 30 seconds
    const overviewInterval = setInterval(() => {
      if (!document.hidden) {
        loadQuotes();
      }
    }, 30000);

    // Immediate update when user switches back to the tab
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        pollRealtimeQuote(selectedSymbol);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(quoteInterval);
      clearInterval(overviewInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedSymbol, pollRealtimeQuote, loadQuotes]);

  // Handle stock switch - instantly updates price from existing quotes list
  const handleSelectStock = (symbol: string) => {
    const cleanSym = symbol.replace(/\.BK$/i, '').toUpperCase();
    setSelectedSymbol(symbol);

    // 1. Immediately switch liveQuote and ticker baseline from the existing quotes list (0ms delay!)
    const existingQuote = quotes.find((q) => {
      const qClean = q.symbol.replace(/\.BK$/i, '').toUpperCase();
      return (
        qClean === cleanSym ||
        (['GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(qClean) &&
          ['GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(cleanSym))
      );
    });

    if (existingQuote && existingQuote.price > 0) {
      setLiveQuote(existingQuote);
      realtimeTicker.setBaseQuote(symbol, existingQuote);
    } else {
      setLiveQuote(null);
    }

    // 2. Fetch fresh SMC analysis, news, multi-tf, and live tick for the clicked stock
    loadAnalysis(symbol, timeframe);
    loadNews(symbol);
    loadMultiTf(symbol);
    pollRealtimeQuote(symbol);
  };

  // Handle timeframe switch
  const handleSelectTimeframe = (tf: string) => {
    setTimeframe(tf);
    loadAnalysis(selectedSymbol, tf);
  };

  // Manual refresh
  const handleRefresh = () => {
    loadQuotes();
    loadAnalysis(selectedSymbol, timeframe);
    loadNews(selectedSymbol);
    loadMultiTf(selectedSymbol);
    pollRealtimeQuote(selectedSymbol);
  };

  // Confluence AI verdict calculated for current stock & news
  const aiVerdict = useMemo(() => {
    return analyzeNewsAndSmcConfluence(analysisData, news, multiTfData);
  }, [analysisData, news, multiTfData]);

  // 1. Automated Active Stock Alert Monitor (Single alert guarantee)
  useEffect(() => {
    if (analysisData && aiVerdict) {
      alertManager.evaluateSignal(analysisData, aiVerdict, multiTfData);
    }
  }, [analysisData, aiVerdict, multiTfData]);

  // 2. Automated Watchlist Alert Monitor: checks ALL watchlist stocks in the background
  // No need for the user to click into that stock to trigger alerts!
  useEffect(() => {
    if (quotes.length > 0) {
      alertManager.evaluateWatchlistQuotes(quotes);
    }
  }, [quotes]);

  // 3. Periodic Background Server Alert Sync (every 15s)
  useEffect(() => {
    alertManager.syncWatchlistSetups();
    alertManager.syncServerAlerts();

    const interval = setInterval(() => {
      if (!document.hidden) {
        alertManager.syncServerAlerts();
      }
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-shell min-h-screen md:h-screen md:overflow-hidden text-slate-100 flex flex-col font-sans bg-[#090c15]">
      {/* ── Minimal Global Navbar ── */}
      <Navbar
        onRefresh={handleRefresh}
        isLoading={isLoadingQuotes || isLoadingAnalysis}
        lastUpdated={lastUpdated}
        onSelectStock={handleSelectStock}
        currentData={analysisData}
        currentAiVerdict={aiVerdict}
        multiTfData={multiTfData}
      />

      {/* Floating Alert Toast Notification */}
      <AlertToast onSelectStock={handleSelectStock} />

      {/* ── Main Workspace ── */}
      <main className="flex-1 min-h-0 w-full max-w-[1920px] mx-auto p-2 sm:p-2.5 flex flex-col md:flex-row gap-2.5 overflow-y-auto md:overflow-hidden">
        {/* Left Column: Unified Chart Area with Integrated Stock Tabs (Flexibly adapts to screen size) */}
        <div className="flex-1 min-w-[320px] sm:min-w-[380px] flex flex-col h-full min-h-0">
          {/* Error Alert (if any) */}
          {error && (
            <div className="mb-2 flex items-center justify-between px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs shrink-0">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-1 text-[11px] font-medium text-rose-300 hover:text-white"
              >
                <RefreshCw className="w-3 h-3" /> ลองใหม่
              </button>
            </div>
          )}

          {/* 1. Unified Chart with Stock Tabs & Toolbar Aligned 100% */}
          <SmcChart
            data={analysisData}
            quotes={quotes}
            selectedSymbol={selectedSymbol}
            timeframe={timeframe}
            onSelectStock={handleSelectStock}
            onSelectTimeframe={handleSelectTimeframe}
            settings={indicatorSettings}
            onUpdateSettings={setIndicatorSettings}
            isLoading={isLoadingAnalysis}
            isLoadingQuotes={isLoadingQuotes}
            liveQuote={liveQuote}
            aiVerdict={aiVerdict}
          />
        </div>

        {/* Right Column: Strategy Desk & Global News Panel (Fixed/Protected Width: NEVER shrinks when resizing website) */}
        <div className="w-full md:w-[450px] lg:w-[480px] xl:w-[500px] 2xl:w-[520px] shrink-0 flex flex-col h-full min-h-0">
          <SmcAnalysisPanel
            data={analysisData}
            newsItems={news}
            multiTfData={multiTfData}
          />
        </div>
      </main>
    </div>
  );
};

export default App;
