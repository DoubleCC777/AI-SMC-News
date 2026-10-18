import React, { useEffect, useState } from 'react';
import { alertManager } from '../services/alertManager';
import { BuyAlertItem } from '../types/alert';
import { Bell, X, ChevronRight, TrendingUp } from 'lucide-react';

interface AlertToastProps {
  onSelectStock?: (symbol: string) => void;
}

export const AlertToast: React.FC<AlertToastProps> = ({ onSelectStock }) => {
  const [activeAlert, setActiveAlert] = useState<BuyAlertItem | null>(null);

  useEffect(() => {
    const unsubscribe = alertManager.subscribe((newAlert) => {
      setActiveAlert(newAlert);
      // Auto-hide after 10 seconds
      const timer = setTimeout(() => {
        setActiveAlert(null);
      }, 10000);
      return () => clearTimeout(timer);
    });

    return () => unsubscribe();
  }, []);

  if (!activeAlert) return null;

  const isTpAlert = activeAlert.alertType === 'TP' || activeAlert.alertType === 'SELL_HH';
  const tpMin = activeAlert.sellZoneMin ?? activeAlert.targetPrice1Y;
  const tpMax = activeAlert.sellZoneMax ?? Number((tpMin * 1.06).toFixed(2));

  return (
    <div className="fixed top-14 right-4 z-50 max-w-sm w-full animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto">
      <div
        className={`backdrop-blur-xl rounded-2xl p-4 shadow-2xl transition-all duration-300 ${
          isTpAlert
            ? 'bg-[#140e06]/95 border border-amber-500/40 shadow-amber-950/60 ring-1 ring-amber-500/30'
            : 'bg-[#0b101d]/95 border border-emerald-500/40 shadow-emerald-950/60 ring-1 ring-emerald-500/30'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 animate-pulse ${
                isTpAlert
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                  : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
              }`}
            >
              {isTpAlert ? <TrendingUp className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-mono font-black px-2 py-0.5 rounded-md border ${
                    isTpAlert
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  {activeAlert.symbol}
                </span>
                <span className="text-xs font-bold text-white">
                  {isTpAlert ? 'ใกล้ถึงโซน TP แล้ว! (เตือนที่ -2%)' : 'แตะจุดซื้อสถาบันแล้ว!'}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                ราคาปัจจุบัน: <b className="text-white">${activeAlert.currentPrice.toFixed(2)}</b>
              </span>
            </div>
          </div>

          <button
            onClick={() => setActiveAlert(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {isTpAlert ? (
          <div className="mt-2.5 p-2 rounded-xl bg-black/40 border border-amber-500/15 text-[11px] space-y-1 font-mono">
            <div className="flex justify-between text-slate-300">
              <span className="font-sans">🎯 โซน TP (Take Profit):</span>
              <span className="font-bold text-amber-300">
                ${tpMin.toFixed(2)} – ${tpMax.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="font-sans flex items-center gap-1">
                <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-500/20 text-amber-300">ไม้ 1</span>
                <span>TP 1:</span>
              </span>
              <span className="font-bold text-amber-400">
                ${tpMin.toFixed(2)} (ขาย 50%)
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="font-sans flex items-center gap-1">
                <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-500/20 text-amber-300">ไม้ 2</span>
                <span>TP 2:</span>
              </span>
              <span className="font-bold text-amber-300">
                ${tpMax.toFixed(2)} (ขาย 50%)
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-2.5 p-2 rounded-xl bg-black/40 border border-white/[0.05] text-[11px] space-y-1">
            <div className="flex justify-between text-slate-300">
              <span>🛒 โซนช้อนซื้อ:</span>
              <span className="font-mono font-bold text-emerald-400">
                ${activeAlert.buyZoneMin.toFixed(2)} – ${activeAlert.buyZoneMax.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>📊 Volume Flow:</span>
              <span className="font-mono text-cyan-300 font-medium">
                ซื้อ {activeAlert.volumeBuyRatio}% (Delta +{(activeAlert.volumeDelta / 1e6).toFixed(1)}M)
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>🧠 AI มั่นใจ:</span>
              <span className="font-mono font-bold text-emerald-300">
                {activeAlert.confidenceScore}% (สถาบันหนุน)
              </span>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[9.5px] text-slate-500">
            {isTpAlert ? 'ส่งเตือนโซน TP เรียบร้อย 🎯' : 'ส่งแจ้งเตือนเรียบร้อย 🔔'}
          </span>
          <button
            onClick={() => {
              if (onSelectStock) onSelectStock(activeAlert.symbol);
              setActiveAlert(null);
            }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-black font-bold text-xs transition-all active:scale-95 shadow-md ${
              isTpAlert
                ? 'bg-amber-500 hover:bg-amber-400 shadow-amber-500/20'
                : 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20'
            }`}
          >
            <span>{isTpAlert ? 'ขายทำกำไร / ดูกราฟ' : 'เปิดดูกราฟ'}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
