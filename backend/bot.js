const { Telegraf, Markup } = require('telegraf');

function setupBot(token, webAppUrl) {
  const bot = new Telegraf(token);

  bot.start((ctx) => {
    const startPayload = ctx.startPayload; // Referal ID keladi
    
    ctx.reply(
      `🚀 *ZorCoinBot*'ga xush kelibsiz!\n\nZOR tangalarini bosing, energiya ishlating va do'stlaringizni taklif qilib ko'proq daromad oling!`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.webApp('🎮 O‘yinni ochish', `${webAppUrl}?ref=${startPayload || ''}`)]
        ])
      }
    );
  });

  bot.command('help', (ctx) => {
    ctx.reply(
      "⚡ Yordam Menyusi:\n\n" +
      "1. /start - O'yinni boshlash\n" +
      "2. Coin bosing va ZOR yig'ing.\n" +
      "3. Do'stlarni taklif qilib bonus oling.\n" +
      "4. Yig'ilgan ZORlarni Profil bo'limidan UZS ga yechib oling."
    );
  });

  return bot;
}

module.exports = { setupBot };
