# ⚡ AI·SMC Institutional Trading & Multi-Timeframe Alert Platform

> **Advanced Smart Money Concepts (SMC) Engine** with real-time multi-timeframe confluence analysis (1H, 4H, 1D), 24/7 background scanner, and instant automated LINE Bot Flex Message alerts.

---

## ✨ Key Features

- **🏛️ Institutional Smart Money Concepts (SMC):**
  - Order Blocks (OB), Fair Value Gaps (FVG), Premium & Discount Zones (OTE).
  - Break of Structure (BOS), Change of Character (CHoCH), and Liquidity Sweeps.
  - Institutional Volume Flow & Delta analytics.

- **⏱️ 3-Timeframe Confluence (หารสาม):**
  - Concurrently analyzes **1H (1 ชม.)**, **4H (4 ชม.)**, and **1D (รายวัน)** timeframes.
  - Balanced multi-timeframe average scoring formula preventing false breakouts.

- **🎯 Automated 24/7 Background Alert Scanner:**
  - Real-time monitoring across Magnificent 7 (AAPL, NVDA, MSFT, AMZN, GOOGL, META, TSLA) and Thai blue-chips (KBANK, SCB, etc.).
  - **Take Profit (TP) Proximity Alerts:** Alerts when price reaches 98% of target (`99% (ใกล้ถึง TP)`).
  - **Institutional Buy Zone Alerts:** Alerts when price enters the optimal discount entry zone (`🟢 เข้าซื้อได้` / `🟡 ทยอยสะสม`).
  - Strict single-alert cycle guarantee with hysteresis reset logic.

- **📱 LINE Bot Flex Message Notifications:**
  - Custom Cyber Ultraviolet neon theme for TP alerts (`🎯 ใกล้ถึง TP`).
  - Distinct Emerald & Amber neon capsule badges for Buy (`🟢 เข้าซื้อได้`) and Accumulate (`🟡 ทยอยสะสม`).
  - Complete 3-timeframe visual breakdown directly in LINE chat.

---

## 🚀 Quick Start

### 1. Installation

```bash
git clone https://github.com/DoubleCC777/AI-SMC-News.git
cd AI-SMC-News
npm install
```

### 2. Configure Alerts (Optional)

Copy the configuration template:
```bash
cp server/data/alertConfig.example.json server/data/alertConfig.json
```
Edit `server/data/alertConfig.json` with your LINE Channel Access Token and User ID.

### 3. Run Development Server

```bash
npm run dev
```

The application will start with:
- **Frontend:** `http://localhost:5173`
- **Backend API:** `http://localhost:5000`

### 4. Production Build

```bash
npm run build
npm start
```

---

## 🛠️ Tech Stack

- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, Lucide Icons, Lightweight Charts
- **Backend:** Node.js, Express, TypeScript, TSX
- **Market Data:** Yahoo Finance Real-time Engine
- **Messaging:** LINE Messaging API (Flex Messages), LINE Notify, Discord, Telegram

---

## 📄 License

MIT License. Designed & Developed for Smart Money Institutional Trading.