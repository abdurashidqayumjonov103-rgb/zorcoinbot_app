const userLastTap = new Map();

function validateTap(userId, tapCount = 1) {
  const now = Date.now();
  const lastInfo = userLastTap.get(userId) || { time: now, count: 0 };
  const timeDiff = now - lastInfo.time;

  // Juda tez (500ms ichida 20 tadan ko'p) shubhali bosishlarni to'xtatish
  if (timeDiff < 500 && tapCount > 20) {
    return { valid: false, reason: 'Shubhali tez bosish aniqlandi (Anti-Cheat)' };
  }

  userLastTap.set(userId, { time: now, count: tapCount });
  return { valid: true };
}

module.exports = { validateTap };
