import { SmcAnalysisResult, StockNewsItem, StockQuote } from '../types/smc';

const API_BASE = '/api/stocks';

export async function fetchM7Quotes(): Promise<StockQuote[]> {
  const res = await fetch(`${API_BASE}/m7`);
  if (!res.ok) {
    throw new Error(`Failed to fetch M7 quotes: ${res.statusText}`);
  }
  const data = await res.json();
  return data.data;
}

export async function fetchStockAnalysis(symbol: string, timeframe: string = '1d'): Promise<SmcAnalysisResult> {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch stock analysis for ${symbol}: ${res.statusText}`);
  }
  const data = await res.json();
  return data.data;
}

export async function fetchStockNews(symbol: string): Promise<StockNewsItem[]> {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(symbol)}/news`);
  if (!res.ok) throw new Error(`Failed to fetch stock news for ${symbol}: ${res.statusText}`);
  return (await res.json()).data;
}

export async function fetchMultiTimeframeAnalysis(symbol: string): Promise<{
  '1h': SmcAnalysisResult | null;
  '4h': SmcAnalysisResult | null;
  '1d': SmcAnalysisResult | null;
}> {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(symbol)}/multi-tf`);
  if (!res.ok) throw new Error(`Failed to fetch multi-tf analysis for ${symbol}: ${res.statusText}`);
  return (await res.json()).data;
}

export async function fetchStockQuote(symbol: string): Promise<StockQuote> {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(symbol)}/quote`);
  if (!res.ok) throw new Error(`Failed to fetch quote for ${symbol}: ${res.statusText}`);
  const data = await res.json();
  return data.data;
}
