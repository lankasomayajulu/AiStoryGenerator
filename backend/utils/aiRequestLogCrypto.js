const crypto = require('crypto');

const PREFIX = 'ailog:1:';
const IV_LEN = 12;
const TAG_LEN = 16;

const getKey = () => {
  const fromEnv = process.env.AI_LOG_ENCRYPTION_KEY;
  if (fromEnv && typeof fromEnv === 'string') {
    const trimmed = fromEnv.trim();
    if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    if (trimmed.length >= 16) {
      return crypto.createHash('sha256').update(trimmed, 'utf8').digest();
    }
  }
  return crypto.createHash('sha256').update('aiStryGenerator-ai-log-dev-default', 'utf8').digest();
};

const encryptRequestPayload = (plain) => {
  if (plain === undefined || plain === null) return '';
  const text = typeof plain === 'string' ? plain : JSON.stringify(plain);
  if (text === '') return `${PREFIX}`;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, enc]);
  return `${PREFIX}${payload.toString('base64')}`;
};

const decryptRequestPayload = (stored) => {
  if (stored === undefined || stored === null) return null;
  const s = String(stored);
  if (!s.startsWith(PREFIX)) {
    try {
      return JSON.parse(s);
    } catch {
      return { raw: s };
    }
  }
  const b64 = s.slice(PREFIX.length);
  if (!b64) return null;
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < IV_LEN + TAG_LEN) return null;
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const key = getKey();
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    try {
      return JSON.parse(json);
    } catch {
      return json;
    }
  } catch {
    return null;
  }
};

module.exports = {
  encryptRequestPayload,
  decryptRequestPayload,
  PREFIX,
};
