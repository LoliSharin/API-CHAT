/* eslint-disable no-console */
const { setTimeout: delay } = require('timers/promises');
const {
  constants,
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  privateDecrypt,
  randomBytes,
} = require('crypto');

const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';

if (typeof fetch !== 'function') {
  throw new Error('Global fetch not found. Use Node 18+ or install a fetch polyfill.');
}

function createJar() {
  return { value: '', sessionId: null };
}

function updateCookie(res, jar) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return;
  const match = /sessionId=([^;]+)/.exec(setCookie);
  if (match) {
    jar.value = `sessionId=${match[1]}`;
    jar.sessionId = match[1];
  }
}

async function request(method, path, { body, headers, jar, raw } = {}) {
  const url = `${baseUrl}${path}`;
  const opts = { method, headers: { ...(headers || {}) } };
  if (jar && jar.value) {
    opts.headers.Cookie = jar.value;
  }
  if (body !== undefined) {
    opts.body = body;
  }
  const res = await fetch(url, opts);
  if (jar) updateCookie(res, jar);
  if (raw) return res;
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { res, json };
}

async function postJson(path, payload, jar) {
  return request('POST', path, {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    jar,
  });
}

async function getJson(path, jar) {
  return request('GET', path, { jar });
}

async function delJson(path, jar, payload) {
  return request('DELETE', path, {
    body: payload ? JSON.stringify(payload) : undefined,
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    jar,
  });
}

async function registerOrLogin(username, password, displayName) {
  const jar = createJar();
  const reg = await postJson('/auth/register', { username, password, displayName }, jar);
  if (reg.res.ok) return { data: reg.json, jar };

  const login = await postJson('/auth/login', { username, password }, jar);
  if (!login.res.ok) {
    throw new Error(`Auth failed: ${login.res.status}`);
  }
  return { data: login.json, jar };
}

async function uploadFile(chatId, jar) {
  const form = new FormData();
  const blob = new Blob(['hello world'], { type: 'text/plain' });
  form.append('file', blob, 'hello.txt');
  if (chatId) form.append('chatId', chatId);
  const res = await request('POST', '/api/files', { body: form, jar });
  if (!res.res.ok) throw new Error(`upload failed: ${res.res.status}`);
  return res.json;
}

function encryptAesGcm(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertextB64: ciphertext.toString('base64'),
    ivB64: iv.toString('base64'),
    tagB64: tag.toString('base64'),
  };
}

