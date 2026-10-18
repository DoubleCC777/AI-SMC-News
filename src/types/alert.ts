export interface AlertConfig {
  soundEnabled: boolean;
  inAppEnabled: boolean;
  // Discord
  discordEnabled: boolean;
  discordWebhookUrl: string;
  // Telegram
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  // LINE Notify
  lineEnabled: boolean;
  lineNotifyToken: string;
  // LINE Bot (Messaging API - ส่งตรงเข้าห้องแชทส่วนตัว/กลุ่ม)
  lineBotEnabled: boolean;
  lineBotChannelToken: string;
  lineBotUserId: string;
  // Condition filters
  minConfidenceScore: number; // e.g. 70
  requireVolumeConfirmation: boolean; // e.g. buyRatio >= 50%
  requireWickConfirmation: boolean; // e.g. lower wick >= 35% of range
}

export interface MultiTfAlertSnapshot {
  tf: string; // '1D' | '4H' | '1H'
  label: string; // '1D (รายวัน)', '4H (4 ชม.)', '1H (1 ชม.)'
  score: number; // e.g. 82
  badge: string; // 'เข้าซื้อได้ โอกาสกำไรสูง'
  trend?: string;
  buyRatio?: number;
}

export interface BuyAlertItem {
  id: string;
  timestamp: number;
  symbol: string;
  companyName: string;
  currentPrice: number;
  buyZoneMin: number;
  buyZoneMax: number;
  targetPrice6M: number;
  targetPrice1Y: number;
  stopLossPrice: number;
  confidenceScore: number;
  volumeBuyRatio: number;
  volumeDelta: number;
  wickRejection: boolean;
  timeframe: string;
  title: string;
  message: string;
  read: boolean;
  multiTimeframe?: {
    alignmentText: string;
    items: MultiTfAlertSnapshot[];
  };
}

export interface AlertTestResult {
  channel: 'sound' | 'discord' | 'telegram' | 'line' | 'line-bot';
  success: boolean;
  message: string;
  timestamp: number;
}
