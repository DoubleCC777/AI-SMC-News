import React, { useState } from 'react';
import { AlertConfig } from '../types/alert';
import { alertManager } from '../services/alertManager';
import {
  X,
  Bell,
  Volume2,
  VolumeX,
  Send,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sliders,
  Sparkles,
  ExternalLink,
  MessageSquare,
  Bot
} from 'lucide-react';
import { SmcAnalysisResult, MultiTimeframeAnalysis } from '../types/smc';
import { AiNewsVerdict } from '../utils/aiNewsAdvisor';

interface AlertSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AlertConfig;
  onSaveConfig: (newConfig: AlertConfig) => void;
  currentData?: SmcAnalysisResult | null;
  currentAiVerdict?: AiNewsVerdict | null;
  multiTfData?: MultiTimeframeAnalysis | null;
}

export const AlertSettingsModal: React.FC<AlertSettingsModalProps> = ({
  isOpen,
  onClose,
  config: initialConfig,
  onSaveConfig,
  currentData,
  currentAiVerdict,
  multiTfData
}) => {
  const [config, setConfig] = useState<AlertConfig>({ ...initialConfig });
  const [activeTab, setActiveTab] = useState<'sound' | 'discord' | 'telegram' | 'line' | 'filters'>('sound');

  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ channel: string; success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleTestSound = () => {
    alertManager.testSound();
    setTestResult({
      channel: 'sound',
      success: true,
      message: 'เล่นเสียงกระดิ่งสัญญาณซื้อเรียบร้อย! 🔔'
    });
  };

  const getLiveAlertData = () => {
    if (!currentData || !currentAiVerdict) return undefined;
    const plan = currentData.summary?.simpleTradePlan;
    const keyLevels = currentData.summary?.keyLevels;
    const buyZone = plan?.buyZone;

    const snapshots = currentAiVerdict.multiTimeframe?.snapshots || [];
    const tfList: Array<{ tf: '1d' | '4h' | '1h'; label: string }> = [
      { tf: '1d', label: 'รายวัน' },
      { tf: '4h', label: '4 ชม.' },
      { tf: '1h', label: '1 ชม.' },
    ];

    const items = tfList.map(({ tf, label }) => {
      const snap = snapshots.find((s: any) => s.timeframe === tf);
      const tfResult = multiTfData?.[tf] || (currentData.timeframe === tf ? currentData : null);
      const score = snap?.score ?? (tfResult?.summary?.volumeAnalysis ? Math.round(tfResult.summary.volumeAnalysis.buyRatio * 0.8) : 60);
      const badge = snap?.scoreBadge || (score >= 75 ? '🟢 เข้าซื้อได้ โอกาสกำไรสูง' : score >= 65 ? '🟡 ทยอยสะสม แบ่งไม้เข้าซื้อ' : '🟠 ควรรอย่อ ห้ามไล่ราคา');
      return {
        tf: tf.toUpperCase(),
        label,
        score,
        badge,
        trend: snap?.trend || (tfResult?.summary as any)?.trendBias || tfResult?.summary?.overallBias || 'BULLISH',
        buyRatio: snap?.volumeFlow?.buyRatio ?? tfResult?.summary?.volumeAnalysis?.buyRatio ?? 50
      };
    });

    const lastCandleClose = currentData.candles && currentData.candles.length > 0
      ? currentData.candles[currentData.candles.length - 1].close
      : 0;
    const currentPrice = keyLevels?.currentPrice || lastCandleClose;

    const target6M = (plan as any)?.sellTargets?.target6Month?.price
      || (plan as any)?.targets?.target6M
      || (currentPrice > 0 ? Number((currentPrice * 1.15).toFixed(2)) : 0);

    const target1Y = (plan as any)?.sellTargets?.target1Year?.price
      || (plan as any)?.targets?.target1Y
      || (currentPrice > 0 ? Number((currentPrice * 1.28).toFixed(2)) : 0);

    const stopLoss = (plan as any)?.cutLoss?.price
      || (plan as any)?.stopLoss
      || (currentPrice > 0 ? Number((currentPrice * 0.94).toFixed(2)) : 0);

    const buyZoneMin = buyZone?.minPrice || (currentPrice > 0 ? Number((currentPrice * 0.96).toFixed(2)) : 0);
    const buyZoneMax = buyZone?.maxPrice || (currentPrice > 0 ? Number((currentPrice * 0.99).toFixed(2)) : 0);

    return {
      symbol: currentData.symbol,
      companyName: (currentData as any).companyName || currentData.name || currentData.symbol,
      currentPrice,
      buyZoneMin,
      buyZoneMax,
      targetPrice6M: target1Y,
      targetPrice1Y: target1Y,
      stopLossPrice: stopLoss,
      confidenceScore: currentAiVerdict.confidenceScore,
      volumeBuyRatio: currentAiVerdict.volumeFlow?.buyRatio ?? currentData.summary?.volumeAnalysis?.buyRatio ?? 50,
      volumeDelta: currentAiVerdict.volumeFlow?.netDelta ?? currentData.summary?.volumeAnalysis?.netDelta ?? 0,
      wickRejection: true,
      timeframe: currentData.timeframe || '1d',
      multiTimeframe: {
        alignmentText: currentAiVerdict.multiTimeframe?.alignmentText || `สัญญาณสอดคล้อง ${currentAiVerdict.multiTimeframe?.alignmentCount ?? 2}/3 TF`,
        items
      }
    };
  };

  const handleTestChannel = async (channel: 'discord' | 'telegram' | 'line' | 'line-bot') => {
    setTestingChannel(channel);
    setTestResult(null);
    const liveData = getLiveAlertData();
    const res = await alertManager.testChannel(channel, config, liveData);
    setTestingChannel(null);
    setTestResult({
      channel,
      success: res.success,
      message: res.message
    });
  };

  const handleSave = async () => {
    await alertManager.updateConfig(config);
    onSaveConfig(config);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#090d16] border border-white/[0.12] rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] bg-[#0c1220]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.2)]">
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                ตั้งค่าระบบแจ้งเตือนจุดซื้อสถาบัน (Smart Money Alerts)
              </h2>
              <p className="text-[11px] text-slate-400">
                แจ้งเตือนทันทีเมื่อราคาเข้าโซนสะสมของถูก พร้อมเสียงกระดิ่ง, Discord, Telegram & LINE
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center px-4 pt-3 border-b border-white/[0.06] bg-black/30 gap-1.5 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => { setActiveTab('sound'); setTestResult(null); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'sound'
                ? 'border-cyan-400 text-cyan-300 bg-white/[0.04]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>กระดิ่งมีเสียงในเว็บ</span>
          </button>

          <button
            onClick={() => { setActiveTab('discord'); setTestResult(null); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'discord'
                ? 'border-indigo-400 text-indigo-300 bg-white/[0.04]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Discord</span>
          </button>

          <button
            onClick={() => { setActiveTab('telegram'); setTestResult(null); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'telegram'
                ? 'border-sky-400 text-sky-300 bg-white/[0.04]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Telegram</span>
          </button>

          <button
            onClick={() => { setActiveTab('line'); setTestResult(null); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'line'
                ? 'border-emerald-400 text-emerald-300 bg-white/[0.04]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>LINE (แชทไลน์)</span>
          </button>

          <button
            onClick={() => { setActiveTab('filters'); setTestResult(null); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'filters'
                ? 'border-amber-400 text-amber-300 bg-white/[0.04]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>เงื่อนไขจุดเข้าซื้อ</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* 1. Tab: Sound Chime */}
          {activeTab === 'sound' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm">เปิดเสียงกระดิ่งแจ้งเตือนบนหน้าเว็บ</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    เล่นเสียง Harmonic Chime ความคมชัดสูงเมื่อราคาแตะจุดซื้อสถาบัน
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.soundEnabled}
                    onChange={(e) => setConfig({ ...config, soundEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>

              <div className="flex items-center gap-3 p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/20">
                <button
                  onClick={handleTestSound}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold transition-all shadow-lg shadow-cyan-500/25 active:scale-95"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>กดทดสอบเสียงกระดิ่ง</span>
                </button>
                <span className="text-[11px] text-cyan-200/80">
                  ระบบสังเคราะห์เสียงด้วย Web Audio API ไม่ต้องโหลดไฟล์ mp3 จากภายนอก ทำงานได้ 100%
                </span>
              </div>
            </div>
          )}

          {/* 2. Tab: Discord */}
          {activeTab === 'discord' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <div>
                  <h3 className="font-bold text-white text-sm">ส่งการแจ้งเตือนไปยัง Discord</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    ส่งการ์ด Rich Embed สีเขียวสวยงาม พร้อมบอกราคา, โซนช้อน, Volume Delta และเป้าหมาย TP/SL
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.discordEnabled}
                    onChange={(e) => setConfig({ ...config, discordEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>

              <div className="space-y-2">
                <label className="block text-slate-300 font-semibold">
                  Discord Webhook URL:
                </label>
                <input
                  type="text"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={config.discordWebhookUrl}
                  onChange={(e) => setConfig({ ...config, discordWebhookUrl: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/[0.1] text-white font-mono text-xs focus:outline-none focus:border-indigo-400 placeholder-slate-600"
                />
                <p className="text-[10.5px] text-slate-400">
                  💡 วิธีรับ Webhook: ใน Discord คลิกขวาที่ห้องแชท &gt; Edit Channel &gt; Integrations &gt; Webhooks &gt; New Webhook &gt; Copy Webhook URL
                </p>
              </div>

              <button
                onClick={() => handleTestChannel('discord')}
                disabled={testingChannel === 'discord' || !config.discordWebhookUrl}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold transition-all shadow-lg shadow-indigo-600/25 active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{testingChannel === 'discord' ? 'กำลังส่งทดสอบ...' : 'ทดสอบส่งการ์ดไป Discord'}</span>
              </button>
            </div>
          )}

          {/* 3. Tab: Telegram */}
          {activeTab === 'telegram' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <div>
                  <h3 className="font-bold text-white text-sm">ส่งการแจ้งเตือนไปยัง Telegram</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    แจ้งเตือนเข้า Telegram Bot ส่วนตัวหรือ Group แชทแบบเรียลไทม์
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.telegramEnabled}
                    onChange={(e) => setConfig({ ...config, telegramEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
                </label>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Telegram Bot Token:
                  </label>
                  <input
                    type="text"
                    placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                    value={config.telegramBotToken}
                    onChange={(e) => setConfig({ ...config, telegramBotToken: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/[0.1] text-white font-mono text-xs focus:outline-none focus:border-sky-400 placeholder-slate-600"
                  />
                  <span className="text-[10px] text-slate-500">สร้างบอทได้ฟรีที่ @BotFather บน Telegram</span>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Telegram Chat ID:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 12345678 หรือ -10012345678"
                    value={config.telegramChatId}
                    onChange={(e) => setConfig({ ...config, telegramChatId: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/[0.1] text-white font-mono text-xs focus:outline-none focus:border-sky-400 placeholder-slate-600"
                  />
                  <span className="text-[10px] text-slate-500">ดู Chat ID ของตนเองได้จากบอท @userinfobot</span>
                </div>
              </div>

              <button
                onClick={() => handleTestChannel('telegram')}
                disabled={testingChannel === 'telegram' || !config.telegramBotToken || !config.telegramChatId}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-black font-bold transition-all shadow-lg shadow-sky-500/25 active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{testingChannel === 'telegram' ? 'กำลังส่งทดสอบ...' : 'ทดสอบส่งข้อความไป Telegram'}</span>
              </button>
            </div>
          )}

          {/* 4. Tab: LINE (Bot & Notify) */}
          {activeTab === 'line' && (
            <div className="space-y-5">
              {/* Option A: LINE Official Account / Bot (Messaging API) - RECOMMENDED */}
              <div className="p-4 rounded-xl bg-gradient-to-b from-emerald-950/20 to-black/40 border border-emerald-500/20 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white text-sm">LINE Bot / Messaging API</h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          ⭐ แนะนำสูงสุด
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        ส่งการ์ด Flex Message สีเข้มสวยงามเข้าห้องแชทส่วนตัวหรือกลุ่ม (รองรับระยะยาว LINE ไม่ปิดตัว)
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={config.lineBotEnabled}
                      onChange={(e) => setConfig({ ...config, lineBotEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Channel Access Token (long-lived):
                    </label>
                    <input
                      type="text"
                      placeholder="กรอก Channel Access Token ยาวๆ จาก LINE Developers..."
                      value={config.lineBotChannelToken}
                      onChange={(e) => setConfig({ ...config, lineBotChannelToken: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/[0.1] text-white font-mono text-xs focus:outline-none focus:border-emerald-400 placeholder-slate-600"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Your User ID (หรือ Group ID):
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. U1234567890abcdef1234567890abcdef (ขึ้นต้นด้วยตัว U)"
                      value={config.lineBotUserId}
                      onChange={(e) => setConfig({ ...config, lineBotUserId: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/[0.1] text-white font-mono text-xs focus:outline-none focus:border-emerald-400 placeholder-slate-600"
                    />
                  </div>

                  {/* Quick guide box */}
                  <div className="p-3 rounded-lg bg-black/40 border border-white/[0.06] text-[11px] text-slate-300 space-y-1 leading-relaxed">
                    <p className="font-semibold text-emerald-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> วิธีเชื่อมต่อบอท LINE ง่ายๆ ใน 3 นาที:
                    </p>
                    <ol className="list-decimal pl-4 space-y-0.5 text-slate-400">
                      <li>เข้าเว็บ <a href="https://developers.line.biz" target="_blank" rel="noreferrer" className="text-cyan-400 underline hover:text-cyan-300 inline-flex items-center gap-0.5">LINE Developers <ExternalLink className="w-2.5 h-2.5" /></a> แล้วล็อกอินด้วยบัญชี LINE</li>
                      <li>กด Create Provider &gt; Create a <b>Messaging API</b> channel &gt; แอดเพื่อนบอทด้วย QR Code</li>
                      <li>ไปที่แท็บ <b>Messaging API</b> เลื่อนล่างสุดกด Issue ช่อง <i>Channel access token (long-lived)</i> นำมากรอก</li>
                      <li>ไปที่แท็บ <b>Basic settings</b> เลื่อนล่างสุดคัดลอก <i>Your user ID</i> (ขึ้นต้นด้วยตัว U) นำมากรอก</li>
                    </ol>
                  </div>

                  <button
                    onClick={() => handleTestChannel('line-bot')}
                    disabled={testingChannel === 'line-bot' || !config.lineBotChannelToken || !config.lineBotUserId}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-bold transition-all shadow-lg shadow-emerald-500/25 active:scale-95"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{testingChannel === 'line-bot' ? 'กำลังส่งทดสอบ...' : 'ทดสอบส่งการ์ดเข้าแชท LINE (Messaging API)'}</span>
                  </button>
                </div>
              </div>

              {/* Option B: LINE Notify (Classic / Deprecated) */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-sm">LINE Notify (วิธีดั้งเดิม)</h3>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        ปิดตัว 31 มี.ค. 2025
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      ส่งข้อความแจ้งเตือนผ่านบริการ LINE Notify
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={config.lineEnabled}
                      onChange={(e) => setConfig({ ...config, lineEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="block text-slate-300 font-semibold">
                    LINE Notify Access Token:
                  </label>
                  <input
                    type="text"
                    placeholder="กรอก LINE Notify Token..."
                    value={config.lineNotifyToken}
                    onChange={(e) => setConfig({ ...config, lineNotifyToken: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/[0.1] text-white font-mono text-xs focus:outline-none focus:border-emerald-400 placeholder-slate-600"
                  />
                  <p className="text-[10.5px] text-slate-400">
                    💡 ออก Token ได้ที่เว็บ <code>notify-bot.line.me</code>
                  </p>
                </div>

                <button
                  onClick={() => handleTestChannel('line')}
                  disabled={testingChannel === 'line' || !config.lineNotifyToken}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] disabled:opacity-40 text-slate-300 font-bold transition-all border border-white/[0.1] active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{testingChannel === 'line' ? 'กำลังส่งทดสอบ...' : 'ทดสอบส่งข้อความ LINE Notify'}</span>
                </button>
              </div>
            </div>
          )}

          {/* 5. Tab: Filters & Logic */}
          {activeTab === 'filters' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">คะแนนความน่าเข้าขั้นต่ำ (AI Confidence Score):</span>
                  <span className="font-mono font-bold text-amber-300 text-sm px-2.5 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    &gt;= {config.minConfidenceScore}%
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="90"
                  step="5"
                  value={config.minConfidenceScore}
                  onChange={(e) => setConfig({ ...config, minConfidenceScore: Number(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>50% (เตือนบ่อย)</span>
                  <span>65% (ทยอยสะสม)</span>
                  <span className="text-emerald-300 font-bold">75%+ (แนะนำ: เข้าซื้อได้ โอกาสกำไรสูง)</span>
                </div>
              </div>

              <div className="space-y-2.5">
                <label className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] cursor-pointer hover:bg-white/[0.05] transition-colors">
                  <input
                    type="checkbox"
                    checked={config.requireVolumeConfirmation}
                    onChange={(e) => setConfig({ ...config, requireVolumeConfirmation: e.target.checked })}
                    className="mt-0.5 rounded text-cyan-500 focus:ring-0 w-4 h-4"
                  />
                  <div>
                    <span className="font-bold text-white block">ยืนยันด้วย Volume Flow แรงซื้อ (&gt;= 50%)</span>
                    <span className="text-[11px] text-slate-400">
                      แจ้งเตือนเฉพาะเมื่อสัดส่วนวอลุ่มแรงซื้อเริ่มดูดซับแรงขายและฟื้นตัว เพื่อป้องกันการรับมีดขณะมีแรงเทขายหนัก
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] cursor-pointer hover:bg-white/[0.05] transition-colors">
                  <input
                    type="checkbox"
                    checked={config.requireWickConfirmation}
                    onChange={(e) => setConfig({ ...config, requireWickConfirmation: e.target.checked })}
                    className="mt-0.5 rounded text-cyan-500 focus:ring-0 w-4 h-4"
                  />
                  <div>
                    <span className="font-bold text-white block">ต้องมีไส้ล่างปฏิเสธแรงขาย (Rejection Wick / Pin Bar)</span>
                    <span className="text-[11px] text-slate-400">
                      รอให้แท่งเทียนทิ้งไส้ล่างยาวอย่างน้อย 35% ยืนยันการเด้งตัวของสถาบันก่อนส่งสัญญาณ
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Test Status Banner */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2.5 animate-in fade-in duration-150 ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span className="text-xs font-medium">{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-white/[0.08] bg-[#0c1220]/80">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-xs font-bold text-black bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 transition-all shadow-lg shadow-cyan-500/25 active:scale-95"
          >
            บันทึกการตั้งค่า
          </button>
        </div>
      </div>
    </div>
  );
};
