import React, { useState, useEffect, useRef } from 'react';
import { alertManager } from '../services/alertManager';
import { BuyAlertItem, AlertConfig } from '../types/alert';
import { AlertSettingsModal } from './AlertSettingsModal';
import {
  Bell,
  Volume2,
  VolumeX,
  Settings,
  Trash2,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Sparkles
} from 'lucide-react';

import { SmcAnalysisResult, MultiTimeframeAnalysis } from '../types/smc';
import { AiNewsVerdict } from '../utils/aiNewsAdvisor';

interface AlertBellButtonProps {
  onSelectStock?: (symbol: string) => void;
  currentData?: SmcAnalysisResult | null;
  currentAiVerdict?: AiNewsVerdict | null;
  multiTfData?: MultiTimeframeAnalysis | null;
}

export const AlertBellButton: React.FC<AlertBellButtonProps> = ({
  onSelectStock,
  currentData,
  currentAiVerdict,
  multiTfData
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [alerts, setAlerts] = useState<BuyAlertItem[]>(alertManager.getAlerts());
  const [config, setConfig] = useState<AlertConfig>(alertManager.getConfig());
  const [hasNewAlert, setHasNewAlert] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = alertManager.subscribe((newAlert) => {
      setAlerts(alertManager.getAlerts());
      setHasNewAlert(true);
    });

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const unreadCount = alerts.filter(a => !a.read).length;

  const handleOpenDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen && unreadCount > 0) {
      alertManager.markAllAsRead();
      setAlerts(alertManager.getAlerts());
      setHasNewAlert(false);
    }
  };

  const handleToggleSound = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = await alertManager.updateConfig({ soundEnabled: !config.soundEnabled });
    setConfig(updated);
  };

  const handleClearAlerts = (e: React.MouseEvent) => {
    e.stopPropagation();
    alertManager.clearAlerts();
    setAlerts([]);
  };

  const formatTimeAgo = (timestamp: number) => {
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return `${diffSec} วินาทีที่แล้ว`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} ชม. ที่แล้ว`;
    return new Date(timestamp).toLocaleDateString('th-TH');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={handleOpenDropdown}
        className={`relative p-2 rounded-xl border transition-all duration-200 active:scale-95 flex items-center justify-center ${
          isOpen
            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
            : hasNewAlert || unreadCount > 0
            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)] animate-pulse'
            : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300 hover:text-white'
        }`}
        title="การแจ้งเตือนจุดซื้อ / จุดขายใกล้ HH (Smart Money Alerts)"
      >
        <Bell className="w-4 h-4" />

        {/* Unread badge count */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-black text-[10px] font-black font-mono flex items-center justify-center shadow-lg shadow-emerald-500/50 animate-bounce">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#0a0e1a]/95 backdrop-blur-xl border border-white/[0.12] rounded-2xl shadow-2xl shadow-black z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Dropdown Header */}
          <div className="px-4 py-3 border-b border-white/[0.08] bg-[#0c1220] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span className="text-xs font-bold text-white tracking-wide">
                การแจ้งเตือนจุดซื้อ / โซน TP
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* Quick Sound Toggle */}
              <button
                onClick={handleToggleSound}
                className={`p-1.5 rounded-lg border transition-colors ${
                  config.soundEnabled
                    ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20'
                    : 'text-slate-500 border-white/[0.05] hover:text-slate-300'
                }`}
                title={config.soundEnabled ? 'ปิดเสียงกระดิ่ง' : 'เปิดเสียงกระดิ่ง'}
              >
                {config.soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              {/* Settings Cog */}
              <button
                onClick={() => { setIsOpen(false); setIsSettingsOpen(true); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white border border-transparent hover:border-white/[0.08] hover:bg-white/[0.05] transition-colors"
                title="ตั้งค่า LINE / Discord / Telegram / เสียง"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Alert List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.04]">
            {alerts.length === 0 ? (
              <div className="p-6 text-center text-slate-400 space-y-1.5">
                <Bell className="w-8 h-8 text-slate-600 mx-auto stroke-[1.5]" />
                <p className="text-xs font-medium text-slate-300">ยังไม่มีสัญญาณแจ้งเตือน</p>
                <p className="text-[11px] text-slate-500">
                  ระบบจะตรวจจับอัตโนมัติทั้งจุดเข้าซื้อสถาบัน และจุดเข้าใกล้ Higher High (HH) เพื่อเตือนขายทำกำไร
                </p>
              </div>
            ) : (
              alerts.map((item) => {
                const isTp = item.alertType === 'TP' || item.alertType === 'SELL_HH';
                const tpMin = item.sellZoneMin ?? item.targetPrice1Y;
                const tpMax = item.sellZoneMax ?? Number((tpMin * 1.06).toFixed(2));
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (onSelectStock) onSelectStock(item.symbol);
                      setIsOpen(false);
                    }}
                    className="p-3 hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-lg font-mono text-[11px] font-black border ${
                            isTp
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          }`}
                        >
                          {item.symbol}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold border ${
                            isTp
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          {isTp ? '🎯 โซน TP' : '🛒 จุดซื้อ'}
                        </span>
                        <span className="font-mono text-xs font-bold text-white ml-1">
                          ${item.currentPrice.toFixed(2)}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formatTimeAgo(item.timestamp)}
                      </span>
                    </div>

                    {isTp ? (
                      <p className="text-[11px] text-slate-300 mt-1.5 leading-snug line-clamp-2">
                        🎯 โซน TP: ไม้ 1 <b className="text-amber-300 font-mono">${tpMin.toFixed(1)}</b> • ไม้ 2 <b className="text-amber-300 font-mono">${tpMax.toFixed(1)}</b> (เตือนที่ -2%)
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-300 mt-1.5 leading-snug line-clamp-2">
                        🛒 โซนช้อน: <b className="text-emerald-400 font-mono">${item.buyZoneMin.toFixed(1)}–${item.buyZoneMax.toFixed(1)}</b> • AI มั่นใจ <b className="text-cyan-300 font-mono">{item.confidenceScore}%</b> • วอลุ่มซื้อ <b className="text-emerald-300 font-mono">{item.volumeBuyRatio}%</b>
                      </p>
                    )}

                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1.5 border-t border-white/[0.04]">
                      <span>{isTp ? `🎯 ล็อกกำไรโซน TP` : `🎯 เป้า: $${item.targetPrice6M.toFixed(1)}`}</span>
                      <span className={`group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 font-sans font-semibold ${isTp ? 'text-amber-400' : 'text-cyan-400'}`}>
                        {isTp ? 'ขายทำกำไร' : 'ดูกราฟ'} <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Dropdown Footer */}
          <div className="p-2.5 border-t border-white/[0.08] bg-[#0c1220]/80 flex items-center justify-between text-[11px]">
            <button
              onClick={() => { setIsOpen(false); setIsSettingsOpen(true); }}
              className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors flex items-center gap-1"
            >
              <Settings className="w-3 h-3" /> ตั้งค่าบอทเตือน LINE / Discord
            </button>

            {alerts.length > 0 && (
              <button
                onClick={handleClearAlerts}
                className="text-slate-500 hover:text-rose-400 font-medium transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> ล้างทั้งหมด
              </button>
            )}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <AlertSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaveConfig={(newConfig) => setConfig(newConfig)}
        currentData={currentData}
        currentAiVerdict={currentAiVerdict}
        multiTfData={multiTfData}
      />
    </div>
  );
};
