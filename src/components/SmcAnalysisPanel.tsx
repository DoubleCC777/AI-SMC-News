import React, { useState, useMemo } from 'react';
import { SmcAnalysisResult, StockNewsItem, MultiTimeframeAnalysis } from '../types/smc';
import { analyzeNewsAndSmcConfluence } from '../utils/aiNewsAdvisor';
import { computeVolumeAnalysis } from '../utils/volumeEngine';
import {
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BookOpen,
  ShieldAlert,
  Sparkles,
  Layers,
  Compass,
  CheckCircle2,
  Zap,
  Clock,
  Radio,
  Activity,
  Award,
  TrendingUp,
  Flame,
  ArrowUpRight
} from 'lucide-react';

const getCategoryBadge = (category?: string) => {
  switch (category) {
    case 'BREAKING':
      return { label: 'ด่วนที่สุด', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
    case 'EARNINGS':
      return { label: 'ผลประกอบการ', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
    case 'ANALYST_TARGET':
      return { label: 'ปรับเป้าราคา', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' };
    case 'FED_MACRO':
      return { label: 'เฟด & ดอกเบี้ย', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    case 'TECH_AI':
      return { label: 'AI & ชิปเทค', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' };
    case 'INSIDER_DEAL':
      return { label: 'ผู้บริหาร/ดีล', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
    default:
      return { label: 'เรดาร์สถาบัน', color: 'bg-slate-700/40 text-slate-300 border-white/10' };
  }
};

const getPublisherStyle = (publisher: string, _tier?: string) => {
  const p = publisher.toLowerCase();
  if (p.includes('bloomberg')) return 'bg-purple-500/20 text-purple-300 border-purple-500/30 font-bold';
  if (p.includes('reuters')) return 'bg-amber-500/20 text-amber-300 border-amber-500/30 font-bold';
  if (p.includes('cnbc')) return 'bg-blue-500/20 text-blue-300 border-blue-500/30 font-bold';
  if (p.includes('wsj') || p.includes('wall street')) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30 font-bold';
  if (p.includes('financial times') || p.includes('ft')) return 'bg-pink-500/20 text-pink-300 border-pink-500/30 font-bold';
  if (p.includes('yahoo')) return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 font-bold';
  if (p.includes('ข่าวหุ้น') || p.includes('กรุงเทพธุรกิจ') || p.includes('hoonsmart')) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-bold';
  return 'bg-white/[0.05] text-slate-400 border-white/10';
};

interface SmcAnalysisPanelProps {
  data: SmcAnalysisResult | null;
  newsItems?: StockNewsItem[];
  newsLoading?: boolean;
  multiTfData?: MultiTimeframeAnalysis | null;
}

const SmcAnalysisPanelComponent: React.FC<SmcAnalysisPanelProps> = ({
  data,
  newsItems = [],
  multiTfData = null,
}) => {
  const [showGuide, setShowGuide] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);

  const aiVerdict = useMemo(() => {
    return analyzeNewsAndSmcConfluence(data, newsItems, multiTfData);
  }, [data, newsItems, multiTfData]);

  const sortedNewsList = useMemo(() => {
    if (!newsItems || newsItems.length === 0) return [];
    return [...newsItems].sort((a, b) => (b.impactScore ?? 75) - (a.impactScore ?? 75)).slice(0, 15);
  }, [newsItems]);

  // Multi-Timeframe Volume Flow & Entry Attractiveness % (1H, 4H, 1D)
  const threeTfVolumeFlow = useMemo(() => {
    const tfList: Array<{ tf: '1h' | '4h' | '1d'; label: string; subLabel: string }> = [
      { tf: '1h', label: '1H', subLabel: '1 ชม.' },
      { tf: '4h', label: '4H', subLabel: '4 ชม.' },
      { tf: '1d', label: '1D', subLabel: '1 วัน' },
    ];

    return tfList.map(({ tf, label, subLabel }) => {
      // 1. Check snapshot in aiVerdict
      const snap = aiVerdict?.multiTimeframe?.snapshots?.find((s) => s.timeframe === tf);
      if (snap) {
        return {
          tf,
          label,
          subLabel,
          buyRatio: snap.volumeFlow?.buyRatio ?? 50,
          sellRatio: snap.volumeFlow?.sellRatio ?? 50,
          biasLabel: snap.volumeFlow?.biasLabel ?? 'สมดุล',
          entryScore: snap.score,
          scoreBadge: snap.scoreBadge,
          badgeColor: snap.badgeColor,
        };
      }

      // 2. Check multiTfData
      const tfResult = multiTfData?.[tf] || (data?.timeframe === tf ? data : null);
      if (tfResult?.candles && tfResult.candles.length > 0) {
        const va = tfResult.summary?.volumeAnalysis || computeVolumeAnalysis(tfResult.candles);
        const buyRatio = va.buyRatio;
        const trend = (tfResult.summary as any)?.trendBias || tfResult.summary?.overallBias || 'NEUTRAL';
        const isBull = trend.includes('BULL');
        const fallbackScore = Math.min(96, Math.max(20, Math.round(buyRatio * 0.5 + (isBull ? 35 : 15))));
        const badgeColor: 'emerald' | 'yellow' | 'orange' | 'rose' =
          fallbackScore >= 75 ? 'emerald' : fallbackScore >= 65 ? 'yellow' : fallbackScore >= 51 ? 'orange' : 'rose';
        const scoreBadge =
          fallbackScore >= 75 ? '🟢 เข้าซื้อได้ โอกาสกำไรสูง' : fallbackScore >= 65 ? '🟡 ทยอยสะสม แบ่งไม้เข้าซื้อ' : fallbackScore >= 51 ? '🟠 ควรรอย่อ ห้ามไล่ราคา' : '🔴 ไม่ควรเข้า เสี่ยงสูง';
        return {
          tf,
          label,
          subLabel,
          buyRatio: va.buyRatio,
          sellRatio: va.sellRatio,
          biasLabel: va.biasLabel,
          entryScore: fallbackScore,
          scoreBadge,
          badgeColor,
        };
      }

      // 3. Fallback to current data
      const currentVa = data?.summary?.volumeAnalysis || (data?.candles ? computeVolumeAnalysis(data.candles) : null);
      const buyRatio = currentVa?.buyRatio ?? 50;
      const fallbackScore = Math.min(90, Math.max(30, Math.round(buyRatio * 0.8)));
      const badgeColor: 'emerald' | 'yellow' | 'orange' | 'rose' =
        fallbackScore >= 75 ? 'emerald' : fallbackScore >= 65 ? 'yellow' : fallbackScore >= 51 ? 'orange' : 'rose';
      const scoreBadge =
        fallbackScore >= 75 ? '🟢 เข้าซื้อได้ โอกาสกำไรสูง' : fallbackScore >= 65 ? '🟡 ทยอยสะสม แบ่งไม้เข้าซื้อ' : fallbackScore >= 51 ? '🟠 ควรรอย่อ ห้ามไล่ราคา' : '🔴 ไม่ควรเข้า เสี่ยงสูง';
      return {
        tf,
        label,
        subLabel,
        buyRatio,
        sellRatio: 100 - buyRatio,
        biasLabel: currentVa?.biasLabel ?? 'สมดุล',
        entryScore: fallbackScore,
        scoreBadge,
        badgeColor,
      };
    });
  }, [aiVerdict, multiTfData, data]);

  // จุดสะสมที่วิเคราะห์น่าเข้า 75%+ (ผสานความมั่นใจ AI รวม 3 Timeframes: 1H + 4H + 1D)
  const buyZone75 = useMemo(() => {
    if (!data) return null;
    const summary = data.summary;
    const simpleTradePlan = summary?.simpleTradePlan;

    // คำนวณความมั่นใจ AI รวม 3 Timeframes (1D, 4H, 1H) ตรงตามจริง
    const scores3Tf = threeTfVolumeFlow.map(t => t.entryScore).filter(s => s > 0);
    const avgScore = scores3Tf.length > 0
      ? Math.round(scores3Tf.reduce((a, b) => a + b, 0) / scores3Tf.length)
      : (aiVerdict?.confidenceScore ?? 70);
    const combinedAiConfidence = avgScore;

    // รวมระดับราคาจุดสะสมจาก Demand ทั้ง 3 Timeframes
    let minP = 0;
    let maxP = 0;

    const demandsFrom3Tf = (aiVerdict?.multiTimeframe?.snapshots || [])
      .map(s => s.nearestDemand)
      .filter((d): d is { min: number; max: number } => Boolean(d && d.min > 0 && d.max > d.min));

    if (demandsFrom3Tf.length > 0) {
      maxP = Number(Math.max(...demandsFrom3Tf.map(d => d.max)).toFixed(2));
      minP = Number(Math.min(...demandsFrom3Tf.map(d => d.min)).toFixed(2));
      if (maxP > minP * 1.08) {
        maxP = Number((minP * 1.055).toFixed(2));
      }
    } else if (summary?.luxAlgoTradeSetup?.entryZone && summary.luxAlgoTradeSetup.setupType === 'LONG') {
      minP = Number(summary.luxAlgoTradeSetup.entryZone.min.toFixed(2));
      maxP = Number(summary.luxAlgoTradeSetup.entryZone.max.toFixed(2));
    } else if (simpleTradePlan?.buyZone) {
      minP = simpleTradePlan.buyZone.minPrice;
      maxP = simpleTradePlan.buyZone.maxPrice;
    } else {
      minP = Number((data.summary.keyLevels.currentPrice * 0.96).toFixed(2));
      maxP = Number((data.summary.keyLevels.currentPrice * 0.99).toFixed(2));
    }

    if (maxP < minP) {
      const tmp = maxP;
      maxP = minP;
      minP = tmp;
    }

    return {
      minPrice: minP,
      maxPrice: maxP,
      tranche1Price: maxP,
      tranche2Price: minP,
      label: `มั่นใจ ${combinedAiConfidence}% (รวม 3 TF)`,
      score: combinedAiConfidence
    };
  }, [aiVerdict, data, threeTfVolumeFlow]);

  if (!data) return null;

  const { summary, premiumDiscount, keyLevels, simpleTradePlan } = {
    summary: data.summary,
    premiumDiscount: data.premiumDiscount,
    keyLevels: data.summary.keyLevels,
    simpleTradePlan: data.summary.simpleTradePlan,
  };

  const isThai = data.symbol.endsWith('.BK') || ['KBANK', 'SCB', 'TISCO', 'BBL'].includes(data.symbol.replace(/\.BK$/i, '').toUpperCase());
  const curr = isThai ? '฿' : '$';

  // Premium / Discount calculation
  const totalRange = Math.max(0.01, premiumDiscount.high - premiumDiscount.low);
  const pricePositionPct = Math.min(
    100,
    Math.max(0, ((keyLevels.currentPrice - premiumDiscount.low) / totalRange) * 100)
  );

  // คำนวณจุดเทรด LuxAlgo SMC
  const luxSetup = summary.luxAlgoTradeSetup;

  // 1. จุดเข้า (Entry Zone)
  const entryMin = luxSetup?.entryZone?.min ?? buyZone75?.minPrice ?? simpleTradePlan?.buyZone?.minPrice ?? Number((keyLevels.currentPrice * 0.96).toFixed(2));
  const entryMax = luxSetup?.entryZone?.max ?? buyZone75?.maxPrice ?? simpleTradePlan?.buyZone?.maxPrice ?? Number((keyLevels.currentPrice * 0.99).toFixed(2));
  const entryLabel = luxSetup?.entryZone?.label ?? buyZone75?.label ?? 'Discount Zone (< 50% Equilibrium)';

  // 2. จุดคัท (Stop Loss)
  const slPrice = luxSetup?.stopLoss?.price ?? simpleTradePlan?.cutLoss?.price ?? Number((entryMin * 0.985).toFixed(2));
  const slLossPct = luxSetup?.stopLoss?.lossPercent ?? simpleTradePlan?.cutLoss?.lossPercent ?? -9.4;
  const slLabel = luxSetup?.stopLoss?.label ?? 'ใต้ Strong Low สถาบัน';

  // 3. จุดออก (Take Profit)
  const tp2Price = luxSetup?.takeProfit2?.price ?? simpleTradePlan?.sellZone?.maxPrice ?? simpleTradePlan?.sellTargets?.target1Year?.price ?? Number((keyLevels.currentPrice * 1.165).toFixed(2));
  const tp1Price = luxSetup?.takeProfit1?.price ?? simpleTradePlan?.sellZone?.minPrice ?? Number(((entryMax + tp2Price) / 2).toFixed(2));
  const tpPrice = tp2Price; // Main TP target ($287.20)
  const tpGainPct = luxSetup?.takeProfit2?.gainPercent ?? simpleTradePlan?.sellTargets?.target1Year?.gainPercent ?? 16.5;
  const tpLabel = luxSetup?.takeProfit2?.label ?? 'TP2: Weak High (เป้าหมายสถาบัน)';
  const rrRatio = luxSetup?.riskRewardRatio ?? simpleTradePlan?.riskRewardRatio ?? '1.76';

  // คำนวณจุดขาย TP (Take Profit) และระยะห่าง (เตือนตั้งแต่ -2%)
  const distToTpPercent = tpPrice > 0 && keyLevels?.currentPrice
    ? Number((((tpPrice - keyLevels.currentPrice) / keyLevels.currentPrice) * 100).toFixed(1))
    : 0;
  const isReachedTp = Boolean(keyLevels?.currentPrice && tpPrice > 0 && keyLevels.currentPrice >= tpPrice);
  const isNearTp = Boolean(!isReachedTp && tpPrice > 0 && distToTpPercent <= 2.0);

  return (
    <div className="bg-[#070a12] border border-white/[0.08] rounded-2xl p-3.5 sm:p-4 flex flex-col h-full overflow-y-auto space-y-3.5 no-scrollbar shadow-2xl shadow-black/50 select-none min-w-[340px] sm:min-w-[380px] shrink-0">
      
      {/* ─────────────────────────────────────────────────────────────
          1. SLEEK HEADER (เรียบหรู สบายตา ไม่มีแท็บรกตา)
      ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/[0.07] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 via-cyan-500/10 to-teal-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0 shadow-inner">
            <Compass className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-extrabold text-white tracking-tight truncate">
                {data.symbol.replace(/\.BK$/i, '')} บทวิเคราะห์สถาบัน
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.06] text-slate-400 border border-white/[0.08] uppercase">
                {data.timeframe}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400 font-sans truncate">
              <span className="text-cyan-400 font-semibold">Smart Money Concepts</span>
              <a
                href="https://th.tradingview.com/v/CnB3fSph/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[9.5px] font-bold hover:bg-sky-500/25 transition-all inline-flex items-center gap-0.5"
                title="เปิดดูอินดิเคเตอร์ต้นฉบับ LuxAlgo SMC บน TradingView"
              >
                <span>LuxAlgo</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. AI MASTER VERDICT & MARKET PULSE (กระชับ ชัดเจน ฟันธงทันที)
      ────────────────────────────────────────────────────────────── */}
      {aiVerdict && (
        <div
          className={`p-3.5 rounded-2xl border transition-all duration-300 relative overflow-hidden shadow-lg shrink-0 ${
            aiVerdict.badgeColor === 'emerald'
              ? 'bg-gradient-to-br from-emerald-950/25 via-[#0c1219] to-[#070a12] border-emerald-500/35 shadow-emerald-950/20'
              : aiVerdict.badgeColor === 'yellow'
              ? 'bg-gradient-to-br from-yellow-950/25 via-[#13120c] to-[#070a12] border-yellow-500/35 shadow-yellow-950/20'
              : aiVerdict.badgeColor === 'orange'
              ? 'bg-gradient-to-br from-orange-950/25 via-[#14100c] to-[#070a12] border-orange-500/35 shadow-orange-950/20'
              : aiVerdict.badgeColor === 'rose'
              ? 'bg-gradient-to-br from-rose-950/25 via-[#140c11] to-[#070a12] border-rose-500/35 shadow-rose-950/20'
              : 'bg-gradient-to-br from-cyan-950/25 via-[#091118] to-[#070a12] border-cyan-500/35 shadow-cyan-950/20'
          }`}
        >
          {/* Signal Headline & Badge + AI Confidence */}
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 w-full">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border shadow-sm ${
                    aiVerdict.badgeColor === 'emerald'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : aiVerdict.badgeColor === 'yellow'
                      ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                      : aiVerdict.badgeColor === 'orange'
                      ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                      : aiVerdict.badgeColor === 'rose'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
                  <span>{aiVerdict.badgeLabel}</span>
                </span>

                {/* % ความมั่นใจ AI ไปขวาสุด - เปลี่ยนสีตาม status */}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-xs shrink-0 ml-auto shadow-sm border transition-colors ${
                    aiVerdict.badgeColor === 'emerald'
                      ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                      : aiVerdict.badgeColor === 'yellow'
                      ? 'bg-yellow-500/15 border-yellow-500/35 text-yellow-300'
                      : aiVerdict.badgeColor === 'orange'
                      ? 'bg-orange-500/15 border-orange-500/35 text-orange-300'
                      : aiVerdict.badgeColor === 'rose'
                      ? 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                      : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                  }`}
                >
                  <Sparkles
                    className={`w-3.5 h-3.5 animate-pulse ${
                      aiVerdict.badgeColor === 'emerald'
                        ? 'text-emerald-400'
                        : aiVerdict.badgeColor === 'yellow'
                        ? 'text-yellow-400'
                        : aiVerdict.badgeColor === 'orange'
                        ? 'text-orange-400'
                        : aiVerdict.badgeColor === 'rose'
                        ? 'text-rose-400'
                        : 'text-cyan-400'
                    }`}
                  />
                  <span
                    className={`text-[10px] font-sans ${
                      aiVerdict.badgeColor === 'emerald'
                        ? 'text-emerald-400/80'
                        : aiVerdict.badgeColor === 'yellow'
                        ? 'text-yellow-400/80'
                        : aiVerdict.badgeColor === 'orange'
                        ? 'text-orange-400/80'
                        : aiVerdict.badgeColor === 'rose'
                        ? 'text-rose-400/80'
                        : 'text-cyan-400/80'
                    }`}
                  >
                    ความมั่นใจ AI
                  </span>
                  <span className="font-extrabold text-xs">{aiVerdict.confidenceScore}%</span>
                </div>
              </div>

              <p className="text-sm font-bold text-white leading-snug">
                {aiVerdict.headlineVerdict}
              </p>
            </div>
          </div>

          {/* Action Directives: คนยังไม่มีหุ้น vs คนมีหุ้นอยู่แล้ว */}
          <div className="mt-3 pt-2.5 border-t border-white/[0.08] grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <span className="text-[10px] font-mono font-bold text-emerald-400 block mb-0.5">
                🟢 คนยังไม่มีหุ้น:
              </span>
              <span className="text-slate-200 text-[11px] leading-relaxed block">
                {aiVerdict.actionGuidance.forNewBuyers}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <span className="text-[10px] font-mono font-bold text-cyan-400 block mb-0.5">
                🔵 คนมีหุ้นอยู่แล้ว:
              </span>
              <span className="text-slate-200 text-[11px] leading-relaxed block">
                {aiVerdict.actionGuidance.forHolders}
              </span>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              แรงซื้อ vs แรงขาย & ความน่าเข้า แยกแสดง 3 Timeframes (1H • 4H • 1D)
          ────────────────────────────────────────────────────────────── */}
          <div className="mt-3 pt-2.5 border-t border-white/[0.08] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-200 font-mono text-[11px]">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>แรงซื้อ vs แรงขาย & ความน่าเข้า 3 Timeframes</span>
              </div>
              {aiVerdict.multiTimeframe && (
                <span className="text-[9.5px] font-mono px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-slate-300 font-bold">
                  {aiVerdict.multiTimeframe.alignmentCount === 3
                    ? '🎯 สอดคล้อง 3/3 TF'
                    : aiVerdict.multiTimeframe.alignmentCount === 2
                    ? '⚡ สอดคล้อง 2/3 TF'
                    : '⚠️ สัญญาณขัดแย้ง'}
                </span>
              )}
            </div>

            {/* 3-Timeframe Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
              {threeTfVolumeFlow.map(({ tf, label, subLabel, buyRatio, sellRatio, entryScore, scoreBadge, badgeColor }) => {
                const isBuyDominant = buyRatio >= 50;
                return (
                  <div
                    key={tf}
                    className={`p-2.5 rounded-xl border transition-all flex flex-col justify-between gap-2 shadow-md ${
                      badgeColor === 'emerald'
                        ? 'bg-gradient-to-b from-emerald-950/30 to-[#070e12] border-emerald-500/30 shadow-emerald-950/20 hover:border-emerald-500/50'
                        : badgeColor === 'yellow'
                        ? 'bg-gradient-to-b from-yellow-950/30 to-[#121107] border-yellow-500/30 shadow-yellow-950/20 hover:border-yellow-500/50'
                        : badgeColor === 'orange'
                        ? 'bg-gradient-to-b from-orange-950/30 to-[#140e07] border-orange-500/30 shadow-orange-950/20 hover:border-orange-500/50'
                        : 'bg-gradient-to-b from-rose-950/30 to-[#14070a] border-rose-500/30 shadow-rose-950/20 hover:border-rose-500/50'
                    }`}
                  >
                    {/* Header: Timeframe + % น่าเข้า Badge */}
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isBuyDominant
                              ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]'
                              : 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.7)]'
                          }`}
                        />
                        <span className="font-extrabold text-white text-[13px] font-mono tracking-tight">{label}</span>
                      </div>
                      <div
                        className={`px-2 py-0.5 rounded-md text-[10.5px] font-mono font-bold whitespace-nowrap border shrink-0 ${
                          badgeColor === 'emerald'
                            ? 'text-emerald-300 bg-emerald-500/20 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                            : badgeColor === 'yellow'
                            ? 'text-yellow-300 bg-yellow-500/20 border-yellow-500/40'
                            : badgeColor === 'orange'
                            ? 'text-orange-300 bg-orange-500/20 border-orange-500/40'
                            : 'text-rose-300 bg-rose-500/20 border-rose-500/40'
                        }`}
                      >
                        น่าเข้า {entryScore}%
                      </div>
                    </div>

                    {/* AI Guidance Chip: Sleek full-width centered pill (No truncate) */}
                    <div
                      className={`w-full min-h-[30px] py-1 px-1 rounded-lg border text-center font-bold leading-tight shadow-sm transition-all flex items-center justify-center gap-1 ${
                        badgeColor === 'emerald'
                          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                          : badgeColor === 'yellow'
                          ? 'bg-yellow-500/10 border-yellow-500/25 text-yellow-300'
                          : badgeColor === 'orange'
                          ? 'bg-orange-500/10 border-orange-500/25 text-orange-300'
                          : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                      }`}
                      title={scoreBadge}
                    >
                      <span className="text-[9.5px] leading-tight text-center">{scoreBadge}</span>
                    </div>

                    {/* Two-tone Buy/Sell Volume Bar */}
                    <div className="space-y-1 pt-1 border-t border-white/[0.06]">
                      <div className="h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden flex shadow-inner">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                          style={{ width: `${buyRatio}%` }}
                          title={`แรงซื้อ: ${buyRatio}%`}
                        />
                        <div
                          className="h-full bg-gradient-to-r from-rose-500 to-red-500 transition-all duration-300"
                          style={{ width: `${sellRatio}%` }}
                          title={`แรงขาย: ${sellRatio}%`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono leading-none">
                        <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                          <span className="text-[8px]">▲</span> {buyRatio}%
                        </span>
                        <span className="text-[9px] text-slate-500 font-sans">แรงซื้อ/ขาย</span>
                        <span className="text-rose-400 font-bold flex items-center gap-0.5">
                          {sellRatio}% <span className="text-[8px]">▼</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. จุดเข้า - จุดออก ตามโมเดล LUXALGO SMC
      ────────────────────────────────────────────────────────────── */}
      {(luxSetup || simpleTradePlan) && (
        <div className="space-y-2.5 pt-1 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="text-xs font-bold text-sky-200 uppercase tracking-wider font-mono">
                จุดเข้า - จุดออก ตามโมเดล LUXALGO SMC
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-bold">
              R:R 1 : {rrRatio}
            </span>
          </div>

          {/* 3-Column Clean Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 shrink-0">
            {/* Card 1: จุดเข้า (Entry Zone) */}
            <div className="relative overflow-hidden bg-gradient-to-b from-[#0a1814] via-[#081210] to-[#050b0a] border border-emerald-500/30 hover:border-emerald-500/50 rounded-2xl p-2.5 sm:p-3 flex flex-col justify-between shadow-[0_4px_20px_rgba(0,0,0,0.35)] transition-all duration-300 group">
              <div className="absolute -top-12 -right-12 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[11px] shrink-0">🟢</span>
                  <span className="text-[12px] font-sans font-extrabold text-emerald-300 uppercase tracking-tight whitespace-nowrap">
                    จุดเข้า (Entry Zone)
                  </span>
                </div>
                <div className="font-mono text-[12.5px] min-[360px]:text-[13px] sm:text-[14px] font-black text-emerald-300 tracking-tight whitespace-nowrap drop-shadow-[0_0_8px_rgba(52,211,153,0.25)]">
                  {curr}{entryMin.toFixed(2)} - {curr}{entryMax.toFixed(2)}
                </div>
                <div className="text-[9px] font-mono text-emerald-400/90 mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block shrink-0" />
                  <span className="truncate">{entryLabel}</span>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-emerald-500/15 space-y-1 text-[10.5px] font-mono">
                <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-emerald-500/[0.05] border border-emerald-500/15">
                  <span className="text-slate-400 flex items-center gap-1 whitespace-nowrap">
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300">ไม้ 1</span>
                    <span className="text-[9px] text-slate-400">50%</span>
                  </span>
                  <span className="text-emerald-300 font-bold whitespace-nowrap">{curr}{entryMax.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-emerald-500/[0.05] border border-emerald-500/15">
                  <span className="text-slate-400 flex items-center gap-1 whitespace-nowrap">
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300">ไม้ 2</span>
                    <span className="text-[9px] text-slate-400">50%</span>
                  </span>
                  <span className="text-emerald-300 font-bold whitespace-nowrap">{curr}{entryMin.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Card 2: จุดคัท (Stop Loss) */}
            <div className="relative overflow-hidden bg-gradient-to-b from-[#180a0e] via-[#12070a] to-[#0a0406] border border-rose-500/30 hover:border-rose-500/50 rounded-2xl p-2.5 sm:p-3 flex flex-col justify-between shadow-[0_4px_20px_rgba(0,0,0,0.35)] transition-all duration-300 group">
              <div className="absolute -top-12 -right-12 w-24 h-24 bg-rose-500/10 rounded-full blur-xl pointer-events-none" />
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px] shrink-0">🛑</span>
                    <span className="text-[12px] font-sans font-extrabold text-rose-300 uppercase tracking-tight whitespace-nowrap">
                      จุดคัท (Stop Loss)
                    </span>
                  </div>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 shrink-0">
                    {slLossPct}%
                  </span>
                </div>
                <div className="font-mono text-[13px] min-[360px]:text-[14px] sm:text-base font-black text-rose-300 tracking-tight whitespace-nowrap drop-shadow-[0_0_8px_rgba(244,63,94,0.25)]">
                  {curr}{slPrice.toFixed(2)}
                </div>
                <div className="text-[9px] font-mono text-rose-400/90 mt-1 flex items-center gap-1">
                  <span className="shrink-0">🛡️</span>
                  <span className="truncate">{slLabel}</span>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-rose-500/15 space-y-1 text-[10.5px] font-mono">
                <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-rose-500/[0.05] border border-rose-500/15">
                  <span className="text-slate-400 whitespace-nowrap">ความเสี่ยง</span>
                  <span className="text-rose-400 font-bold whitespace-nowrap">{slLossPct}%</span>
                </div>
                <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-rose-500/[0.05] border border-rose-500/15">
                  <span className="text-slate-400 whitespace-nowrap">กลยุทธ์</span>
                  <span className="text-slate-200 font-bold whitespace-nowrap">รักษาเงินต้น</span>
                </div>
              </div>
            </div>

            {/* Card 3: จุดออก (Take Profit) พร้อมสถานะเตือนตั้งแต่ -2% */}
            <div className="relative overflow-hidden bg-gradient-to-b from-[#08151c] via-[#061016] to-[#04090d] border border-cyan-500/30 hover:border-cyan-500/50 rounded-2xl p-2.5 sm:p-3 flex flex-col justify-between shadow-[0_4px_20px_rgba(0,0,0,0.35)] transition-all duration-300 group">
              <div className="absolute -top-12 -right-12 w-24 h-24 bg-cyan-500/10 rounded-full blur-xl pointer-events-none" />
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px] shrink-0">🎯</span>
                    <span className="text-[12px] font-sans font-extrabold text-cyan-300 uppercase tracking-tight whitespace-nowrap">
                      จุดออก (Take Profit)
                    </span>
                  </div>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-emerald-400 shrink-0 font-bold">
                    +{tpGainPct}%
                  </span>
                </div>
                <div className="font-mono text-[13px] min-[360px]:text-[14px] sm:text-base font-black text-cyan-300 tracking-tight whitespace-nowrap drop-shadow-[0_0_8px_rgba(6,182,212,0.25)]">
                  {curr}{tpPrice.toFixed(2)}
                </div>
                <div className="text-[9px] font-mono mt-1 flex items-center gap-1">
                  {isReachedTp ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping inline-block shrink-0" />
                      <span className="text-rose-300 font-bold whitespace-nowrap">🚨 ถึงจุด TP แล้ว! แนะนำขาย</span>
                    </>
                  ) : isNearTp ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block shrink-0" />
                      <span className="text-amber-300 font-bold whitespace-nowrap">⚠️ ใกล้ถึง TP แล้ว! (เตือนที่ -2%)</span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80 inline-block shrink-0" />
                      <span className="text-cyan-300/90 truncate">{tpLabel || `ห่างจุด TP อีก +${distToTpPercent.toFixed(1)}%`}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-cyan-500/15 space-y-1 text-[10.5px] font-mono">
                <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-cyan-500/[0.05] border border-cyan-500/15">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 shrink-0">ไม้ 1</span>
                    <span className="text-[9px] text-slate-400 truncate">TP 1</span>
                  </div>
                  <span className="text-cyan-300 font-bold whitespace-nowrap ml-1 shrink-0">{curr}{tp1Price.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-cyan-500/[0.05] border border-cyan-500/15">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 shrink-0">ไม้ 2</span>
                    <span className="text-[9px] text-slate-400 truncate">TP 2</span>
                  </div>
                  <span className="text-emerald-300 font-bold whitespace-nowrap ml-1 shrink-0">{curr}{tp2Price.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 💡 การประเมิน: ควรถือต่อ หรือ ควรขายแล้ว? */}
          {simpleTradePlan.holdAdvice && (
            <div
              className={`p-3 rounded-xl border text-xs leading-relaxed flex flex-col gap-1.5 shadow-md ${
                simpleTradePlan.holdAdvice.theme === 'rose'
                  ? 'bg-gradient-to-r from-rose-950/30 via-[#140c11] to-[#0b0f19] border-rose-500/40'
                  : simpleTradePlan.holdAdvice.theme === 'cyan'
                  ? 'bg-gradient-to-r from-cyan-950/30 via-[#0a131b] to-[#0b0f19] border-cyan-500/40'
                  : 'bg-gradient-to-r from-emerald-950/30 via-[#0a1813] to-[#0b0f19] border-emerald-500/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11.5px] font-bold text-white flex items-center gap-1">
                    💡 <b>การประเมิน:</b> ควรถือต่อ หรือ ควรขายแล้ว?
                  </span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border shadow-sm ${
                    simpleTradePlan.holdAdvice.theme === 'rose'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : simpleTradePlan.holdAdvice.theme === 'cyan'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {simpleTradePlan.holdAdvice.badgeText}
                </span>
              </div>

              <p className="text-slate-200 text-[11.5px] pt-0.5 leading-relaxed">
                {simpleTradePlan.holdAdvice.reason}
              </p>

              <div className="text-[11px] text-cyan-300/90 font-sans pt-1.5 border-t border-white/[0.08] flex items-start gap-1.5">
                <span className="font-bold text-white shrink-0">⚡ คำแนะนำ:</span>
                <span className="text-slate-300 leading-normal">{simpleTradePlan.holdAdvice.actionPlan}</span>
              </div>
            </div>
          )}

          {/* Plain Thai Strategy Summary */}
          {simpleTradePlan.plainThaiSummary && (
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-slate-300 leading-relaxed flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span>{simpleTradePlan.plainThaiSummary}</span>
            </div>
          )}

          {/* Collapsible Technical Details (Fibonacci & OTE) */}
          {simpleTradePlan.methodology && (
            <div>
              <button
                onClick={() => setShowMethodology(!showMethodology)}
                className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] transition-all text-[11px] text-slate-400 hover:text-slate-200"
              >
                <span className="flex items-center gap-1.5 font-mono">
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                  <span>สูตรคำนวณและระดับ Fibonacci OTE สถาบัน</span>
                </span>
                {showMethodology ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showMethodology && (
                <div className="mt-1.5 p-2.5 bg-black/40 border border-white/[0.06] rounded-xl text-xs space-y-2 font-mono text-slate-300">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Active Swing Range:</span>
                    <span className="font-bold text-white">
                      {curr}{simpleTradePlan.methodology.activeRange.low} – {curr}{simpleTradePlan.methodology.activeRange.high}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[10px] text-center pt-1 border-t border-white/[0.05]">
                    <div className="bg-white/[0.02] p-1 rounded border border-white/[0.04]">
                      <span className="text-slate-500 block">Fib 0.382</span>
                      <span className="text-emerald-400 font-bold">{curr}{simpleTradePlan.methodology.fibOte.fib382}</span>
                    </div>
                    <div className="bg-white/[0.02] p-1 rounded border border-white/[0.04]">
                      <span className="text-slate-500 block">Fib 0.500</span>
                      <span className="text-amber-400 font-bold">{curr}{simpleTradePlan.methodology.fibOte.fib500}</span>
                    </div>
                    <div className="bg-white/[0.02] p-1 rounded border border-white/[0.04]">
                      <span className="text-slate-500 block">Fib 0.618</span>
                      <span className="text-emerald-400 font-bold">{curr}{simpleTradePlan.methodology.fibOte.fib618}</span>
                    </div>
                    <div className="bg-white/[0.02] p-1 rounded border border-white/[0.04]">
                      <span className="text-slate-500 block">Fib 0.786</span>
                      <span className="text-cyan-400 font-bold">{curr}{simpleTradePlan.methodology.fibOte.fib786}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. INSTITUTIONAL STRUCTURE & PRICE ZONE (กระชับ รวมในแผงเดียว)
      ────────────────────────────────────────────────────────────── */}
      <div className="bg-[#090d16] border border-white/[0.07] rounded-xl p-3 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-300 text-[11px] uppercase tracking-wider font-mono">
            โครงสร้างราคา & จุดสถาบัน
          </span>
          <span
            className={`font-mono text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${
              premiumDiscount.currentZone === 'DISCOUNT'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                : premiumDiscount.currentZone === 'PREMIUM'
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                : 'bg-slate-700/40 text-slate-300 border-white/10'
            }`}
          >
            {premiumDiscount.currentZone === 'DISCOUNT'
              ? '🟢 โซนของถูก'
              : premiumDiscount.currentZone === 'PREMIUM'
              ? '🔴 โซนของแพง'
              : '🟡 สมดุล'} ({pricePositionPct.toFixed(0)}%)
          </span>
        </div>

        {/* Minimal Price Slider */}
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full bg-slate-800 relative overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-rose-500"
              style={{ width: `${pricePositionPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span className="text-emerald-400">ของถูก {curr}{premiumDiscount.low.toFixed(1)}</span>
            <span className="text-slate-400">สมดุล {curr}{premiumDiscount.equilibrium.toFixed(1)}</span>
            <span className="text-rose-400">ของแพง {curr}{premiumDiscount.high.toFixed(1)}</span>
          </div>
        </div>

        {/* Institutional Demand / Supply Blocks */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/[0.05] text-[11px] font-mono">
          <div className="bg-emerald-500/[0.05] border border-emerald-500/15 p-2 rounded-lg">
            <span className="text-[10px] text-emerald-400 font-sans block font-semibold">
              🟢 จุดช้อนซื้อ (Demand):
            </span>
            <span className="font-bold text-white block mt-0.5">
              {summary.nearestDemand
                ? `${curr}${summary.nearestDemand.bottom.toFixed(1)}–${curr}${summary.nearestDemand.top.toFixed(1)}`
                : 'ไม่มี Demand ใต้ราคา'}
            </span>
          </div>

          <div className="bg-rose-500/[0.05] border border-rose-500/15 p-2 rounded-lg">
            <span className="text-[10px] text-rose-400 font-sans block font-semibold">
              🔴 จุดขายทำกำไร (Supply):
            </span>
            <span className="font-bold text-white block mt-0.5">
              {summary.nearestSupply
                ? `${curr}${summary.nearestSupply.bottom.toFixed(1)}–${curr}${summary.nearestSupply.top.toFixed(1)}`
                : 'ราคาทดสอบ High เดิม'}
            </span>
          </div>
        </div>

        {/* LuxAlgo SMC Structural Confluence & Levels */}
        {summary.luxAlgoMetadata && (
          <div className="pt-2 border-t border-white/[0.05] space-y-2 text-[11px] font-mono">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-400 font-sans flex items-center gap-1">
                <span className="text-sky-400 font-bold">LuxAlgo SMC</span>
                <span>ระดับโครงสร้างสำคัญ:</span>
              </span>
              <span className="text-slate-500 font-mono">
                Swing len {summary.luxAlgoMetadata.swingLength} / Int len {summary.luxAlgoMetadata.internalLength}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10.5px]">
              {summary.luxAlgoMetadata.strongLow && (
                <div className="bg-emerald-500/10 border border-emerald-500/25 px-2 py-1.5 rounded-lg flex justify-between items-center shadow-sm">
                  <div>
                    <span className="text-emerald-400 font-sans font-bold block text-[10px]">🛡️ Strong Low</span>
                    <span className="text-[9px] text-slate-400 font-sans">แนวรับสถาบัน (จุด SL)</span>
                  </div>
                  <span className="text-white font-mono font-bold text-xs">{curr}{summary.luxAlgoMetadata.strongLow.toFixed(2)}</span>
                </div>
              )}
              {summary.luxAlgoMetadata.weakHigh && (
                <div className="bg-rose-500/10 border border-rose-500/25 px-2 py-1.5 rounded-lg flex justify-between items-center shadow-sm">
                  <div>
                    <span className="text-rose-400 font-sans font-bold block text-[10px]">🎯 Weak High</span>
                    <span className="text-[9px] text-slate-400 font-sans">เป้าสถาบันกวาด (จุด TP)</span>
                  </div>
                  <span className="text-white font-mono font-bold text-xs">{curr}{summary.luxAlgoMetadata.weakHigh.toFixed(2)}</span>
                </div>
              )}
              {summary.luxAlgoMetadata.strongHigh && (
                <div className="bg-rose-500/10 border border-rose-500/25 px-2 py-1.5 rounded-lg flex justify-between items-center shadow-sm">
                  <div>
                    <span className="text-rose-400 font-sans font-bold block text-[10px]">🛡️ Strong High</span>
                    <span className="text-[9px] text-slate-400 font-sans">แนวต้านสถาบัน (จุด SL)</span>
                  </div>
                  <span className="text-white font-mono font-bold text-xs">{curr}{summary.luxAlgoMetadata.strongHigh.toFixed(2)}</span>
                </div>
              )}
              {summary.luxAlgoMetadata.weakLow && (
                <div className="bg-emerald-500/10 border border-emerald-500/25 px-2 py-1.5 rounded-lg flex justify-between items-center shadow-sm">
                  <div>
                    <span className="text-emerald-400 font-sans font-bold block text-[10px]">🎯 Weak Low</span>
                    <span className="text-[9px] text-slate-400 font-sans">เป้าสถาบันกวาด (จุด TP)</span>
                  </div>
                  <span className="text-white font-mono font-bold text-xs">{curr}{summary.luxAlgoMetadata.weakLow.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* EQH / EQL Liquidity status */}
            {data.liquidityLevels && data.liquidityLevels.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-[10px]">
                <span className="text-slate-500 font-sans">สภาพคล่องสะสม:</span>
                {data.liquidityLevels.slice(-3).map((lvl, idx) => (
                  <span
                    key={idx}
                    className={`px-1.5 py-0.5 rounded font-mono font-bold border ${
                      lvl.type === 'EQH'
                        ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    {lvl.type} {curr}{lvl.price.toFixed(2)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 📋 เช็กลิสต์สัญญาณยืนยันตามตำรา LuxAlgo */}
        {summary.luxAlgoTradeSetup?.confirmationChecklist && summary.luxAlgoTradeSetup.confirmationChecklist.length > 0 && (
          <div className="pt-2 border-t border-white/[0.08] p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1 text-[10.5px]">
            <span className="font-bold text-slate-300 block mb-1">📋 เช็กลิสต์สัญญาณยืนยันตามตำรา LuxAlgo:</span>
            {summary.luxAlgoTradeSetup.confirmationChecklist.map((item, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-slate-300 leading-snug">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        )}

        {/* LuxAlgo SMC Detailed Narrative */}
        {summary.thaiAnalysis && (
          <div className="pt-2 border-t border-white/[0.05] p-2.5 rounded-lg bg-sky-950/20 border border-sky-500/20 text-[11px] text-slate-200 leading-relaxed space-y-1">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="flex items-center gap-1 font-bold text-sky-400 font-sans">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span>บทวิเคราะห์สถาบัน Smart Money Concepts [LuxAlgo]:</span>
              </span>
              <a
                href="https://th.tradingview.com/v/CnB3fSph/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9.5px] font-mono text-sky-400/80 hover:text-sky-300 underline flex items-center gap-0.5"
              >
                <span>TradingView</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
            <p className="text-slate-300 font-sans text-[11px] leading-relaxed whitespace-pre-line">
              {summary.thaiAnalysis}
            </p>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          5. GLOBAL TIER-1 NEWS FEED (ศูนย์รวมข่าวสดระดับโลก)
      ────────────────────────────────────────────────────────────── */}
      {sortedNewsList.length > 0 && (
        <div className="pt-2 border-t border-white/[0.07] shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                ข่าวสดระดับโลก Tier-1 ({sortedNewsList.length})
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono text-cyan-400">
              <Clock className="w-2.5 h-2.5" />
              <span>Real-time</span>
            </div>
          </div>

          {/* Clean News Stream */}
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1 no-scrollbar shrink-0">
            {sortedNewsList.map((item, index) => {
              const catBadge = getCategoryBadge(item.category);
              const pubStyle = getPublisherStyle(item.publisher, item.sourceTier);
              const isTop = index < 2 || (item.impactScore ?? 0) >= 85;

              return (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`block p-2.5 rounded-xl border transition-all group ${
                    isTop
                      ? 'bg-gradient-to-r from-amber-500/[0.06] via-[#0d121c] to-[#080b12] border-amber-500/25 hover:border-amber-400/50'
                      : 'bg-[#080b14] hover:bg-[#0c101c] border-white/[0.05] hover:border-cyan-500/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1 text-[9.5px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-1.5 py-0.2 rounded border ${pubStyle}`}>
                        {item.publisher}
                      </span>
                      <span className={`px-1.5 py-0.2 rounded border ${catBadge.color}`}>
                        {catBadge.label}
                      </span>
                    </div>
                    <span className="text-slate-500 font-mono text-[9px]">{item.timeAgo || 'ล่าสุด'}</span>
                  </div>

                  <span className="text-xs font-medium text-slate-200 group-hover:text-cyan-300 leading-snug block">
                    {item.translatedTitle}
                    <ExternalLink className="ml-1 inline h-2.5 w-2.5 text-slate-500 group-hover:text-cyan-400" />
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          6. SMC GLOSSARY (พจนานุกรมแปลคำศัพท์สถาบัน - พับเก็บได้)
      ────────────────────────────────────────────────────────────── */}
      <div className="pt-1 border-t border-white/[0.06] shrink-0">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] text-xs font-medium text-slate-400 hover:text-slate-200 transition-all border border-white/[0.05]"
        >
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span>พจนานุกรมคำศัพท์สถาบัน SMC</span>
          </div>
          {showGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showGuide && (
          <div className="mt-2 p-3 rounded-xl bg-[#090d16] border border-white/[0.05] text-xs space-y-2 text-slate-300 leading-relaxed font-sans animate-fadeIn">
            <p>
              <strong className="text-emerald-400">🟢 จุดช้อนซื้อ (Demand / Order Block):</strong> บริเวณที่กองทุนหรือสถาบันตั้งรับซื้อของจำนวนมาก เป็นแนวรับหลักที่แข็งแกร่ง
            </p>
            <p>
              <strong className="text-rose-400">🔴 จุดขายทำกำไร (Supply / Order Block):</strong> บริเวณที่สถาบันตั้งรอเทขายทำกำไร เป็นแนวต้านสำคัญ
            </p>
            <p>
              <strong className="text-cyan-400">🟢 โซนของถูก (Discount Zone):</strong> ราคาต่ำกว่าจุดสมดุล 50% เหมาะสำหรับการสะสมหุ้นเพราะได้เปรียบต้นทุน
            </p>
            <p>
              <strong className="text-amber-400">🔴 โซนของแพง (Premium Zone):</strong> ราคาสูงกว่า 50% เสี่ยงติดดอย ไม่ควรไล่ราคา
            </p>
            <p>
              <strong className="text-slate-200">⚡ FVG (Fair Value Gap):</strong> ช่องว่างราคาที่เกิดจากการเคาะซื้อ/ขายรุนแรง มักเป็นแม่เหล็กดึงราคามาทดสอบ
            </p>
            <p>
              <strong className="text-slate-200">🚀 BOS:</strong> การทะลุแนวต้านเดิม ยืนยันแนวโน้มขาขึ้นต่อเนื่อง
            </p>
            <p>
              <strong className="text-slate-200">⚠️ CHoCH:</strong> สัญญาณเตือนแรกของการกลับตัวของทิศทางราคา
            </p>
          </div>
        )}
      </div>

    </div>
  );
};

export const SmcAnalysisPanel = React.memo(SmcAnalysisPanelComponent);
