with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Script teglari orasini topib xavfsiz toza kodga almashtiramiz
html_part = content.split('<script>')[0]

new_script = """<script>
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

let state = {
  userId: tg?.initDataUnsafe?.user?.id || 12345678,
  username: tg?.initDataUnsafe?.user?.username || 'Foydalanuvchi',
  zor: 0,
  rate: 0.1,
  energy: 1000,
  maxEnergy: 1000,
  pendingTaps: 0,
  bonusClaimed: false
};

const API = window.location.origin;

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-telegram-init-data': tg?.initData || ''
  };
}

function getLocalBalance() {
  try {
    const val = localStorage.getItem(`zor_balance_${state.userId}`);
    return val !== null ? Number(val) : 0;
  } catch (e) { return 0; }
}

function setLocalBalance(val) {
  try {
    localStorage.setItem(`zor_balance_${state.userId}`, val);
  } catch (e) {}
}

function refreshUI() {
  try {
    const homeZor = document.getElementById('home-zor');
    if (homeZor) homeZor.innerText = Math.floor(state.zor).toLocaleString();

    const homeUzs = document.getElementById('home-uzs');
    if (homeUzs) homeUzs.innerText = `≈ ${(Math.floor(state.zor * state.rate)).toLocaleString()} UZS`;

    const profZor = document.getElementById('prof-zor');
    if (profZor) profZor.innerText = Math.floor(state.zor).toLocaleString();

    const energyStat = document.getElementById('energy-stat');
    if (energyStat) energyStat.innerText = `⚡ ${state.energy} / ${state.maxEnergy}`;

    const energyProgress = document.getElementById('energy-progress');
    if (energyProgress) {
      const percent = (state.energy / state.maxEnergy) * 100;
      energyProgress.style.width = `${percent}%`;
    }
  } catch (err) {
    console.error('refreshUI error:', err);
  }
}

async function loadData() {
  try {
    state.zor = getLocalBalance();
    refreshUI();

    const res = await fetch(`${API}/user-data?user_id=${state.userId}`, { headers: getHeaders() });
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        state.userId = data.user.telegram_id || state.userId;
        const serverBal = Number(data.user.zor_balance) || 0;
        state.zor = Math.max(serverBal, state.zor);
        setLocalBalance(state.zor);
        state.rate = Number(data.rate_uzs) || 0.1;
        state.energy = data.user.energy !== undefined ? Number(data.user.energy) : 1000;
        state.maxEnergy = Number(data.user.max_energy) || 1000;

        const uVal = document.getElementById('username-val');
        if (uVal) uVal.innerText = '@' + (data.user.username || data.user.first_name || 'Foydalanuvchi');

        const pUser = document.getElementById('prof-user');
        if (pUser) pUser.innerText = '@' + (data.user.username || data.user.first_name || 'Foydalanuvchi');

        const pTgid = document.getElementById('prof-tgid');
        if (pTgid) pTgid.innerText = data.user.telegram_id;

        const refLink = document.getElementById('ref-link-val');
        if (refLink) refLink.innerText = `t.me/ZorCoinBot?start=${data.user.telegram_id}`;
      }
    }
  } catch (err) {
    console.error('loadData error:', err);
  }
  refreshUI();
}

let isSyncing = false;
async function syncTaps() {
  if (state.pendingTaps <= 0 || isSyncing) return;
  isSyncing = true;
  const count = state.pendingTaps;
  state.pendingTaps = 0;

  try {
    const res = await fetch(`${API}/tap`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ user_id: state.userId, count: count })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.balance !== undefined) {
        state.zor = Math.max(Number(data.balance), state.zor);
        setLocalBalance(state.zor);
      }
    }
  } catch (e) {
    state.pendingTaps += count;
  } finally {
    isSyncing = false;
    if (state.pendingTaps > 0) setTimeout(syncTaps, 2000);
    refreshUI();
  }
}

function handleTap(event) {
  if (state.energy <= 0) return;
  state.energy -= 1;
  state.zor += 1;
  state.pendingTaps += 1;
  setLocalBalance(state.zor);
  refreshUI();

  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
  syncTaps();
}

function navigate(tab) {
  document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  const targetView = document.getElementById(`view-${tab}`);
  if (targetView) targetView.classList.add('active');

  const tabs = ['home', 'bonus', 'ref', 'rank', 'profile'];
  const idx = tabs.indexOf(tab);
  if (idx !== -1) {
    const btns = document.querySelectorAll('.nav-btn');
    if (btns[idx]) btns[idx].classList.add('active');
  }

  if (tab === 'bonus') loadBonuses();
  if (tab === 'ref') loadRefs();
  if (tab === 'rank') loadRank();
  if (tab === 'profile') loadHistory();
}

async function loadRefs() {
  try {
    const res = await fetch(`${API}/referrals?user_id=${state.userId}`, { headers: getHeaders() });
    const d = await res.json();
    const rVal = document.getElementById('ref-count-val');
    if (rVal) rVal.innerText = d.count || 0;
    const pRef = document.getElementById('prof-ref-cnt');
    if (pRef) pRef.innerText = d.count || 0;
  } catch (e) {}
}

function copyRefLink() {
  const link = `https://t.me/ZorCoinBot?start=${state.userId}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link);
    alert('Referal havola nusxalandi!');
  } else {
    alert(link);
  }
}

function shareTelegram() {
  const link = `https://t.me/ZorCoinBot?start=${state.userId}`;
  const msg = `⚡ ZorCoinBot'da ZOR yig'ing va real pul ishlang!`;
  const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(msg)}`;
  if (tg) tg.openTelegramLink(url);
  else window.open(url, '_blank');
}

async function loadBonuses() {}
async function loadRank() {}
async function loadHistory() {}

window.onload = function() {
  loadData();
  const coin = document.getElementById('coin-tap') || document.querySelector('.coin-btn') || document.querySelector('.main-coin');
  if (coin) {
    coin.addEventListener('click', handleTap);
    coin.addEventListener('touchstart', (e) => { e.preventDefault(); handleTap(e); });
  }
};
</script>
</body>
</html>"""

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html_part + new_script)
print("INDEX_HTML_YANGILANDI")
