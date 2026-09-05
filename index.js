const { Telegraf, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('FRIDAY Bot is online and running!\n');
});

server.listen(PORT, () => {
  console.log(`HTTP Server is listening on port ${PORT}`);
});

const bot = new Telegraf('8804212194:AAGkCSQy3LgD_SVbLBaBREO3RGquKTChiyc');

const userStats = {}; 

// डेटा को परमानेंट सेव रखने के लिए फाइल हैंडलिंग
const DATA_FILE = './triggers.json';
let customTriggers = {};

// अगर पहले से फाइल मौजूद है तो डेटा लोड करें
if (fs.existsSync(DATA_FILE)) {
  try {
    const fileData = fs.readFileSync(DATA_FILE, 'utf8');
    customTriggers = JSON.parse(fileData);
  } catch (err) {
    console.error('Error reading triggers file:', err);
    customTriggers = {};
  }
}

// डेटा सेव करने का फंक्शन
function saveTriggers() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(customTriggers, null, 2));
  } catch (err) {
    console.error('Error writing triggers file:', err);
  }
}

const safeWords = [
  'chhod', 'chhod do', 'chhodo', 'chhota', 'chhoti', 'chhotu', 
  'pachhayat', 'bachha', 'bachho', 'achha', 'achhi'
];

const badWordsList = [
  'madarchod', 'madarchodh', 'bhenchod', 'bhenchodh', 'bhosdiwala', 'bhosdike',
  'chutiya', 'chutiye', 'chutiyapa', 'bhadwa', 'bhadwe', 'bhadva', 'bhadve',
  'maakichut', 'maki chut', 'gaali', 'lande', 'lode', 'laude', 'fuck', 'shit',
  'lavde', 'lauda', 'bhosda', 'choot', 'chut', 'gandu', 'gaand', 'gaandu'
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

// 1. /add कमांड: किसी मैसेज/फाइल पर रिप्लाई करके `/add movie box` लिखना
bot.command('add', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;

    if (!(await isAuthorized(ctx, userId))) {
      return ctx.reply("Unauthorized! Only admins can use /add.");
    }

    const fullText = ctx.message.text.trim();
    const keyword = fullText.substring(4).trim().toLowerCase();
    
    if (!keyword || !ctx.message.reply_to_message) {
      return ctx.reply("Usage: Reply to any message/APK/file with `/add [keyword]`");
    }

    const targetMsg = ctx.message.reply_to_message;

    if (!customTriggers[chatId]) {
      customTriggers[chatId] = {};
    }

    customTriggers[chatId][keyword] = {
      from_chat_id: targetMsg.chat.id,
      message_id: targetMsg.message_id
    };

    saveTriggers(); // फाइल में परमानेंट सेव करें
    return ctx.reply(`✅ Filter saved successfully for '${keyword}'!`);
  } catch (error) {
    console.error('Add filter error:', error);
  }
});

// 2. /added कमांड: सभी सेव किए गए फिल्टर्स देखना
bot.command('added', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    if (!customTriggers[chatId] || Object.keys(customTriggers[chatId]).length === 0) {
      return ctx.reply("No filters have been added in this group yet.");
    }

    let list = "📌 **Saved Filters:**\n";
    for (const key of Object.keys(customTriggers[chatId])) {
      list += `• ${key}\n`;
    }
    return ctx.replyWithMarkdown(list);
  } catch (error) {
    console.error('Added list error:', error);
  }
});

// 3. /remove कमांड: फिल्टर हटाना
bot.command('remove', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;

    if (!(await isAuthorized(ctx, userId))) {
      return ctx.reply("Unauthorized! Only admins can use /remove.");
    }

    const keyword = ctx.message.text.substring(7).trim().toLowerCase();
    if (!keyword) {
      return ctx.reply("Usage: `/remove [keyword]`");
    }

    if (customTriggers[chatId] && customTriggers[chatId][keyword]) {
      delete customTriggers[chatId][keyword];
      saveTriggers(); // अपडेटेड लिस्ट सेव करें
      return ctx.reply(`🗑️ Filter '${keyword}' has been successfully removed.`);
    } else {
      return ctx.reply(`❌ Filter '${keyword}' does not exist.`);
    }
  } catch (error) {
    console.error('Remove filter error:', error);
  }
});

// एडमिन कमांड: /resetwarns
bot.command('resetwarns', async (ctx) => {
  try {
    if (!(await isAuthorized(ctx, ctx.from.id))) {
      return ctx.reply("Unauthorized! Only admins can reset warnings.");
    }

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

// टेक्स्ट मॉडरेशन और स्मार्ट फिल्टर चेकर
bot.on('text', async (ctx) => {
  try {
    if (ctx.chat.type === 'private') return;

    const chatId = ctx.chat.id;
    let text = ctx.message.text.trim().toLowerCase();
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'User';
    const userIsAdmin = await isAuthorized(ctx, userId);

    if (text.startsWith('/add') || text.startsWith('/remove') || text.startsWith('/added') || text.startsWith('/resetwarns')) {
      return;
    }

    if (text.startsWith('/')) {
      text = text.substring(1).trim();
    }

    // फिल्टर चेकिंग
    if (customTriggers[chatId]) {
      if (customTriggers[chatId][text]) {
        const triggerData = customTriggers[chatId][text];
        return ctx.telegram.forwardMessage(chatId, triggerData.from_chat_id, triggerData.message_id);
      }
    }

    // --- गालियों और मॉडरेशन का चेकिंग एरिया ---
    let isSafe = false;
    for (const safeWord of safeWords) {
      if (text.includes(safeWord)) {
        isSafe = true;
        break;
      }
    }

    if (isSafe) return;

    const cleanedText = text.replace(/[\s\*\-\_\.\,\!\@\#\$\%\^\&\(\)\+\=\~\`]+/g, '');

    let isProfane = false;
    for (const badWord of badWordsList) {
      if (cleanedText.includes(badWord)) {
        isProfane = true;
        break;
      }
    }

    if (isProfane) {
      if (userIsAdmin) {
        await ctx.deleteMessage();
        return;
      }

      await ctx.deleteMessage();

      if (!userStats[userId]) {
        userStats[userId] = { insults: 0, warnings: 0, name: userName };
      }

      userStats[userId].insults += 1;

      const muteDurationHours = 2;
      const muteUntil = Math.floor(Date.now() / 1000) + (muteDurationHours * 60 * 60);
      
      await ctx.telegram.restrictChatMember(chatId, userId, {
        until_date: muteUntil,
        permissions: { can_send_messages: false }
      });

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

// बटन एक्शंस
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
console.log('FRIDAY V13 Persistent File-Storage Filter Bot is active...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
                     
