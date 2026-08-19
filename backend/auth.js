const crypto = require('crypto');

function verifyTelegramWebAppData(initDataRaw, botToken) {
  if (!initDataRaw) return null;

  try {
    const urlParams = new URLSearchParams(initDataRaw);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    const params = [];
    Array.from(urlParams.keys())
      .sort()
      .forEach(key => {
        params.push(`${key}=${urlParams.get(key)}`);
      });

    const dataCheckString = params.join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash === hash) {
      const userStr = urlParams.get('user');
      return userStr ? JSON.parse(userStr) : null;
    }
    return null;
  } catch (err) {
    return null;
  }
}

module.exports = { verifyTelegramWebAppData };
