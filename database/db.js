const fs = require('fs');
const path = require('path');

const dbFile = path.join(__dirname, 'data.json');

if (!fs.existsSync(dbFile)) {
  const initialData = {
    users: [],
    transactions: [],
    withdrawals: [],
    daily_bonus: [],
    settings: {
      rate_zor_to_uzs: '0.1',
      click_reward: '1',
      energy_cost: '1',
      energy_regen_per_min: '3',
      min_withdrawal_zor: '50000',
      maintenance_mode: '0'
    }
  };
  fs.writeFileSync(dbFile, JSON.stringify(initialData, null, 2));
}

function readData() {
  try {
    return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  } catch (e) {
    return { users: [], transactions: [], withdrawals: [], daily_bonus: [], settings: {} };
  }
}

function writeData(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

const db = {
  prepare: (query) => ({
    get: (param) => {
      const data = readData();
      if (query.includes('FROM users WHERE telegram_id')) {
        return data.users.find(u => u.telegram_id === Number(param)) || null;
      }
      if (query.includes('FROM settings WHERE key')) {
        return { value: data.settings[param] };
      }
      if (query.includes('FROM daily_bonus WHERE telegram_id')) {
        return data.daily_bonus.find(b => b.telegram_id === Number(param)) || null;
      }
      if (query.includes('COUNT(*) + 1 as rank')) {
        const target = data.users.find(u => u.telegram_id === Number(param));
        const rank = target ? data.users.filter(u => u.zor_balance > target.zor_balance).length + 1 : 1;
        return { rank };
      }
      if (query.includes('FROM withdrawals WHERE id')) {
        return data.withdrawals.find(w => w.id === param) || null;
      }
      return null;
    },
    all: (param) => {
      const data = readData();
      if (query.includes('FROM users ORDER BY zor_balance DESC')) {
        return [...data.users].sort((a, b) => b.zor_balance - a.zor_balance).slice(0, 100);
      }
      if (query.includes('FROM users WHERE referred_by')) {
        return data.users.filter(u => u.referred_by === Number(param));
      }
      if (query.includes('FROM transactions WHERE telegram_id')) {
        return data.transactions.filter(t => t.telegram_id === Number(param));
      }
      return [];
    },
    run: (...params) => {
      const data = readData();
      if (query.includes('INSERT INTO users')) {
        const [telegram_id, username, first_name, created_at, last_activity, last_energy_update] = params;
        data.users.push({
          telegram_id: Number(telegram_id),
          username: username || '',
          first_name: first_name || '',
          zor_balance: 0,
          energy: 1000,
          max_energy: 1000,
          last_energy_update,
          referral_count: 0,
          referred_by: null,
          created_at,
          last_activity,
          is_banned: 0
        });
      } else if (query.includes('UPDATE users SET zor_balance = zor_balance + ?')) {
        const [add, energy, now, id] = params;
        const u = data.users.find(x => x.telegram_id === Number(id));
        if (u) {
          u.zor_balance += Number(add);
          u.energy = Number(energy);
          u.last_energy_update = Number(now);
        }
      } else if (query.includes('UPDATE users SET energy = ?')) {
        const [energy, now, id] = params;
        const u = data.users.find(x => x.telegram_id === Number(id));
        if (u) {
          u.energy = Number(energy);
          u.last_energy_update = Number(now);
        }
      } else if (query.includes('UPDATE users SET zor_balance = zor_balance - ?')) {
        const [sub, id] = params;
        const u = data.users.find(x => x.telegram_id === Number(id));
        if (u) u.zor_balance -= Number(sub);
      } else if (query.includes('INSERT INTO transactions')) {
        const [id, telegram_id, type, amount, status, details, created_at] = params;
        data.transactions.push({ id, telegram_id: Number(telegram_id), type, amount: Number(amount), status, details, created_at });
      } else if (query.includes('INSERT INTO withdrawals')) {
        const [id, telegram_id, amount_zor, amount_uzs, method, recipient, created_at] = params;
        data.withdrawals.push({ id, telegram_id: Number(telegram_id), amount_zor, amount_uzs, method, recipient, status: 'Pending', created_at });
      }
      writeData(data);
      return { changes: 1 };
    }
  }),
  transaction: (fn) => fn
};

module.exports = db;
