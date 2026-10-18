export interface MarketStatus {
  market: 'US' | 'SET' | 'GOLD';
  marketName: string;
  isOpen: boolean;
  session: 'REGULAR' | 'LUNCH_BREAK' | 'WEEKEND_CLOSED' | 'NIGHT_CLOSED' | 'MAINTENANCE';
  badgeColor: 'emerald' | 'amber' | 'rose';
  shortBadge: string;
  fullLabel: string;
  scheduleNote: string;
  nextOpenText: string;
  localTimeFormatted: string;
}

export function getMarketType(symbol: string): 'US' | 'SET' | 'GOLD' {
  if (!symbol) return 'US';
  const clean = symbol.replace(/\.BK$/i, '').toUpperCase();
  if (['GOLD', 'GC=F', 'XAUUSD', 'GOLDUSD'].includes(clean)) return 'GOLD';
  if (symbol.toUpperCase().endsWith('.BK')) return 'SET';
  const thaiSymbols = [
    'KBANK', 'SCB', 'TISCO', 'BBL', 'PTT', 'CPALL', 'AOT', 'GULF', 'DELTA',
    'BDMS', 'ADVANC', 'TRUE', 'CPN', 'CRC', 'PTTEP', 'MINT', 'TOP', 'IVL', 'BANPU', 'TU'
  ];
  if (thaiSymbols.includes(clean)) return 'SET';
  return 'US';
}

/**
 * คำนวณสถานะเปิด-ปิดของตลาดหุ้นแบบ Real-time ตามเกณฑ์เวลาทางการของแต่ละตลาด
 * - US Market (NYSE/NASDAQ): จันทร์-ศุกร์ 09:30 - 16:00 NY Time (20:30 - 03:00 น. เวลาไทย)
 * - SET (ตลาดหุ้นไทย): จันทร์-ศุกร์ รอบเช้า 10:00-12:30 / พักเที่ยง 12:30-14:30 / รอบบ่าย 14:30-16:30 น.
 * - GOLD (ตลาดทองคำโลก): เปิดจันทร์ 05:00 น. ถึง เสาร์ 04:00 น. เวลาไทย (หยุดเสาร์-อาทิตย์)
 */