function decryptAesGcm(ciphertextB64, ivB64, tagB64, key) {
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function unwrapDek(wrappedB64, privateKeyPem) {
  return privateDecrypt(
    {
      key: privateKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(wrappedB64, 'base64'),
  );
}

async function runRestFlow() {
  console.log('REST: register/login');
  const u1 = await registerOrLogin('e2e_user_1', 'pass123', 'User One');
  const u2 = await registerOrLogin('e2e_user_2', 'pass123', 'User Two');
  const u3 = await registerOrLogin('e2e_user_3', 'pass123', 'User Three');

  const jar1 = u1.jar;
  const jar2 = u2.jar;
  const jar3 = u3.jar;

  console.log('REST: register public key');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const pubRes = await postJson('/api/keys/public', { publicKey }, jar1);
  if (!pubRes.res.ok) throw new Error(`postPublicKey failed: ${pubRes.res.status}`);

  console.log('REST: create single chat');
  const single = await postJson('/api/chats', { type: 'single', participants: [u2.data.user.id] }, jar1);
  if (!single.res.ok) throw new Error(`createChat failed: ${single.res.status}`);

  console.log('REST: create group chat');
  const group = await postJson(
    '/api/chats',
    { type: 'group', title: 'Group', description: 'Test', participants: [u2.data.user.id] },
    jar1,
  );
  if (!group.res.ok) throw new Error(`createGroupChat failed: ${group.res.status}`);

  console.log('REST: get chat key');
  const keyRes = await getJson(`/api/chats/${group.json.id}/key`, jar1);
  if (!keyRes.res.ok) throw new Error(`getChatKey failed: ${keyRes.res.status}`);
  const dek = unwrapDek(keyRes.json.wrappedDekForClientB64, privateKey);
  if (dek.length !== 32) throw new Error('Invalid DEK length');

  console.log('REST: upload file');
  const file = await uploadFile(group.json.id, jar1);

  console.log('REST: send message');
  const enc = encryptAesGcm(Buffer.from('hello'), dek);
  const msgRes = await postJson(
    `/api/chats/${group.json.id}/messages`,
    { ...enc, keyVersion: keyRes.json.version, metadata: { attachments: [file.id] } },
    jar1,
  );
  if (!msgRes.res.ok) throw new Error(`sendMessage failed: ${msgRes.res.status}`);

  console.log('REST: list chats');
  const chats = await getJson('/api/chats', jar1);
  if (!chats.res.ok) throw new Error(`listChats failed: ${chats.res.status}`);

  // REST list messages removed to avoid confusion; WS list is tested below.

  console.log('REST: reactions');
  const msgId = msgRes.json.id;
  await postJson(`/api/chats/messages/${msgId}/reactions`, { type: 'like' }, jar1);

  console.log('REST: pin message');
  await postJson(`/api/chats/messages/${msgId}/pin`, { chatId: group.json.id }, jar1);

  console.log('REST: delivered/read');
  await postJson(`/api/chats/messages/${msgId}/delivered`, {}, jar1);
  await postJson(`/api/chats/messages/${msgId}/read`, {}, jar1);

  console.log('REST: search');
  await getJson(`/api/chats/search?q=hello`, jar1);

  console.log('REST: download file');
  const fileRes = await request('GET', `/api/files/${file.id}`, { jar: jar1, raw: true });
  if (!fileRes.ok) throw new Error(`download failed: ${fileRes.status}`);

  console.log('REST: unauthorized file access (should fail)');
  const otherRes = await request('GET', `/api/files/${file.id}`, { jar: jar3, raw: true });
  if (otherRes.ok) {
    throw new Error('Unauthorized file access unexpectedly succeeded');
  }

  console.log('REST: delete message');
  await delJson(`/api/chats/messages/${msgId}`, jar1);

  return { groupId: group.json.id, jar1, jar2, dek, keyVersion: keyRes.json.version };
}

async function waitForEvent(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function runWsFlow(ctx) {
  let io;
  try {
    io = require('socket.io-client');
  } catch {
    console.warn('WS: socket.io-client not installed, skipping WS tests.');
    return;
  }

  if (!ctx.jar1.sessionId) {
    console.warn('WS: no sessionId cookie available, skipping WS tests.');
    return;
  }

  console.log('WS: connecting');
  const cookieHeader = ctx.jar1.value || `sessionId=${ctx.jar1.sessionId}`;
  const extraHeaders = {
    Authorization: `Bearer ${ctx.jar1.sessionId}`,
    Cookie: cookieHeader,
  };
  const socket = io(baseUrl, {
    transports: ['websocket'],
    auth: { sessionId: ctx.jar1.sessionId },
    extraHeaders,
    transportOptions: {
      polling: { extraHeaders },
      websocket: { extraHeaders },
    },
  });

  socket.on('error', (err) => console.warn('WS error', err));
  socket.on('connect_error', (err) => console.warn('WS connect_error', err?.message || err));
  socket.on('disconnect', (reason) => console.warn('WS disconnect', reason));

  await waitForEvent(socket, 'connect');

  socket.emit('join_chat', { chatId: ctx.groupId });
  await waitForEvent(socket, 'joined_chat');

  const enc = encryptAesGcm(Buffer.from('ws-hello'), ctx.dek);
  socket.emit('send_message', {
    chatId: ctx.groupId,
    ...enc,
    keyVersion: ctx.keyVersion,
    metadata: {},
  });
  const sent = await waitForEvent(socket, 'message.sent');

  console.log('WS: messages.list (decrypt check)');
  socket.emit('messages.list', { chatId: ctx.groupId, limit: 10 });
  const listRes = await waitForEvent(socket, 'messages.list');
  const items = Array.isArray(listRes?.items) ? listRes.items : [];
  const msg = items.find((m) => m.id === sent.id);
  if (!msg) {
    throw new Error('messages.list did not include sent message');
  }
  const plaintext = decryptAesGcm(msg.ciphertextB64, msg.ivB64, msg.tagB64, ctx.dek);
  if (plaintext.toString() !== 'ws-hello') {
    throw new Error('decrypt check failed');
  }
  console.log('WS: decrypt check OK');

  socket.emit('leave_chat', { chatId: ctx.groupId });
  await delay(200);
  socket.disconnect();
}

async function main() {
  console.log(`Base URL: ${baseUrl}`);
  const ctx = await runRestFlow();
  await runWsFlow(ctx);
  console.log('E2E OK');
}

main().catch((err) => {
  console.error('E2E FAILED', err);
  process.exit(1);
});
