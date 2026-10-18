import { StockNewsItem } from '../../src/types/smc.js';

type YahooNews = {
  uuid?: string;
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number;
};

type RawNews = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt: number;
};

const TIER1_GLOBAL_PUBLISHERS = [
  'Bloomberg',
  'Reuters',
  'CNBC',
  'The Wall Street Journal',
  'Wall Street Journal',
  'WSJ',
  'Financial Times',
  'FT',
  'MarketWatch',
  'Barron\'s',
  'Seeking Alpha',
  'Associated Press',
  'AP',
  'Yahoo Finance',
  'Forbes',
  'Fortune',
  'Benzinga',
  'Investor\'s Business Daily',
  'IBD',
  'The Motley Fool',
  'TipRanks',
  'Zacks'
];

const THAI_TOP_PUBLISHERS = [
  'ข่าวหุ้นธุรกิจออนไลน์',
  'ข่าวหุ้น',
  'กรุงเทพธุรกิจ',
  'HoonSmart',
  'ฐานเศรษฐกิจ',
  'โพสต์ทูเดย์',
  'ตลาดหลักทรัพย์แห่งประเทศไทย',
  'SET',
  'Bangkok Post',
  'ทันหุ้น',
  'The Standard Wealth'
];

const POSITIVE_WORDS = [
  'beat', 'surge', 'rally', 'gain', 'growth', 'upgrade', 'record', 'profit',
  'strong', 'bullish', 'approval', 'launch', 'raises', 'outperform', 'advantage',
  'hit', 'trillion', 'soar', 'buy', 'dividend', 'all-time high', 'breakout', 'hike'
];

const NEGATIVE_WORDS = [
  'miss', 'fall', 'drop', 'plunge', 'cut', 'downgrade', 'loss', 'weak',
  'bearish', 'lawsuit', 'probe', 'recall', 'layoff', 'warns', 'warning',
  'investigation', 'decline', 'tumble', 'slump', 'antitrust', 'penalty'
];

const HIGH_IMPACT_WORDS = [
  'earnings', 'guidance', 'revenue', 'profit', 'lawsuit', 'antitrust',
  'regulator', 'sec', 'downgrade', 'upgrade', 'acquisition', 'merger',
  'tariff', 'ban', 'recall', 'dividend', 'price target', 'fed', 'interest rate',
  'blackwell', 'gpu', 'capex', 'openai', 'stake', 'insider'
];

const decodeXml = (text: string) => text
  .replace(/^<!\[CDATA\[|\]\]>$/g, '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

const xmlTag = (item: string, tag: string) => {
  const match = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
};

function detectSourceTier(publisher: string): StockNewsItem['sourceTier'] {
  const p = publisher.toLowerCase();
  if (TIER1_GLOBAL_PUBLISHERS.some(t => p.includes(t.toLowerCase()))) {
    return 'TIER1_GLOBAL';
  }
  if (THAI_TOP_PUBLISHERS.some(t => p.includes(t.toLowerCase()))) {
    return 'THAI_TOP';
  }
  return 'WIRE';
}

function formatTimeAgo(publishedAt: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - publishedAt) / 1000));
  if (diffSec < 60) return 'เมื่อสักครู่';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} นาทีที่แล้ว`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ชั่วโมงที่แล้ว`;
  const days = Math.floor(diffSec / 86400);
  if (days === 1) return 'เมื่อวานนี้';
  return `${days} วันที่แล้ว`;
}

