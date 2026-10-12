const { saveTokens } = require('../config/boostyTokens');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('--- Boosty Manual Session Import ---');
console.log('Zəhmət olmasa brauzerdə (F12 -> Application -> Local Storage -> https://boosty.to) içindəki "auth" açarının BÜTÜN dəyərini ({ "accessToken": "..." } olan mətni) bura yapışdırın və Enter basın:');

function fail(message) {
  console.error('\n❌ Xəta baş verdi:', message);
  rl.close();
  process.exit(1);
}

rl.question('> ', (answer) => {
  let data;
  try {
    data = JSON.parse(answer.trim());
  } catch (err) {
    return fail(`JSON formatı səhvdir: ${err.message}`);
  }

  if (!data.accessToken || !data.refreshToken) {
    return fail('accessToken və ya refreshToken tapılmadı!');
  }

  // Boosty refuses to refresh tokens without the browser's device id, which is
  // stored separately from "auth" under the "_clientId" Local Storage key.
  const save = (deviceId) => {
    const expiresAt = Number(data.expiresAt) > Date.now()
      ? Number(data.expiresAt)
      : Date.now() + (Number(data.expiresIn) * 1000 || 3600 * 1000);

    saveTokens({
      access_token:  data.accessToken,
      refresh_token: data.refreshToken,
      expires_at:    expiresAt,
      device_id:     deviceId,
    });
    console.log('\n✅ ƏLA! Sessiya məlumatları (Tokens + Device ID) uğurla yadda saxlanıldı!');
    console.log('Bot artıq bu sessiya ilə işləyəcək və vaxtı bitəndə özü təzələyəcək.');
    rl.close();
    process.exit(0);
  };

  if (data.deviceId) return save(data.deviceId);

  console.log('\nİndi eyni yerdə (Local Storage -> https://boosty.to) "_clientId" açarının dəyərini yapışdırın və Enter basın:');
  rl.question('> ', (clientId) => {
    const deviceId = clientId.trim().replace(/^"|"$/g, '');
    if (!deviceId) return fail('_clientId boşdur. Onsuz token yenilənə bilməz.');
    save(deviceId);
  });
});
