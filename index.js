const { Telegraf, Markup } = require('telegraf');
const http = require('http');

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
const customTriggers = {}; // { chatId: { keyword: { from_chat_id, message_id } } }

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

// 1. /add कमांड: रिप्लाई किए गए मैसेज की आईडी सेव करना (सिर्फ एडमिन)
bot.command('add', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;

    if (!(await isAuthorized(ctx, userId))) {
      return ctx.reply("Unauthorized! Only admins can use /add.");
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2 || !ctx.message.reply_to_message) {
      return ctx.reply("Usage: Reply to any message/APK/file with `/add [keyword]`");
    }

    const keyword = args[1].toLowerCase();
    const targetMsg = ctx.message.reply_to_message;

    if (!customTriggers[chatId]) {
      customTriggers[chatId] = {};
    }

    // ओरिजिनल मैसेज की चैट आईडी और मैसेज आईडी सेव करें ताकि उसे फॉरवर्ड किया जा सके
    customTriggers[chatId][keyword] = {
      from_chat_id: targetMsg.chat.id,
      message_id: targetMsg.message_id
    };

    return ctx.reply(`✅ Success! Trigger /${keyword} has been linked to the replied message.`);
  } catch (error) {
    console.error('Add trigger error:', error);
  }
});

// 2. /added कमांड: सभी सेव किए गए कीवर्ड्स देखना
bot.command('added', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    if (!customTriggers[chatId] || Object.keys(customTriggers[chatId]).length === 0) {
      return ctx.reply("No custom triggers have been added in this group yet.");
    }

    let list = "📌 **Saved Custom Triggers:**\n";
    for (const key of Object.keys(customTriggers[chatId])) {
      list += `• /${key}\n`;
    }
    return ctx.replyWithMarkdown(list);
  } catch (error) {
    console.error('Added list error:', error);
  }
});

// 3. /remove कमांड: कीवर्ड हटाना (सिर्फ एडमिन)
bot.command('remove', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;

    if (!(await isAuthorized(ctx, userId))) {
      return ctx.reply("Unauthorized! Only admins can use /remove.");
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply("Usage: `/remove [keyword]`");
    }

    const keyword = args[1].toLowerCase();

    if (customTriggers[chatId] && customTriggers[chatId][keyword]) {
      delete customTriggers[chatId][keyword];
      return ctx.reply(`🗑️ Trigger /${keyword} has been successfully removed.`);
    } else {
      return ctx.reply(`❌ Keyword /${keyword} does not exist.`);
    }
  } catch (error) {
    console.error('Remove trigger error:', error);
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

// टेक्स्ट मॉडरेशन और कस्टम ट्रिगर चेकर
bot.on('text', async (ctx) => {
  try {
    if (ctx.chat.type === 'private') return;

    const chatId = ctx.chat.id;
    const text = ctx.message.text;
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'User';

    // चेक करें कि क्या यह मैसेज किसी कस्टम ट्रिगर (जैसे /capcut) से मैच होता है
    if (text.startsWith('/')) {
      const commandKey = text.substring(1).toLowerCase();
      if (customTriggers[chatId] && customTriggers[chatId][commandKey]) {
        const trigger = customTriggers[chatId][commandKey];
        // ओरिजिनल मैसेज को सीधे ग्रुप में फॉरवर्ड कर देगा (चाहे वह APK हो, फाइल हो या टेक्स्ट)
        return ctx.telegram.forwardMessage(chatId, trigger.from_chat_id, trigger.message_id);
      }
      return; 
    }

    const userIsAdmin = await isAuthorized(ctx, userId);
    const rawText = text.toLowerCase();

    // सेफ वर्ड्स चेक करें
    let isSafe = false;
    for (const safeWord of safeWords) {
      if (rawText.includes(safeWord)) {
        isSafe = true;
        break;
      }
    }

    if (isSafe) return;

    // टेक्स्ट नॉर्मलाइज़र (सारे स्टार्स और स्पेसेस हटाकर गाली पकड़ना)
    const cleanedText = rawText.replace(/[\s\*\-\_\.\,\!\@\#\$\%\^\&\(\)\+\=\~\`]+/g, '');

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
console.log('FRIDAY V9 Forward-Trigger Bot is active...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