export function getMarketStatus(symbol: string, now: Date = new Date()): MarketStatus {
  const marketType = getMarketType(symbol);

  // 1. ตลาดหลักทรัพย์แห่งประเทศไทย (SET: เวลาประเทศไทย UTC+7)
  if (marketType === 'SET') {
    const bkkString = now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
    const bkkDate = new Date(bkkString);
    const day = bkkDate.getDay(); // 0 = Sun, 6 = Sat
    const hour = bkkDate.getHours();
    const minute = bkkDate.getMinutes();
    const totalMinutes = hour * 60 + minute;
    const timeFormatted = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} น.`;

    const isWeekend = day === 0 || day === 6;
    if (isWeekend) {
      return {
        market: 'SET',
        marketName: 'SET (ตลาดหุ้นไทย)',
        isOpen: false,
        session: 'WEEKEND_CLOSED',
        badgeColor: 'rose',
        shortBadge: '🔴 ปิดเสาร์-อาทิตย์',
        fullLabel: 'ตลาด SET ปิดทำการ (วันหยุดสุดสัปดาห์)',
        scheduleNote: 'วันทำการ: จันทร์-ศุกร์ (รอบเช้า 10:00-12:30 / รอบบ่าย 14:30-16:30 น.)',
        nextOpenText: 'เปิดทำการอีกครั้ง: วันจันทร์ 10:00 น.',
        localTimeFormatted: timeFormatted
      };
    }

    const morningOpen = 10 * 60; // 10:00
    const morningClose = 12 * 60 + 30; // 12:30
    const afternoonOpen = 14 * 60 + 30; // 14:30
    const runOffClose = 17 * 60; // 17:00

    if (totalMinutes >= morningOpen && totalMinutes < morningClose) {
      return {
        market: 'SET',
        marketName: 'SET (ตลาดหุ้นไทย)',
        isOpen: true,
        session: 'REGULAR',
        badgeColor: 'emerald',
        shortBadge: '🟢 เปิดรอบเช้า',
        fullLabel: 'ตลาด SET เปิดทำการ (รอบเช้า)',
        scheduleNote: 'รอบเช้า: 10:00 - 12:30 น. | พักเที่ยง: 12:30 - 14:30 น. | รอบบ่าย: 14:30 - 16:30 น.',
        nextOpenText: 'พักเที่ยงเวลา 12:30 น.',
        localTimeFormatted: timeFormatted
      };
    }

    if (totalMinutes >= morningClose && totalMinutes < afternoonOpen) {
      return {
        market: 'SET',
        marketName: 'SET (ตลาดหุ้นไทย)',
        isOpen: false,
        session: 'LUNCH_BREAK',
        badgeColor: 'amber',
        shortBadge: '🟡 พักเที่ยง',
        fullLabel: 'ตลาด SET พักเที่ยง (ปิดชั่วคราว)',
        scheduleNote: 'รอบเช้า: 10:00 - 12:30 น. | พักเที่ยง: 12:30 - 14:30 น. | รอบบ่าย: 14:30 - 16:30 น.',
        nextOpenText: 'เปิดรอบบ่าย: วันนี้ 14:30 น.',
        localTimeFormatted: timeFormatted
      };
    }

    if (totalMinutes >= afternoonOpen && totalMinutes < runOffClose) {
      return {
        market: 'SET',
        marketName: 'SET (ตลาดหุ้นไทย)',
        isOpen: true,
        session: 'REGULAR',
        badgeColor: 'emerald',
        shortBadge: '🟢 เปิดรอบบ่าย',
        fullLabel: 'ตลาด SET เปิดทำการ (รอบบ่าย)',
        scheduleNote: 'รอบเช้า: 10:00 - 12:30 น. | พักเที่ยง: 12:30 - 14:30 น. | รอบบ่าย: 14:30 - 16:30 น.',
        nextOpenText: 'ปิดตลาดรอบบ่าย: วันนี้ 16:30 น.',
        localTimeFormatted: timeFormatted
      };
    }

    const isBeforeMorning = totalMinutes < morningOpen;
    return {
      market: 'SET',
      marketName: 'SET (ตลาดหุ้นไทย)',
      isOpen: false,
      session: 'NIGHT_CLOSED',
      badgeColor: 'rose',
      shortBadge: '🔴 ปิดทำการ',
      fullLabel: 'ตลาด SET ปิดทำการ',
      scheduleNote: 'วันทำการ: จันทร์-ศุกร์ (รอบเช้า 10:00-12:30 / รอบบ่าย 14:30-16:30 น.)',
      nextOpenText: isBeforeMorning
        ? 'เปิดรอบเช้า: วันนี้ 10:00 น.'
        : (day === 5 ? 'เปิดทำการอีกครั้ง: วันจันทร์ 10:00 น.' : 'เปิดรอบเช้า: พรุ่งนี้ 10:00 น.'),
      localTimeFormatted: timeFormatted
    };
  }

  // 2. ตลาดทองคำ (COMEX Gold)
  if (marketType === 'GOLD') {
    const nyString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const nyDate = new Date(nyString);
    const nyDay = nyDate.getDay();
    const nyHour = nyDate.getHours();
    const nyMinute = nyDate.getMinutes();
    const nyTotalMin = nyHour * 60 + nyMinute;

    const bkkString = now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
    const bkkDate = new Date(bkkString);
    const bkkHour = bkkDate.getHours();
    const bkkMinute = bkkDate.getMinutes();
    const timeFormatted = `${bkkHour.toString().padStart(2, '0')}:${bkkMinute.toString().padStart(2, '0')} น.`;

    // Closes Friday 17:00 NY to Sunday 18:00 NY
    const isWeekend = (nyDay === 5 && nyTotalMin >= 17 * 60) || nyDay === 6 || (nyDay === 0 && nyTotalMin < 18 * 60);
    const isDailyBreak = !isWeekend && (nyTotalMin >= 17 * 60 && nyTotalMin < 18 * 60);

    if (isWeekend) {
      return {
        market: 'GOLD',
        marketName: 'COMEX Gold (ทองคำโลก)',
        isOpen: false,
        session: 'WEEKEND_CLOSED',
        badgeColor: 'rose',
        shortBadge: '🔴 ปิดสุดสัปดาห์',
        fullLabel: 'ตลาดทองคำปิดทำการ (สุดสัปดาห์)',
        scheduleNote: 'เวลาเทรด: วันจันทร์ 05:00 น. ถึง วันเสาร์ 04:00 น. (เวลาไทย)',
        nextOpenText: 'เปิดทำการอีกครั้ง: เช้าวันจันทร์ 05:00 น.',
        localTimeFormatted: timeFormatted
      };
    }

    if (isDailyBreak) {
      return {
        market: 'GOLD',
        marketName: 'COMEX Gold (ทองคำโลก)',
        isOpen: false,
        session: 'MAINTENANCE',
        badgeColor: 'amber',
        shortBadge: '🟡 พักระบบประจำวัน',
        fullLabel: 'ตลาดทองคำพักระบบประจำวัน',
        scheduleNote: 'พักระบบวันละ 1 ชม. (04:00 - 05:00 น. เวลาไทย)',
        nextOpenText: 'เปิดทำการอีกครั้งใน 1 ชั่วโมง',
        localTimeFormatted: timeFormatted
      };
    }

    return {
      market: 'GOLD',
      marketName: 'COMEX Gold (ทองคำโลก)',
      isOpen: true,
      session: 'REGULAR',
      badgeColor: 'emerald',
      shortBadge: '🟢 เปิดทำการ 24 ชม.',
      fullLabel: 'ตลาดทองคำเปิดทำการ (24 ชั่วโมง)',
      scheduleNote: 'เทรดต่อเนื่องวันจันทร์ 05:00 น. ถึง วันเสาร์ 04:00 น. (เวลาไทย)',
      nextOpenText: 'ปิดตลาดสุดสัปดาห์: วันเสาร์ 04:00 น.',
      localTimeFormatted: timeFormatted
    };
  }

  // 3. ตลาดหุ้นสหรัฐฯ (US Stocks: NYSE / NASDAQ)
  const nyString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const nyDate = new Date(nyString);
  const nyDay = nyDate.getDay();
  const nyHour = nyDate.getHours();
  const nyMinute = nyDate.getMinutes();
  const nyTotalMin = nyHour * 60 + nyMinute;

  const bkkString = now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
  const bkkDate = new Date(bkkString);
  const bkkHour = bkkDate.getHours();
  const bkkMinute = bkkDate.getMinutes();
  const timeFormatted = `${bkkHour.toString().padStart(2, '0')}:${bkkMinute.toString().padStart(2, '0')} น.`;

  const isWeekend = nyDay === 0 || nyDay === 6;
  if (isWeekend) {
    return {
      market: 'US',
      marketName: 'US Market (NYSE / NASDAQ)',
      isOpen: false,
      session: 'WEEKEND_CLOSED',
      badgeColor: 'rose',
      shortBadge: '🔴 ปิดเสาร์-อาทิตย์',
      fullLabel: 'ตลาดสหรัฐฯ ปิดทำการ (วันหยุดสุดสัปดาห์)',
      scheduleNote: 'เวลาเทรดหลัก: วันจันทร์-ศุกร์ 20:30 - 03:00 น. (เวลาไทย)',
      nextOpenText: 'เปิดทำการอีกครั้ง: คืนวันจันทร์ 20:30 น. (ไทย)',
      localTimeFormatted: timeFormatted
    };
  }

  // Regular Trading Session: 09:30 - 16:00 NY
  const regOpen = 9 * 60 + 30;
  const regClose = 16 * 60;

  if (nyTotalMin >= regOpen && nyTotalMin < regClose) {
    return {
      market: 'US',
      marketName: 'US Market (NYSE / NASDAQ)',
      isOpen: true,
      session: 'REGULAR',
      badgeColor: 'emerald',
      shortBadge: '🟢 ตลาดเปิดทำการ',
      fullLabel: 'ตลาดสหรัฐฯ เปิดทำการ (Regular Hours)',
      scheduleNote: 'เวลาเทรดหลัก: 09:30 - 16:00 NY (20:30 - 03:00 น. เวลาไทย)',
      nextOpenText: 'ปิดตลาดคืนนี้เวลา: 03:00 น. (ไทย)',
      localTimeFormatted: timeFormatted
    };
  }

  const isBeforeOpen = nyTotalMin < regOpen;
  return {
    market: 'US',
    marketName: 'US Market (NYSE / NASDAQ)',
    isOpen: false,
    session: 'NIGHT_CLOSED',
    badgeColor: 'rose',
    shortBadge: '🔴 ตลาดปิดทำการ',
    fullLabel: 'ตลาดสหรัฐฯ ปิดทำการ',
    scheduleNote: 'เวลาเทรดหลัก: วันจันทร์-ศุกร์ 20:30 - 03:00 น. (เวลาไทย)',
    nextOpenText: isBeforeOpen
      ? 'เปิดตลาดคืนนี้: 20:30 น. (เวลาไทย)'
      : (nyDay === 5 ? 'เปิดทำการอีกครั้ง: คืนวันจันทร์ 20:30 น. (ไทย)' : 'เปิดตลาดคืนนี้: 20:30 น. (เวลาไทย)'),
    localTimeFormatted: timeFormatted
  };
}
