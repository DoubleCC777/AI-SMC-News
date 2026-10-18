export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume?: number;
  sellVolume?: number;
  buyRatio?: number; // 0 - 100 (%)
  sellRatio?: number; // 0 - 100 (%)
  delta?: number; // buyVolume - sellVolume
}

export type StructureBreakType = 'BOS' | 'CHoCH';
export type BiasType = 'bullish' | 'bearish';

export interface MarketStructureBreak {
  type: StructureBreakType;
  bias: BiasType;
  price: number;
  time: number;
  sourceTime: number;
  sourceIndex: number;
  breakIndex: number;
  isInternal?: boolean; // LuxAlgo: true = Internal Structure (dashed), false = Swing Structure (solid)
}

export interface SwingPoint {
  type: 'high' | 'low';
  price: number;
  time: number;
  index: number;
  isInternal: boolean;
  label?: string; // LuxAlgo: HH, LH, HL, LL
  strengthLabel?: string; // LuxAlgo: Strong High, Weak High, Strong Low, Weak Low
}

export interface OrderBlock {
  id: string;
  type: BiasType;
  top: number;
  bottom: number;
  startTime: number;
  endTime: number;
  startIndex: number;
  endIndex?: number;
  mitigated: boolean;
  mitigatedTime?: number;
  volume: number;
  strength: number; // 1-5 rating
  isInternal?: boolean; // LuxAlgo: Internal OB vs Swing OB
}

export interface FairValueGap {
  id: string;
  type: BiasType;
  top: number;
  bottom: number;
  startTime: number;
  endTime: number;
  startIndex: number;
  endIndex?: number;
  mitigated: boolean;
  fillPercent: number;
}

export interface PremiumDiscount {
  high: number;
  low: number;
  equilibrium: number;
  premiumZone: { from: number; to: number };
  discountZone: { from: number; to: number };
  currentZone: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
}

export interface LiquidityLevel {
  type: 'EQH' | 'EQL';
  price: number;
  time: number;
  label: string;
}

export interface KeyLevels {
  currentPrice: number;
  change24h: number;
  changePercent: number;
  support1: number;
  resistance1: number;
  slSuggestion: number;
  tpSuggestion: number;
}

export interface TradeSetup {
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entryLow: number | null;
  entryHigh: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: number | null;
  confidence: number;
  note: string;
}

export interface SellZone {
  minPrice: number;
  maxPrice: number;
  label: string;
  rationale: string;
}

export interface HoldAdvice {
  decision: 'HOLD_FOR_HIGHER' | 'SELL_ZONE_REACHED' | 'ACCUMULATE_MORE';
  actionTitle: string;
  badgeText: string;
  theme: 'emerald' | 'rose' | 'amber' | 'cyan' | 'blue';
  reason: string;
  higherTarget: number;
  higherGainPercent: number;
  actionPlan: string;
}

export interface SimpleTradePlan {
  status: 'BUY_NOW' | 'WAIT_DIP' | 'HOLD_FOR_PROFIT' | 'TAKE_PROFIT_NOW';
  statusBadge: string;
  statusDescription: string;
  themeColor: 'emerald' | 'amber' | 'blue' | 'rose';
  sellZone?: SellZone;
  holdAdvice?: HoldAdvice;
  buyZone: {
    minPrice: number;
    maxPrice: number;
    tranche1: { label: string; price: number; advice: string };
    tranche2: { label: string; price: number; advice: string };
  };
  sellTargets: {
    target6Month?: { price: number; gainPercent: number; note: string };
    target1Year: { price: number; gainPercent: number; note: string };
  };
  cutLoss: {
    price: number;
    lossPercent: number;
    note: string;
  };
  riskRewardRatio: number;
  plainThaiSummary: string;
  methodology?: {
    buyZoneRationale: string;
    targetRationale: string;
    cutLossRationale: string;
    activeRange: { high: number; low: number; span: number };
    fibOte: { fib382: number; fib500: number; fib618: number; fib786: number };
    fibExpansion: { ext1272: number; ext1618: number };
  };
}

export interface VolumeAnalysis {
  recentBuyVolume: number;
  recentSellVolume: number;
  recentTotalVolume: number;
  buyRatio: number; // 0 - 100 (%)
  sellRatio: number; // 0 - 100 (%)
  netDelta: number; // recentBuyVolume - recentSellVolume
  bias: 'STRONG_BUY' | 'MODERATE_BUY' | 'NEUTRAL' | 'MODERATE_SELL' | 'STRONG_SELL';
  biasLabel: string;
  scoreContribution?: number; // 0 - 20
  latestCandle?: {
    buyRatio: number;
    sellRatio: number;
    buyVolume: number;
    sellVolume: number;
    delta: number;
  };
}

export interface LuxAlgoTradeSetup {
  setupType: 'LONG' | 'SHORT' | 'WAIT';
  title: string;
  theme: 'emerald' | 'rose' | 'amber';
  entryZone: {
    min: number;
    max: number;
    label: string;
    rationale: string;
  };
  stopLoss: {
    price: number;
    label: string;
    lossPercent: number;
    rationale: string;
  };
  takeProfit1: {
    price: number;
    label: string;
    gainPercent: number;
    rationale: string;
  };
  takeProfit2: {
    price: number;
    label: string;
    gainPercent: number;
    rationale: string;
  };
  riskRewardRatio: number;
  confirmationChecklist: string[];
}

