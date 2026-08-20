
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.expand();
      tg.ready();
    }

    const API = '/api';
    const reqHeaders = {
      'Content-Type': 'application/json',
      'x-telegram-init-data': tg?.initData || ''
    };

    // Boshlang'ich holat: Hammasi 0 dan boshlanadi
    let state = {
      zor: 0,
      rate: 0.1,
      energy: 1000,
      maxEnergy: 1000,
      userId: 0,
      pendingTaps: 0
    };

    // API bilan ulanish
    async function loadData() {
      try {
        const res = await fetch(`${API}/me`, { headers: reqHeaders });
        if (!res.ok) throw new Error();
        const data = await res.json();

        state.zor = data.user.zor_balance || 0;
        state.rate = data.rate_uzs || 0.1;
        state.energy = data.user.energy !== undefined ? data.user.energy : 1000;
        state.maxEnergy = data.user.max_energy || 1000;
        state.userId = data.user.telegram_id;

        document.getElementById('username-val').innerText = `@${data.user.username || data.user.first_name || 'Foydalanuvchi'}`;
        document.getElementById('prof-user').innerText = `@${data.user.username || data.user.first_name || 'Foydalanuvchi'}`;
        document.getElementById('prof-tgid').innerText = data.user.telegram_id;
        document.getElementById('ref-link-val').innerText = `t.me/ZorCoinBot?start=${data.user.telegram_id}`;

        refreshUI();
      } catch (err) {
        refreshUI();
      }
    }

    function refreshUI() {
      document.getElementById('home-zor').innerText = Math.floor(state.zor).toLocaleString();
      document.getElementById('home-uzs').innerText = `≈ ${Math.floor(state.zor * state.rate).toLocaleString()} UZS`;
      document.getElementById('prof-zor').innerText = Math.floor(state.zor).toLocaleString();
      document.getElementById('energy-stat').innerText = `⚡ ${state.energy} / ${state.maxEnergy}`;
      
      const percent = (state.energy / state.maxEnergy) * 100;
      document.getElementById('energy-progress').style.width = `${percent}%`;
    }

    // Tap Mexanikasi
    const coin = document.getElementById('coin-element');
    let tapTimer = null;

    coin.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleTap(touch.clientX, touch.clientY);
    });

    function handleTap(x, y) {
      if (state.energy <= 0) return;

      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

      state.energy -= 1;
      state.zor += 1;
      state.pendingTaps += 1;
      refreshUI();

      // Particle
      const pop = document.createElement('div');
      pop.className = 'tap-pop';
      pop.innerText = '+1 ZOR';
      pop.style.left = `${x - 20}px`;
      pop.style.top = `${y - 40}px`;
      document.body.appendChild(pop);
      setTimeout(() => pop.remove(), 700);

      clearTimeout(tapTimer);
      tapTimer = setTimeout(syncTaps, 400);
    }

    async function syncTaps() {
      if (state.pendingTaps === 0) return;
      const count = state.pendingTaps;
      state.pendingTaps = 0;

      try {
        const res = await fetch(`${API}/tap`, {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify({ count })
        });
            const data = await res.json();
   const serverBalance = data.user?.zor_balance ?? data.zor_balance;
if (serverBalance !== undefined) {
  state.zor = Number(serverBalance) + (state.pendingTaps || 0);}
    }
    refreshUI();
  } catch (e) {
    state.pendingTaps += count;
  }
    }

    // Sahifalar navigatsiyasi
    function navigate(tab) {
      document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

      document.getElementById(`view-${tab}`).classList.add('active');

      const tabs = ['home', 'bonus', 'ref', 'rank', 'profile'];
      const idx = tabs.indexOf(tab);
      if (idx !== -1) document.querySelectorAll('.nav-btn')[idx].classList.add('active');

      if (tab === 'bonus') loadBonuses();
      if (tab === 'ref') loadRefs();
      if (tab === 'rank') loadRankings();
      if (tab === 'profile') loadHistory();
    }

    // Bonuslar
    const rewards = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
    function loadBonuses() {
      const box = document.getElementById('bonus-card-list');
      box.innerHTML = '';
      rewards.forEach((amount, i) => {
        const card = document.createElement('div');
        card.className = `bonus-card ${i === 0 ? 'active' : ''}`;
        card.innerHTML = `
          <div>
            <div style="font-size:12px; color:var(--muted);">${i + 1}-kun</div>
            <div style="font-weight:800; color:var(--gold-main);">${amount.toLocaleString()} ZOR</div>
          </div>
          ${i === 0 ? `<button class="btn-claim" onclick="claimBonus()">Olish</button>` : `<span style="font-size:16px;">🔒</span>`}
        `;
        box.appendChild(card);
      });
    }

    async function claimBonus() {
      try {
        const res = await fetch(`${API}/bonus/claim`, { method: 'POST', headers: reqHeaders });
        const d = await res.json();
        if (d.success) {
          alert(`🎁 Tabriklaymiz! +${d.reward.toLocaleString()} ZOR berildi!`);
          loadData();
        } else {
          alert(d.error || 'Bugungi bonus olingan');
        }
      } catch (e) {
        alert('Bonus olindi');
      }
    }

    // Referal
    async function loadRefs() {
      try {
        const res = await fetch(`${API}/referrals`, { headers: reqHeaders });
        const d = await res.json();
        document.getElementById('ref-count-val').innerText = d.count || 0;
        document.getElementById('prof-ref-cnt').innerText = d.count || 0;
      } catch (e) {}
    }
    function copyRefLink() {
      const link = `https://t.me/ZorCoinBot?start=${state.userId}`;
      navigator.clipboard?.writeText(link);
      alert('Referal havola nusxalandi!');
    }
    function shareTelegram() {
      const link = `https://t.me/ZorCoinBot?start=${state.userId}`;
      const msg = `⚡ ZorCoinBot'da ZOR yig'ing va real pul ishlang!`;
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(msg)}`);
      } else {
        copyRefLink();
      }
    }

    // Reyting
    async function loadRankings() {
      try {
        const res = await fetch(`${API}/leaderboard`, { headers: reqHeaders });
        const d = await res.json();
        if (d.top && d.top.length > 0) {
          if (d.top[0]) {
            document.getElementById('top1-name').innerText = d.top[0].first_name || 'User';
            document.getElementById('top1-zor').innerText = `${Math.floor(d.top[0].zor_balance).toLocaleString()} ZOR`;
          }
          if (d.top[1]) {
            document.getElementById('top2-name').innerText = d.top[1].first_name || 'User';
            document.getElementById('top2-zor').innerText = `${Math.floor(d.top[1].zor_balance).toLocaleString()} ZOR`;
          }
          if (d.top[2]) {
            document.getElementById('top3-name').innerText = d.top[2].first_name || 'User';
            document.getElementById('top3-zor').innerText = `${Math.floor(d.top[2].zor_balance).toLocaleString()} ZOR`;
          }

          const others = document.getElementById('rank-list-others');
          others.innerHTML = '';
          d.top.slice(3).forEach((u, idx) => {
            const row = document.createElement('div');
            row.className = 'card-block';
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.padding = '10px 14px';
            row.innerHTML = `<span>#${idx + 4} ${u.first_name || 'User'}</span> <b style="color:var(--gold-main);">${Math.floor(u.zor_balance).toLocaleString()} ZOR</b>`;
            others.appendChild(row);
          });
        }
      } catch (e) {}
    }

    // Pul yechish
    async function sendWithdraw() {
      const method = document.getElementById('wd-type').value;
      const recipient = document.getElementById('wd-card-num').value;
      const amount_zor = document.getElementById('wd-zor-val').value;

      if (!recipient) return alert('Karta raqamini kiriting!');
      if (!amount_zor || amount_zor < 50000) return alert('Minimal miqdor: 50,000 ZOR');

      try {
        const res = await fetch(`${API}/withdraw`, {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify({ method, recipient, amount_zor })
        });
        const d = await res.json();
        if (d.success) {
          alert('✅ Yechish so‘rovi adminga yuborildi!');
          loadData();
          loadHistory();
        } else {
          alert(d.error || 'Xatolik yuz berdi');
        }
      } catch (e) {
        alert('Serverga ulanib bo‘lmadi');
      }
    }

    // Tranzaksiyalar
    async function loadHistory() {
      try {
        const res = await fetch(`${API}/transactions`, { headers: reqHeaders });
        const list = await res.json();
        const box = document.getElementById('tx-history-box');
        box.innerHTML = '';
        if (!list || list.length === 0) {
          box.innerHTML = '<span style="color:var(--muted);">Hozircha tranzaksiyalar yo‘q</span>';
          return;
        }
        list.slice(0, 5).forEach(tx => {
          const div = document.createElement('div');
          div.className = 'tx-item';
          div.innerHTML = `<span>${tx.type}</span> <b style="color:${tx.type === 'Withdrawal' ? 'var(--danger)' : 'var(--success)'};">${tx.type === 'Withdrawal' ? '-' : '+'}${tx.amount.toLocaleString()} ZOR</b>`;
          box.appendChild(div);
        });
      } catch (e) {}
    }

    window.onload = loadData;
  