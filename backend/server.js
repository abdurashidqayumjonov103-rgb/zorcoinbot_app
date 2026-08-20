require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const db = require('../database/db');
const { verifyTelegramWebAppData } = require('./auth');
const { validateTap } = require('./antiCheat');
const { setupBot } = require('./bot');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim());
const bot = setupBot(BOT_TOKEN, process.env.WEBAPP_URL);

bot.launch().then(() => console.log('⚡ ZorCoinBot Telegraf orqali ulandi'));

// Utility: Energiya hisoblash
function calculateCurrentEnergy(user, regenPerMin) {
  const now = Date.now();
  const diffSec = Math.floor((now - (user.last_energy_update || now)) / 1000);
  const regenAmount = Math.floor(diffSec * (regenPerMin / 60));
  const currentEnergy = Math.min(user.max_energy, user.energy + regenAmount);
  return { currentEnergy, now };
}

// Sozlamalarni olish
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

// Auth Middleware
function authMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  const user = verifyTelegramWebAppData(initData, BOT_TOKEN);

  if (!user) {
    return res.status(401).json({ error: 'Avtorizatsiyadan o‘tilmadi' });
  }

  const isMaintenance = getSetting('maintenance_mode') === '1';
  const isAdmin = ADMIN_IDS.includes(String(user.id));

  if (isMaintenance && !isAdmin) {
    return res.status(503).json({ error: 'Texnik ishlar olib borilmoqda. Tez orada qaytamiz.' });
  }

  let dbUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.id);
  const now = Date.now();

  if (!dbUser) {
    db.prepare(`
      INSERT INTO users (telegram_id, username, first_name, created_at, last_activity, last_energy_update)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user.id, user.username || '', user.first_name || '', now, now, now);
    dbUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.id);
  } else {
    if (dbUser.is_banned) {
      return res.status(403).json({ error: `Profilingiz bloklangan. Sabab: ${dbUser.ban_reason || 'Qoidabuzarlik'}` });
    }
    db.prepare('UPDATE users SET last_activity = ?, username = ?, first_name = ? WHERE telegram_id = ?')
      .run(now, user.username || '', user.first_name || '', user.id);
  }

  req.user = dbUser;
  next();
}

// Admin Auth Middleware
function adminMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  const user = verifyTelegramWebAppData(initData, BOT_TOKEN);
  if (!user || !ADMIN_IDS.includes(String(user.id))) {
    return res.status(403).json({ error: 'Faqat adminlar kira oladi' });
  }
  req.adminId = user.id;
  next();
}

// ================= FOYDALANUVCHI API =================

// 1. Profil va ma'lumotlar
app.get('/api/me', authMiddleware, (req, res) => {
  const regen = parseFloat(getSetting('energy_regen_per_min') || '3');
  const { currentEnergy, now } = calculateCurrentEnergy(req.user, regen);
  db.prepare('UPDATE users SET energy = ?, last_energy_update = ? WHERE telegram_id = ?').run(currentEnergy, now, req.user.telegram_id);
  const updatedUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(req.user.telegram_id);
  const rate = parseFloat(getSetting('rate_zor_to_uzs') || '0.1');
  const updatedUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(req.user.telegram_id);

  res.json({
    user: updatedUser,
    rate_uzs: rate,
    settings: {
      min_withdrawal: parseFloat(getSetting('min_withdrawal_zor') || '50000'),
      click_reward: parseFloat(getSetting('click_reward') || '1'),
      energy_regen_per_min: regen
    }
  });
});

// 2. Tap-to-Earn
app.post('/api/tap', authMiddleware, (req, res) => {
  const count = parseInt(req.body.count, 10) || 1;
  const antiCheat = validateTap(req.user.telegram_id, count);

  if (!antiCheat.valid) {
    return res.status(400).json({ error: antiCheat.reason });
  }

  const regen = parseFloat(getSetting('energy_regen_per_min') || '3');
  const clickReward = parseFloat(getSetting('click_reward') || '1');
  const energyCost = parseFloat(getSetting('energy_cost') || '1');

  const { currentEnergy, now } = calculateCurrentEnergy(req.user, regen);
  const totalCost = count * energyCost;

  if (currentEnergy < totalCost) {
    return res.status(400).json({ error: '⚡ Energy yetarli emas' });
  }

  const addedBalance = count * clickReward;
  const newEnergy = currentEnergy - totalCost;

  db.prepare(`
    UPDATE users 
    SET zor_balance = zor_balance + ?, energy = ?, last_energy_update = ? 
    WHERE telegram_id = ?
  `).run(addedBalance, newEnergy, now, req.user.telegram_id);

  res.json({
    success: true,
    added_zor: addedBalance,
    energy: newEnergy,
    zor_balance: (req.user.zor_balance || 0) + addedBalance
  });
});

// 3. Kunlik Bonus Holati
app.get('/api/bonus/status', authMiddleware, (req, res) => {
  const bonus = db.prepare('SELECT * FROM daily_bonus WHERE telegram_id = ?').get(req.user.telegram_id);
  const today = new Date().toISOString().slice(0, 10);
  
  if (!bonus) {
    return res.json({ day: 1, can_claim: true });
  }

  const isClaimedToday = bonus.last_claim_date === today;
  res.json({
    day: bonus.current_day,
    can_claim: !isClaimedToday
  });
});

// 4. Kunlik Bonus Olish
app.post('/api/bonus/claim', authMiddleware, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const bonus = db.prepare('SELECT * FROM daily_bonus WHERE telegram_id = ?').get(req.user.telegram_id);
  const bonusRewards = [1000, 2000, 5000, 10000, 20000, 50000, 100000];

  let currentDay = 1;
  if (bonus) {
    if (bonus.last_claim_date === today) {
      return res.status(400).json({ error: 'Bugungi bonus allaqachon olingan' });
    }
    const lastDate = new Date(bonus.last_claim_date);
    const currDate = new Date(today);
    const diffDays = Math.round((currDate - lastDate) / (1000 * 3600 * 24));
    currentDay = diffDays === 1 ? (bonus.current_day % 7) + 1 : 1;
  }

  const reward = bonusRewards[currentDay - 1];
  const txId = 'TX_BONUS_' + crypto.randomBytes(4).toString('hex');

  const executeClaim = db.transaction(() => {
    db.prepare(`
      INSERT INTO daily_bonus (telegram_id, current_day, last_claim_date) 
      VALUES (?, ?, ?) 
      ON CONFLICT(telegram_id) DO UPDATE SET current_day = ?, last_claim_date = ?
    `).run(req.user.telegram_id, currentDay, today, currentDay, today);

    db.prepare('UPDATE users SET zor_balance = zor_balance + ? WHERE telegram_id = ?')
      .run(reward, req.user.telegram_id);

    db.prepare('INSERT INTO transactions (id, telegram_id, type, amount, status, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(txId, req.user.telegram_id, 'Daily Bonus', reward, 'Completed', `${currentDay}-kunlik bonus`, Date.now());
  });

  executeClaim();
  res.json({ success: true, reward, next_day: currentDay });
});

// 5. Reyting (TOP 100)
app.get('/api/leaderboard', authMiddleware, (req, res) => {
  const topUsers = db.prepare(`
    SELECT telegram_id, username, first_name, zor_balance 
    FROM users 
    ORDER BY zor_balance DESC 
    LIMIT 100
  `).all();

  const userRankRow = db.prepare(`
    SELECT COUNT(*) + 1 as rank 
    FROM users 
    WHERE zor_balance > (SELECT zor_balance FROM users WHERE telegram_id = ?)
  `).get(req.user.telegram_id);

  res.json({
    top: topUsers,
    user_rank: userRankRow ? userRankRow.rank : 1,
    user: req.user
  });
});

// 6. Pul Yechish So'rovi
app.post('/api/withdraw', authMiddleware, (req, res) => {
  const { amount_zor, method, recipient } = req.body;
  const zor = parseFloat(amount_zor);
  const minWithdrawal = parseFloat(getSetting('min_withdrawal_zor') || '50000');
  const rate = parseFloat(getSetting('rate_zor_to_uzs') || '0.1');

  if (!recipient || recipient.trim() === '') {
    return res.status(400).json({ error: 'Karta yoki hamyon raqamini kiriting' });
  }

  if (zor < minWithdrawal) {
    return res.status(400).json({ error: `Minimal yechish miqdori: ${minWithdrawal.toLocaleString()} ZOR` });
  }

  if (req.user.zor_balance < zor) {
    return res.status(400).json({ error: 'Balansda mablag‘ yetarli emas' });
  }

  const uzsAmount = zor * rate;
  const withdrawId = 'WD_' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const txId = 'TX_WD_' + crypto.randomBytes(4).toString('hex').toUpperCase();

  const executeWithdraw = db.transaction(() => {
    db.prepare('UPDATE users SET zor_balance = zor_balance - ? WHERE telegram_id = ?')
      .run(zor, req.user.telegram_id);

    db.prepare(`
      INSERT INTO withdrawals (id, telegram_id, amount_zor, amount_uzs, method, recipient, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)
    `).run(withdrawId, req.user.telegram_id, zor, uzsAmount, method, recipient, Date.now());

    db.prepare(`
      INSERT INTO transactions (id, telegram_id, type, amount, status, details, created_at)
      VALUES (?, ?, 'Withdrawal', ?, 'Pending', ?, ?)
    `).run(txId, req.user.telegram_id, zor, `${method}: ${recipient}`, Date.now());
  });

  executeWithdraw();
  res.json({ success: true, withdrawId });
});

// 7. Tranzaksiyalar Ro'yxati
app.get('/api/transactions', authMiddleware, (req, res) => {
  const history = db.prepare('SELECT * FROM transactions WHERE telegram_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user.telegram_id);
  res.json(history);
});

// 8. Referal Ma'lumotlari
app.get('/api/referrals', authMiddleware, (req, res) => {
  const referrals = db.prepare('SELECT username, first_name, created_at FROM users WHERE referred_by = ?')
    .all(req.user.telegram_id);
  res.json({
    count: referrals.length,
    referrals
  });
});

// ================= ADMIN PANEL API =================

app.get('/api/admin/stats', adminMiddleware, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalZor = db.prepare('SELECT SUM(zor_balance) as s FROM users').get().s || 0;
  const pendingWd = db.prepare('SELECT COUNT(*) as c FROM withdrawals WHERE status = "Pending"').get().c;
  const totalWd = db.prepare('SELECT SUM(amount_uzs) as s FROM withdrawals WHERE status = "Paid"').get().s || 0;

  res.json({ totalUsers, totalZor, pendingWd, totalWd });
});

app.get('/api/admin/withdrawals', adminMiddleware, (req, res) => {
  const list = db.prepare('SELECT * FROM withdrawals ORDER BY created_at DESC').all();
  res.json(list);
});

app.post('/api/admin/withdrawals/action', adminMiddleware, (req, res) => {
  const { withdrawId, action, reason } = req.body;
  const wd = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawId);
  if (!wd || wd.status !== 'Pending') return res.status(400).json({ error: 'Topilmadi yoki allaqachon ko‘rib chiqilgan' });

  if (action === 'approve') {
    db.prepare('UPDATE withdrawals SET status = "Paid" WHERE id = ?').run(withdrawId);
  } else if (action === 'reject') {
    const refundTxId = 'TX_REFUND_' + crypto.randomBytes(4).toString('hex').toUpperCase();
    db.transaction(() => {
      db.prepare('UPDATE withdrawals SET status = "Rejected", reject_reason = ? WHERE id = ?').run(reason || 'Rad etildi', withdrawId);
      db.prepare('UPDATE users SET zor_balance = zor_balance + ? WHERE telegram_id = ?').run(wd.amount_zor, wd.telegram_id);
      db.prepare('INSERT INTO transactions (id, telegram_id, type, amount, status, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(refundTxId, wd.telegram_id, 'Refund', wd.amount_zor, 'Completed', `Rad etildi: ${reason || ''}`, Date.now());
    })();
  }

  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server http://localhost:${PORT} manzilida ishlamoqda`));
