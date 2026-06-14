const crypto = require('crypto');

const PREFIX = 'gsdt:1:';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

const getKey = () => {
  const fromEnv = process.env.GSD_PLAN_TITLE_KEY;
  if (fromEnv && typeof fromEnv === 'string') {
    const trimmed = fromEnv.trim();
    if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    if (trimmed.length >= 32) {
      return crypto.createHash('sha256').update(trimmed, 'utf8').digest();
    }
  }
  return crypto.createHash('sha256').update('aiStryGenerator-gsd-plan-title-dev-default', 'utf8').digest();
};

/** Returns encrypted string suitable for Mongoose string field */
const encryptTitle = (plain) => {
  if (plain === undefined || plain === null) return '';
  const text = String(plain);
  if (text === '') return '';
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, enc]);
  return `${PREFIX}${payload.toString('base64')}`;
};

const decryptTitle = (stored) => {
  if (stored === undefined || stored === null) return '';
  const s = String(stored);
  if (!s.startsWith(PREFIX)) {
    return s;
  }
  const b64 = s.slice(PREFIX.length);
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < IV_LEN + TAG_LEN) return '';
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const key = getKey();
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (e) {
    return '';
  }
};

const encryptPlanPartTitles = (parts = []) => {
  if (!Array.isArray(parts)) return [];
  return parts.map((p) => ({
    ...p,
    title: encryptTitle(p.title)
  }));
};

const decryptPlanPartTitles = (parts = []) => {
  if (!Array.isArray(parts)) return [];
  return parts.map((p) => ({
    ...p,
    title: decryptTitle(p.title)
  }));
};

module.exports = {
  encryptTitle,
  decryptTitle,
  encryptPlanPartTitles,
  decryptPlanPartTitles,
  PREFIX
};
