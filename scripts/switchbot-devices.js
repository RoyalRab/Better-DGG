#!/usr/bin/env node
// Lists the devices on a SwitchBot account, to find the Bot's id for
// SWITCHBOT_DEVICE. Needs SWITCHBOT_TOKEN and SWITCHBOT_SECRET (SwitchBot app
// → Profile → Preferences → tap App Version ten times → Developer Options):
//   SWITCHBOT_TOKEN=... SWITCHBOT_SECRET=... node scripts/switchbot-devices.js
const crypto = require('crypto');

async function main() {
  const { SWITCHBOT_TOKEN: token, SWITCHBOT_SECRET: secret } = process.env;
  if (!token || !secret) {
    console.error('set SWITCHBOT_TOKEN and SWITCHBOT_SECRET');
    process.exit(1);
  }
  const t = String(Date.now());
  const nonce = crypto.randomUUID();
  const sign = crypto
    .createHmac('sha256', secret)
    .update(token + t + nonce)
    .digest('base64')
    .toUpperCase();
  const res = await fetch('https://api.switch-bot.com/v1.1/devices', {
    headers: { Authorization: token, sign, t, nonce },
  });
  const body = await res.json();
  if (!res.ok || body.statusCode !== 100) {
    console.error(`SwitchBot answered HTTP ${res.status}, ${body.statusCode} ${body.message || ''}`);
    process.exit(1);
  }
  for (const d of body.body.deviceList || []) {
    console.log(`${d.deviceId}  ${d.deviceType}  ${d.deviceName}${d.hubDeviceId ? `  (hub ${d.hubDeviceId})` : ''}`);
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
