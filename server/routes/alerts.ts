import { Router, Request, Response } from 'express';
import { NotificationService, DispatchAlertPayload } from '../services/notificationService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, '../data/alertConfig.json');

const router = Router();

// Ensure data folder exists
const dataDir = path.dirname(CONFIG_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// In-memory fallback
let cachedConfig: any = {
  soundEnabled: true,
  inAppEnabled: true,
  discordEnabled: false,
  discordWebhookUrl: '',
  telegramEnabled: false,
  telegramBotToken: '',
  telegramChatId: '',
  lineEnabled: false,
  lineNotifyToken: '',
  lineBotEnabled: false,
  lineBotChannelToken: '',
  lineBotUserId: '',
  minConfidenceScore: 75,
  requireVolumeConfirmation: true,
  requireWickConfirmation: false
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    cachedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (e) {
    console.warn('[Alerts] Could not read alertConfig.json, using defaults.');
  }
}

// GET /api/alerts/config
router.get('/config', (req: Request, res: Response) => {
  res.json({ success: true, data: cachedConfig });
});

// POST /api/alerts/config
router.post('/config', (req: Request, res: Response) => {
  try {
    cachedConfig = { ...cachedConfig, ...req.body };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cachedConfig, null, 2), 'utf-8');
    res.json({ success: true, data: cachedConfig });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/alerts/test - Test notification connection
router.post('/test', async (req: Request, res: Response) => {
  const { channel, config, alertData } = req.body;
  const samplePayload: DispatchAlertPayload = alertData || {
    symbol: 'AMZN',
    companyName: 'Amazon.com, Inc.',
    currentPrice: 251.03,
    buyZoneMin: 238.48,
    buyZoneMax: 251.03,
    targetPrice6M: 323.68,
    targetPrice1Y: 323.68,
    stopLossPrice: 227.48,
    confidenceScore: 66,
    volumeBuyRatio: 52,
    volumeDelta: 4200000,
    wickRejection: true,
    timeframe: '1d',
    notes: 'ทดสอบการเชื่อมต่อระบบแจ้งเตือน AI-SMC',
    multiTimeframe: {
      alignmentText: '⚡ สัญญาณสอดคล้อง 2/3 Timeframes (1D ทรงดี / 1H, 4H ควรรอย่อ)',
      items: [
        { tf: '1H', label: '1 ชม.', score: 56, badge: '🟠 ควรรอย่อ ห้ามไล่ราคา', trend: 'NEUTRAL' },
        { tf: '4H', label: '4 ชม.', score: 62, badge: '🟠 ควรรอย่อ ห้ามไล่ราคา', trend: 'NEUTRAL' },
        { tf: '1D', label: 'รายวัน', score: 79, badge: '🟢 เข้าซื้อได้ โอกาสกำไรสูง', trend: 'BULLISH' }
      ]
    }
  };

  try {
    if (channel === 'discord') {
      const url = config?.discordWebhookUrl || cachedConfig.discordWebhookUrl;
      await NotificationService.sendDiscord(url, samplePayload);
      return res.json({ success: true, message: 'ส่งข้อความทดสอบไปยัง Discord สำเร็จ! 🟢' });
    }

    if (channel === 'telegram') {
      const token = config?.telegramBotToken || cachedConfig.telegramBotToken;
      const chatId = config?.telegramChatId || cachedConfig.telegramChatId;
      await NotificationService.sendTelegram(token, chatId, samplePayload);
      return res.json({ success: true, message: 'ส่งข้อความทดสอบไปยัง Telegram สำเร็จ! 🟢' });
    }

    if (channel === 'line') {
      const token = config?.lineNotifyToken || cachedConfig.lineNotifyToken;
      await NotificationService.sendLine(token, samplePayload);
      return res.json({ success: true, message: 'ส่งข้อความทดสอบไปยัง LINE Notify สำเร็จ! 🟢' });
    }

    if (channel === 'line-bot') {
      const token = config?.lineBotChannelToken || cachedConfig.lineBotChannelToken;
      const userId = config?.lineBotUserId || cachedConfig.lineBotUserId;
      await NotificationService.sendLineBot(token, userId, samplePayload);
      return res.json({ success: true, message: 'ส่งการ์ดแจ้งเตือนเข้าห้องแชท LINE สำเร็จเรียบร้อย! 🟢' });
    }

    res.status(400).json({ success: false, error: 'ไม่พบช่องทางแจ้งเตือนที่ระบุ' });
  } catch (error: any) {
    console.error(`[Alerts] Test failed for ${channel}:`, error.message);
    res.status(400).json({ success: false, error: error.message || 'ส่งข้อความทดสอบไม่สำเร็จ' });
  }
});

// POST /api/alerts/dispatch - Broadcast buy alert across all enabled channels
router.post('/dispatch', async (req: Request, res: Response) => {
  const { alertData, config } = req.body;
  const cfg = config || cachedConfig;

  const results: Record<string, { success: boolean; error?: string }> = {};

  if (cfg.discordEnabled && cfg.discordWebhookUrl) {
    try {
      await NotificationService.sendDiscord(cfg.discordWebhookUrl, alertData);
      results.discord = { success: true };
    } catch (e: any) {
      results.discord = { success: false, error: e.message };
    }
  }

  if (cfg.telegramEnabled && cfg.telegramBotToken && cfg.telegramChatId) {
    try {
      await NotificationService.sendTelegram(cfg.telegramBotToken, cfg.telegramChatId, alertData);
      results.telegram = { success: true };
    } catch (e: any) {
      results.telegram = { success: false, error: e.message };
    }
  }

  if (cfg.lineEnabled && cfg.lineNotifyToken) {
    try {
      await NotificationService.sendLine(cfg.lineNotifyToken, alertData);
      results.line = { success: true };
    } catch (e: any) {
      results.line = { success: false, error: e.message };
    }
  }

  if (cfg.lineBotEnabled && cfg.lineBotChannelToken && cfg.lineBotUserId) {
    try {
      await NotificationService.sendLineBot(cfg.lineBotChannelToken, cfg.lineBotUserId, alertData);
      results.lineBot = { success: true };
    } catch (e: any) {
      results.lineBot = { success: false, error: e.message };
    }
  }

  res.json({ success: true, results });
});

export default router;