export interface SmcSummary {
  overallBias: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH';
  currentTrend: string;
  latestStructure: string;
  zoneStatus: string;
  nearestDemand: OrderBlock | null;
  nearestSupply: OrderBlock | null;
  nearestFvg: FairValueGap | null;
  thaiAnalysis: string;
  tradingActionAdvice: string;
  keyLevels: KeyLevels;
  tradeSetup: TradeSetup;
  simpleTradePlan?: SimpleTradePlan;
  luxAlgoTradeSetup?: LuxAlgoTradeSetup;
  volumeAnalysis?: VolumeAnalysis;
  luxAlgoMetadata?: {
    engine: string;
    scriptUrl: string;
    swingLength: number;
    internalLength: number;
    currentTrend: 'bullish' | 'bearish';
    internalTrend: 'bullish' | 'bearish';
    strongHigh?: number;
    weakHigh?: number;
    strongLow?: number;
    weakLow?: number;
  };
}

export interface SmcAnalysisResult {
  symbol: string;
  name: string;
  timeframe: string;
  currency: string;
  candles: Candle[];
  swings: SwingPoint[];
  breaks: MarketStructureBreak[];
  orderBlocks: OrderBlock[];
  fvgs: FairValueGap[];
  premiumDiscount: PremiumDiscount;
  liquidityLevels: LiquidityLevel[];
  summary: SmcSummary;
}

export interface StockQuote {
  symbol: string;
  name: string;
  thaiName: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  marketCap: number;
  smcBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trendBadge: string;
}

export interface StockNewsItem {
  id: string;
  title: string;
  translatedTitle: string;
  translated: boolean;
  publisher: string;
  url: string;
  publishedAt: number;
  sentimentScore: number;
  impactScore: number;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  timeAgo?: string;
  category?: 'BREAKING' | 'EARNINGS' | 'ANALYST_TARGET' | 'FED_MACRO' | 'TECH_AI' | 'INSIDER_DEAL' | 'MARKET_RADAR';
  sourceTier?: 'TIER1_GLOBAL' | 'THAI_TOP' | 'WIRE';
}

export interface AiNewsVerdict {
  status: 'STRONG_BUY' | 'BUY_ON_DIP' | 'HOLD_WAIT' | 'AVOID_CAUTION';
  badgeLabel: string;
  badgeColor: 'emerald' | 'amber' | 'rose' | 'cyan' | 'orange' | 'yellow';
  confidenceScore: number;
  scoreTier?: {
    range: '0-50' | '51-64' | '65-74' | '75-100';
    color: 'rose' | 'orange' | 'yellow' | 'emerald';
    label: string;
    advice: string;
  };
  headlineVerdict: string;
  newsSentimentSummary: string;
  technicalConfluenceSummary: string;
  keyTakeaway: string;
  marketMood: {
    label: string;
    positiveCount: number;
    negativeCount: number;
    neutralCount: number;
    positivePct: number;
    negativePct: number;
    neutralPct: number;
    netScore: number;
  };
  actionGuidance: {
    forNewBuyers: string;
    forHolders: string;
    invalidationPrice: number | null;
    targetPrice: number | null;
  };
  topCatalysts: {
    id: string;
    title: string;
    translatedTitle: string;
    impact: 'HIGH' | 'MEDIUM';
    sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    url: string;
    publisher: string;
    timeAgo?: string;
    category?: 'BREAKING' | 'EARNINGS' | 'ANALYST_TARGET' | 'FED_MACRO' | 'TECH_AI' | 'INSIDER_DEAL' | 'MARKET_RADAR';
    sourceTier?: 'TIER1_GLOBAL' | 'THAI_TOP' | 'WIRE';
  }[];
  multiTimeframe?: {
    snapshots: TimeframeSnapshot[];
    alignmentText: string;
    alignmentCount: number;
  };
  volumeFlow?: {
    buyRatio: number;
    sellRatio: number;
    netDelta: number;
    biasLabel: string;
    scoreContribution: number;
  };
}

export interface TimeframeSnapshot {
  timeframe: '1h' | '4h' | '1d';
  timeframeLabel: string;
  zone: 'DISCOUNT' | 'EQUILIBRIUM' | 'PREMIUM';
  zonePct: number;
  zoneLabel: string;
  trend: string;
  trendLabel: string;
  nearestDemand: { min: number; max: number } | null;
  nearestSupply: { min: number; max: number } | null;
  score: number;
  scoreBadge: string;
  badgeColor: 'emerald' | 'yellow' | 'orange' | 'rose';
  volumeFlow?: {
    buyRatio: number;
    sellRatio: number;
    biasLabel: string;
    scoreContribution: number;
  };
}

export interface MultiTimeframeAnalysis {
  '1h': SmcAnalysisResult | null;
  '4h': SmcAnalysisResult | null;
  '1d': SmcAnalysisResult | null;
}
