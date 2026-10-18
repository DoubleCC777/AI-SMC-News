import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  UTCTimestamp,
  LineStyle,
  CrosshairMode,
  SeriesMarker,
  Time,
  Logical
} from 'lightweight-charts';
import { SmcAnalysisResult, StockQuote, AiNewsVerdict, Candle } from '../types/smc';
import { IndicatorControls, IndicatorSettings } from './IndicatorControls';
import { M7Bar } from './M7Bar';
import { RotateCcw, Maximize2, Minimize2, Move, Lock, ZoomIn, ZoomOut, ChevronUp, ChevronDown, Sparkles } from 'lucide-react';
import { calculateCandleVolumeDecomposition } from '../utils/volumeEngine';
import { getMarketStatus } from '../utils/marketHours';

const normalizeSymbol = (s?: string) => {
  if (!s) return '';
  const clean = s.replace(/\.BK$/i, '').toUpperCase();
  if (['GC=F', 'XAUUSD', 'GOLDUSD'].includes(clean)) return 'GOLD';
  return clean;
};

const matchSymbol = (a?: string, b?: string): boolean => {
  return normalizeSymbol(a) === normalizeSymbol(b);
};

const isThaiSymbol = (sym?: string): boolean => {
  if (!sym) return false;
  const clean = sym.replace(/\.BK$/i, '').toUpperCase();
  return sym.endsWith('.BK') || ['KBANK', 'SCB', 'TISCO', 'BBL'].includes(clean);
};

interface SmcChartProps {
  data: SmcAnalysisResult | null;
  quotes?: StockQuote[];
  selectedSymbol?: string;
  onSelectStock?: (symbol: string) => void;
  timeframe: string;
  onSelectTimeframe: (tf: string) => void;
  settings: IndicatorSettings;
  onUpdateSettings: (newSettings: IndicatorSettings) => void;
  isLoading: boolean;
  isLoadingQuotes?: boolean;
  liveQuote?: StockQuote | null;
  aiVerdict?: AiNewsVerdict | null;
}

