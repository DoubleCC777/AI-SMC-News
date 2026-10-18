import React from 'react';
import { Eye, Layers, Zap, Gauge, GitCommit, Activity } from 'lucide-react';

export interface IndicatorSettings {
  showStructure: boolean;
  showOrderBlocks: boolean;
  showFvgs: boolean;
  showPremiumDiscount: boolean;
  showMitigated: boolean;
  showRealtimePriceLine?: boolean;
  showEqualHighsLows?: boolean;
}

interface IndicatorControlsProps {
  timeframe: string;
  onSelectTimeframe: (tf: string) => void;
  settings: IndicatorSettings;
  onUpdateSettings: (newSettings: IndicatorSettings) => void;
}

const TIMEFRAMES = [
  { id: '1m', label: '1m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: '1D' }
];

export const IndicatorControls: React.FC<IndicatorControlsProps> = ({
  timeframe,
  onSelectTimeframe,
  settings,
  onUpdateSettings
}) => {
  const toggle = (key: keyof IndicatorSettings) => {
    onUpdateSettings({
      ...settings,
      [key]: !settings[key]
    });
  };

  return (
    <div className="flex items-center flex-wrap gap-2.5 shrink-0">
      {/* Segmented Timeframe Switcher */}
      <div className="flex items-center bg-[#07090f] p-0.5 rounded-lg border border-white/[0.08] shadow-inner">
        {TIMEFRAMES.map(tf => {
          const isActive = timeframe === tf.id;
          return (
            <button
              key={tf.id}
              onClick={() => onSelectTimeframe(tf.id)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all duration-150 ${
                isActive
                  ? 'bg-gradient-to-b from-white to-slate-200 text-slate-900 font-bold shadow-sm shadow-white/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              {tf.label}
            </button>
          );
        })}
      </div>

      {/* SMC Indicator Toggle Pills */}
      <div className="flex items-center flex-wrap gap-1.5">
        {/* BOS / CHoCH */}
        <button
          onClick={() => toggle('showStructure')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all duration-150 border ${
            settings.showStructure
              ? 'bg-violet-500/15 text-violet-300 border-violet-500/30 shadow-[0_0_10px_rgba(167,139,250,0.15)]'
              : 'bg-white/[0.02] text-slate-500 border-white/[0.05] hover:text-slate-300 hover:border-white/[0.1]'
          }`}
          title="โครงสร้างตลาด Break of Structure (BOS) / Change of Character (CHoCH)"
        >
          <GitCommit className={`w-3 h-3 ${settings.showStructure ? 'text-violet-400' : 'text-slate-600'}`} />
          <span>BOS/CHoCH</span>
        </button>

        {/* Order Blocks */}
        <button
          onClick={() => toggle('showOrderBlocks')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all duration-150 border ${
            settings.showOrderBlocks
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_rgba(52,211,153,0.15)]'
              : 'bg-white/[0.02] text-slate-500 border-white/[0.05] hover:text-slate-300 hover:border-white/[0.1]'
          }`}
          title="โซนคำสั่งสถาบัน Order Blocks (Demand & Supply)"
        >
          <Layers className={`w-3 h-3 ${settings.showOrderBlocks ? 'text-emerald-400' : 'text-slate-600'}`} />
          <span>Order Blocks</span>
        </button>

        {/* FVG */}
        <button
          onClick={() => toggle('showFvgs')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all duration-150 border ${
            settings.showFvgs
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-[0_0_10px_rgba(251,191,36,0.15)]'
              : 'bg-white/[0.02] text-slate-500 border-white/[0.05] hover:text-slate-300 hover:border-white/[0.1]'
          }`}
          title="ช่องว่างราคา Fair Value Gaps (FVG)"
        >
          <Zap className={`w-3 h-3 ${settings.showFvgs ? 'text-amber-400' : 'text-slate-600'}`} />
          <span>FVG</span>
        </button>

        {/* Premium / Discount */}
        <button
          onClick={() => toggle('showPremiumDiscount')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all duration-150 border ${
            settings.showPremiumDiscount
              ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 shadow-[0_0_10px_rgba(34,211,238,0.15)]'
              : 'bg-white/[0.02] text-slate-500 border-white/[0.05] hover:text-slate-300 hover:border-white/[0.1]'
          }`}
          title="โซนราคาถูก (Discount) / โซนราคาแพง (Premium)"
        >
          <Gauge className={`w-3 h-3 ${settings.showPremiumDiscount ? 'text-cyan-400' : 'text-slate-600'}`} />
          <span>Discount/Premium</span>
        </button>

        {/* Mitigated */}
        <button
          onClick={() => toggle('showMitigated')}
          className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-lg transition-all duration-150 border ${
            settings.showMitigated
              ? 'bg-white/[0.1] text-white border-white/25 shadow-[0_0_8px_rgba(255,255,255,0.1)]'
              : 'bg-white/[0.02] text-slate-500 border-white/[0.05] hover:text-slate-400'
          }`}
          title="แสดงหรือซ่อนโซนที่ราคาเคยทดสอบ (Mitigated) ไปแล้ว"
        >
          <Eye className={`w-3 h-3 ${settings.showMitigated ? 'text-slate-200' : 'text-slate-600'}`} />
          <span>Mitigated</span>
        </button>

        {/* EQH / EQL Liquidity Pools */}
        <button
          onClick={() => toggle('showEqualHighsLows')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all duration-150 border ${
            settings.showEqualHighsLows !== false
              ? 'bg-blue-500/15 text-blue-300 border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.15)]'
              : 'bg-white/[0.02] text-slate-500 border-white/[0.05] hover:text-slate-300 hover:border-white/[0.1]'
          }`}
          title="แสดง Equal Highs (EQH) & Equal Lows (EQL) สภาพคล่อง Buy-Side / Sell-Side ตามโมเดล LuxAlgo"
        >
          <Activity className={`w-3 h-3 ${settings.showEqualHighsLows !== false ? 'text-blue-400' : 'text-slate-600'}`} />
          <span>EQH/EQL</span>
        </button>

        {/* Real-time Price Line */}
        <button
          onClick={() => toggle('showRealtimePriceLine')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all duration-150 border ${
            settings.showRealtimePriceLine !== false
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
              : 'bg-white/[0.02] text-slate-500 border-white/[0.05] hover:text-slate-300 hover:border-white/[0.1]'
          }`}
          title="เปิด/ปิด เส้นบอกราคาเรียลไทม์ (Live Real-time Price Line)"
        >
          <span className="relative flex h-2 w-2">
            {settings.showRealtimePriceLine !== false && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${settings.showRealtimePriceLine !== false ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
          </span>
          <span className="font-semibold">เส้นราคาปัจจุบัน</span>
        </button>

        {/* LuxAlgo Indicator Official Tag */}
        <a
          href="https://th.tradingview.com/v/CnB3fSph/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md border border-sky-500/25 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition-all ml-auto sm:ml-0"
          title="อิงอินดิเคเตอร์ Smart Money Concepts (SMC) [LuxAlgo] บน TradingView"
        >
          <span>TradingView: LuxAlgo SMC</span>
          <span className="text-sky-400">↗</span>
        </a>
      </div>
    </div>
  );
};
