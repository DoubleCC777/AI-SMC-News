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

  return (
    <div className="fixed top-14 right-4 z-50 max-w-sm w-full animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto">
      <div className="bg-[#0b101d]/95 backdrop-blur-xl border border-emerald-500/40 rounded-2xl p-4 shadow-2xl shadow-emerald-950/60 ring-1 ring-emerald-500/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-[0_0_12px_rgba(16,185,129,0.3)] animate-pulse">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {activeAlert.symbol}
                </span>
                <span className="text-xs font-bold text-white">
                  แตะจุดซื้อสถาบันแล้ว!
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

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[9.5px] text-slate-500">
            ส่งแจ้งเตือนเรียบร้อย 🔔
          </span>
          <button
            onClick={() => {
              if (onSelectStock) onSelectStock(activeAlert.symbol);
              setActiveAlert(null);
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-md shadow-emerald-500/20 active:scale-95"
          >
            <span>เปิดดูกราฟ</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
