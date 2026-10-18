import { SmcAnalysisResult, StockNewsItem, AiNewsVerdict, TimeframeSnapshot, MultiTimeframeAnalysis } from '../types/smc';
import { computeVolumeAnalysis } from './volumeEngine';

export type { AiNewsVerdict, TimeframeSnapshot, MultiTimeframeAnalysis };

function computeTfSnapshot(
  tf: '1h' | '4h' | '1d',
  tfData: SmcAnalysisResult | null,
  fallbackPrice: number
): TimeframeSnapshot | null {
  if (!tfData) return null;

  const pd = tfData.premiumDiscount || { high: fallbackPrice * 1.1, low: fallbackPrice * 0.9, equilibrium: fallbackPrice };
  const currentPrice = tfData.summary?.keyLevels?.currentPrice || fallbackPrice || pd.low;
  const rangeSpan = Math.max(0.01, pd.high - pd.low);
  const rawPct = ((currentPrice - pd.low) / rangeSpan) * 100;
  const zonePct = Math.min(100, Math.max(0, Math.round(rawPct)));

  let zone: 'DISCOUNT' | 'EQUILIBRIUM' | 'PREMIUM' = 'EQUILIBRIUM';
  let zoneLabel = 'สมดุล (Equilibrium)';
  if (zonePct <= 45) {
    zone = 'DISCOUNT';
    zoneLabel = 'ของถูก (Discount)';
  } else if (zonePct >= 65) {
    zone = 'PREMIUM';
    zoneLabel = 'ของแพง (Premium)';
  }

  // 1. Trend scoring (max 25)
  const bias = tfData.summary?.overallBias || 'NEUTRAL';
  let trendLabel = 'ไซด์เวย์ 🟡';
  let scoreTrend = 12;
  if (bias === 'STRONG_BULLISH') {
    trendLabel = 'ขาขึ้นแข็งแกร่ง 🟢';
    scoreTrend = 25;
  } else if (bias === 'BULLISH') {
    trendLabel = 'ขาขึ้น 🟢';
    scoreTrend = 20;
  } else if (bias === 'NEUTRAL') {
    trendLabel = 'ไซด์เวย์ 🟡';
    scoreTrend = 12;
  } else if (bias === 'BEARISH') {
    trendLabel = 'ขาลง 🔴';
    scoreTrend = 5;
  } else {
    trendLabel = 'ขาลงรุนแรง 🔴';
    scoreTrend = 1;
  }

  // 2. Zone scoring (max 35)
  let scoreZone = 10;
  if (zonePct <= 30) {
    scoreZone = 35;
  } else if (zonePct <= 50) {
    scoreZone = Math.round(24 + ((50 - zonePct) / 20) * 11);
  } else if (zonePct <= 65) {
    scoreZone = Math.round(14 + ((65 - zonePct) / 15) * 10);
  } else if (zonePct <= 80) {
    scoreZone = Math.round(5 + ((80 - zonePct) / 15) * 9);
  } else {
    scoreZone = Math.max(0, Math.round(5 - ((zonePct - 80) / 20) * 5));
  }

  // 3. Demand / Supply proximity (max 20)
  let scoreDemand = 8;
  const demand = tfData.summary?.nearestDemand;
  const supply = tfData.summary?.nearestSupply;
  if (demand) {
    const distToDemand = ((currentPrice - demand.top) / currentPrice) * 100;
    if (currentPrice >= demand.bottom && currentPrice <= demand.top * 1.015) {
      scoreDemand = 20;
    } else if (distToDemand > 0 && distToDemand <= 2.5) {
      scoreDemand = 16;
    } else if (distToDemand > 0 && distToDemand <= 5.0) {
      scoreDemand = 12;
    }
  }
  if (supply) {
    const distToSupply = ((supply.bottom - currentPrice) / currentPrice) * 100;
    if (distToSupply <= 1.5) {
      scoreDemand = Math.max(0, scoreDemand - 10);
    }
  }

  // 4. Volume Flow Scoring (แรงซื้อ vs แรงขาย) (max 20)
  const volAnalysis = tfData.summary?.volumeAnalysis || computeVolumeAnalysis(tfData.candles || []);
  let scoreVolume = 11;
  const buyRatio = volAnalysis.buyRatio;
  if (buyRatio >= 62) {
    scoreVolume = 20;
  } else if (buyRatio >= 54) {
    scoreVolume = 16;
  } else if (buyRatio >= 47) {
    scoreVolume = 11;
  } else if (buyRatio >= 38) {
    scoreVolume = 6;
  } else {
    scoreVolume = 2;
  }

  const rawScore = Math.round(scoreZone + scoreTrend + scoreDemand + scoreVolume);
  const score = Math.min(99, Math.max(15, rawScore));

  let scoreBadge = '🔴 ไม่ควรเข้า เสี่ยงสูง';
  let badgeColor: 'emerald' | 'yellow' | 'orange' | 'rose' = 'rose';
  if (score >= 75) {
    scoreBadge = '🟢 เข้าซื้อได้ โอกาสกำไรสูง';
    badgeColor = 'emerald';
  } else if (score >= 65) {
    scoreBadge = '🟡 ทยอยสะสม แบ่งไม้เข้าซื้อ';
    badgeColor = 'yellow';
  } else if (score >= 51) {
    scoreBadge = '🟠 ควรรอย่อ ห้ามไล่ราคา';
    badgeColor = 'orange';
  }

  const tfLabels: Record<string, string> = {
    '1h': '1H (Intraday จังหวะสไนเปอร์)',
    '4h': '4H (Swing รอบเทรนด์กลาง)',
    '1d': '1D (Macro กรอบใหญ่สถาบัน)'
  };

  return {
    timeframe: tf,
    timeframeLabel: tfLabels[tf] || tf.toUpperCase(),
    zone,
    zonePct,
    zoneLabel,
    trend: bias,
    trendLabel,
    nearestDemand: demand ? { min: demand.bottom, max: demand.top } : null,
    nearestSupply: supply ? { min: supply.bottom, max: supply.top } : null,
    score,
    scoreBadge,
    badgeColor,
    volumeFlow: {
      buyRatio: volAnalysis.buyRatio,
      sellRatio: volAnalysis.sellRatio,
      biasLabel: volAnalysis.biasLabel,
      scoreContribution: scoreVolume
    }
  };
}

