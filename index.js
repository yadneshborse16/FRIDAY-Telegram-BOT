const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// Render वेब सर्विस पोर्ट बाइंडिंग के लिए छोटा HTTP सर्वर
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('FRIDAY Bot is online and running!\n');
});

server.listen(PORT, () => {
  console.log(`HTTP Server is listening on port ${PORT}`);
});

const bot = new Telegraf('8804212194:AAGkCSQy3LgD_SVbLBaBREO3RGquKTChiyc');

// यूजर स्टेट्स ट्रैक करने के लिए: { userId: { insults: 0, warnings: 0, name: '' } }
const userStats = {}; 

// केवल बेसिक सेफ वर्ड्स जो 'छोड़ने' या 'छोटा' के सेंस में आते हैं
const safeWords = [
  'chhod', 'chhod do', 'chhodo', 'chhota', 'chhoti', 'chhotu', 
  'pachhayat', 'bachha', 'bachho', 'achha', 'achhi'
];

// गालियों की फिक्स लिस्ट
const badWordsList = [
  'madarchod', 'madarchodh', 'bhenchod', 'bhenchodh', 'bhosdiwala', 'bhosdike',
  'chutiya', 'chutiye', 'chutiyapa', 'bhadwa', 'bhadwe', 'bhadva', 'bhadve',
  'maakichut', 'maki chut', 'gaali', 'lande', 'lode', 'fuck', 'shit'
];

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

// एडमिन कमांड: /resetwarns (रिप्लाई करके या यूजर आईडी के साथ इस्तेमाल कर सकते हैं)
bot.command('resetwarns', async (ctx) => {
  try {
    if (!(await isAuthorized(ctx, ctx.from.id))) {
      return ctx.reply("Unauthorized! Only admins can reset warnings.");
    }

    // अगर किसी मैसेज पर रिप्लाई किया गया है
    if (ctx.message.reply_to_message) {
      const targetUserId = ctx.message.reply_to_message.from.id;
      const targetUserName = ctx.message.reply_to_message.from.first_name || 'User';

      if (userStats[targetUserId]) {
        userStats[targetUserId].insults = 0;
        userStats[targetUserId].warnings = 0;
        return ctx.reply(`🔄 All warnings and strikes have been reset for ${targetUserName} by admin.`);
      } else {
        return ctx.reply(`No warnings found for ${targetUserName}.`);
      }
    } else {
      return ctx.reply("Please reply to a user's message with `/resetwarns` to clear their warnings.");
    }
  } catch (error) {
    console.error('Resetwarns error:', error);
  }
});

bot.on('text', async (ctx) => {
  try {
    if (ctx.chat.type === 'private') return;

    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'User';
    const chatId = ctx.chat.id;
    const rawText = ctx.message.text.toLowerCase();

    // 1. सेफ वर्ड्स चेक करें
    let isSafe = false;
    for (const safeWord of safeWords) {
      if (rawText.includes(safeWord)) {
        isSafe = true;
        break;
      }
    }

    if (isSafe) return;

    // 2. टेक्स्ट को नॉर्मलाइज करें (सारे स्टार्स *, स्पेस, डैश हटा दें)
    const cleanedText = rawText.replace(/[\s\*\-\_\.\,\!\@\#\$\%\^\&\(\)\+\=\~\`]+/g, '');

    // 3. गाली मैच करें
    let isProfane = false;
    for (const badWord of badWordsList) {
      if (cleanedText.includes(badWord)) {
        isProfane = true;
        break;
      }
    }

    if (isProfane) {
      const userIsAdmin = await isAuthorized(ctx, userId);

      // अगर एडमिन या ओनर है -> सिर्फ मैसेज उड़ाओ, कोई म्यूट/बैन नहीं
      if (userIsAdmin) {
        await ctx.deleteMessage();
        return;
      }

      // नॉर्मल यूजर के लिए एक्शन
      await ctx.deleteMessage();

      if (!userStats[userId]) {
        userStats[userId] = { insults: 0, warnings: 0, name: userName };
      }

      userStats[userId].insults += 1;

      // 2 घंटे के लिए म्यूट
      const muteDurationHours = 2;
      const muteUntil = Math.floor(Date.now() / 1000) + (muteDurationHours * 60 * 60);
      
      await ctx.telegram.restrictChatMember(chatId, userId, {
        until_date: muteUntil,
        permissions: { can_send_messages: false }
      });

      // गालियों की संख्या चेक करें (हर 10 पर वार्निंग)
      if (userStats[userId].insults >= 10) {
        userStats[userId].warnings += 1;
        userStats[userId].insults = 0; 

        const currentWarnings = userStats[userId].warnings;

        if (currentWarnings < 3) {
          await ctx.reply(
            `⚠️ Warning [${currentWarnings}/3] issued to ${userName}.\nReason: 10 profanity violations reached.\n🔇 Status: Muted for ${muteDurationHours} hours.`,
            Markup.inlineKeyboard([
              [
                Markup.button.callback(`🔊 Unmute`, `unmute_${userId}`),
                Markup.button.callback(`🔄 Reset Warns`, `resetwarns_${userId}`)
              ]
            ])
          );
        } else {
          // तीसरा वार्निंग -> परमानेंट बैन
          await ctx.telegram.banChatMember(chatId, userId);
          await ctx.reply(
            `🚫 Protocol Finalized: ${userName} has been permanently banned due to 3 cumulative warnings.`,
            Markup.inlineKeyboard([
              [Markup.button.callback(`🔓 Unban`, `unban_${userId}`)]
            ])
          );
          delete userStats[userId];
        }
      } else {
        await ctx.reply(
          `🔇 ${userName} has been muted for ${muteDurationHours} hours.\nReason: Inappropriate language detected. (Strike ${userStats[userId].insults}/10)`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback(`🔊 Unmute`, `unmute_${userId}`),
              Markup.button.callback(`🔄 Reset Warns`, `resetwarns_${userId}`)
            ]
          ])
        );
      }
    }
  } catch (error) {
    console.error('Moderation error:', error);
  }
});

// अनम्यूट बटन का एक्शन (सिर्फ एडमिन)
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

// रिसेट वार्निंग्स बटन का एक्शन (सिर्फ एडमिन)
bot.action(/^resetwarns_(.+)$/, async (ctx) => {
  try {
    const userId = ctx.match[1];
    if (!(await isAuthorized(ctx, ctx.from.id))) {
      return ctx.answerCbQuery("Unauthorized action! Only admins can use this.", { show_alert: true });
    }

    if (userStats[userId]) {
      userStats[userId].insults = 0;
      userStats[userId].warnings = 0;
    }

    await ctx.answerCbQuery("All warnings and strikes reset successfully!");
    await ctx.editMessageText("🔄 User's warnings and strikes have been completely reset by an admin.");
  } catch (error) {
    console.error('Reset warns error:', error);
    await ctx.answerCbQuery("Failed to reset warnings.", { show_alert: true });
  }
});

// अनबैन बटन का एक्शन (सिर्फ एडमिन)
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
console.log('FRIDAY V5 Moderation Bot with Reset Warns is active...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
                                       
