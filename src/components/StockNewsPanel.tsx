import React, { useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe2,
  LoaderCircle,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { StockNewsItem } from "../types/smc";

interface StockNewsPanelProps {
  items: StockNewsItem[];
  isLoading: boolean;
  error: string | null;
}

const scoreStyle = (item: StockNewsItem) => {
  if (item.sentiment === "POSITIVE")
    return {
      icon: TrendingUp,
      label: "บวก",
      color: "text-emerald-300 bg-emerald-500/15 border-emerald-400/30",
      bar: "bg-gradient-to-r from-emerald-500 to-teal-400",
    };
  if (item.sentiment === "NEGATIVE")
    return {
      icon: TrendingDown,
      label: "ลบ",
      color: "text-rose-300 bg-rose-500/15 border-rose-400/30",
      bar: "bg-gradient-to-r from-rose-500 to-red-400",
    };
  return {
    icon: Sparkles,
    label: "กลาง",
    color: "text-slate-300 bg-slate-500/15 border-slate-400/25",
    bar: "bg-slate-400",
  };
};

export const StockNewsPanel: React.FC<StockNewsPanelProps> = ({
  items,
  isLoading,
  error,
}) => {
  const newsStripRef = useRef<HTMLDivElement>(null);
  const scrollNews = (direction: "left" | "right") =>
    newsStripRef.current?.scrollBy({
      left: direction === "left" ? -360 : 360,
      behavior: "smooth",
    });

  return (
    <section className="lux-panel rounded-3xl overflow-hidden border border-white/[0.08]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-3.5 bg-gradient-to-r from-slate-900/90 via-[#0d1424]/90 to-[#0a101f]/90">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-violet-400/30 bg-violet-400/10 p-2.5 text-violet-300 shadow-inner">
            <Globe2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-white">ข่าวกรองตลาดต่างประเทศ (Global Market Feed)</h3>
            <p className="text-[10px] sm:text-[11px] tracking-wider text-slate-400 font-medium">
              HEADLINE SENTIMENT & INSTITUTIONAL IMPACT
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="hidden sm:inline rounded-lg border border-white/[0.08] bg-slate-950/80 px-2.5 py-1 text-[11px] font-bold text-slate-300 font-mono">
            {items.length} ข่าวล่าสุด
          </span>
          <button
            type="button"
            onClick={() => scrollNews("left")}
            className="watchlist-arrow"
            aria-label="เลื่อนข่าวไปทางซ้าย"
            title="เลื่อนซ้าย"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollNews("right")}
            className="watchlist-arrow"
            aria-label="เลื่อนข่าวไปทางขวา"
            title="เลื่อนขวา"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2.5 px-4 py-12 text-xs font-bold text-cyan-300">
          <LoaderCircle className="h-5 w-5 animate-spin" />{" "}
          กำลังรวบรวมและแปลข่าวล่าสุดจากสำนักข่าวการเงินระดับโลก...
        </div>
      )}

      {!isLoading && error && (
        <div className="flex items-start gap-2.5 px-5 py-6 text-xs leading-relaxed text-rose-300">
          <ShieldAlert className="h-5 w-5 shrink-0 text-rose-400" /> {error}
        </div>
      )}

      {!isLoading && !error && items.length === 0 && (
        <p className="px-4 py-8 text-center text-xs text-slate-400 font-medium">
          ยังไม่พบข่าวสารใหม่สำหรับหุ้นนี้
        </p>
      )}

      {!isLoading && !error && items.length > 0 && (
        <div
          ref={newsStripRef}
          onWheel={(event) => {
            if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
              event.currentTarget.scrollLeft += event.deltaY;
              event.preventDefault();
            }
          }}
          className="news-strip no-scrollbar py-3 px-4 sm:px-5"
        >
          {items.map((item) => {
            const style = scoreStyle(item);
            const Icon = style.icon;
            return (
              <article
                key={item.id}
                className="group rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4 hover:border-cyan-400/40 hover:bg-slate-800/70 hover:-translate-y-0.5 transition-all shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2.5">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="news-headline min-w-0 text-xs sm:text-sm font-bold leading-snug text-slate-100 group-hover:text-cyan-200 transition-colors"
                    >
                      {item.translatedTitle}
                      <ExternalLink className="ml-1 inline h-3 w-3 text-slate-400 opacity-60 group-hover:opacity-100" />
                    </a>
                    <span
                      className={`shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-mono font-extrabold flex items-center gap-1 ${style.color}`}
                    >
                      <Icon className="h-3 w-3" />
                      {style.label} {Math.abs(item.sentimentScore)}%
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium mb-1.5">
                    <span className="font-semibold text-slate-300 max-w-[130px] truncate">
                      {item.publisher}
                    </span>
                    <span className="font-mono">
                      {new Date(item.publishedAt).toLocaleDateString("th-TH", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full ${style.bar}`}
                      style={{ width: `${item.impactScore}%` }}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="border-t border-white/[0.06] bg-slate-950/40 px-5 py-2.5 text-[11px] text-slate-500 font-medium flex items-center justify-between">
        <span>เลื่อนการ์ดแนวนอนเพื่ออ่านข่าวถัดไป • คะแนนวิเคราะห์จากพาดหัวข่าว</span>
        <span className="font-mono text-[10px] text-slate-600 hidden sm:inline">NEWS FEED VERIFIED</span>
      </div>
    </section>
  );
};