function categorizeNews(title: string, publishedAt: number): StockNewsItem['category'] {
  const t = title.toLowerCase();
  const diffHours = (Date.now() - publishedAt) / (1000 * 3600);

  if (
    t.includes('earnings') || t.includes('revenue') || t.includes('profit') ||
    t.includes('eps') || t.includes('guidance') || t.includes('quarter') ||
    t.includes('งบ') || t.includes('กำไร') || t.includes('รายได้')
  ) {
    return 'EARNINGS';
  }
  if (
    t.includes('upgrade') || t.includes('downgrade') || t.includes('price target') ||
    t.includes('target hike') || t.includes('outperform') || t.includes('buy rating') ||
    t.includes('morgan stanley') || t.includes('goldman') || t.includes('jpmorgan') ||
    t.includes('bofa') || t.includes('citi') || t.includes('เป้าหมาย') || t.includes('อัพเป้า')
  ) {
    return 'ANALYST_TARGET';
  }
  if (
    t.includes('fed') || t.includes('powell') || t.includes('interest rate') ||
    t.includes('inflation') || t.includes('cpi') || t.includes('tariff') ||
    t.includes('ดอกเบี้ย') || t.includes('เงินเฟ้อ')
  ) {
    return 'FED_MACRO';
  }
  if (
    t.includes('ai') || t.includes('chip') || t.includes('gpu') ||
    t.includes('blackwell') || t.includes('semiconductor') || t.includes('cloud') ||
    t.includes('datacenter') || t.includes('เทคโนโลยี') || t.includes('ชิป')
  ) {
    return 'TECH_AI';
  }
  if (
    t.includes('insider') || t.includes('sells') || t.includes('buys') ||
    t.includes('stake') || t.includes('merger') || t.includes('acquisition') ||
    t.includes('takeover') || t.includes('ปันผล') || t.includes('dividend')
  ) {
    return 'INSIDER_DEAL';
  }
  if (diffHours <= 3.0) {
    return 'BREAKING';
  }
  return 'MARKET_RADAR';
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*-\s*(Yahoo Finance|Reuters|Bloomberg|CNBC|The Wall Street Journal|WSJ|MarketWatch|Seeking Alpha|Barron's|Forbes|Fortune|Benzinga|Stocktwits|Motley Fool|Google News|ข่าวหุ้นธุรกิจออนไลน์|กรุงเทพธุรกิจ|HoonSmart)\s*$/i, '')
    .trim();
}

function scoreHeadline(title: string, publisher: string, publishedAt: number) {
  const text = title.toLowerCase();
  const positiveHits = POSITIVE_WORDS.filter(word => text.includes(word)).length;
  const negativeHits = NEGATIVE_WORDS.filter(word => text.includes(word)).length;
  const impactHits = HIGH_IMPACT_WORDS.filter(word => text.includes(word)).length;
  
  const sentimentScore = Math.max(-100, Math.min(100, (positiveHits - negativeHits) * 25));
  
  // Base impact from financial keywords
  let baseImpact = 35 + impactHits * 22 + (positiveHits + negativeHits) * 8;
  
  // Bonus for Tier 1 source (+15)
  const tier = detectSourceTier(publisher);
  if (tier === 'TIER1_GLOBAL' || tier === 'THAI_TOP') {
    baseImpact += 15;
  }
  
  // Bonus for Freshness / Recency (< 4 hours = +15, < 12 hours = +8)
  const diffHours = (Date.now() - publishedAt) / (1000 * 3600);
  if (diffHours < 4) {
    baseImpact += 15;
  } else if (diffHours < 12) {
    baseImpact += 8;
  }

  const impactScore = Math.max(30, Math.min(100, baseImpact));

  return {
    sentimentScore,
    impactScore,
    sentiment: (sentimentScore > 0 ? 'POSITIVE' : sentimentScore < 0 ? 'NEGATIVE' : 'NEUTRAL') as StockNewsItem['sentiment'],
    timeAgo: formatTimeAgo(publishedAt),
    category: categorizeNews(title, publishedAt),
    sourceTier: tier,
  };
}

async function translateToThai(text: string): Promise<{ text: string; translated: boolean }> {
  // If already contains Thai characters, no need to translate
  if (/[\u0E00-\u0E7F]/.test(text)) {
    return { text, translated: true };
  }

  try {
    const response = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=th&dt=t&q=${encodeURIComponent(text)}`,
      { headers: { 'User-Agent': 'AI-SMC-News/2.0' } },
    );
    if (!response.ok) return { text, translated: false };
    const data = await response.json() as Array<Array<[string]>>;
    const translated = data[0]?.map(part => part[0]).join('');
    return { text: translated || text, translated: Boolean(translated && translated !== text) };
  } catch {
    return { text, translated: false };
  }
}

export class StockNewsService {
  /**
   * Source 1: Yahoo Finance Real-time Wire API (Speed & Real-time Coverage)
   */
  private static async getYahooNews(symbol: string): Promise<RawNews[]> {
    try {
      const upper = symbol.toUpperCase();
      const searchTarget = ['GOLD', 'XAUUSD', 'GOLDUSD'].includes(upper) ? 'GC=F' : symbol;
      const response = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchTarget)}&quotesCount=0&newsCount=30`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } },
      );
      if (!response.ok) return [];
      const payload = await response.json() as { news?: YahooNews[] };
      return (payload.news ?? []).filter(item => item.title && item.link).map((item, index) => ({
        id: item.uuid ?? `yahoo-${symbol}-${item.providerPublishTime ?? Date.now()}-${index}`,
        title: cleanTitle(item.title!),
        publisher: item.publisher ?? 'Yahoo Finance',
        url: item.link!,
        publishedAt: (item.providerPublishTime ?? Math.floor(Date.now() / 1000)) * 1000,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Source 2: Premier Global Financial Wires (Bloomberg, Reuters, WSJ, CNBC, FT, MarketWatch)
   */
  private static async getPremierGlobalNews(symbol: string): Promise<RawNews[]> {
    try {
      const cleanSym = symbol.replace('.BK', '').toUpperCase();
      let querySubject = `${cleanSym} stock`;
      if (['GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(cleanSym)) {
        querySubject = '(gold price OR gold market OR XAUUSD OR gold bullion)';
      }
      const query = `${querySubject} (site:bloomberg.com OR site:reuters.com OR site:cnbc.com OR site:wsj.com OR site:marketwatch.com OR site:finance.yahoo.com OR site:seekingalpha.com OR site:barrons.com) when:3d`;
      const response = await fetch(
        `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/rss+xml' } },
      );
      if (!response.ok) return [];
      const xml = await response.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
      return items.map((item, index) => {
        const rawTitle = xmlTag(item, 'title');
        const source = xmlTag(item, 'source') || 'Global Wire';
        const date = Date.parse(xmlTag(item, 'pubDate')) || Date.now();
        return {
          id: `global-${symbol}-${date}-${index}`,
          title: cleanTitle(rawTitle),
          publisher: source,
          url: xmlTag(item, 'link'),
          publishedAt: date,
        };
      }).filter(item => item.title && item.url);
    } catch {
      return [];
    }
  }

  /**
   * Source 3: Top Thai Financial Press for Thai stocks (KBANK, SCB, TISCO, BBL) and Gold
   */
  private static async getThaiPressNews(symbol: string): Promise<RawNews[]> {
    const isThaiStock = symbol.endsWith('.BK') || ['KBANK', 'SCB', 'TISCO', 'BBL', 'GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(symbol.toUpperCase());
    if (!isThaiStock) return [];

    const thaiNames: Record<string, string> = {
      'KBANK': 'KBANK OR กสิกร',
      'KBANK.BK': 'KBANK OR กสิกร',
      'SCB': 'SCB OR ไทยพาณิชย์',
      'SCB.BK': 'SCB OR ไทยพาณิชย์',
      'TISCO': 'TISCO OR ทิสโก้',
      'TISCO.BK': 'TISCO OR ทิสโก้',
      'BBL': 'BBL OR ธนาคารกรุงเทพ',
      'BBL.BK': 'BBL OR ธนาคารกรุงเทพ',
      'GOLD': 'ราคาทอง OR ราคาทองคำ OR ตลาดทองคำ',
      'GC=F': 'ราคาทอง OR ราคาทองคำ OR ตลาดทองคำ',
      'XAUUSD': 'ราคาทอง OR ราคาทองคำ OR ตลาดทองคำ',
      'GOLDUSD': 'ราคาทอง OR ราคาทองคำ OR ตลาดทองคำ',
    };

    const isGold = ['GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(symbol.toUpperCase());
    const queryTerm = thaiNames[symbol.toUpperCase()] || symbol.replace('.BK', '');
    const query = isGold
      ? `${queryTerm} (site:kaohoon.com OR site:bangkokbiznews.com OR site:hoonsmart.com OR site:thansettakij.com OR site:posttoday.com) when:5d`
      : `${queryTerm} หุ้น (site:kaohoon.com OR site:bangkokbiznews.com OR site:hoonsmart.com OR site:thansettakij.com OR site:posttoday.com OR site:set.or.th) when:5d`;

    try {
      const response = await fetch(
        `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=th&gl=TH&ceid=TH:th`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/rss+xml' } },
      );
      if (!response.ok) return [];
      const xml = await response.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
      return items.map((item, index) => {
        const rawTitle = xmlTag(item, 'title');
        const source = xmlTag(item, 'source') || 'Thai Financial News';
        const date = Date.parse(xmlTag(item, 'pubDate')) || Date.now();
        return {
          id: `thai-${symbol}-${date}-${index}`,
          title: cleanTitle(rawTitle),
          publisher: source,
          url: xmlTag(item, 'link'),
          publishedAt: date,
        };
      }).filter(item => item.title && item.url);
    } catch {
      return [];
    }
  }

  /**
   * Main Aggregator: Fetches the fastest, highest-impact Tier 1 global and local news
   */
  public static async getNews(symbol: string): Promise<StockNewsItem[]> {
    const [yahooNews, globalNews, thaiNews] = await Promise.all([
      this.getYahooNews(symbol),
      this.getPremierGlobalNews(symbol),
      this.getThaiPressNews(symbol),
    ]);

    const seenTitles = new Set<string>();
    const allNews = [...yahooNews, ...globalNews, ...thaiNews]
      .filter(item => {
        const key = item.title.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, '').slice(0, 85);
        if (seenTitles.has(key)) return false;
        seenTitles.add(key);
        return true;
      })
      .map(item => ({
        item,
        scores: scoreHeadline(item.title, item.publisher, item.publishedAt),
      }))
      // Sort by: Tier 1 weight + Impact Score + Recency (Fastest & Best first!)
      .sort((a, b) => {
        const now = Date.now();
        const aHours = (now - a.item.publishedAt) / (1000 * 3600);
        const bHours = (now - b.item.publishedAt) / (1000 * 3600);

        // Recency score (newer = higher)
        const aFreshness = aHours < 4 ? 30 : aHours < 12 ? 15 : aHours < 24 ? 5 : 0;
        const bFreshness = bHours < 4 ? 30 : bHours < 12 ? 15 : bHours < 24 ? 5 : 0;

        const aTierScore = a.scores.sourceTier === 'TIER1_GLOBAL' ? 25 : a.scores.sourceTier === 'THAI_TOP' ? 20 : 10;
        const bTierScore = b.scores.sourceTier === 'TIER1_GLOBAL' ? 25 : b.scores.sourceTier === 'THAI_TOP' ? 20 : 10;

        const aTotalRank = a.scores.impactScore * 0.5 + aFreshness + aTierScore;
        const bTotalRank = b.scores.impactScore * 0.5 + bFreshness + bTierScore;

        return bTotalRank - aTotalRank || b.item.publishedAt - a.item.publishedAt;
      })
      .slice(0, 15);

    if (allNews.length === 0) {
      throw new Error('ไม่พบข่าวจากเครือข่ายข่าวการเงินสากล');
    }

    // Translate headlines to high-quality Thai
    return Promise.all(allNews.map(async ({ item, scores }) => {
      const translation = await translateToThai(item.title);
      return {
        id: item.id,
        title: item.title,
        translatedTitle: translation.text,
        translated: translation.translated,
        publisher: item.publisher,
        url: item.url,
        publishedAt: item.publishedAt,
        ...scores,
      };
    }));
  }
}
