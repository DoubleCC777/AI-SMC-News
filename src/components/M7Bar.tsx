import React, { useRef, useState, useEffect } from "react";
import { StockQuote } from "../types/smc";
import { TrendingUp, TrendingDown } from "lucide-react";
import { getMarketStatus } from "../utils/marketHours";

interface M7BarProps {
  quotes: StockQuote[];
  selectedSymbol: string;
  onSelectStock: (symbol: string) => void;
  isLoading?: boolean;
}

const STOCK_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  AAPL: { bg: "bg-sky-500/15", text: "text-sky-300", border: "border-sky-400/35" },
  NVDA: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  MSFT: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  GOOGL: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  AMZN: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20" },
  META: { bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/20" },
  TSLA: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
  V: { bg: "bg-blue-600/20", text: "text-blue-300", border: "border-blue-500/40" },
  MA: { bg: "bg-orange-500/20", text: "text-orange-300", border: "border-orange-500/40" },
  GOLD: { bg: "bg-amber-400/20", text: "text-amber-300", border: "border-amber-400/40" },
  "GC=F": { bg: "bg-amber-400/20", text: "text-amber-300", border: "border-amber-400/40" },
  XAUUSD: { bg: "bg-amber-400/20", text: "text-amber-300", border: "border-amber-400/40" },
  GOLDUSD: { bg: "bg-amber-400/20", text: "text-amber-300", border: "border-amber-400/40" },
  LLY: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" },
  KBANK: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  SCB: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
  TISCO: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  BBL: { bg: "bg-blue-600/10", text: "text-blue-300", border: "border-blue-600/20" },
};

const DEFAULT_STOCKS = [
  { symbol: "AAPL", name: "Apple", thaiName: "แอปเปิ้ล" },
  { symbol: "MSFT", name: "Microsoft", thaiName: "ไมโครซอฟท์" },
  { symbol: "GOOGL", name: "Alphabet", thaiName: "กูเกิล" },
  { symbol: "AMZN", name: "Amazon", thaiName: "แอมะซอน" },
  { symbol: "NVDA", name: "NVIDIA", thaiName: "เอ็นวิเดีย" },
  { symbol: "META", name: "Meta", thaiName: "เมต้า" },
  { symbol: "TSLA", name: "Tesla", thaiName: "เทสลา" },
  { symbol: "V", name: "Visa", thaiName: "วีซ่า" },
  { symbol: "MA", name: "Mastercard", thaiName: "มาสเตอร์การ์ด" },
  { symbol: "GOLD", name: "Gold / USD", thaiName: "ทองคำ" },
  { symbol: "LLY", name: "Eli Lilly", thaiName: "ลิลี่" },
  { symbol: "KBANK", name: "Kasikornbank", thaiName: "กสิกร" },
  { symbol: "SCB", name: "SCB X", thaiName: "ไทยพาณิชย์" },
  { symbol: "TISCO", name: "Tisco", thaiName: "ทิสโก้" },
  { symbol: "BBL", name: "Bangkok Bank", thaiName: "กรุงเทพ" },
];

