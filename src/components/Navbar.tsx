import React from "react";
import { RefreshCw, Activity, Clock } from "lucide-react";
import { AlertBellButton } from "./AlertBellButton";

import { SmcAnalysisResult, MultiTimeframeAnalysis } from "../types/smc";
import { AiNewsVerdict } from "../utils/aiNewsAdvisor";
import { getMarketStatus } from "../utils/marketHours";

interface NavbarProps {
  onRefresh: () => void;
  isLoading: boolean;
  lastUpdated: Date | null;
  onSelectStock?: (symbol: string) => void;
  currentData?: SmcAnalysisResult | null;
  currentAiVerdict?: AiNewsVerdict | null;
  multiTfData?: MultiTimeframeAnalysis | null;
}

const NavbarComponent: React.FC<NavbarProps> = ({
  onRefresh,
  isLoading,
  lastUpdated,
  onSelectStock,
  currentData,
  currentAiVerdict,
  multiTfData
}) => {
  return (
    <header className="w-full bg-[#07090e]/90 backdrop-blur-md border-b border-white/[0.08] sticky top-0 z-50 shrink-0 h-12 flex items-center shadow-lg shadow-black/20">
      <div className="w-full max-w-[1920px] mx-auto px-2 sm:px-2.5 flex items-center justify-between">
        {/* Left: Brand & Title - Aligned 100% with the Chart Column below */}
        <div className="flex items-center gap-3 min-w-0">
          {/* High-End Institutional Logo Badge with Glowing Backing */}
          <div className="relative group shrink-0">
            <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-cyan-500/30 to-emerald-500/30 blur-sm opacity-60 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <div className="relative w-8 h-8 rounded-xl bg-[#080d1a] border border-cyan-500/40 p-1 flex items-center justify-center shadow-lg shadow-cyan-950/40 group-hover:border-cyan-400/70 transition-all duration-200">
              <img
                src="/logo.svg"
                alt="AI-SMC Emblem"
                className="w-full h-full object-contain filter drop-shadow-[0_0_6px_rgba(56,189,248,0.5)] transform group-hover:scale-105 transition-transform"
              />
            </div>
          </div>

          {/* Title & Tag */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <h1 className="text-sm sm:text-[15px] font-black tracking-tight font-sans bg-gradient-to-r from-white via-cyan-100 to-cyan-300 bg-clip-text text-transparent flex items-center gap-2 shrink-0 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                AI·SMC
              </h1>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gradient-to-r from-cyan-500/15 via-indigo-500/15 to-emerald-500/15 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.15)]">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[9.5px] font-mono font-extrabold text-cyan-300 tracking-wider">
                  INSTITUTIONAL
                </span>
              </div>
            </div>

            <span className="text-slate-700 hidden md:inline text-xs font-mono">|</span>

            <span className="text-xs text-slate-400 font-medium hidden md:inline truncate tracking-normal">
              ระบบวิเคราะห์โครงสร้างสถาบัน Smart Money Concepts & เรดาร์ข่าวหุ้น 7 นางฟ้า
            </span>
          </div>
        </div>

        {/* Right: Live Market & Refresh - Aligned 100% with the Strategy Panel below */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Bell Alerts Button with Audio & Modal Settings */}
          <AlertBellButton
            onSelectStock={onSelectStock}
            currentData={currentData}
            currentAiVerdict={currentAiVerdict}
            multiTfData={multiTfData}
          />

          {/* Real-time Market Status Pill with Tooltip Schedule */}
          {(() => {
            const marketStatus = getMarketStatus(currentData?.symbol || 'NVDA');
            return (
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium shadow-sm transition-colors cursor-help ${
                  marketStatus.isOpen
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : marketStatus.session === "LUNCH_BREAK"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}
                title={`${marketStatus.fullLabel}\n• ${marketStatus.scheduleNote}\n• ${marketStatus.nextOpenText}`}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  {marketStatus.isOpen && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      marketStatus.isOpen
                        ? "bg-emerald-400"
                        : marketStatus.session === "LUNCH_BREAK"
                        ? "bg-amber-400"
                        : "bg-rose-400"
                    }`}
                  />
                </span>
                <span className="font-mono font-bold text-[10.5px]">{marketStatus.shortBadge}</span>
              </div>
            );
          })()}

          {/* Timestamp */}
          {lastUpdated && (
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-400 font-mono px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>{lastUpdated.toLocaleTimeString("th-TH")}</span>
            </div>
          )}

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold text-slate-200 hover:text-white bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] transition-all duration-150 disabled:opacity-50 active:scale-95 shadow-sm"
            title="รีเฟรชข้อมูลราคาแบบเรียลไทม์"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isLoading ? "animate-spin text-cyan-400" : "text-slate-400 group-hover:text-cyan-400"
              }`}
            />
            <span className="hidden sm:inline">รีเฟรช</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export const Navbar = React.memo(NavbarComponent);
