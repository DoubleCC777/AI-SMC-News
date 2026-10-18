export interface MultiTfAlertItem {
  tf: string; // '1D', '4H', '1H'
  label?: string; // 'รายวัน', '4 ชม.', '1 ชม.'
  score: number; // e.g. 82
  badge: string; // 'เข้าซื้อได้ โอกาสกำไรสูง'
  trend?: string;
  buyRatio?: number;
}

export interface DispatchAlertPayload {
  symbol: string;
  companyName: string;
  currentPrice: number;
  buyZoneMin: number;
  buyZoneMax: number;
  targetPrice6M?: number;
  targetPrice1Y: number;
  stopLossPrice: number;
  confidenceScore: number;
  volumeBuyRatio: number;
  volumeDelta: number;
  wickRejection: boolean;
  timeframe: string;
  notes?: string;
  multiTimeframe?: {
    alignmentText: string;
    items: MultiTfAlertItem[];
  };
}

export class NotificationService {
  /**
   * Send Rich Embed notification to Discord Webhook
   */
  public static async sendDiscord(
    webhookUrl: string,
    data: DispatchAlertPayload,
  ): Promise<boolean> {
    if (
      !webhookUrl ||
      !webhookUrl.startsWith("https://discord.com/api/webhooks/")
    ) {
      throw new Error(
        "URL Discord Webhook ไม่ถูกต้อง (ต้องขึ้นต้นด้วย https://discord.com/api/webhooks/)",
      );
    }

    const tierLabel =
      data.confidenceScore >= 75
        ? "🟢 เข้าซื้อได้ โอกาสกำไรสูง"
        : data.confidenceScore >= 65
          ? "🟡 ทยอยสะสม แบ่งไม้เข้าซื้อ"
          : data.confidenceScore >= 51
            ? "🟠 ควรรอย่อ ห้ามไล่ราคา"
            : "🔴 ไม่ควรเข้า เสี่ยงสูง";

    const fields: any[] = [
      {
        name: "💵 ราคาปัจจุบัน",
        value: `**$${data.currentPrice.toFixed(2)}**`,
        inline: true,
      },
      {
        name: "🛒 กรอบช้อนซื้อ (Buy Zone)",
        value: `$${data.buyZoneMin.toFixed(2)} – $${data.buyZoneMax.toFixed(2)}`,
        inline: true,
      },
      {
        name: "🧠 AI มั่นใจรวม",
        value: `**${data.confidenceScore}%** (${tierLabel})`,
        inline: true,
      },
      {
        name: "📊 Volume Flow",
        value: `แรงซื้อ **${data.volumeBuyRatio}%** (Delta: ${(data.volumeDelta / 1e6).toFixed(1)}M)`,
        inline: true,
      },
      {
        name: "🎯 โซนขาย 1Y (แรงขายสูง)",
        value: `**$${data.targetPrice1Y.toFixed(2)}**`,
        inline: true,
      },
      {
        name: "🛑 จุดตัดขาดทุน (SL)",
        value: `$${data.stopLossPrice.toFixed(2)}`,
        inline: true,
      },
    ];

    if (data.multiTimeframe && data.multiTimeframe.items.length > 0) {
      const tfText = data.multiTimeframe.items
        .map((it) => `• **${it.tf}**: ${it.score}% (${it.badge})`)
        .join("\n");
      fields.push({
        name: "📊 วิเคราะห์ผสาน 3 Timeframes (1D, 4H, 1H)",
        value: `${tfText}\n_${data.multiTimeframe.alignmentText}_`,
        inline: false,
      });
    }

    const payload = {
      username: "AI·SMC Institutional Alert",
      avatar_url: "https://cdn-icons-png.flaticon.com/512/3314/3314482.png",
      embeds: [
        {
          title: `🟢 [BUY ALERT] ${data.symbol} (${data.companyName}) เข้าสู่จุดซื้อสะสมสถาบัน!`,
          color: 0x10b981, // Emerald Green
          description: `ระบบตรวจพบสัญญาณซื้อตามกรอบ Smart Money Concepts พร้อมวิเคราะห์ผสาน 3 Timeframes`,
          fields,
          footer: {
            text: "AI·SMC News • Smart Money Concepts Institutional Engine",
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`ส่ง Discord ไม่สำเร็จ (${res.status}): ${errText}`);
    }

    return true;
  }

  /**
   * Send formatted HTML alert to Telegram Bot
   */
  public static async sendTelegram(
    botToken: string,
    chatId: string,
    data: DispatchAlertPayload,
  ): Promise<boolean> {
    if (!botToken || !chatId) {
      throw new Error("กรุณาระบุ Telegram Bot Token และ Chat ID ให้ครบถ้วน");
    }

    const tierLabel =
      data.confidenceScore >= 75
        ? "🟢 เข้าซื้อได้ โอกาสกำไรสูง"
        : data.confidenceScore >= 65
          ? "🟡 ทยอยสะสม แบ่งไม้เข้าซื้อ"
          : data.confidenceScore >= 51
            ? "🟠 ควรรอย่อ ห้ามไล่ราคา"
            : "🔴 ไม่ควรเข้า เสี่ยงสูง";

    const messageLines = [
      `<b>🟢 [AI·SMC BUY ALERT] ${data.symbol} เข้าสู่จุดซื้อสถาบัน!</b>`,
      ``,
      `🏢 หุ้น: <b>${data.symbol}</b> (${data.companyName})`,
      `💵 ราคาปัจจุบัน: <b>$${data.currentPrice.toFixed(2)}</b>`,
      `🛒 กรอบช้อนซื้อ (Buy Zone): <b>$${data.buyZoneMin.toFixed(2)} – $${data.buyZoneMax.toFixed(2)}</b>`,
      `🧠 คะแนน AI รวม: <b>${data.confidenceScore}%</b> (${tierLabel})`,
      `📊 Volume Flow: แรงซื้อ <b>${data.volumeBuyRatio}%</b> (Delta: ${(data.volumeDelta / 1e6).toFixed(1)}M)`,
    ];

    if (data.multiTimeframe && data.multiTimeframe.items.length > 0) {
      messageLines.push(``, `<b>📊 วิเคราะห์ผสาน 3 Timeframes:</b>`);
      data.multiTimeframe.items.forEach((it) => {
        messageLines.push(`• <b>${it.tf}</b>: ${it.score}% (${it.badge})`);
      });
      messageLines.push(`<i>${data.multiTimeframe.alignmentText}</i>`);
    }

    messageLines.push(
      ``,
      `🎯 โซนขาย 1Y (แรงขายสูง): <b>$${data.targetPrice1Y.toFixed(2)}</b>`,
      `🛑 จุดตัดขาดทุน (SL): <b>$${data.stopLossPrice.toFixed(2)}</b>`,
      ``,
      `<i>⚡ Smart Money Concepts • AI Confluence Engine</i>`,
    );

    const message = messageLines.join("\n");

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      throw new Error(
        `ส่ง Telegram ไม่สำเร็จ: ${json.description || res.statusText}`,
      );
    }

    return true;
  }

  /**
   * Send notification to LINE Notify
   */
  public static async sendLine(
    lineToken: string,
    data: DispatchAlertPayload,
  ): Promise<boolean> {
    if (!lineToken) {
      throw new Error("กรุณาระบุ LINE Notify Token");
    }

    const tierLabel =
      data.confidenceScore >= 75 ? "เข้าซื้อได้ โอกาสกำไรสูง" : "ทยอยสะสม";

    const messageLines = [
      `\n🟢 [AI-SMC BUY ALERT]`,
      `หุ้น: ${data.symbol} (${data.companyName})`,
      `ราคา: $${data.currentPrice.toFixed(2)}`,
      `โซนช้อน: $${data.buyZoneMin.toFixed(2)} - $${data.buyZoneMax.toFixed(2)}`,
      `AI รวม: ${data.confidenceScore}% (${tierLabel})`,
      `วอลุ่มซื้อ: ${data.volumeBuyRatio}%`,
    ];

    if (data.multiTimeframe && data.multiTimeframe.items.length > 0) {
      const tfSummary = data.multiTimeframe.items
        .map((it) => `${it.tf}:${it.score}%`)
        .join(" | ");
      messageLines.push(`3-TF: ${tfSummary}`);
    }

    messageLines.push(
      `เป้าหมาย 1Y (แรงขายสูง): $${data.targetPrice1Y.toFixed(2)}`,
      `ตัดขาดทุน: $${data.stopLossPrice.toFixed(2)}`,
    );

    const message = messageLines.join("\n");

    const res = await fetch("https://notify-api.line.me/api/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${lineToken}`,
      },
      body: new URLSearchParams({ message }).toString(),
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.status !== 200) {
      throw new Error(
        `ส่ง LINE ไม่สำเร็จ (${json.status || res.status}): ${json.message || "Token อาจหมดอายุหรือไม่ถูกต้อง"}`,
      );
    }

    return true;
  }