export function analyzeNewsAndSmcConfluence(
  data: SmcAnalysisResult | null,
  newsItems: StockNewsItem[] = [],
  multiTfData?: MultiTimeframeAnalysis | null
): AiNewsVerdict | null {
  if (!data) return null;

  const currentPrice = data.summary.keyLevels.currentPrice;
  const pd = data.premiumDiscount;
  const zone = pd.currentZone;
  const bias = data.summary?.overallBias || 'NEUTRAL';
  const plan = data.summary.simpleTradePlan;
  const buyZone = plan?.buyZone;
  const sellTargets = plan?.sellTargets;
  const cutLoss = plan?.cutLoss;
  const nearestDemand = data.summary.nearestDemand;
  const nearestSupply = data.summary.nearestSupply;
  const symbol = data.symbol;

  // 1. News Analysis Metrics
  const totalNews = newsItems.length;
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let totalSentimentScore = 0;

  newsItems.forEach(item => {
    if (item.sentiment === 'POSITIVE' || item.sentimentScore > 10) {
      positiveCount++;
    } else if (item.sentiment === 'NEGATIVE' || item.sentimentScore < -10) {
      negativeCount++;
    } else {
      neutralCount++;
    }
    totalSentimentScore += item.sentimentScore;
  });

  const validCount = Math.max(1, totalNews);
  const positivePct = Math.round((positiveCount / validCount) * 100);
  const negativePct = Math.round((negativeCount / validCount) * 100);
  const neutralPct = Math.max(0, 100 - positivePct - negativePct);
  const avgNetScore = Math.round(totalSentimentScore / validCount);

  // Determine market mood label
  let moodLabel = 'กระแสข่าวภาพรวมเป็นกลาง (Neutral Sentiment)';
  if (positivePct >= 60) {
    moodLabel = 'กระแสข่าวเชิงบวกคึกคักอย่างเด่นชัด (Strong Bullish Sentiment)';
  } else if (positivePct >= 40 && negativePct < 25) {
    moodLabel = 'มุมมองข่าวค่อนไปทางบวก (Moderately Bullish)';
  } else if (negativePct >= 40) {
    moodLabel = 'กระแสข่าวด้านลบกดดันตลาด (Bearish Pressure)';
  } else if (negativePct >= 25 && positivePct >= 25) {
    moodLabel = 'ข่าวสารมีทั้งปัจจัยบวกและลบผสมผสาน (Mixed News Sentiment)';
  }

  // Extract Top 3 Most Impactful Catalysts
  const topCatalysts = [...newsItems]
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, 3)
    .map(item => ({
      id: item.id,
      title: item.title,
      translatedTitle: item.translatedTitle || item.title,
      impact: item.impactScore >= 60 ? ('HIGH' as const) : ('MEDIUM' as const),
      sentiment: item.sentiment,
      url: item.url,
      publisher: item.publisher,
      timeAgo: item.timeAgo,
      category: item.category,
      sourceTier: item.sourceTier,
    }));

  // Multi-Timeframe Snapshots (1H, 4H, 1D)
  const tf1hData = multiTfData?.['1h'] || (data.timeframe === '1h' ? data : null);
  const tf4hData = multiTfData?.['4h'] || (data.timeframe === '4h' ? data : null);
  const tf1dData = multiTfData?.['1d'] || (data.timeframe === '1d' ? data : null);

  const snap1h = computeTfSnapshot('1h', tf1hData, currentPrice);
  const snap4h = computeTfSnapshot('4h', tf4hData, currentPrice);
  const snap1d = computeTfSnapshot('1d', tf1dData, currentPrice);

  const snapshots: TimeframeSnapshot[] = [snap1h, snap4h, snap1d].filter(Boolean) as TimeframeSnapshot[];

  let alignmentCount = 0;
  snapshots.forEach(s => {
    if (s.score >= 65 || (s.trend.includes('BULLISH') && s.zone !== 'PREMIUM')) {
      alignmentCount++;
    }
  });

  let alignmentText = '🎯 สัญญาณสอดคล้องสมบูรณ์ 3/3 Timeframes (1D + 4H + 1H ทรงเดียวกับสถาบัน)';
  if (alignmentCount === 2) {
    alignmentText = '⚡ สัญญาณสอดคล้อง 2/3 Timeframes (เทรนด์ใหญ่หนุนดี คอนเฟิร์มย่อยใน 1H/4H)';
  } else if (alignmentCount <= 1) {
    alignmentText = '⚠️ สัญญาณ Timeframe ขัดแย้งกัน (1D, 4H, 1H ยังไม่สอดคล้องกัน แนะนำรอยืนยัน)';
  }

  // 2. ประเมินความน่าจะเข้า (Entry Attractiveness Score: 0 - 100)
  // ผสานความมั่นใจ AI รวม 3 Timeframes (1D + 4H + 1H) มารวมกัน
  // ให้น้ำหนักสถาบัน: 1D (40%) + 4H (35%) + 1H (25%) พร้อมโบนัส Confluence
  let calculatedScore = 50;

  if (snapshots.length > 0) {
    // คำนวณค่าเฉลี่ยจริงทางคณิตศาสตร์จาก Timeframe ทั้งหมด (1D, 4H, 1H)
    // ตรงกับตัวเลขที่แสดงบนการ์ดทั้ง 3 Timeframe 100% ไม่ใส่คะแนนบวกเพิ่มหลอก
    const sumScores = snapshots.reduce((acc, s) => acc + s.score, 0);
    const avgScore = sumScores / snapshots.length;

    calculatedScore = Math.round(avgScore);
  } else {
    // Fallback: คำนวณแบบ Timeframe เดี่ยวเดิม (5 แกน: โซน 25 + ดีมานด์ 20 + เทรนด์ 20 + วอลุ่ม 20 + ข่าว 15 = 100)
    const rangeSpan = Math.max(0.01, pd.high - pd.low);
    const pricePct = Math.min(100, Math.max(0, ((currentPrice - pd.low) / rangeSpan) * 100));

    // A. โซนราคา (0-25 คะแนน)
    let scoreZone = 7;
    if (pricePct <= 30) {
      scoreZone = 25;
    } else if (pricePct <= 50) {
      scoreZone = Math.round(18 + ((50 - pricePct) / 20) * 7);
    } else if (pricePct <= 65) {
      scoreZone = Math.round(10 + ((65 - pricePct) / 15) * 8);
    } else if (pricePct <= 80) {
      scoreZone = Math.round(4 + ((80 - pricePct) / 15) * 6);
    } else {
      scoreZone = Math.max(0, Math.round(4 - ((pricePct - 80) / 20) * 4));
    }

    // B. ฐานแนวรับสถาบัน (0-20 คะแนน)
    let scoreDemand = 6;
    if (nearestDemand) {
      const distToDemandPct = ((currentPrice - nearestDemand.top) / currentPrice) * 100;
      if (currentPrice >= nearestDemand.bottom && currentPrice <= nearestDemand.top * 1.01) {
        scoreDemand = 20;
      } else if (distToDemandPct > 0 && distToDemandPct <= 2.5) {
        scoreDemand = 16;
      } else if (distToDemandPct > 0 && distToDemandPct <= 5.0) {
        scoreDemand = 12;
      } else {
        scoreDemand = 8;
      }
    }
    if (nearestSupply) {
      const distToSupplyPct = ((nearestSupply.bottom - currentPrice) / currentPrice) * 100;
      if (distToSupplyPct <= 1.5) {
        scoreDemand = Math.max(0, scoreDemand - 8);
      }
    }

    // C. แนวโน้มและโครงสร้างราคา (0-20 คะแนน)
    let scoreTrend = 10;
    if (bias === 'STRONG_BULLISH') {
      scoreTrend = 20;
    } else if (bias === 'BULLISH') {
      scoreTrend = 16;
    } else if (bias === 'NEUTRAL') {
      scoreTrend = 10;
    } else if (bias === 'BEARISH') {
      scoreTrend = 4;
    } else {
      scoreTrend = 1;
    }

    // D. Volume แรงซื้อ vs แรงขาย (0-20 คะแนน)
    const volAnalysis = data.summary?.volumeAnalysis || computeVolumeAnalysis(data.candles || []);
    let scoreVolume = 11;
    if (volAnalysis.buyRatio >= 62) {
      scoreVolume = 20;
    } else if (volAnalysis.buyRatio >= 54) {
      scoreVolume = 16;
    } else if (volAnalysis.buyRatio >= 47) {
      scoreVolume = 11;
    } else if (volAnalysis.buyRatio >= 38) {
      scoreVolume = 6;
    } else {
      scoreVolume = 2;
    }

    // E. ข่าว (0-15 คะแนน)
    let scoreNews = 8;
    if (positivePct >= 65 && negativePct <= 15) {
      scoreNews = 15;
    } else if (positivePct >= 45 && negativePct <= 25) {
      scoreNews = 12;
    } else if (negativePct >= 40) {
      scoreNews = 2;
    } else if (negativePct >= 25) {
      scoreNews = 5;
    } else {
      scoreNews = 8;
    }

    calculatedScore = Math.round(scoreZone + scoreDemand + scoreTrend + scoreVolume + scoreNews);
  }

  // ตรวจสอบลิมิต 0 - 100 แบบตรงไปตรงมา ไม่มีการบิดเบือนหรือบูสต์คะแนนเทียม
  const confidenceScore = Math.min(99, Math.max(15, calculatedScore));

  const defaultBuyMin = buyZone?.minPrice ?? (currentPrice * 0.95);
  const defaultBuyMax = buyZone?.maxPrice ?? currentPrice;
  const defaultTarget = sellTargets?.target1Year?.price ?? sellTargets?.target6Month?.price ?? (currentPrice * 1.25);
  const defaultCutLoss = cutLoss?.price ?? (currentPrice * 0.92);

  // 3. จัดกลุ่ม 4 ระดับตามที่ผู้ใช้กำหนดอย่างเคร่งครัด (ชุดที่ 1):
  // - 0% - 50%: 🔴 สีแดง "ไม่ควรเข้า เสี่ยงสูง"
  // - 51% - 64%: 🟠 สีส้ม "ควรรอย่อ ห้ามไล่ราคา"
  // - 65% - 74%: 🟡 สีเหลือง "ทยอยสะสม แบ่งไม้เข้าซื้อ"
  // - 75% - 100%: 🟢 สีเขียว "เข้าซื้อได้ โอกาสกำไรสูง"

  let status: AiNewsVerdict['status'] = 'HOLD_WAIT';
  let badgeLabel = '';
  let badgeColor: AiNewsVerdict['badgeColor'] = 'amber';
  let headlineVerdict = '';
  let newsSentimentSummary = '';
  let technicalConfluenceSummary = '';
  let keyTakeaway = '';
  let scoreTier: NonNullable<AiNewsVerdict['scoreTier']>;

  const multiTfSummary = snapshots.length >= 3
    ? `ผสาน 3 Timeframes: 1D (${snap1d?.scoreBadge}), 4H (${snap4h?.scoreBadge}), 1H (${snap1h?.scoreBadge})`
    : '';

  if (confidenceScore >= 75) {
    // 🟢 75 - 100: สีเขียว เข้าซื้อได้ โอกาสกำไรสูง
    status = 'STRONG_BUY';
    badgeLabel = '🟢 เข้าซื้อได้ โอกาสกำไรสูง';
    badgeColor = 'emerald';
    scoreTier = {
      range: '75-100',
      color: 'emerald',
      label: 'เข้าซื้อได้ โอกาสกำไรสูง',
      advice: 'เข้าซื้อได้ โอกาสกำไรสูง โครงสร้างราคาและแรงซื้อสถาบันหนุนหลังเต็มที่ มั่นใจรอบการทำกำไร',
    };
    headlineVerdict = `สัญญาณไฟเขียว (ความน่าเข้า ${confidenceScore}%)! เข้าซื้อได้ โอกาสกำไรสูง ${multiTfSummary ? 'วิเคราะห์ 3 Timeframes ประสานกัน ' : ''}ราคากำลังอยู่ในโซนของถูกสถาบัน ผสานแรงซื้อหนุนและโมเมนตัมบวกชัดเจน`;
    newsSentimentSummary = `กระแสข่าวต่างประเทศเป็นบวก (${positivePct}%) ไร้ปัจจัยลบรุนแรง พื้นฐานและผลดำเนินงานสนับสนุนการเติบโต`;
    technicalConfluenceSummary = multiTfSummary
      ? `${multiTfSummary} — ราคาอยู่ในโซนของถูก (Discount) ใกล้ฐานช้อนซื้อสถาบัน $${defaultBuyMin.toFixed(2)} – $${defaultBuyMax.toFixed(2)} ได้เปรียบต้นทุนสูง ความเสี่ยงขาลงต่ำ`
      : `ราคาอยู่ในโซนของถูก (Discount) ใกล้ฐานช้อนซื้อสถาบัน $${defaultBuyMin.toFixed(2)} – $${defaultBuyMax.toFixed(2)} ได้เปรียบต้นทุนสูง ความเสี่ยงขาลงต่ำ`;
    keyTakeaway = `เข้าสะสมตามกรอบ Buy Zone ได้ทันที โครงสร้างแกร่ง เข้าซื้อได้ โอกาสกำไรสูง มุ่งหน้าสู่เป้าหมาย`;
  } else if (confidenceScore >= 65) {
    // 🟡 65 - 74: สีเหลือง ทยอยสะสม แบ่งไม้เข้าซื้อ
    status = 'BUY_ON_DIP';
    badgeLabel = '🟡 ทยอยสะสม แบ่งไม้เข้าซื้อ';
    badgeColor = 'yellow';
    scoreTier = {
      range: '65-74',
      color: 'yellow',
      label: 'ทยอยสะสม แบ่งไม้เข้าซื้อ',
      advice: 'ทยอยสะสม แบ่งไม้เข้าซื้อ สะสมตามแนวรับ ไม่ควรทุ่มหมดหน้าตัก เพราะตลาดยังรอคอนเฟิร์ม',
    };
    headlineVerdict = `สัญญาณระดับปานกลาง-ดี (ความน่าเข้า ${confidenceScore}%)! ทยอยสะสม แบ่งไม้เข้าซื้อ ราคาทรงตัวในโซนสมดุล แนะนำทยอยแบ่งไม้ ไม่ควรทุ่มหมดหน้าตัก`;
    newsSentimentSummary = `ข่าวสารเป็นกลางถึงบวก (${neutralPct}% เป็นกลาง, ${positivePct}% บวก) ตลาดยังรอปัจจัยผลักดันเพิ่มเติม`;
    technicalConfluenceSummary = multiTfSummary
      ? `${multiTfSummary} — ราคาวิ่งอยู่ใกล้กึ่งกลางสมดุล (Equilibrium) ให้ตั้งรับเมื่อราคาย่อตัวลงมาใกล้แนวรับ $${defaultBuyMin.toFixed(2)}`
      : `ราคาวิ่งอยู่ใกล้กึ่งกลางสมดุล (Equilibrium) ให้ตั้งรับเมื่อราคาย่อตัวลงมาใกล้แนวรับ $${defaultBuyMin.toFixed(2)}`;
    keyTakeaway = `เน้นวินัยทยอยสะสม แบ่งไม้เข้าซื้อ 25-30% เป็นไม้หยั่งเชิง แล้วรอซื้อเพิ่มเมื่อราคาย่อตัว`;
  } else if (confidenceScore >= 51) {
    // 🟠 51 - 64: สีส้ม ควรรอย่อ ห้ามไล่ราคา
    status = 'HOLD_WAIT';
    badgeLabel = '🟠 ควรรอย่อ ห้ามไล่ราคา';
    badgeColor = 'orange';
    scoreTier = {
      range: '51-64',
      color: 'orange',
      label: 'ควรรอย่อ ห้ามไล่ราคา',
      advice: 'ควรรอย่อ ห้ามไล่ราคาเด็ดขาด เพราะราคาลอยสูงในโซนแพง เสี่ยงโดนเทขาย',
    };
    headlineVerdict = `ระวังราคาตึงตัว (ความน่าเข้า ${confidenceScore}%)! ควรรอย่อ ห้ามไล่ราคา ราคาปัจจุบันลอยอยู่ในโซนของแพง เสี่ยงโดนสถาบันเทขายทำกำไร`;
    newsSentimentSummary = `ข่าวอาจดูดี แต่ราคาได้รับรู้ข่าวบวกไปมากแล้ว การเข้าซื้อตรงนี้มีความเสี่ยงติดดอยระยะสั้น`;
    technicalConfluenceSummary = multiTfSummary
      ? `${multiTfSummary} — กราฟลอยอยู่เหนือระดับ 50% และกำลังประชิดแนวต้าน Supply ให้รอราคาพักฐานย่อตัวลงมาก่อน`
      : `กราฟลอยอยู่เหนือระดับ 50% และกำลังประชิดแนวต้าน Supply ให้รอราคาพักฐานย่อตัวลงมาก่อน`;
    keyTakeaway = `ควรรอย่อ ห้ามไล่ราคาเด็ดขาด ให้ใจเย็นๆ ตั้งรับรอซื้อในกรอบ Buy Zone $${defaultBuyMin.toFixed(2)} – $${defaultBuyMax.toFixed(2)}`;
  } else {
    // 🔴 0 - 50: สีแดง ไม่ควรเข้า เสี่ยงสูง
    status = 'AVOID_CAUTION';
    badgeLabel = '🔴 ไม่ควรเข้า เสี่ยงสูง';
    badgeColor = 'rose';
    scoreTier = {
      range: '0-50',
      color: 'rose',
      label: 'ไม่ควรเข้า เสี่ยงสูง',
      advice: 'ไม่ควรเข้า เสี่ยงสูง ไม่ควรเข้าซื้อ ณ เวลานี้ มีแรงกดดันจากแนวโน้มขาลงหรือหลุดแนวรับสถาบัน',
    };
    headlineVerdict = `ความเสี่ยงสูง (ความน่าเข้า ${confidenceScore}%)! ไม่ควรเข้า เสี่ยงสูง ตลาดมีแรงกดดันจากข่าวลบหรือราคาหลุดแนวรับสถาบัน ไม่แนะนำให้เข้าซื้อ`;
    newsSentimentSummary = `พบกระแสข่าวเชิงลบและคำเตือนถึง ${negativePct}% ซึ่งอาจกดดันผลการดำเนินงานและราคาหุ้นในระยะสั้น`;
    technicalConfluenceSummary = multiTfSummary
      ? `${multiTfSummary} — โครงสร้างราคาอ่อนแอหรือยังไม่พบคอนเฟิร์มการกลับตัวที่ปลอดภัย`
      : `แนวโน้มเป็นขาลงหรือกำลังปรับฐานลงมา ยังไม่พบสัญญาณแท่งเทียนกลับตัว (CHoCH) ที่ชัดเจน`;
    keyTakeaway = `ไม่ควรเข้า เสี่ยงสูง ชะลอการลงทุนเด็ดขาด ถือเงินสดรอความชัดเจน ไม่ควรรับมีดขณะที่สถาบันยังรินของขาย`;
  }

  // 4. Action Guidance
  const actionGuidance = {
    forNewBuyers: confidenceScore >= 75
      ? `เข้าซื้อได้ โอกาสกำไรสูง สามารถเข้าซื้อไม้ที่ 1 (50%) ได้ทันทีในกรอบ $${defaultBuyMin.toFixed(2)} – $${defaultBuyMax.toFixed(2)} และสำรองอีก 50% เผื่อราคาย่อตัวทดสอบก้นโซน Demand`
      : confidenceScore >= 65
      ? `ทยอยสะสม แบ่งไม้เข้าซื้อ แบ่งไม้เข้าซื้อ 25–30% เพื่อหยั่งเชิง แล้วรอซื้อเพิ่มเมื่อราคาย่อตัวลงมาใกล้ขอบล่าง Buy Zone`
      : confidenceScore >= 51
      ? `ควรรอย่อ ห้ามไล่ราคาเด็ดขาด ให้ใจเย็นๆ รอราคาย่อตัวลงมาในกรอบ Buy Zone $${defaultBuyMin.toFixed(2)} – $${defaultBuyMax.toFixed(2)}`
      : `ไม่ควรเข้า เสี่ยงสูง ชะลอการเข้าซื้อ 100% หลีกเลี่ยงการรับมีดจนกว่าราคาจะสร้างฐานรับสถาบันและมีสัญญาณกลับตัวชัดเจน`,

    forHolders: plan?.holdAdvice
      ? `${plan.holdAdvice.actionTitle}: ${plan.holdAdvice.actionPlan}`
      : confidenceScore >= 75
      ? `ถือต่อรันเทรนด์ (Hold) มุ่งสู่เป้าหมายระยะ 6 เดือนที่ $${defaultTarget.toFixed(2)} ปล่อยให้ผลกำไรเติบโตตามรอบสถาบัน`
      : confidenceScore >= 65
      ? `ถือต่อได้ แต่หากมีกำไรแล้ว สามารถพิจารณาแบ่งขายล็อกกำไร 25% ที่แนวต้าน แล้วถือส่วนที่เหลือลุ้นรอบใหญ่`
      : confidenceScore >= 51
      ? `หากมีกำไร ควรแบ่งขายล็อกกำไร 30–50% ในโซนของแพงนี้ และตั้งจุด Trailing Stop เพื่อปกป้องกำไร`
      : `เฝ้าระวังจุดตัดขาดทุน (Stop Loss) ที่ $${defaultCutLoss.toFixed(2)} อย่างเคร่งครัด หากราคาปิดหลุดแนวรับให้ตัดขาดทุนเพื่อรักษาเงินต้น`,

    invalidationPrice: defaultCutLoss,
    targetPrice: defaultTarget,
  };

  const primaryVol = data.summary?.volumeAnalysis || computeVolumeAnalysis(data.candles || []);
  const volumeFlow: AiNewsVerdict['volumeFlow'] = {
    buyRatio: primaryVol.buyRatio,
    sellRatio: primaryVol.sellRatio,
    netDelta: primaryVol.netDelta,
    biasLabel: primaryVol.biasLabel,
    scoreContribution: primaryVol.scoreContribution || 10,
  };

  return {
    status,
    badgeLabel,
    badgeColor,
    confidenceScore,
    scoreTier,
    headlineVerdict,
    newsSentimentSummary,
    technicalConfluenceSummary,
    keyTakeaway,
    marketMood: {
      label: moodLabel,
      positiveCount,
      negativeCount,
      neutralCount,
      positivePct,
      negativePct,
      neutralPct,
      netScore: avgNetScore,
    },
    actionGuidance,
    topCatalysts,
    volumeFlow,
    multiTimeframe: snapshots.length > 0 ? {
      snapshots,
      alignmentText,
      alignmentCount,
    } : undefined,
  };
}