const M7BarComponent: React.FC<M7BarProps> = ({
  quotes,
  selectedSymbol,
  onSelectStock,
  isLoading,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [flashMap, setFlashMap] = useState<Record<string, 'up' | 'down'>>({});
  const prevPricesRef = useRef<Record<string, number>>({});

  // Detect live price changes across all stocks and trigger dynamic pulse animation
  useEffect(() => {
    if (!quotes || quotes.length === 0) return;
    const newFlashes: Record<string, 'up' | 'down'> = {};
    let hasChanges = false;

    quotes.forEach((q) => {
      if (!q.price || q.price <= 0) return;
      const clean = q.symbol.replace(/\.BK$/i, "").toUpperCase();
      const prev = prevPricesRef.current[clean];
      if (prev !== undefined && prev !== q.price) {
        newFlashes[clean] = q.price > prev ? 'up' : 'down';
        hasChanges = true;
      }
      prevPricesRef.current[clean] = q.price;
    });

    if (hasChanges) {
      setFlashMap((prev) => ({ ...prev, ...newFlashes }));
      const timer = setTimeout(() => {
        setFlashMap({});
      }, 750);
      return () => clearTimeout(timer);
    }
  }, [quotes]);

  const normalizeSymbol = (s?: string) => {
    if (!s) return "";
    const clean = s.replace(/\.BK$/i, "").toUpperCase();
    if (["GC=F", "XAUUSD", "GOLDUSD"].includes(clean)) return "GOLD";
    return clean;
  };

  const matchSymbol = (a?: string, b?: string) =>
    normalizeSymbol(a) === normalizeSymbol(b);

  const displayList: StockQuote[] =
    quotes && quotes.length > 0
      ? quotes
      : (DEFAULT_STOCKS.map((d) => ({
          symbol: d.symbol,
          name: d.name,
          thaiName: d.thaiName,
          price: 0,
          change: 0,
          changePercent: 0,
          high: 0,
          low: 0,
          volume: 0,
          marketCap: 0,
          smcBias: "NEUTRAL" as const,
          trendBadge: "",
        })) as StockQuote[]);

  const formatPrice = (quote: StockQuote) => {
    if (!quote.price || quote.price <= 0) return "---";
    const cleanSym = quote.symbol.replace(/\.BK$/i, "").toUpperCase();
    const isThai =
      quote.symbol.endsWith(".BK") ||
      ["KBANK", "SCB", "TISCO", "BBL"].includes(cleanSym);
    return `${isThai ? "฿" : "$"}${quote.price.toFixed(2)}`;
  };

  return (
    <div className="w-full bg-[#080b12] border-b border-white/[0.08] shrink-0 overflow-hidden select-none">
      <div
        ref={listRef}
        onWheel={(event) => {
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            event.currentTarget.scrollLeft += event.deltaY;
            event.preventDefault();
          }
        }}
        className="flex items-stretch overflow-x-auto no-scrollbar scroll-smooth divide-x divide-white/[0.05]"
      >
        {displayList.map((quote) => {
          const rawSymbol = quote.symbol.replace(/\.BK$/i, "");
          const isSelected = matchSymbol(quote.symbol, selectedSymbol);
          const isPositive = (quote.changePercent || 0) >= 0;
          const tickDir = flashMap[rawSymbol.toUpperCase()];
          const brandStyle = STOCK_STYLES[rawSymbol] || {
            bg: "bg-white/[0.05]",
            text: "text-slate-300",
            border: "border-white/[0.08]",
          };

          const marketStatus = getMarketStatus(quote.symbol);

          return (
            <button
              key={quote.symbol}
              onClick={() => onSelectStock(quote.symbol)}
              type="button"
              title={`${quote.name} (${quote.thaiName || rawSymbol})\n• สถานะตลาด: ${marketStatus.fullLabel}\n• ${marketStatus.scheduleNote}\n• ${marketStatus.nextOpenText}`}
              className={`relative flex-1 min-w-[115px] sm:min-w-[130px] py-2 px-3 flex flex-col justify-center transition-all duration-200 text-left group ${
                isSelected
                  ? "bg-white/[0.08] text-white shadow-inner"
                  : "bg-transparent hover:bg-white/[0.03] text-slate-400 hover:text-slate-200"
              }`}
            >
              {/* Active Underline Glow */}
              {isSelected && (
                <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-cyan-500 via-cyan-400 to-teal-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
              )}

              {/* Row 1: Stock Avatar/Tag + Symbol + Bias Dot */}
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${brandStyle.bg} ${brandStyle.text} ${brandStyle.border}`}
                  >
                    {rawSymbol}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium truncate max-w-[55px] hidden sm:inline">
                    {quote.thaiName || quote.name}
                  </span>
                </div>

                {/* Market Status + Bias Indicator */}
                <div className="flex items-center gap-1 shrink-0">
                  {!marketStatus.isOpen && (
                    <span
                      className="text-[8.5px] font-mono font-bold px-1 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/25 leading-none"
                      title={marketStatus.fullLabel}
                    >
                      ปิด
                    </span>
                  )}
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      quote.smcBias === "BULLISH"
                        ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]"
                        : quote.smcBias === "BEARISH"
                        ? "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.7)]"
                        : "bg-slate-600"
                    }`}
                    title={`SMC Bias: ${quote.smcBias || "NEUTRAL"}`}
                  />
                </div>
              </div>

              {/* Row 2: Price + Change % Pill (With Real-time Live Tick Glow) */}
              <div className="flex items-center justify-between gap-1 font-mono">
                <span
                  className={`text-xs font-semibold flex items-center gap-1 transition-all duration-200 ${
                    tickDir === 'up'
                      ? 'text-emerald-300 font-bold scale-[1.04] drop-shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                      : tickDir === 'down'
                      ? 'text-rose-300 font-bold scale-[1.04] drop-shadow-[0_0_8px_rgba(244,63,94,0.7)]'
                      : isSelected
                      ? 'text-white'
                      : 'text-slate-200 group-hover:text-white'
                  }`}
                >
                  {formatPrice(quote)}
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block shrink-0" />
                  )}
                </span>

                <span
                  className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-tight transition-all duration-200 ${
                    tickDir === 'up'
                      ? 'text-emerald-300 bg-emerald-500/30 border border-emerald-400/50 shadow-[0_0_8px_rgba(52,211,153,0.3)]'
                      : tickDir === 'down'
                      ? 'text-rose-300 bg-rose-500/30 border border-rose-400/50 shadow-[0_0_8px_rgba(244,63,94,0.3)]'
                      : isPositive
                      ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                      : 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                  }`}
                >
                  {isPositive ? (
                    <TrendingUp className="w-2.5 h-2.5 shrink-0" />
                  ) : (
                    <TrendingDown className="w-2.5 h-2.5 shrink-0" />
                  )}
                  {Math.abs(quote.changePercent || 0).toFixed(1)}%
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const M7Bar = React.memo(M7BarComponent);
