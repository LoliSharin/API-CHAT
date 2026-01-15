import { io } from 'socket.io-client';
const sessionId = '6f86cab0-3b4e-44a0-b06c-c7aa5452e261'// Этот айдишник сессии владеет чатом 
const socket = io('http://localhost:3000', {
  withCredentials: true,
  extraHeaders: { Cookie: `sessionId=${sessionId}` },
});

socket.on('connect', () => {
  console.log('connected', socket.id);
  socket.emit('join_chat', { chatId: 'e2cdd171-3f4f-4ae6-9467-5a6ff73a9d86' });
  socket.emit('messages.list', { chatId: 'e2cdd171-3f4f-4ae6-9467-5a6ff73a9d86', limit: 20 });
  socket.emit('send_message', {
    chatId: 'e2cdd171-3f4f-4ae6-9467-5a6ff73a9d86',
    encryptedPayload: Buffer.from('Привет! Как у тебя дела?').toString('base64'),
    metadata: { text: 'Привет! как у тебя дела' },
  });
});

socket.on('messages.list', (data) => console.log('history', data));
socket.on('message.new', (msg) => console.log('new', msg));
socket.on('message.sent', (data) => console.log('sent', data));
socket.on('message.delivered', (data) => console.log('delivered', data));
socket.on('message.read', (data) => console.log('read', data));
socket.on('error', (e) => console.error('error', e));