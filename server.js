/**
 * KICK HALAY - Ana Sunucu
 * OBS Browser Source + Kick sohbet entegrasyonu
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const GameState = require('./gameState');
const KickChat = require('./kickChat');
const KickAuth = require('./kickAuth');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PLAYERS = parseInt(process.env.MAX_PLAYERS || '50', 10);
const TEST_MODE = process.env.TEST_MODE === 'true' || !process.env.KICK_CLIENT_ID;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Oyun durumu (tek kanal için basit tutuyoruz; çoklu kanal için Map kullanılabilir)
const games = new Map(); // channelSlug -> GameState

function getOrCreateGame(channel) {
  const key = (channel || 'default').toLowerCase();
  if (!games.has(key)) {
    games.set(key, new GameState(key, MAX_PLAYERS));
  }
  return games.get(key);
}

// WebSocket bağlantıları
const clients = new Set();

function broadcast(channel, data) {
  const msg = JSON.stringify({ channel, ...data });
  for (const ws of clients) {
    if (ws.readyState === 1 && (!ws.channel || ws.channel === channel || channel === '*')) {
      try {
        ws.send(msg);
      } catch (e) {
        // ignore
      }
    }
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const channel = (url.searchParams.get('channel') || 'default').toLowerCase();
  ws.channel = channel;
  ws.id = uuidv4();
  clients.add(ws);

  // Mevcut durumu gönder
  const game = getOrCreateGame(channel);
  ws.send(JSON.stringify({
    type: 'state',
    channel,
    players: game.getPlayers(),
    leaderId: game.leaderId,
    dancing: game.dancing,
    maxPlayers: MAX_PLAYERS,
    timestamp: Date.now()
  }));

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

// ---- Rotalar ----

// Health check (Render / uptime)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Overlay (OBS Browser Source)
app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/overlay.html'));
});

// Yönetim / Test paneli
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Oyun durumu API
app.get('/api/state/:channel?', (req, res) => {
  const channel = (req.params.channel || req.query.channel || 'default').toLowerCase();
  const game = getOrCreateGame(channel);
  res.json({
    players: game.getPlayers(),
    leaderId: game.leaderId,
    dancing: game.dancing,
    maxPlayers: MAX_PLAYERS,
    playerCount: game.players.size
  });
});

// Oyuncu ekle (test + komut)
app.post('/api/join', (req, res) => {
  const { username, channel = 'default', userId } = req.body;
  if (!username) return res.status(400).json({ error: 'username gerekli' });

  const game = getOrCreateGame(channel);
  const result = game.join(username, userId || username);

  if (result.ok) {
    broadcast(channel, { type: 'player_joined', player: result.player, players: game.getPlayers(), leaderId: game.leaderId });
    return res.json({ ok: true, player: result.player, count: game.players.size });
  }
  return res.status(400).json({ ok: false, error: result.error });
});

// Oyuncu çıkar
app.post('/api/leave', (req, res) => {
  const { username, channel = 'default' } = req.body;
  if (!username) return res.status(400).json({ error: 'username gerekli' });

  const game = getOrCreateGame(channel);
  const result = game.leave(username);

  if (result.ok) {
    broadcast(channel, { type: 'player_left', username, players: game.getPlayers(), leaderId: game.leaderId });
    return res.json({ ok: true, count: game.players.size });
  }
  return res.status(400).json({ ok: false, error: result.error });
});

// Halay başlat / durdur
app.post('/api/dance', (req, res) => {
  const { channel = 'default', start = true } = req.body;
  const game = getOrCreateGame(channel);
  game.setDancing(!!start);
  broadcast(channel, { type: 'dance', dancing: game.dancing });
  res.json({ ok: true, dancing: game.dancing });
});

// Lider değiştir
app.post('/api/leader', (req, res) => {
  const { username, channel = 'default' } = req.body;
  const game = getOrCreateGame(channel);
  const result = game.setLeader(username);
  if (result.ok) {
    broadcast(channel, { type: 'leader_changed', leaderId: game.leaderId, players: game.getPlayers() });
    return res.json({ ok: true, leaderId: game.leaderId });
  }
  res.status(400).json({ ok: false, error: result.error });
});

// Özel animasyon tetikle
app.post('/api/action', (req, res) => {
  const { username, action, channel = 'default' } = req.body;
  if (!username || !action) return res.status(400).json({ error: 'username ve action gerekli' });

  const game = getOrCreateGame(channel);
  if (!game.hasPlayer(username)) {
    return res.status(400).json({ ok: false, error: 'Oyuncu bulunamadı' });
  }

  broadcast(channel, {
    type: 'player_action',
    username,
    action, // 'dans' | 'mendil' | 'zilgit'
    timestamp: Date.now()
  });
  res.json({ ok: true });
});

// Tüm oyuncuları temizle
app.post('/api/clear', (req, res) => {
  const { channel = 'default' } = req.body;
  const game = getOrCreateGame(channel);
  game.clear();
  broadcast(channel, { type: 'cleared', players: [] });
  res.json({ ok: true });
});

// ---- Kick Webhook (resmi) ----
app.post('/webhook/kick', (req, res) => {
  // Kick event doğrulaması burada yapılabilir (Kick-Event-Type header)
  const eventType = req.headers['kick-event-type'] || req.headers['Kick-Event-Type'];
  const body = req.body;

  if (eventType === 'chat.message.sent' || body?.content) {
    const content = (body.content || '').trim();
    const sender = body.sender || {};
    const username = sender.username || sender.channel_slug || 'unknown';
    const userId = String(sender.user_id || username);
    const channelSlug = (body.broadcaster?.channel_slug || process.env.KICK_CHANNEL_SLUG || 'default').toLowerCase();

    handleChatCommand(channelSlug, username, userId, content);
  }

  res.status(200).json({ ok: true });
});

// ---- Kick OAuth ----
const kickAuth = new KickAuth();

app.get('/auth', (req, res) => {
  const url = kickAuth.getAuthUrl();
  if (!url) return res.status(500).send('KICK_CLIENT_ID tanımlı değil. .env dosyasını kontrol edin.');
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Code eksik');
    const tokens = await kickAuth.exchangeCode(code);
    // Tokenları .env'ye yazmak yerine basit bir tokens.json'a kaydediyoruz
    fs.writeFileSync(path.join(__dirname, '../tokens.json'), JSON.stringify(tokens, null, 2));
    res.send(`
      <h1>Kick OAuth Başarılı</h1>
      <p>Tokenlar kaydedildi. Sunucuyu yeniden başlatabilirsiniz.</p>
      <p><a href="/admin">Yönetim Paneline Dön</a></p>
    `);
  } catch (e) {
    console.error('OAuth hata:', e);
    res.status(500).send('OAuth hatası: ' + e.message);
  }
});

// ---- Chat komut işleyici ----
function handleChatCommand(channel, username, userId, message) {
  const msg = message.trim().toLowerCase();
  const game = getOrCreateGame(channel);

  if (msg === '!katıl' || msg === '!katil') {
    const result = game.join(username, userId);
    if (result.ok) {
      broadcast(channel, { type: 'player_joined', player: result.player, players: game.getPlayers(), leaderId: game.leaderId });
      console.log(`[${channel}] ${username} katıldı (${game.players.size}/${MAX_PLAYERS})`);
    } else {
      console.log(`[${channel}] ${username} katılamadı: ${result.error}`);
      // İsteğe bağlı: sohbete yanıt gönderme (chat:write scope gerekir)
    }
  } else if (msg === '!ayrıl' || msg === '!ayril') {
    const result = game.leave(username);
    if (result.ok) {
      broadcast(channel, { type: 'player_left', username, players: game.getPlayers(), leaderId: game.leaderId });
      console.log(`[${channel}] ${username} ayrıldı`);
    }
  } else if (msg === '!halay') {
    broadcast(channel, {
      type: 'info',
      message: `Halayda ${game.players.size} oyuncu var (max ${MAX_PLAYERS})`
    });
  } else if (msg === '!dans') {
    if (game.hasPlayer(username)) {
      broadcast(channel, { type: 'player_action', username, action: 'dans', timestamp: Date.now() });
    }
  } else if (msg === '!mendil') {
    if (game.hasPlayer(username)) {
      broadcast(channel, { type: 'player_action', username, action: 'mendil', timestamp: Date.now() });
    }
  } else if (msg === '!zılgıt' || msg === '!zilgit') {
    broadcast(channel, { type: 'player_action', username, action: 'zilgit', timestamp: Date.now() });
  } else if (msg === '!lider') {
    // Basit liderlik isteği – sadece mevcut lider veya ilk oyuncu değiştirebilir (test için herkese açık)
    if (game.hasPlayer(username)) {
      const result = game.setLeader(username);
      if (result.ok) {
        broadcast(channel, { type: 'leader_changed', leaderId: game.leaderId, players: game.getPlayers() });
      }
    }
  }
}

// Test için sohbet mesajı simüle et
app.post('/api/chat', (req, res) => {
  const { username = 'TestUser', message, channel = 'default' } = req.body;
  if (!message) return res.status(400).json({ error: 'message gerekli' });
  handleChatCommand(channel, username, username, message);
  res.json({ ok: true });
});

// ---- Kick Chat Listener başlat ----
let kickChat = null;

async function startKickListener() {
  if (TEST_MODE && process.env.USE_UNOFFICIAL_CHAT !== 'true') {
    console.log('[Kick] Test modu aktif – gerçek sohbet dinlenmiyor. Admin panelinden test edin.');
    return;
  }

  const channelSlug = process.env.KICK_CHANNEL_SLUG;
  if (!channelSlug) {
    console.log('[Kick] KICK_CHANNEL_SLUG tanımlı değil. Sadece test modu çalışacak.');
    return;
  }

  try {
    kickChat = new KickChat({
      channelSlug,
      useUnofficial: process.env.USE_UNOFFICIAL_CHAT !== 'false',
      onMessage: (msg) => {
        const content = (msg.content || '').trim();
        if (!content.startsWith('!')) return;
        handleChatCommand(
          channelSlug.toLowerCase(),
          msg.sender?.username || 'unknown',
          String(msg.sender?.id || msg.sender?.username || 'unknown'),
          content
        );
      }
    });
    await kickChat.connect();
    console.log(`[Kick] Sohbet dinleniyor: ${channelSlug}`);
  } catch (e) {
    console.error('[Kick] Bağlantı hatası (test modu devam ediyor):', e.message);
  }
}

// ---- Başlat ----
server.listen(PORT, HOST, async () => {
  console.log('');
  console.log('========================================');
  console.log('   KICK HALAY v1.0');
  console.log('========================================');
  console.log(`  Sunucu:     http://localhost:${PORT}`);
  console.log(`  Overlay:    http://localhost:${PORT}/overlay?channel=KANAL_ADI`);
  console.log(`  Yönetim:    http://localhost:${PORT}/admin`);
  console.log(`  Test Modu:  ${TEST_MODE ? 'AÇIK' : 'KAPALI'}`);
  console.log(`  Max Oyuncu: ${MAX_PLAYERS}`);
  console.log('========================================');
  console.log('');

  await startKickListener();
});

// Temiz kapanış
process.on('SIGINT', () => {
  if (kickChat) kickChat.disconnect();
  server.close();
  process.exit(0);
});