  /**
   * Send Rich Flex Message directly into LINE Chat via LINE Messaging API (LINE Official Account / Bot)
   */
  public static async sendLineBot(
    channelAccessToken: string,
    toUserId: string,
    data: DispatchAlertPayload,
  ): Promise<boolean> {
    if (!channelAccessToken || !toUserId) {
      throw new Error(
        "กรุณาระบุ LINE Channel Access Token และ User ID ให้ครบถ้วน",
      );
    }

    const tierLabel =
      data.confidenceScore >= 75
        ? "เข้าซื้อได้ โอกาสกำไรสูง"
        : data.confidenceScore >= 65
          ? "ทยอยสะสม แบ่งไม้เข้าซื้อ"
          : data.confidenceScore >= 51
            ? "ควรรอย่อ ห้ามไล่ราคา"
            : "ไม่ควรเข้า เสี่ยงสูง";

    const tierLabelShort =
      data.confidenceScore >= 75
        ? "โอกาสกำไรสูง"
        : data.confidenceScore >= 65
          ? "ทยอยสะสม"
          : data.confidenceScore >= 51
            ? "ควรรอย่อ"
            : "ไม่ควรเข้า";

    const tierColor =
      data.confidenceScore >= 75
        ? "#34d399"
        : data.confidenceScore >= 65
          ? "#facc15"
          : data.confidenceScore >= 51
            ? "#fb923c"
            : "#f87171";

    const isThai =
      data.symbol.endsWith(".BK") ||
      [
        "KBANK",
        "SCB",
        "TISCO",
        "BBL",
        "PTT",
        "CPALL",
        "AOT",
        "DELTA",
        "GULF",
      ].includes(data.symbol.replace(/\.BK$/i, "").toUpperCase());
    const curr = isThai ? "฿" : "$";

    const gain1Y =
      data.currentPrice > 0
        ? (
            ((data.targetPrice1Y - data.currentPrice) / data.currentPrice) *
            100
          ).toFixed(1)
        : "0.0";
    const lossSL =
      data.currentPrice > 0
        ? (
            ((data.stopLossPrice - data.currentPrice) / data.currentPrice) *
            100
          ).toFixed(1)
        : "0.0";

    const hasMultiTf = Boolean(
      data.multiTimeframe &&
      data.multiTimeframe.items &&
      data.multiTimeframe.items.length > 0,
    );
    const is15m = Boolean(
      data.timeframe &&
      (data.timeframe.toUpperCase().includes("15M") ||
        data.timeframe.toUpperCase() === "15M"),
    );
    const tfPillText =
      hasMultiTf || is15m ? "3-TF CONFLUENCE" : data.timeframe.toUpperCase();

    const statusPillBg =
      data.confidenceScore >= 75
        ? "#064e3b"
        : data.confidenceScore >= 65
          ? "#713f12"
          : data.confidenceScore >= 51
            ? "#451a03"
            : "#4c0519";

    const statusPillColor =
      data.confidenceScore >= 75
        ? "#6ee7b7"
        : data.confidenceScore >= 65
          ? "#fde047"
          : data.confidenceScore >= 51
            ? "#fdba74"
            : "#fb7185";

    const statusPillText =
      data.confidenceScore >= 75
        ? "● เข้าซื้อได้"
        : data.confidenceScore >= 65
          ? "● ทยอยสะสม"
          : data.confidenceScore >= 51
            ? "● ควรรอย่อ"
            : "● ไม่ควรเข้า เสี่ยงสูง";

    // ── 1. Hero Pricing & AI Verdict Box ──
    const bodyContents: any[] = [
      {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0f172a",
        cornerRadius: "12px",
        paddingAll: "14px",
        borderWidth: "1px",
        borderColor: "#1e293b",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            alignItems: "center",
            contents: [
              {
                type: "text",
                text: "💵 ราคาปัจจุบัน",
                size: "xs",
                color: "#94a3b8",
                flex: 4,
              },
              {
                type: "text",
                text: `${curr}${data.currentPrice.toFixed(2)}`,
                size: "md",
                weight: "bold",
                color: "#38bdf8",
                align: "end",
                flex: 7,
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            alignItems: "center",
            margin: "sm",
            contents: [
              {
                type: "text",
                text: "💰 โซนช้อนซื้อ",
                size: "xs",
                color: "#94a3b8",
                flex: 4,
              },
              {
                type: "text",
                text: `${curr}${data.buyZoneMin.toFixed(2)} – ${curr}${data.buyZoneMax.toFixed(2)}`,
                size: "xs",
                weight: "bold",
                color: "#34d399",
                align: "end",
                flex: 7,
              },
            ],
          },
          {
            type: "separator",
            margin: "md",
            color: "#1e293b",
          },
          {
            type: "box",
            layout: "horizontal",
            alignItems: "center",
            margin: "md",
            contents: [
              {
                type: "text",
                text: "⚡ ความมั่นใจ AI",
                size: "xs",
                color: "#94a3b8",
                flex: 4,
              },
              {
                type: "text",
                text: `${data.confidenceScore}% (${tierLabelShort})`,
                size: "xs",
                weight: "bold",
                color: tierColor,
                align: "end",
                flex: 7,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            alignItems: "center",
            margin: "sm",
            contents: [
              {
                type: "text",
                text: "📊 วอลุ่มสถาบัน",
                size: "xs",
                color: "#94a3b8",
                flex: 4,
              },
              {
                type: "text",
                text: `ซื้อ ${data.volumeBuyRatio}% / ขาย ${100 - data.volumeBuyRatio}%`,
                size: "xs",
                weight: "bold",
                color: data.volumeBuyRatio >= 50 ? "#34d399" : "#fb7185",
                align: "end",
                flex: 7,
              },
            ],
          },
        ],
      },
    ];

    // ── 2. Multi-Timeframe Confluence Section (1H ซ้ายสุด • 4H ตรงกลาง • 1D ขวาสุด) ──
    if (hasMultiTf && data.multiTimeframe) {
      // Sort strictly: 1H (left) -> 4H (middle) -> 1D (right)
      const tfOrder = ["1H", "4H", "1D"];
      const sortedItems = [...data.multiTimeframe.items].sort((a, b) => {
        const ia = tfOrder.indexOf(a.tf.toUpperCase());
        const ib = tfOrder.indexOf(b.tf.toUpperCase());
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });

      const tfBoxes = sortedItems.slice(0, 3).map((it) => {
        // Tiers according to user criteria:
        // 75% - 100%: เข้าซื้อได้ โอกาสกำไรสูง (Emerald Green)
        // 65% - 74%: ทยอยสะสม แบ่งไม้เข้าซื้อ (Golden Yellow)
        // 51% - 64%: ควรรอย่อ ห้ามไล่ราคา (Sunset Orange)
        // 0% - 50%: ไม่ควรเข้า เสี่ยงสูง (Ruby Red)
        const isGreen = it.score >= 75;
        const isYellow = it.score >= 65 && it.score < 75;
        const isOrange = it.score >= 51 && it.score < 65;

        const boxBg = isGreen
          ? "#042f2e"
          : isYellow
            ? "#362402"
            : isOrange
              ? "#381604"
              : "#3b0717";

        const boxBorder = isGreen
          ? "#059669"
          : isYellow
            ? "#d97706"
            : isOrange
              ? "#ea580c"
              : "#e11d48";

        const labelColor = isGreen
          ? "#6ee7b7"
          : isYellow
            ? "#fde047"
            : isOrange
              ? "#fdba74"
              : "#fca5a5";

        const itemColor = isGreen
          ? "#34d399"
          : isYellow
            ? "#facc15"
            : isOrange
              ? "#fb923c"
              : "#fb7185";

        const tfShortLabel =
          it.tf.toUpperCase() === "1H"
            ? "1H (1 ชม)"
            : it.tf.toUpperCase() === "4H"
              ? "4H (4 ชม)"
              : "1D (วัน)";

        const statusText = isGreen
          ? "เข้าซื้อได้"
          : isYellow
            ? "ทยอยสะสม"
            : isOrange
              ? "ควรรอย่อ"
              : "ไม่ควรเข้า";

        return {
          type: "box",
          layout: "vertical",
          backgroundColor: boxBg,
          cornerRadius: "10px",
          paddingAll: "10px",
          alignItems: "center",
          justifyContent: "center",
          borderWidth: "1.5px",
          borderColor: boxBorder,
          contents: [
            {
              type: "text",
              text: tfShortLabel,
              size: "xxs",
              color: labelColor,
              weight: "bold",
              align: "center",
            },
            {
              type: "text",
              text: `${it.score}%`,
              size: "md",
              weight: "bold",
              color: itemColor,
              align: "center",
              margin: "xs",
            },
            {
              type: "text",
              text: statusText,
              size: "xxs",
              color: itemColor,
              weight: "bold",
              align: "center",
              margin: "xs",
            },
          ],
        };
      });

      const isConflict = Boolean(
        data.multiTimeframe.alignmentText?.includes("ขัดแย้ง") ||
        data.multiTimeframe.alignmentText?.includes("⚠️"),
      );
      const cleanAlignment = data.multiTimeframe.alignmentText
        ? data.multiTimeframe.alignmentText.replace(/^[🎯⚡⚠️✓]\s*/, "")
        : "สัญญาณสอดคล้อง 2/3 Timeframes";
      const alignIcon = isConflict ? "⚠️" : "✓";
      const alignColor = isConflict ? "#fb7185" : "#64748b";

      bodyContents.push({
        type: "box",
        layout: "vertical",
        margin: "md",
        contents: [
          {
            type: "text",
            text: "📊 ความสอดคล้อง 3 TIMEFRAMES",
            size: "xxs",
            weight: "bold",
            color: "#38bdf8",
            margin: "xs",
          },
          {
            type: "box",
            layout: "horizontal",
            margin: "sm",
            spacing: "sm",
            contents: tfBoxes,
          },
          {
            type: "text",
            text: `${alignIcon} ${cleanAlignment}`,
            size: "xxs",
            color: alignColor,
            align: "center",
            margin: "sm",
            wrap: true,
          },
        ],
      });
    }

    // ── 3. Targets & Stop Loss Card ──
    bodyContents.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      backgroundColor: "#0f172a",
      cornerRadius: "12px",
      paddingAll: "14px",
      borderWidth: "1px",
      borderColor: "#1e293b",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          alignItems: "center",
          contents: [
            {
              type: "text",
              text: "🎯 โซนขาย 1Y (แรงขายสูง)",
              size: "xs",
              color: "#94a3b8",
              flex: 5,
            },
            {
              type: "text",
              text: `${curr}${data.targetPrice1Y.toFixed(2)} (+${gain1Y}%)`,
              size: "xs",
              weight: "bold",
              color: "#34d399",
              align: "end",
              flex: 6,
            },
          ],
        },
        {
          type: "separator",
          margin: "sm",
          color: "#1e293b",
        },
        {
          type: "box",
          layout: "horizontal",
          alignItems: "center",
          margin: "sm",
          contents: [
            {
              type: "text",
              text: "⛔ ตัดขาดทุน (SL)",
              size: "xs",
              color: "#94a3b8",
              flex: 5,
            },
            {
              type: "text",
              text: `${curr}${data.stopLossPrice.toFixed(2)} (${lossSL}%)`,
              size: "xs",
              weight: "bold",
              color: "#f43f5e",
              align: "end",
              flex: 6,
            },
          ],
        },
      ],
    });

    const flexBubble = {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0c1220",
        paddingAll: "16px",
        paddingBottom: "14px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            justifyContent: "space-between",
            alignItems: "center",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                backgroundColor: statusPillBg,
                cornerRadius: "6px",
                width: "135px",
                height: "24px",
                justifyContent: "center",
                alignItems: "center",
                contents: [
                  {
                    type: "text",
                    text: statusPillText,
                    weight: "bold",
                    color: statusPillColor,
                    size: "xxs",
                    align: "center",
                    gravity: "center",
                  },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                backgroundColor: "#1e293b",
                cornerRadius: "6px",
                width: "115px",
                height: "24px",
                justifyContent: "center",
                alignItems: "center",
                contents: [
                  {
                    type: "text",
                    text: tfPillText,
                    color: "#38bdf8",
                    size: "xxs",
                    weight: "bold",
                    align: "center",
                    gravity: "center",
                  },
                ],
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            justifyContent: "space-between",
            alignItems: "center",
            margin: "md",
            contents: [
              {
                type: "text",
                text: `${data.symbol}`,
                weight: "bold",
                size: "xxl",
                color: "#ffffff",
                flex: 0,
              },
              {
                type: "text",
                text: `${curr}${data.currentPrice.toFixed(2)}`,
                weight: "bold",
                size: "xl",
                color: "#38bdf8",
                align: "end",
                flex: 0,
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            justifyContent: "space-between",
            contents: [
              {
                type: "text",
                text: `${data.companyName}`,
                size: "xs",
                color: "#94a3b8",
                flex: 0,
              },
              {
                type: "text",
                text: "Smart Money Concepts",
                size: "xxs",
                color: "#64748b",
                align: "end",
                flex: 0,
              },
            ],
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#07090e",
        paddingAll: "16px",
        paddingTop: "12px",
        contents: bodyContents,
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0c1220",
        paddingAll: "12px",
        contents: [
          {
            type: "text",
            text: "⚡ AI·SMC Institutional Engine • iOS",
            size: "xxs",
            color: "#64748b",
            align: "center",
          },
        ],
      },
    };

    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: toUserId,
        messages: [
          {
            type: "flex",
            altText: `${data.symbol} ถึงจุดเข้าซื้อสถาบันแล้ว! ($${data.currentPrice.toFixed(2)}) • AI ${data.confidenceScore}% (${tierLabel})`,
            contents: flexBubble,
          },
        ],
        notificationDisabled: false,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const details = err.details ? ` (${JSON.stringify(err.details)})` : "";
      throw new Error(
        `ส่ง LINE Bot ไม่สำเร็จ (${res.status}): ${err.message || res.statusText || "Token หรือ User ID ไม่ถูกต้อง"}${details}`,
      );
    }

    return true;
  }
}