export const SmcChart: React.FC<SmcChartProps> = ({
  data,
  quotes,
  selectedSymbol,
  onSelectStock,
  timeframe,
  onSelectTimeframe,
  settings,
  onUpdateSettings,
  isLoading,
  isLoadingQuotes,
  liveQuote,
  aiVerdict,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLinesRef = useRef<any[]>([]);
  const livePriceLineRef = useRef<any | null>(null);
  const prevPriceRef = useRef<number | null>(null);

  const [livePriceInfo, setLivePriceInfo] = useState<{
    price: number;
    change: number;
    changePercent: number;
    tickDirection?: 'up' | 'down' | 'same';
  } | null>(null);

  // Track last loaded symbol & timeframe to prevent resetting user zoom/pan on re-render / indicator toggle
  const lastLoadedKeyRef = useRef<string>('');

  // ★ KEY FIX: Use refs for data & settings so event listeners always see the latest values
  const dataRef = useRef<SmcAnalysisResult | null>(null);
  const settingsRef = useRef<IndicatorSettings>(settings);

  // Keep refs in sync
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const [hoverData, setHoverData] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    buyRatio?: number;
    sellRatio?: number;
    buyVolume?: number;
    sellVolume?: number;
  } | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Mouse Wheel Function Mode: 'zoom' (Default ตามคำขอ: หมุนลูกกลิ้งเพื่อซูมเข้า-ออก เลื่อนขึ้นซูมเข้า เลื่อนลงขยายกว้าง) หรือ 'scroll' (เลื่อนซ้าย-ขวา)
  const [wheelMode, setWheelMode] = useState<'zoom' | 'scroll'>('zoom');
  const wheelModeRef = useRef<'zoom' | 'scroll'>('zoom');
  wheelModeRef.current = wheelMode;

  useEffect(() => {
    wheelModeRef.current = wheelMode;
    if (chartRef.current) {
      chartRef.current.applyOptions({
        handleScroll: {
          mouseWheel: false, // ปิด mouseWheel ใน library เพื่อให้ onWheel จัดการซูม/เลื่อนอย่างแม่นยำ
          pressedMouseMove: true, // คลิกลากเมาส์เลื่อนซ้ายขวาอย่างอิสระ ไม่ซูมเด็ดขาด
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
        handleScale: false, // ปิดการ Scale/Zoom ทุกอย่างของ library เพื่อไม่ให้ซูมเองขณะลากกราฟ 100%
      });
    }
  }, [wheelMode]);

  // Vertical Scale (Zoom) & Pan State
  const verticalZoomRef = useRef<number>(1.0);
  const verticalPanRef = useRef<number>(0);
  const [verticalZoomDisplay, setVerticalZoomDisplay] = useState(100);

  // Stable Price Scale Anchor — ล็อกสเกลราคาให้เสถียร ไม่มีการ Auto-zoom หรือเปลี่ยนขนาดขณะลากกราฟ
  const stableSpanRef = useRef<number>(10);
  const stableCenterRef = useRef<number>(100);

  const calibratePriceScale = useCallback((candles: Candle[]) => {
    if (!candles || candles.length === 0) return;
    const slice = candles.length > 80 ? candles.slice(-80) : candles;
    const highs = slice.map(c => c.high);
    const lows = slice.map(c => c.low);
    const maxH = Math.max(...highs);
    const minL = Math.min(...lows);
    const rawSpan = Math.max(0.5, maxH - minL);
    stableSpanRef.current = rawSpan * 1.25;
    stableCenterRef.current = (maxH + minL) / 2;
    verticalPanRef.current = 0;
    verticalZoomRef.current = 1.0;
    setVerticalZoomDisplay(100);
  }, []);

  const handleZoomVertical = (multiplier: number) => {
    verticalZoomRef.current = Math.min(5.0, Math.max(0.2, verticalZoomRef.current * multiplier));
    setVerticalZoomDisplay(Math.round(verticalZoomRef.current * 100));
    candleSeriesRef.current?.applyOptions({});
    setTimeout(() => drawOverlays(), 30);
  };

  const handlePanVertical = (direction: 'up' | 'down') => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const p1 = series.coordinateToPrice(100);
    const p2 = series.coordinateToPrice(200);
    if (p1 !== null && p2 !== null) {
      const pricePerPx = (p1 - p2) / 100;
      const step = (direction === 'up' ? -40 : 40) * pricePerPx;
      verticalPanRef.current += step;
      candleSeriesRef.current?.applyOptions({});
      setTimeout(() => drawOverlays(), 30);
    }
  };

  const handleResetVertical = () => {
    verticalZoomRef.current = 1.0;
    verticalPanRef.current = 0;
    setVerticalZoomDisplay(100);
    candleSeriesRef.current?.applyOptions({});
    setTimeout(() => drawOverlays(), 30);
  };

  const handleResetZoom = () => {
    if (!chartRef.current || !dataRef.current) return;
    
    // Calibrate stable price range
    calibratePriceScale(dataRef.current.candles);

    // Reset vertical zoom and pan to 100%
    handleResetVertical();

    // Reset price scale
    chartRef.current.priceScale('right').applyOptions({ autoScale: true });
    candleSeriesRef.current?.applyOptions({});

    // Fit content across the full container — beautiful wide view without any zoom-in
    chartRef.current.timeScale().fitContent();

    setTimeout(() => drawOverlays(), 50);
  };

  const handleZoomHorizontal = (factor: number) => {
    const chart = chartRef.current;
    if (!chart) return;
    const range = chart.timeScale().getVisibleLogicalRange();
    if (!range) return;
    const currentSpan = range.to - range.from;
    const newSpan = Math.max(15, Math.min(800, currentSpan * factor));
    const center = (range.from + range.to) / 2;
    chart.timeScale().setVisibleLogicalRange({
      from: (center - newSpan / 2) as Logical,
      to: (center + newSpan / 2) as Logical,
    });
    setTimeout(() => drawOverlays(), 30);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(prev => {
      const next = !prev;
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
      return next;
    });
  };

  // ★ CORE DRAW FUNCTION — reads from refs so it's never stale
  const drawOverlays = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    const currentData = dataRef.current;
    const currentSettings = settingsRef.current;

    if (!canvas || !chart || !series || !currentData || currentData.candles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Sync canvas size with container (handles DPR for crisp text)
    const container = chartContainerRef.current;
    if (container) {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.save();

    // Clip to canvas bounds — prevents ANY text overflow
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();

    const timeScale = chart.timeScale();
    const visibleRange = timeScale.getVisibleLogicalRange();

    // Helper: logical bar index → pixel X
    const getX = (index: number): number => {
      const coord = timeScale.logicalToCoordinate(index as Logical);
      if (coord !== null) return Number(coord);
      if (visibleRange && visibleRange.to !== visibleRange.from) {
        return (index - visibleRange.from) * (width / (visibleRange.to - visibleRange.from));
      }
      return -9999;
    };

    // Helper: price → pixel Y
    const getY = (price: number): number | null => {
      const coord = series.priceToCoordinate(price);
      return coord !== null ? Number(coord) : null;
    };

    const lastIdx = currentData.candles.length - 1;

    // ────────────────────────────────────────────
    // 1. ORDER BLOCKS (LuxAlgo Internal & Swing OB)
    // ────────────────────────────────────────────
    if (currentSettings.showOrderBlocks && currentData.orderBlocks) {
      currentData.orderBlocks.forEach(ob => {
        if (!currentSettings.showMitigated && ob.mitigated) return;

        const x1 = getX(ob.startIndex);
        const x2 = ob.mitigated
          ? getX(ob.endIndex ?? ob.startIndex + 5)
          : Math.max(getX(lastIdx) + 80, width + 20);

        // Skip if fully off-screen
        if (x2 < -50 || x1 > width + 50) return;

        const yT = getY(ob.top);
        const yB = getY(ob.bottom);
        if (yT === null || yB === null) return;

        const bx = Math.max(x1, -10);
        const bw = Math.max(4, Math.min(x2, width + 10) - bx);
        const by = Math.min(yT, yB);
        const bh = Math.max(2, Math.abs(yB - yT));
        const isBull = ob.type === 'bullish';
        const isInternal = ob.isInternal;

        // LuxAlgo Palette:
        // Internal Bull: #3179f5, Swing Bull: #089981
        // Internal Bear: #f77c80, Swing Bear: #f23645
        // Mitigated: #636363
        let mainColor = isBull
          ? (isInternal ? '#3179f5' : '#089981')
          : (isInternal ? '#f77c80' : '#f23645');
        if (ob.mitigated) mainColor = '#636363';

        const grad = ctx.createLinearGradient(bx, by, bx + bw, by);
        if (ob.mitigated) {
          grad.addColorStop(0, 'rgba(99, 99, 99, 0.12)');
          grad.addColorStop(1, 'rgba(99, 99, 99, 0.02)');
          ctx.strokeStyle = 'rgba(99, 99, 99, 0.45)';
        } else if (isBull) {
          grad.addColorStop(0, isInternal ? 'rgba(49, 121, 245, 0.22)' : 'rgba(8, 153, 129, 0.25)');
          grad.addColorStop(1, isInternal ? 'rgba(49, 121, 245, 0.04)' : 'rgba(8, 153, 129, 0.06)');
          ctx.strokeStyle = isInternal ? 'rgba(49, 121, 245, 0.85)' : 'rgba(8, 153, 129, 0.95)';
        } else {
          grad.addColorStop(0, isInternal ? 'rgba(247, 124, 128, 0.22)' : 'rgba(242, 54, 69, 0.25)');
          grad.addColorStop(1, isInternal ? 'rgba(247, 124, 128, 0.04)' : 'rgba(242, 54, 69, 0.06)');
          ctx.strokeStyle = isInternal ? 'rgba(247, 124, 128, 0.85)' : 'rgba(242, 54, 69, 0.95)';
        }

        ctx.fillStyle = grad;
        ctx.lineWidth = ob.mitigated ? 0.9 : (isInternal ? 1.0 : 1.5);
        ctx.setLineDash(ob.mitigated ? [3, 3] : []);

        // Draw rounded rectangle
        const r = Math.min(3, bh / 2, bw / 2);
        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.lineTo(bx + bw - r, by);
        ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
        ctx.lineTo(bx + bw, by + bh - r);
        ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
        ctx.lineTo(bx + r, by + bh);
        ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
        ctx.lineTo(bx, by + r);
        ctx.quadraticCurveTo(bx, by, bx + r, by);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Label — only if box is visible and tall enough
        if (bh > 9 && bw > 35) {
          const label = ob.mitigated
            ? (isBull ? '🟢 OB [แตะแล้ว]' : '🔴 OB [แตะแล้ว]')
            : (isInternal
                ? (isBull ? '🔵 iOB (จุดรับย่อย)' : '🟠 iOB (จุดขายย่อย)')
                : (isBull ? '🟢 Swing OB (จุดเข้าซื้อ)' : '🔴 Swing OB (จุดออกขาย)'));

          ctx.font = 'bold 8.5px "Prompt", "Noto Sans Thai", "JetBrains Mono", monospace';
          const tw = ctx.measureText(label).width;
          const lx = Math.max(4, Math.min(bx + 6, width - tw - 6));
          const ly = Math.max(by + 11, Math.min(by + bh - 3, height - 4));

          // Small pill background
          ctx.fillStyle = ob.mitigated ? 'rgba(99, 99, 99, 0.85)' : (isBull ? 'rgba(8, 153, 129, 0.9)' : 'rgba(242, 54, 69, 0.9)');
          const px = lx - 3, py = ly - 9;
          const pw = tw + 6, ph = 12;
          ctx.beginPath();
          ctx.roundRect(px, py, pw, ph, 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, lx, ly);
        }
      });
    }

    // ────────────────────────────────────────────
    // 2. FAIR VALUE GAPS (FVG Imbalance with Midpoint 50%)
    // ────────────────────────────────────────────
    if (currentSettings.showFvgs && currentData.fvgs) {
      currentData.fvgs.forEach(fvg => {
        if (!currentSettings.showMitigated && fvg.mitigated) return;

        const x1 = getX(fvg.startIndex);
        const x2 = fvg.mitigated
          ? getX(fvg.endIndex ?? fvg.startIndex + 3)
          : Math.max(getX(lastIdx) + 80, width + 20);

        if (x2 < -50 || x1 > width + 50) return;

        const yT = getY(fvg.top);
        const yB = getY(fvg.bottom);
        if (yT === null || yB === null) return;

        const bx = Math.max(x1, -10);
        const bw = Math.max(4, Math.min(x2, width + 10) - bx);
        const by = Math.min(yT, yB);
        const bh = Math.max(1, Math.abs(yB - yT));
        const isBull = fvg.type === 'bullish';

        const color = isBull ? '#38bdf8' : '#f23645';
        ctx.fillStyle = isBull ? 'rgba(56, 189, 248, 0.15)' : 'rgba(242, 54, 69, 0.12)';
        ctx.strokeStyle = isBull ? 'rgba(56, 189, 248, 0.75)' : 'rgba(242, 54, 69, 0.65)';
        ctx.lineWidth = 0.9;
        ctx.setLineDash([3, 2]);

        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);

        // Mid-line (50% Equilibrium inside FVG as in LuxAlgo)
        const midY = (yT + yB) / 2;
        ctx.strokeStyle = isBull ? 'rgba(56, 189, 248, 0.45)' : 'rgba(242, 54, 69, 0.4)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(bx, midY);
        ctx.lineTo(bx + bw, midY);
        ctx.stroke();

        // Label only if enough room
        if (bh > 8 && bw > 30) {
          const label = isBull ? '⚡ Bullish FVG' : '⚡ Bearish FVG';
          ctx.font = 'bold 8px "Prompt", "JetBrains Mono", monospace';
          const tw = ctx.measureText(label).width;
          const lx = Math.max(4, Math.min(bx + 4, width - tw - 4));
          const ly = Math.max(by + 8, Math.min(by + bh - 2, height - 4));

          ctx.fillStyle = color;
          ctx.fillText(label, lx, ly);
        }
      });
    }

    // ────────────────────────────────────────────
    // 3. BOS & CHoCH STRUCTURE (LuxAlgo Internal vs Swing)
    // ────────────────────────────────────────────
    if (currentSettings.showStructure && currentData.breaks) {
      currentData.breaks.forEach(brk => {
        const sx = getX(brk.sourceIndex);
        const bx = getX(brk.breakIndex);
        const yCoord = getY(brk.price);
        if (yCoord === null) return;

        const isBull = brk.bias === 'bullish';
        const isInternal = brk.isInternal;
        const color = isBull ? '#089981' : '#f23645';

        // LuxAlgo: Internal = dashed line, Swing = solid line
        ctx.strokeStyle = color;
        ctx.lineWidth = isInternal ? 1.0 : 1.8;
        ctx.setLineDash(isInternal ? [4, 3] : []);
        ctx.beginPath();
        ctx.moveTo(sx, yCoord);
        ctx.lineTo(bx, yCoord);
        ctx.stroke();

        // Tag pill
        const tagText = isInternal
          ? `${brk.type === 'BOS' ? 'iBOS' : 'iCHoCH'}`
          : `${brk.type === 'BOS' ? 'BOS' : 'CHoCH'}`;
        ctx.font = isInternal
          ? 'bold 8.5px "Prompt", "JetBrains Mono", monospace'
          : 'bold 9.5px "Prompt", "JetBrains Mono", sans-serif';

        const tw = ctx.measureText(tagText).width;
        const midX = (sx + bx) / 2;
        const pillW = tw + (isInternal ? 6 : 10);
        const pillH = isInternal ? 13 : 15;
        const pillX = Math.max(2, Math.min(midX - pillW / 2, width - pillW - 2));
        const pillY = yCoord - pillH / 2;

        ctx.setLineDash([]);
        ctx.fillStyle = isInternal ? color : color;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 3);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(tagText, pillX + pillW / 2, pillY + (isInternal ? 9.5 : 11));
        ctx.textAlign = 'start';
      });
    }

    // ────────────────────────────────────────────
    // 4. EQUAL HIGHS & LOWS (EQH / EQL Liquidity Pools)
    // ────────────────────────────────────────────
    if (currentSettings.showEqualHighsLows !== false && currentData.liquidityLevels) {
      currentData.liquidityLevels.forEach(lvl => {
        const yCoord = getY(lvl.price);
        if (yCoord === null || yCoord < 0 || yCoord > height) return;

        const isEqh = lvl.type === 'EQH';
        const color = isEqh ? '#f23645' : '#089981';

        // Dotted liquidity line
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.0;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(20, yCoord);
        ctx.lineTo(width - 70, yCoord);
        ctx.stroke();

        // Badge at right
        const tagText = isEqh ? 'EQH (BSL)' : 'EQL (SSL)';
        ctx.font = 'bold 8.5px "Prompt", "JetBrains Mono", monospace';
        const tw = ctx.measureText(tagText).width;
        const pillW = tw + 8;
        const pillH = 13;
        const pillX = width - pillW - 75;
        const pillY = yCoord - pillH / 2;

        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(tagText, pillX + pillW / 2, pillY + 9.5);
        ctx.textAlign = 'start';
      });
    }

    // ────────────────────────────────────────────
    // 5. STRONG & WEAK HIGH / LOW EXTENSIONS (LuxAlgo)
    // ────────────────────────────────────────────
    const luxMeta = currentData.summary?.luxAlgoMetadata;
    if (currentSettings.showStructure && luxMeta) {
      const renderStrongWeak = (price: number | undefined, title: string, color: string) => {
        if (!price) return;
        const yCoord = getY(price);
        if (yCoord === null || yCoord < 0 || yCoord > height) return;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(width - 180, yCoord);
        ctx.lineTo(width - 65, yCoord);
        ctx.stroke();

        ctx.font = 'bold 8.5px "Prompt", "Noto Sans Thai", monospace';
        const tw = ctx.measureText(title).width;
        const pillW = tw + 8;
        const pillH = 14;
        const pillX = width - pillW - 68;
        const pillY = yCoord - pillH / 2;

        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(title, pillX + pillW / 2, pillY + 10.5);
        ctx.textAlign = 'start';
      };

      if (luxMeta.strongLow) renderStrongWeak(luxMeta.strongLow, '🛡️ Strong Low (จุด SL)', '#089981');
      if (luxMeta.weakHigh) renderStrongWeak(luxMeta.weakHigh, '🎯 Weak High (เป้า TP)', '#f23645');
      if (luxMeta.strongHigh) renderStrongWeak(luxMeta.strongHigh, '🛡️ Strong High (จุด SL)', '#f23645');
      if (luxMeta.weakLow) renderStrongWeak(luxMeta.weakLow, '🎯 Weak Low (เป้า TP)', '#089981');
    }

    // ────────────────────────────────────────────
    // 6. SWING LABELS (HH, LH, HL, LL)
    // ────────────────────────────────────────────
    if (currentSettings.showStructure && currentData.swings) {
      const recentSwings = currentData.swings.filter(s => !s.isInternal).slice(-10);
      recentSwings.forEach(sw => {
        if (!sw.label) return;
        const xCoord = getX(sw.index);
        const yCoord = getY(sw.price);
        if (yCoord === null || xCoord < -20 || xCoord > width + 20) return;

        const isHigh = sw.type === 'high';
        ctx.font = 'bold 8px "Prompt", "JetBrains Mono", monospace';
        ctx.fillStyle = isHigh ? '#f77c80' : '#4ade80';
        ctx.textAlign = 'center';
        ctx.fillText(sw.label, xCoord, isHigh ? yCoord - 6 : yCoord + 12);
        ctx.textAlign = 'start';
      });
    }

    ctx.setLineDash([]);
    ctx.restore();
  }, []); // ★ No deps — uses refs internally

  // ★ Keep a ref to drawOverlays for event listeners
  const drawRef = useRef(drawOverlays);
  drawRef.current = drawOverlays;

  // ─── CHART INIT (runs once) ───────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    container.innerHTML = '';

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: '#070a12' },
        textColor: '#64748b',
        fontFamily: "'JetBrains Mono', 'Plus Jakarta Sans', sans-serif"
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.02)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.02)' }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(56,189,248,0.4)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0284c7'
        },
        horzLine: {
          color: 'rgba(56,189,248,0.4)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0284c7'
        }
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 9,
        minBarSpacing: 0.5,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: false,
        shiftVisibleRangeOnNewBar: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.12 },
        alignLabels: true,
        borderVisible: true,
      },
      handleScroll: {
        mouseWheel: false, // ปิด mouseWheel ใน library ให้ onWheel ควบคุมการซูม/เลื่อนอย่างแม่นยำ
        pressedMouseMove: true, // คลิกลากเมาส์เพื่อเลื่อนกราฟได้อย่างอิสระ
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: false, // ปิดการ Scale/Zoom ทุกอย่างของ library เพื่อไม่ให้ซูมเองขณะลากกราฟ 100%
    });

    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#08d486',
      downColor: '#ff3366',
      borderUpColor: '#06b874',
      borderDownColor: '#e6294e',
      wickUpColor: '#08d486',
      wickDownColor: '#ff3366',
      priceLineVisible: false, // Managed by our dedicated live price line
      lastValueVisible: false, // Prevents duplicate stacked price on Y-axis scale
      autoscaleInfoProvider: (baseImplementation: () => any) => {
        const res = baseImplementation();

        // ฐานอ้างอิงช่วงราคาคงที่ (Stable Price Scale Anchor)
        // เพื่อให้การคลิกลากกราฟไปทางขวาหรือซ้าย เป็นการเลื่อนอย่างอิสระ 100% ไม่มีการ Auto-zoom หรือยืดหดแท่งเทียน
        let span = stableSpanRef.current;
        let center = stableCenterRef.current;

        if (!span || span <= 0 || !Number.isFinite(center)) {
          if (res) {
            span = Math.max(0.5, res.priceRange.maxValue - res.priceRange.minValue);
            center = (res.priceRange.maxValue + res.priceRange.minValue) / 2;
          } else {
            const candles = dataRef.current?.candles;
            if (candles && candles.length > 0) {
              const lastCandle = candles[candles.length - 1];
              center = lastCandle.close;
              span = Math.max(1, center * 0.05);
            } else {
              center = 100;
              span = 10;
            }
          }
          stableSpanRef.current = span;
          stableCenterRef.current = center;
        }

        const zoom = verticalZoomRef.current;
        const halfSpan = (span / 2) / zoom;
        const panShift = verticalPanRef.current;

        return {
          priceRange: {
            minValue: center + panShift - halfSpan,
            maxValue: center + panShift + halfSpan,
          },
          margins: res?.margins || { above: 0.1, below: 0.12 },
        };
      },
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addHistogramSeries({
      color: '#38bdf8',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 }
    });
    volumeSeriesRef.current = volumeSeries;

    // Canvas overlay
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:5;width:100%;height:100%';
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    container.appendChild(canvas);
    canvasRef.current = canvas;

    // ★ Coalesce redraw into single rAF for silky 60/120 FPS without frame drops
    let redrawAnimFrameId: number | null = null;
    const redraw = () => {
      if (redrawAnimFrameId !== null) return;
      redrawAnimFrameId = requestAnimationFrame(() => {
        redrawAnimFrameId = null;
        drawRef.current();
      });
    };

    // Resize
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      chart.applyOptions({ width: w, height: h });
      if (canvasRef.current) {
        canvasRef.current.width = w;
        canvasRef.current.height = h;
      }
      redraw();
    };
    window.addEventListener('resize', handleResize);

    // Subscribe to chart movements
    chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);
    chart.timeScale().subscribeVisibleTimeRangeChange(redraw);

    // ★ 2D Free Dragging Engine (ขยับกราฟได้อย่างอิสระ 360 องศา ทั้งแนวนอนและแนวตั้ง ไม่มีการซูมเด็ดขาด)
    // ★ 2D Free Dragging & Price Scale Vertical Expansion Engine
    let isDragging = false;
    let isScalingPrice = false;
    let startX = 0;
    let startY = 0;
    let startPan = 0;
    let startZoom = 1.0;
    let pricePerPx = 0;
    let rafId: number | null = null;

    const loop = () => {
      redraw();
      if (isDragging || isScalingPrice) rafId = requestAnimationFrame(loop);
    };

    const getPriceScaleWidth = () => {
      try {
        const w = chartRef.current?.priceScale('right').width();
        if (w && w > 30) return w;
      } catch {}
      return 65;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const pWidth = getPriceScaleWidth();
      const isPriceScale = mouseX >= container.clientWidth - pWidth;

      startX = e.clientX;
      startY = e.clientY;
      startPan = verticalPanRef.current;
      startZoom = verticalZoomRef.current;

      if (isPriceScale) {
        // ★ คลิกที่แถบแกนราคาด้านขวาเพื่อขยาย/ย่อสเกลราคา (ตามคำขอ)
        isScalingPrice = true;
        isDragging = false;
        container.style.cursor = 'ns-resize';
      } else {
        // คลิกที่ตัวกราฟเพื่อเลื่อนดูกราฟอย่างอิสระ 360 องศา (2D Pan)
        isScalingPrice = false;
        isDragging = true;
        container.style.cursor = 'grabbing';

        const series = candleSeriesRef.current;
        if (series) {
          const p1 = series.coordinateToPrice(100);
          const p2 = series.coordinateToPrice(200);
          if (p1 !== null && p2 !== null) {
            pricePerPx = (p1 - p2) / 100;
          }
        }
      }

      if (!rafId) rafId = requestAnimationFrame(loop);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isScalingPrice) {
        // ★ ลากแถบแกนราคาขึ้นลงเพื่อขยาย/ย่อสเกลราคา
        // ลากขึ้น (dy < 0): ขยายสเกลราคาให้ยืดสูงขึ้น (แท่งเทียนยาวขึ้น ขยายสเกลราคา)
        // ลากลง (dy > 0): บีบสเกลราคาให้เตี้ยลง
        const dy = e.clientY - startY;
        const factor = Math.exp(-dy * 0.005);
        const newZoom = Math.min(8.0, Math.max(0.15, startZoom * factor));
        verticalZoomRef.current = newZoom;
        setVerticalZoomDisplay(Math.round(newZoom * 100));
        candleSeriesRef.current?.applyOptions({});
        return;
      }

      if (isDragging && pricePerPx !== 0) {
        const dy = e.clientY - startY;
        // เลื่อนตำแหน่งกราฟขึ้นลงอย่างอิสระตามการลากเมาส์บนตัวกราฟ (Vertical Pan)
        if (Math.abs(dy) > 3) {
          verticalPanRef.current = startPan + (dy * pricePerPx);
          candleSeriesRef.current?.applyOptions({});
        }
        return;
      }

      // เปลี่ยน Cursor เมื่อนำเมาส์ไปชี้ที่แถบแกนราคาด้านขวา
      if (!isDragging && !isScalingPrice) {
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const pWidth = getPriceScaleWidth();
        if (mouseX >= container.clientWidth - pWidth) {
          container.style.cursor = 'ns-resize';
        } else {
          container.style.cursor = 'crosshair';
        }
      }
    };

    const onMouseUp = () => {
      if (isScalingPrice || isDragging) {
        isScalingPrice = false;
        isDragging = false;
        container.style.cursor = 'crosshair';
      }
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      redraw();
    };

    let touchStartY = 0;
    let startTouchZoom = 1.0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const rect = container.getBoundingClientRect();
        const touchX = t.clientX - rect.left;
        const pWidth = getPriceScaleWidth();
        const isPriceScale = touchX >= container.clientWidth - pWidth;

        touchStartY = t.clientY;
        startPan = verticalPanRef.current;
        startTouchZoom = verticalZoomRef.current;

        if (isPriceScale) {
          isScalingPrice = true;
          isDragging = false;
        } else {
          isScalingPrice = false;
          isDragging = true;
          const series = candleSeriesRef.current;
          if (series) {
            const p1 = series.coordinateToPrice(100);
            const p2 = series.coordinateToPrice(200);
            if (p1 !== null && p2 !== null) {
              pricePerPx = (p1 - p2) / 100;
            }
          }
        }
        if (!rafId) rafId = requestAnimationFrame(loop);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const dy = t.clientY - touchStartY;

        if (isScalingPrice) {
          const factor = Math.exp(-dy * 0.005);
          const newZoom = Math.min(8.0, Math.max(0.15, startTouchZoom * factor));
          verticalZoomRef.current = newZoom;
          setVerticalZoomDisplay(Math.round(newZoom * 100));
          candleSeriesRef.current?.applyOptions({});
          return;
        }

        if (isDragging && pricePerPx !== 0 && Math.abs(dy) > 3) {
          verticalPanRef.current = startPan + (dy * pricePerPx);
          candleSeriesRef.current?.applyOptions({});
        }
      }
    };

    const onTouchEnd = () => {
      isDragging = false;
      isScalingPrice = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      redraw();
    };

    const onWheel = (e: WheelEvent) => {
      // 0. หมุนลูกกลิ้งเมาส์บนแกนราคาด้านขวา: ขยาย/ย่อสเกลราคาในแนวตั้งโดยตรง
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const pWidth = getPriceScaleWidth();
      if (mouseX >= container.clientWidth - pWidth && Math.abs(e.deltaY) > 0.5) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        verticalZoomRef.current = Math.min(8.0, Math.max(0.15, verticalZoomRef.current * factor));
        setVerticalZoomDisplay(Math.round(verticalZoomRef.current * 100));
        candleSeriesRef.current?.applyOptions({});
        redraw();
        return;
      }

      // 1. Shift + Wheel: เลื่อนกราฟไปทางซ้าย-ขวาอย่างรวดเร็ว
      if (e.shiftKey) {
        e.preventDefault();
        const chart = chartRef.current;
        if (chart) {
          const range = chart.timeScale().getVisibleLogicalRange();
          if (range) {
            const shiftBars = (e.deltaY < 0 ? -6 : 6);
            chart.timeScale().setVisibleLogicalRange({
              from: (range.from + shiftBars) as Logical,
              to: (range.to + shiftBars) as Logical,
            });
            redraw();
          }
        }
        return;
      }

      // 2. Alt + Wheel: ปรับสัดส่วนความสูงแท่งเทียน (↕)
      if (e.altKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        verticalZoomRef.current = Math.min(8.0, Math.max(0.15, verticalZoomRef.current * factor));
        setVerticalZoomDisplay(Math.round(verticalZoomRef.current * 100));
        candleSeriesRef.current?.applyOptions({});
        redraw();
        return;
      }

      // 3. Trackpad horizontal swipe (deltaX) - เลื่อนซ้ายขวาอย่างอิสระ ไม่ซูมเด็ดขาด
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) {
        e.preventDefault();
        const chart = chartRef.current;
        if (chart) {
          const range = chart.timeScale().getVisibleLogicalRange();
          if (range) {
            const shiftBars = e.deltaX > 0 ? 4 : -4;
            chart.timeScale().setVisibleLogicalRange({
              from: (range.from + shiftBars) as Logical,
              to: (range.to + shiftBars) as Logical,
            });
            redraw();
          }
        }
        return;
      }

      // 4. หมุนลูกกลิ้งเมาส์ (Mouse Wheel Zoom & Scroll Engine):
      // หมุนขึ้น (deltaY < 0): ซูมเข้าไป (ขยายแท่งเทียนให้เห็นชัดเจน)
      // หมุนลง (deltaY > 0): ขยายกว้างขึ้น (ซูมออกให้เห็นกว้างขึ้น)
      if (Math.abs(e.deltaY) > 0.5) {
        e.preventDefault();
        const chart = chartRef.current;
        if (!chart) return;
        const timeScale = chart.timeScale();
        const range = timeScale.getVisibleLogicalRange();
        if (!range) return;

        // ถ้าผู้ใช้เลือกโหมด 'scroll' (เลื่อนแกนเวลาซ้าย-ขวา)
        if (wheelModeRef.current === 'scroll') {
          const shiftBars = e.deltaY < 0 ? -4 : 4;
          timeScale.setVisibleLogicalRange({
            from: (range.from + shiftBars) as Logical,
            to: (range.to + shiftBars) as Logical,
          });
          redraw();
          return;
        }

        // โหมด 'zoom' (Default ตามคำขอ: เลื่อนขึ้นซูมเข้าไป เลื่อนลงขยายกว้างขึ้น):
        // deltaY < 0 (เลื่อนลูกกลิ้งขึ้น) -> factor < 1 -> บีบช่วงเวลาให้แคบลง -> แท่งเทียนขยายใหญ่ขึ้น (ซูมเข้าไป)
        // deltaY > 0 (เลื่อนลูกกลิ้งลง) -> factor > 1 -> ขยายช่วงเวลาให้กว้างขึ้น -> เห็นภาพรวมกว้างขึ้น (ขยายกว้างขึ้น)
        const rawFactor = Math.pow(1.0016, e.deltaY);
        const factor = Math.max(0.70, Math.min(1.40, rawFactor));

        const currentSpan = range.to - range.from;
        const totalCandles = dataRef.current?.candles.length ?? 300;
        const minSpan = 12; // ซูมเข้าได้ลึกสุด 12 แท่งเทียน
        const maxSpan = Math.max(800, totalCandles + 100); // ซูมออกได้กว้างสุด
        const newSpan = Math.max(minSpan, Math.min(maxSpan, currentSpan * factor));

        // Cursor-anchored Zoom: ยึดแท่งเทียนตรงตำแหน่งเคอร์เซอร์เมาส์เป็นศูนย์กลางการซูม
        const mouseX = e.clientX - rect.left;
        const mouseLogical = timeScale.coordinateToLogical(mouseX);

        let pivot = (range.from + range.to) / 2;
        let ratio = 0.5;

        if (mouseLogical !== null && Number.isFinite(mouseLogical)) {
          pivot = mouseLogical;
          ratio = Math.max(0.05, Math.min(0.95, (pivot - range.from) / currentSpan));
        }

        const newFrom = pivot - ratio * newSpan;
        const newTo = newFrom + newSpan;

        timeScale.setVisibleLogicalRange({
          from: newFrom as Logical,
          to: newTo as Logical,
        });
        redraw();
        return;
      }
    };

    const onDblClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const pWidth = getPriceScaleWidth();
      if (mouseX >= container.clientWidth - pWidth) {
        // ดับเบิ้ลคลิกที่แกนราคาด้านขวาเพื่อคืนค่าสเกลราคา 100%
        handleResetVertical();
      } else {
        // ดับเบิ้ลคลิกบนกราฟเพื่อรีเซ็ตทั้งสเกลความสูงและระยะเวลาพอดีจอ
        handleResetZoom();
      }
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('dblclick', onDblClick);

    // Crosshair tooltip
    chart.subscribeCrosshairMove(param => {
      if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
        setHoverData(null);
      } else {
        const cd = param.seriesData.get(candleSeries) as CandlestickData | undefined;
        const vd = param.seriesData.get(volumeSeries) as HistogramData | undefined;
        if (cd) {
          const matchingCandle = dataRef.current?.candles?.find(c => c.time === param.time);
          const decomp = matchingCandle
            ? ((matchingCandle.buyRatio !== undefined)
                ? matchingCandle
                : calculateCandleVolumeDecomposition(matchingCandle))
            : calculateCandleVolumeDecomposition({
                time: Number(param.time),
                open: cd.open,
                high: cd.high,
                low: cd.low,
                close: cd.close,
                volume: vd ? vd.value : 0
              });

          setHoverData({
            time: typeof param.time === 'number'
              ? new Date(param.time * 1000).toLocaleString('th-TH')
              : String(param.time),
            open: cd.open, high: cd.high, low: cd.low, close: cd.close,
            volume: vd ? vd.value : 0,
            buyRatio: decomp.buyRatio,
            sellRatio: decomp.sellRatio,
            buyVolume: decomp.buyVolume,
            sellVolume: decomp.sellVolume
          });
        }
      }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('dblclick', onDblClick);
      if (rafId) cancelAnimationFrame(rafId);
      if (redrawAnimFrameId) cancelAnimationFrame(redrawAnimFrameId);
      if (livePriceLineRef.current && candleSeriesRef.current) {
        try { candleSeriesRef.current.removePriceLine(livePriceLineRef.current); } catch {}
        livePriceLineRef.current = null;
      }
      chart.remove();
    };
  }, []);

  // ─── DATA UPDATE ──────────────────────────────
  useEffect(() => {
    if (!data || !candleSeriesRef.current || !volumeSeriesRef.current || !chartRef.current) return;

    const cs = candleSeriesRef.current;
    const vs = volumeSeriesRef.current;

    cs.setData(data.candles.map(c => ({
      time: c.time as UTCTimestamp,
      open: c.open, high: c.high, low: c.low, close: c.close
    })));

    vs.setData(data.candles.map(c => {
      const decomp = (c.buyRatio !== undefined) ? c : calculateCandleVolumeDecomposition(c);
      const isDominantBuy = (decomp.buyRatio ?? 50) >= 50;
      return {
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: isDominantBuy ? 'rgba(8,212,134,0.3)' : 'rgba(255,51,102,0.3)'
      };
    }));

    // BOS/CHoCH markers
    if (settings.showStructure && data.breaks) {
      cs.setMarkers(data.breaks.map(brk => {
        const isBull = brk.bias === 'bullish';
        return {
          time: brk.time as UTCTimestamp,
          position: isBull ? 'belowBar' : 'aboveBar',
          color: isBull ? '#08d486' : '#ff3366',
          shape: isBull ? 'arrowUp' : 'arrowDown',
          text: `${brk.type} ${isBull ? '▲' : '▼'}`
        } as SeriesMarker<Time>;
      }));
    } else {
      cs.setMarkers([]);
    }

    // Price lines
    priceLinesRef.current.forEach(l => { try { cs.removePriceLine(l); } catch {} });
    priceLinesRef.current = [];

    if (settings.showPremiumDiscount && data.premiumDiscount) {
      const pd = data.premiumDiscount;
      const curr = isThaiSymbol(data.symbol) ? '฿' : '$';
      priceLinesRef.current.push(
        cs.createPriceLine({ price: pd.equilibrium, color: '#8b5cf6', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `กึ่งกลางสมดุล ${curr}${pd.equilibrium}` }),
        cs.createPriceLine({ price: pd.high, color: 'rgba(244,63,94,0.6)', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: '🔴 โซนของแพง (รอขาย)' }),
        cs.createPriceLine({ price: pd.low, color: 'rgba(16,185,129,0.6)', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: '🟢 โซนของถูก (รอซื้อ)' })
      );
    }

    // Reset live price line when switching symbol or timeframe and auto-calibrate view to the new stock
    const currentKey = `${data.symbol}_${data.timeframe}`;
    if (currentKey !== lastLoadedKeyRef.current) {
      lastLoadedKeyRef.current = currentKey;
      if (livePriceLineRef.current) {
        try { cs.removePriceLine(livePriceLineRef.current); } catch {}
        livePriceLineRef.current = null;
      }
      prevPriceRef.current = null;

      // 1. Reset vertical scale & pan to 100% and calibrate stable price anchor for the new stock
      calibratePriceScale(data.candles);

      // 2. Automatically recalibrate vertical price scale to the new stock's price range
      chartRef.current.priceScale('right').applyOptions({ autoScale: true });
      cs.applyOptions({});

      // 3. Fit content across the full container
      chartRef.current.timeScale().fitContent();

      // Double-tap in next frame to ensure the new price range is 100% properly scaled & drawn
      requestAnimationFrame(() => {
        if (!chartRef.current) return;
        calibratePriceScale(data.candles);
        chartRef.current.priceScale('right').applyOptions({ autoScale: true });
        candleSeriesRef.current?.applyOptions({});
        chartRef.current.timeScale().fitContent();
        drawOverlays();
      });
    }

    // Immediately draw / update the real-time price line for the loaded stock!
    if (settings.showRealtimePriceLine !== false) {
      const activeQuote = (liveQuote && matchSymbol(liveQuote.symbol, data.symbol))
        ? liveQuote
        : quotes?.find(q => matchSymbol(q.symbol, data.symbol));

      const price = activeQuote?.price || data.summary?.keyLevels?.currentPrice || (data.candles.length > 0 ? data.candles[data.candles.length - 1].close : 0);
      const changePct = activeQuote?.changePercent ?? data.summary?.keyLevels?.changePercent ?? 0;
      const change = activeQuote?.change ?? (data.summary?.keyLevels as any)?.change ?? data.summary?.keyLevels?.change24h ?? 0;

      if (price > 0) {
        updateRealtimePriceLine(price, changePct, change);
      }
    }

    setTimeout(() => drawOverlays(), 50);
    setTimeout(() => drawOverlays(), 200);
  }, [data, settings.showStructure, settings.showPremiumDiscount, drawOverlays]);

  // ─── REAL-TIME PRICE LINE UPDATE FUNCTION ─────────────────────
  const updateRealtimePriceLine = useCallback((currentPrice: number, changePercent: number = 0, change: number = 0) => {
    const cs = candleSeriesRef.current;
    if (!cs || currentPrice <= 0) return;

    if (settingsRef.current.showRealtimePriceLine === false) {
      if (livePriceLineRef.current) {
        try { cs.removePriceLine(livePriceLineRef.current); } catch {}
        livePriceLineRef.current = null;
      }
      return;
    }

    const sym = selectedSymbol || dataRef.current?.symbol || '';
    const isThai = isThaiSymbol(sym);
    const curr = isThai ? '฿' : '$';
    const isBull = changePercent >= 0;
    const lineColor = isBull ? '#08d486' : '#ff3366';
    const titleText = `${isBull ? '▲' : '▼'} ${curr}${currentPrice.toFixed(2)} (${isBull ? '+' : ''}${changePercent.toFixed(2)}%)`;

    // 1. Update or create the dedicated live price line
    if (!livePriceLineRef.current) {
      try {
        livePriceLineRef.current = cs.createPriceLine({
          price: currentPrice,
          color: lineColor,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          axisLabelColor: lineColor,
          axisLabelTextColor: '#ffffff',
          title: titleText,
        });
      } catch (err) {
        console.warn('Failed to create live price line:', err);
      }
    } else {
      try {
        livePriceLineRef.current.applyOptions({
          price: currentPrice,
          color: lineColor,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          axisLabelColor: lineColor,
          axisLabelTextColor: '#ffffff',
          title: titleText,
        });
      } catch (err) {
        try {
          livePriceLineRef.current = cs.createPriceLine({
            price: currentPrice,
            color: lineColor,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            axisLabelColor: lineColor,
            axisLabelTextColor: '#ffffff',
            title: titleText,
          });
        } catch {}
      }
    }

    // 2. Real-time update to the last candle bar ONLY if current chart data matches the stock
    if (dataRef.current?.candles && dataRef.current.candles.length > 0 && matchSymbol(dataRef.current.symbol, sym)) {
      const candles = dataRef.current.candles;
      const last = candles[candles.length - 1];
      if (last) {
        const newHigh = Math.max(last.high, currentPrice);
        const newLow = Math.min(last.low, currentPrice);
        last.close = currentPrice;
        last.high = newHigh;
        last.low = newLow;

        try {
          cs.update({
            time: last.time as UTCTimestamp,
            open: last.open,
            high: newHigh,
            low: newLow,
            close: currentPrice,
          });
        } catch {}

        // Real-time volume micro-update
        const vs = volumeSeriesRef.current;
        if (vs) {
          try {
            const tickVol = Math.floor(Math.random() * 25) + 5;
            last.volume = (last.volume || 0) + tickVol;
            const isDominantBuy = currentPrice >= last.open;
            vs.update({
              time: last.time as UTCTimestamp,
              value: last.volume,
              color: isDominantBuy ? 'rgba(8,212,134,0.35)' : 'rgba(255,51,102,0.35)',
            });
          } catch {}
        }
      }
    }

    // 3. Update HUD live price info & tick animation
    let tickDir: 'up' | 'down' | 'same' = 'same';
    if (prevPriceRef.current !== null) {
      if (currentPrice > prevPriceRef.current) tickDir = 'up';
      else if (currentPrice < prevPriceRef.current) tickDir = 'down';
    }
    prevPriceRef.current = currentPrice;

    setLivePriceInfo({
      price: currentPrice,
      change,
      changePercent,
      tickDirection: tickDir,
    });
  }, [selectedSymbol]);

  // Clear tick direction after brief animation (crisp 1s pulse)
  useEffect(() => {
    if (livePriceInfo?.tickDirection && livePriceInfo.tickDirection !== 'same') {
      const timer = setTimeout(() => {
        setLivePriceInfo(prev => prev ? { ...prev, tickDirection: 'same' } : null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [livePriceInfo?.price, livePriceInfo?.tickDirection]);

  // Sync real-time price line whenever liveQuote, quotes, selectedSymbol, data or indicator setting changes
  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs) return;

    if (settings.showRealtimePriceLine === false) {
      if (livePriceLineRef.current) {
        try { cs.removePriceLine(livePriceLineRef.current); } catch {}
        livePriceLineRef.current = null;
      }
      return;
    }

    // Always target the clicked/selected stock!
    const target = selectedSymbol || data?.symbol || '';
    if (!target) return;

    // Guard: If data belongs to a different stock than target (e.g. while new stock candles are loading),
    // do NOT draw target's price line on the old stock's candle chart!
    if (data && !matchSymbol(data.symbol, target)) return;

    // 1. Look in liveQuote if it matches the target stock
    let activeQuote: StockQuote | undefined = undefined;
    if (liveQuote && matchSymbol(liveQuote.symbol, target)) {
      activeQuote = liveQuote;
    }
    // 2. Look in quotes array for target stock
    if (!activeQuote && quotes) {
      activeQuote = quotes.find(q => matchSymbol(q.symbol, target));
    }

    let price = activeQuote?.price;
    let changePct = activeQuote?.changePercent ?? 0;
    let change = activeQuote?.change ?? 0;

    // 3. Fallback to data only if data matches the target stock
    if ((!price || price <= 0) && data && matchSymbol(data.symbol, target)) {
      if (data.summary?.keyLevels?.currentPrice) {
        price = data.summary.keyLevels.currentPrice;
        changePct = data.summary.keyLevels.changePercent ?? 0;
        change = (data.summary.keyLevels as any)?.change ?? data.summary.keyLevels.change24h ?? 0;
      } else if (data.candles && data.candles.length > 0) {
        price = data.candles[data.candles.length - 1].close;
        changePct = 0;
        change = 0;
      }
    }

    if (price && price > 0) {
      if (prevPriceRef.current !== price) {
        updateRealtimePriceLine(price, changePct, change);
      }
    }
  }, [liveQuote, quotes, selectedSymbol, data, settings.showRealtimePriceLine, updateRealtimePriceLine]);

  // Re-draw on indicator toggle
  useEffect(() => {
    drawOverlays();
    const t = setTimeout(drawOverlays, 50);
    return () => clearTimeout(t);
  }, [settings, drawOverlays]);

  const currSym = isThaiSymbol(selectedSymbol || data?.symbol) ? '฿' : '$';

  const changeColor = data
    ? (data.summary.keyLevels.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400')
    : 'text-slate-400';

  return (
    <div className={`relative w-full bg-[#070a12] border border-white/[0.08] overflow-hidden flex flex-col transition-all duration-300 shadow-2xl shadow-black/50 ${
      isFullscreen
        ? 'fixed inset-0 z-50 rounded-none w-screen h-screen'
        : 'h-full flex-1 min-h-[400px] rounded-2xl'
    }`}>
      {/* ── 1. Stock Ticker Tab Strip (Integrated & 100% aligned with chart) ── */}
      {quotes && onSelectStock && selectedSymbol && (
        <M7Bar
          quotes={quotes}
          selectedSymbol={selectedSymbol}
          onSelectStock={onSelectStock}
          isLoading={isLoadingQuotes}
        />
      )}

      {/* ── 2. Toolbar: Timeframe, Indicators & Chart Actions (Fixed Height h-10, Zero Layout Shift) ── */}
      <div className="flex items-center justify-between px-3 bg-[#080b14]/90 backdrop-blur-md border-b border-white/[0.06] z-10 h-10 shrink-0 gap-2 select-none overflow-x-auto no-scrollbar">
        {/* Left: Timeframe & Indicators */}
        <IndicatorControls
          timeframe={timeframe}
          onSelectTimeframe={onSelectTimeframe}
          settings={settings}
          onUpdateSettings={onUpdateSettings}
        />

        {/* Right: Quick Tools (Horizontal Zoom, Vertical Scale & Pan, Reset Zoom, Fullscreen) */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {/* Live Market Streaming Indicator */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-mono text-emerald-300 shadow-sm"
            title="ระบบจำลองและสตรีมมิ่งราคา Real-time พร้อมอัปเดตแท่งเทียนสดทุก 1.4 วินาที"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="font-bold text-[10px] hidden sm:inline">LIVE TICK</span>
          </div>

          {/* 0. Mouse Wheel Mode Toggle (สลับฟังก์ชันลูกกลิ้งเมาส์: ซูมเข้า-ออก vs เลื่อนซ้าย-ขวา) */}
          <div className="flex items-center bg-[#07090f] p-0.5 rounded-lg border border-white/[0.08] shadow-inner gap-0.5">
            <button
              onClick={() => setWheelMode('zoom')}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded transition-all active:scale-95 ${
                wheelMode === 'zoom'
                  ? 'bg-gradient-to-r from-cyan-500/25 to-blue-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.25)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="ตั้งค่าลูกกลิ้งเมาส์: หมุนขึ้น = ซูมเข้าไป | หมุนลง = ขยายกว้างขึ้น (โหมดเริ่มต้น)"
            >
              <ZoomIn className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono text-[10.5px] font-bold">ลูกกลิ้ง: ซูม</span>
            </button>
            <button
              onClick={() => setWheelMode('scroll')}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded transition-all active:scale-95 ${
                wheelMode === 'scroll'
                  ? 'bg-gradient-to-r from-emerald-500/25 to-teal-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="ตั้งค่าลูกกลิ้งเมาส์: หมุนเพื่อเลื่อนกราฟซ้าย-ขวา"
            >
              <Move className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-mono text-[10.5px] font-bold">ลูกกลิ้ง: เลื่อน</span>
            </button>
          </div>

          {/* 1. Horizontal Zoom In / Out Controls (ขยายดูกราฟแนวนอน) */}
          <div className="flex items-center bg-[#07090f] p-0.5 rounded-lg border border-white/[0.08] shadow-inner gap-0.5">
            <button
              onClick={() => handleZoomHorizontal(0.72)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-100 hover:text-cyan-300 hover:bg-white/[0.06] rounded transition-all active:scale-95 shadow-sm"
              title="ขยายซูมดูกราฟใกล้ๆ (Zoom In) | หรือหมุนสกอร์เมาส์"
            >
              <ZoomIn className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono text-[11px] font-bold">ขยายดูใกล้</span>
            </button>
            <button
              onClick={() => handleZoomHorizontal(1.38)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-slate-300 hover:text-cyan-300 hover:bg-white/[0.06] rounded transition-all active:scale-95"
              title="ซูมออกดูกราฟระยะไกล (Zoom Out) | หรือหมุนสกอร์เมาส์"
            >
              <ZoomOut className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono text-[11px] font-bold hidden sm:inline">ซูมไกล</span>
            </button>
          </div>

          {/* 2. Vertical Height Controls (ปรับความสูงแท่งเทียน) */}
          <div className="flex items-center bg-[#07090f] p-0.5 rounded-lg border border-white/[0.08] shadow-inner gap-0.5">
            <button
              onClick={() => handleZoomVertical(1.10)}
              className="px-1.5 py-1 text-xs font-medium text-slate-300 hover:text-cyan-300 hover:bg-white/[0.06] rounded transition-all active:scale-95"
              title="ยืดความสูงแท่งเทียนขึ้น (↕+) | หรือกด Shift + เลื่อนลูกกลิ้งเมาส์"
            >
              <span className="font-mono text-[11px] font-bold">↕ ยืด</span>
            </button>
            <button
              onClick={handleResetVertical}
              className={`px-1.5 py-0.5 text-[10.5px] font-mono font-medium rounded transition-all ${
                verticalZoomDisplay !== 100
                  ? 'text-cyan-400 bg-cyan-500/15 font-bold shadow-[0_0_8px_rgba(6,182,212,0.2)]'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="สัดส่วนความสูงแท่งเทียน (คลิกเพื่อรีเซ็ตกลับ 100%)"
            >
              {verticalZoomDisplay}%
            </button>
            <button
              onClick={() => handleZoomVertical(1 / 1.10)}
              className="px-1.5 py-1 text-xs font-medium text-slate-300 hover:text-cyan-300 hover:bg-white/[0.06] rounded transition-all active:scale-95"
              title="บีบความสูงแท่งเทียนลง (↕-)"
            >
              <span className="font-mono text-[11px] font-bold">↕ บีบ</span>
            </button>
          </div>

          {/* 3. Vertical Pan Controls (เลื่อนขึ้น/ลง) */}
          <div className="flex items-center bg-[#07090f] p-0.5 rounded-lg border border-white/[0.08] shadow-inner gap-0.5">
            <button
              onClick={() => handlePanVertical('up')}
              className="p-1 px-1.5 text-xs text-slate-300 hover:text-cyan-300 hover:bg-white/[0.06] rounded transition-all active:scale-95"
              title="เลื่อนกราฟขึ้น (Pan Up) | หรือคลิกลากบนกราฟขึ้น-ลง"
            >
              <ChevronUp className="w-3.5 h-3.5 text-slate-300 hover:text-cyan-400" />
            </button>
            <button
              onClick={() => handlePanVertical('down')}
              className="p-1 px-1.5 text-xs text-slate-300 hover:text-cyan-300 hover:bg-white/[0.06] rounded transition-all active:scale-95"
              title="เลื่อนกราฟลง (Pan Down) | หรือคลิกลากบนกราฟขึ้น-ลง"
            >
              <ChevronDown className="w-3.5 h-3.5 text-slate-300 hover:text-cyan-400" />
            </button>
          </div>

          {/* 4. Fit View (พอดีจอ) */}
          <button
            onClick={handleResetZoom}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all shadow-sm active:scale-95"
            title="จัดกราฟพอดีจอ (Fit View) | ดึงมุมมองกลับมาเต็มจอและรีเซ็ตความสูง"
          >
            <RotateCcw className="w-3 h-3 text-slate-400 hover:text-cyan-400" />
            <span className="hidden sm:inline">พอดีจอ</span>
          </button>

          {/* 5. Prominent Fullscreen Expand Button (ขยายดูกราฟเต็มจอ) */}
          <button
            onClick={toggleFullscreen}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 ${
              isFullscreen
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30 hover:text-white shadow-[0_0_12px_rgba(99,102,241,0.25)]'
            }`}
            title={isFullscreen ? "ย่อกลับสู่ขนาดปกติ" : "ขยายดูกราฟเต็มจอ (Fullscreen)"}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-rose-400" />
                <span>ย่อจอปกติ</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>ขยายดูกราฟเต็มจอ</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── 3. Chart Canvas Container with Floating OHLCV HUD (Zero Shaking) ── */}
      <div className="relative w-full flex-1 min-h-0 bg-[#070a12] overflow-hidden">
        {/* ── Unified Floating Action HUD Card (Zero Cut-Off, Zero Overlap, 100% Complete Levels) ── */}
        <div className="absolute top-2.5 left-3.5 z-20 pointer-events-auto flex flex-col gap-1.5 max-w-[calc(100%-28px)] select-none">
          {/* Main Status & Trade Plan Card */}
          <div
            className={`flex flex-col gap-1.5 p-2 px-3 rounded-2xl backdrop-blur-md border transition-all duration-300 shadow-2xl ${
              livePriceInfo?.tickDirection === 'up'
                ? 'bg-[#070d17]/95 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)] ring-1 ring-emerald-400/30'
                : livePriceInfo?.tickDirection === 'down'
                ? 'bg-[#12080e]/95 border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.3)] ring-1 ring-rose-400/30'
                : 'bg-[#07090e]/92 border-white/[0.09] shadow-black/80'
            }`}
          >
            {/* Row 1: Real-time Live Price & AI Verdict */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
              {livePriceInfo && (() => {
                const marketStatus = getMarketStatus(data?.symbol || selectedSymbol || 'NVDA');
                return (
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="relative flex h-2 w-2 shrink-0">
                      {marketStatus.isOpen && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      )}
                      <span
                        className={`relative inline-flex rounded-full h-2 w-2 ${
                          marketStatus.isOpen
                            ? "bg-emerald-400"
                            : marketStatus.session === "LUNCH_BREAK"
                            ? "bg-amber-400"
                            : "bg-rose-400"
                        }`}
                      />
                    </span>
                    <span className="font-extrabold text-white text-[13px] tracking-tight">
                      {currSym}{livePriceInfo.price.toFixed(2)}
                    </span>
                    <span
                      className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded leading-none ${
                        livePriceInfo.changePercent >= 0
                          ? 'text-emerald-300 bg-emerald-500/20'
                          : 'text-rose-300 bg-rose-500/20'
                      }`}
                    >
                      {livePriceInfo.changePercent >= 0 ? '+' : ''}
                      {livePriceInfo.changePercent.toFixed(2)}%
                    </span>
                    {!marketStatus.isOpen && (
                      <span
                        className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded border border-rose-500/30 bg-rose-500/15 text-rose-300 cursor-help"
                        title={`${marketStatus.fullLabel}\n• ${marketStatus.scheduleNote}\n• ${marketStatus.nextOpenText}`}
                      >
                        {marketStatus.shortBadge}
                      </span>
                    )}
                  </div>
                );
              })()}

              {data?.summary?.simpleTradePlan?.holdAdvice ? (
                <>
                  <span className="text-white/20 hidden sm:inline">|</span>
                  <div className="flex items-center gap-1.5 text-xs font-sans">
                    <span
                      className={`font-bold px-2 py-0.5 rounded-md border text-[11px] shadow-sm ${
                        data.summary.simpleTradePlan.holdAdvice.theme === 'rose'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/35'
                          : data.summary.simpleTradePlan.holdAdvice.theme === 'cyan'
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/35'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35'
                      }`}
                      title={data.summary.simpleTradePlan.holdAdvice.reason}
                    >
                      {data.summary.simpleTradePlan.holdAdvice.badgeText}
                    </span>
                    {aiVerdict && (
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shadow-sm transition-colors ${
                          aiVerdict.badgeColor === 'emerald'
                            ? 'text-emerald-300 bg-emerald-500/20 border-emerald-500/35'
                            : aiVerdict.badgeColor === 'yellow'
                            ? 'text-yellow-300 bg-yellow-500/20 border-yellow-500/35'
                            : aiVerdict.badgeColor === 'orange'
                            ? 'text-orange-300 bg-orange-500/20 border-orange-500/35'
                            : aiVerdict.badgeColor === 'rose'
                            ? 'text-rose-300 bg-rose-500/20 border-rose-500/35'
                            : 'text-cyan-300 bg-cyan-500/15 border-cyan-500/25'
                        }`}
                      >
                        AI {aiVerdict.confidenceScore}%
                      </span>
                    )}
                  </div>
                </>
              ) : aiVerdict && (
                <>
                  <span className="text-white/20 hidden sm:inline">|</span>
                  <div className="flex items-center gap-1.5 text-xs font-sans">
                    <span
                      className={`font-bold ${
                        aiVerdict.badgeColor === 'emerald'
                          ? 'text-emerald-300'
                          : aiVerdict.badgeColor === 'rose'
                          ? 'text-rose-300'
                          : aiVerdict.badgeColor === 'yellow'
                          ? 'text-yellow-300'
                          : aiVerdict.badgeColor === 'orange'
                          ? 'text-orange-300'
                          : 'text-amber-300'
                      }`}
                    >
                      {aiVerdict.badgeLabel}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shadow-sm transition-colors ${
                        aiVerdict.badgeColor === 'emerald'
                          ? 'text-emerald-300 bg-emerald-500/20 border-emerald-500/35'
                          : aiVerdict.badgeColor === 'yellow'
                          ? 'text-yellow-300 bg-yellow-500/20 border-yellow-500/35'
                          : aiVerdict.badgeColor === 'orange'
                          ? 'text-orange-300 bg-orange-500/20 border-orange-500/35'
                          : aiVerdict.badgeColor === 'rose'
                          ? 'text-rose-300 bg-rose-500/20 border-rose-500/35'
                          : 'text-cyan-300 bg-cyan-500/15 border-cyan-500/25'
                      }`}
                    >
                      AI {aiVerdict.confidenceScore}%
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Row 2: Complete Trade Plan Levels (Always 100% visible, never cut off!) */}
            {data?.summary?.simpleTradePlan && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 border-t border-white/[0.07] text-[11px] font-mono text-slate-300">
                <span className="flex items-center gap-1">
                  <span className="text-slate-400">🛒 ช้อน:</span>
                  <b className="text-emerald-400 font-bold">
                    {currSym}{data.summary.simpleTradePlan.buyZone.minPrice.toFixed(1)}–{currSym}{data.summary.simpleTradePlan.buyZone.maxPrice.toFixed(1)}
                  </b>
                </span>

                <span className="text-white/15">•</span>

                <span className="flex items-center gap-1">
                  <span className="text-slate-400">🎯 โซนขาย 1Y (แรงขายสูง):</span>
                  <b className="text-cyan-300 font-bold">
                    {data.summary.simpleTradePlan.sellZone
                      ? `${currSym}${data.summary.simpleTradePlan.sellZone.minPrice.toFixed(1)}–${currSym}${data.summary.simpleTradePlan.sellZone.maxPrice.toFixed(1)}`
                      : `${currSym}${data.summary.simpleTradePlan.sellTargets.target1Year.price.toFixed(1)}`}
                  </b>
                </span>

                <span className="text-white/15">•</span>

                <span className="flex items-center gap-1">
                  <span className="text-slate-400">🛑 คัท:</span>
                  <b className="text-rose-400 font-bold">
                    {currSym}{data.summary.simpleTradePlan.cutLoss.price.toFixed(1)}
                  </b>
                </span>
              </div>
            )}
          </div>

          {/* Hover OHLCV HUD: Sits neatly underneath the card */}
          {hoverData && (
            <div className="flex items-center gap-2 text-[10.5px] font-mono px-2.5 py-1 rounded-lg bg-[#07090e]/92 backdrop-blur-md border border-white/[0.08] text-slate-300 shadow-xl select-none self-start">
              <span className="text-slate-400 text-[10px] pr-1.5 border-r border-white/10 hidden sm:inline">
                {hoverData.time}
              </span>
              <span>O <b className="text-slate-200">{currSym}{hoverData.open.toFixed(2)}</b></span>
              <span>H <b className="text-emerald-400">{currSym}{hoverData.high.toFixed(2)}</b></span>
              <span>L <b className="text-rose-400">{currSym}{hoverData.low.toFixed(2)}</b></span>
              <span>Vol <b className="text-cyan-300">{(hoverData.volume / 1e6).toFixed(1)}M</b></span>
            </div>
          )}
        </div>

        {/* Floating Quick Zoom & Pan Control Pill (TradingView Style at bottom-right) */}
        <div className="absolute bottom-8 right-16 z-20 pointer-events-auto select-none flex items-center gap-1.5 bg-[#090d19]/90 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/10 shadow-xl shadow-black/50 text-[11px] font-mono">
          <button
            onClick={() => setWheelMode(prev => prev === 'zoom' ? 'scroll' : 'zoom')}
            className={`px-2 py-0.5 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition-all shadow-sm active:scale-95 ${
              wheelMode === 'zoom'
                ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.25)]'
                : 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
            }`}
            title="คลิกสลับฟังก์ชันลูกกลิ้งเมาส์: [หมุนขึ้นซูมเข้า / หมุนลงขยายกว้าง] หรือ [เลื่อนซ้าย-ขวา]"
          >
            {wheelMode === 'zoom' ? (
              <>
                <ZoomIn className="w-3 h-3 text-cyan-400" />
                <span>ลูกกลิ้ง: ซูม</span>
              </>
            ) : (
              <>
                <Move className="w-3 h-3 text-emerald-400" />
                <span>ลูกกลิ้ง: เลื่อน</span>
              </>
            )}
          </button>
          <span className="text-white/15">|</span>
          <button
            onClick={() => handleZoomHorizontal(0.72)}
            className="px-1.5 py-0.5 font-bold text-cyan-300 hover:bg-cyan-500/20 rounded active:scale-90 transition-all flex items-center gap-1"
            title="ขยายซูมดูกราฟใกล้ๆ (Zoom In)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
            <span className="text-[10px]">ขยายดู</span>
          </button>
          <button
            onClick={() => handleZoomHorizontal(1.38)}
            className="px-1.5 py-0.5 font-bold text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/20 rounded active:scale-90 transition-all flex items-center gap-1"
            title="ซูมออกดูกราฟระยะไกล (Zoom Out)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
            <span className="text-[10px]">ซูมไกล</span>
          </button>
          <span className="text-white/15">|</span>
          <button
            onClick={() => handleZoomVertical(1.10)}
            className="px-1 py-0.5 font-bold text-slate-300 hover:text-cyan-300 hover:bg-white/10 rounded active:scale-90 transition-all"
            title="ยืดแท่งเทียนให้สูงขึ้น (↕+)"
          >
            ↕+
          </button>
          <button
            onClick={handleResetVertical}
            className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-all ${
              verticalZoomDisplay !== 100 ? 'text-cyan-400 bg-cyan-500/20' : 'text-slate-400 hover:text-white'
            }`}
            title="คืนค่าความสูงปกติ (100%)"
          >
            {verticalZoomDisplay}%
          </button>
          <button
            onClick={() => handleZoomVertical(1 / 1.10)}
            className="px-1 py-0.5 font-bold text-slate-300 hover:text-cyan-300 hover:bg-white/10 rounded active:scale-90 transition-all"
            title="บีบแท่งเทียนให้เตี้ยลง (↕-)"
          >
            ↕-
          </button>
          <span className="text-white/10">|</span>
          <button
            onClick={() => handlePanVertical('up')}
            className="px-1 py-0.5 text-slate-300 hover:text-cyan-300 hover:bg-white/10 rounded active:scale-90 transition-all"
            title="เลื่อนกราฟขึ้น (▲)"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            onClick={() => handlePanVertical('down')}
            className="px-1 py-0.5 text-slate-300 hover:text-cyan-300 hover:bg-white/10 rounded active:scale-90 transition-all"
            title="เลื่อนกราฟลง (▼)"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        {/* Chart Canvas */}
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#06080f]/85 backdrop-blur-md flex flex-col items-center justify-center gap-3.5 z-30">
          <div className="relative flex items-center justify-center">
            <div className="w-12 h-12 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
            <div className="absolute w-6 h-6 border-2 border-indigo-500/30 border-b-indigo-400 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          </div>
          <span className="text-xs font-mono font-bold tracking-wider text-cyan-300">
            SMC MARKET ENGINE CALCULATION...
          </span>
        </div>
      )}

      {/* Watermark */}
      <div className="absolute bottom-3 left-3 pointer-events-none opacity-[0.07] select-none z-0 flex items-center gap-2">
        <img src="/logo.svg" alt="" className="w-6 h-6 grayscale opacity-80" />
        <div className="text-xl font-black tracking-[0.25em] text-slate-100 font-mono">AI-SMC LUXALGO</div>
      </div>
    </div>
  );
};
