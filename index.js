const { Telegraf, Markup } = require('telegraf');

// बोट टोकन सीधे यहाँ जोड़ दिया गया है
const bot = new Telegraf('8804212194:AAGkCSQy3LgD_SVbLBaBREO3RGquKTChiyc');

// यूजर स्टेट्स ट्रैक करने के लिए: { userId: { insults: 0, warnings: 0 } }
const userStats = {}; 

// सेफ वर्ड्स की लिस्ट (जैसे 'chhod', 'chhota', आदि)
const safeWords = [
  'chhod', 'chhod do', 'chhodo', 'chhota', 'chhoti', 'chhotu', 
  'pachhayat', 'bachha', 'bachho', 'achha', 'achhi'
];

// गालियों के एडवांस्ड पैटर्न्स
const profanityPatterns = [
  /m\s*a\s*d\s*a\s*r\s*c\s*h\s*o\s*d/gi,
  /b\s*h\s*e\s*n\s*c\s*h\s*o\s*d/gi,
  /b\s*h\s*o\s*s\s*d\s*i\s*w\s*a\s*l\s*a/gi,
  /ch\s*u\s*t\s*i\s*y\s*a/gi,
  /g\s*a\s*a\s*l\s*i/gi,
  /l\s*a\s*n\s*d\s*e/gi,
  /f\s*u\s*c\s*k/gi,
  /s\s*h\s*i\s*t\s*(?!at)/gi
];

// चेक करने के लिए कि यूजर एडमिन, ओनर या एनोनिमस चैनल है या नहीं
async function isAuthorized(ctx, userId) {
  try {
    if (ctx.message && ctx.message.sender_chat) {
      return true;
    }
    const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return ['creator', 'administrator'].includes(chatMember.status);
  } catch (error) {
    console.error('Authorization check error:', error);
    return false;
  }
}

// मुख्य मॉडरेशन और टेक्स्ट फिल्टरिंग लॉजिक
bot.on('text', async (ctx) => {
  try {
    if (ctx.chat.type === 'private') return;

    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'User';
    const chatId = ctx.chat.id;

    if (await isAuthorized(ctx, userId)) {
      return;
    }

    const text = ctx.message.text.toLowerCase();

    // स्टेप 1: सेफ वर्ड्स चेक करें
    let isSafe = false;
    for (const safeWord of safeWords) {
      if (text.includes(safeWord)) {
        isSafe = true;
        break;
      }
    }

    if (isSafe) {
      return;
    }

    // स्टेप 2: गाली डिटेक्ट करें
    let isProfane = false;
    for (const pattern of profanityPatterns) {
      if (pattern.test(text)) {
        isProfane = true;
        break;
      }
    }

    if (isProfane) {
      // 1. मैसेज डिलीट करें
      await ctx.deleteMessage();

      if (!userStats[userId]) {
        userStats[userId] = { insults: 0, warnings: 0 };
      }

      userStats[userId].insults += 1;

      // 2. 2 घंटे (120 मिनट) के लिए म्यूट करें
      const muteDurationHours = 2;
      const muteUntil = Math.floor(Date.now() / 1000) + (muteDurationHours * 60 * 60);
      
      await ctx.telegram.restrictChatMember(chatId, userId, {
        until_date: muteUntil,
        permissions: { can_send_messages: false }
      });

      // 3. गालियों की संख्या चेक करें (हर 10 पर वार्निंग)
      if (userStats[userId].insults >= 10) {
        userStats[userId].warnings += 1;
        userStats[userId].insults = 0; 

        const currentWarnings = userStats[userId].warnings;

        if (currentWarnings < 3) {
          await ctx.reply(
            `⚠️ Warning [${currentWarnings}/3] issued to ${userName}.\nReason: 10 profanity violations reached.\n🔇 Status: Muted for ${muteDurationHours} hours.`,
            Markup.inlineKeyboard([
              [Markup.button.callback(`🔊 Unmute ${userName}`, `unmute_${userId}`)]
            ])
          );
        } else {
          // तीसरा वार्निंग होने पर परमानेंट बैन
          await ctx.telegram.banChatMember(chatId, userId);
          await ctx.reply(
            `🚫 Protocol Finalized: ${userName} has been permanently banned due to 3 cumulative warnings (30 total profanity hits).`,
            Markup.inlineKeyboard([
              [Markup.button.callback(`🔓 Unban ${userName}`, `unban_${userId}`)]
            ])
          );
          delete userStats[userId];
        }
      } else {
        await ctx.reply(
          `🔇 ${userName} has been muted for ${muteDurationHours} hours.\nReason: Inappropriate language detected. (Strike ${userStats[userId].insults}/10)`,
          Markup.inlineKeyboard([
            [Markup.button.callback(`🔊 Unmute ${userName}`, `unmute_${userId}`)]
          ])
        );
      }
    }
  } catch (error) {
    console.error('Moderation error:', error);
  }
});

// अनम्यूट बटन का एक्शन
bot.action(/^unmute_(.+)$/, async (ctx) => {
  try {
    const userId = ctx.match[1];
    if (!(await isAuthorized(ctx, ctx.from.id))) {
      return ctx.answerCbQuery("Unauthorized action! Only admins can use this.", { show_alert: true });
    }

    await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
      permissions: {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true
      }
    });

    await ctx.answerCbQuery("User unmuted successfully!");
    await ctx.editMessageText("🔊 User has been unmuted early by an admin.");
  } catch (error) {
    console.error('Unmute error:', error);
    await ctx.answerCbQuery("Failed to unmute user.", { show_alert: true });
  }
});

// अनबैन बटन का एक्शन
bot.action(/^unban_(.+)$/, async (ctx) => {
  try {
    const userId = ctx.match[1];
    if (!(await isAuthorized(ctx, ctx.from.id))) {
      return ctx.answerCbQuery("Unauthorized action! Only admins can use this.", { show_alert: true });
    }

    await ctx.telegram.unbanChatMember(ctx.chat.id, userId);
    await ctx.answerCbQuery("User unbanned successfully!");
    await ctx.editMessageText("🔓 User has been unbanned by an admin.");
  } catch (error) {
    console.error('Unban error:', error);
    await ctx.answerCbQuery("Failed to unban user.", { show_alert: true });
  }
});

bot.launch();
console.log('FRIDAY Background Moderation Bot is active with embedded token...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
