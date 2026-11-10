/**
 * Kick sohbet dinleyici
 * - Unofficial Pusher WebSocket (kolay local test)
 * - Resmi webhook sunucu tarafında ayrıca /webhook/kick ile işlenir
 *
 * Uyarı: Pusher bağlantısı Kick'in resmi olmayan internal API'sidir.
 * Değişebilir. Üretimde mümkünse resmi EventSub (webhook) kullanın.
 */

const WebSocket = require('ws');
const https = require('https');

// Bilinen Pusher app key'leri (Kick zaman zaman değiştirir)
const PUSHER_KEYS = [
  '32cbd69e4b950bf97679',
  'eb1d5f283081a78b932c'
];

class KickChat {
  constructor({ channelSlug, onMessage, useUnofficial = true }) {
    this.channelSlug = channelSlug;
    this.onMessage = onMessage || (() => {});
    this.useUnofficial = useUnofficial;
    this.ws = null;
    this.chatroomId = null;
    this.reconnectTimer = null;
    this.closed = false;
  }

  async connect() {
    if (!this.useUnofficial) {
      console.log('[KickChat] Unofficial kapalı. Sadece webhook kullanın.');
      return;
    }

    try {
      this.chatroomId = await this._fetchChatroomId(this.channelSlug);
      if (!this.chatroomId) {
        throw new Error('Chatroom ID alınamadı. Kanal adını kontrol edin.');
      }
      console.log(`[KickChat] Chatroom ID: ${this.chatroomId}`);
      this._connectPusher();
    } catch (e) {
      console.error('[KickChat]', e.message);
      this._scheduleReconnect();
    }
  }

  disconnect() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
  }

  _fetchChatroomId(slug) {
    return new Promise((resolve, reject) => {
      const url = `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`;
      const req = https.get(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'application/json',
            Referer: `https://kick.com/${slug}`
          },
          timeout: 10000
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            if (res.statusCode !== 200) {
              return reject(new Error(`Kanal bilgisi alınamadı (${res.statusCode})`));
            }
            try {
              const json = JSON.parse(data);
              const id = json?.chatroom?.id;
              resolve(id || null);
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  }

  _connectPusher(keyIndex = 0) {
    if (this.closed) return;

    const key = PUSHER_KEYS[keyIndex % PUSHER_KEYS.length];
    const url = `wss://ws-us2.pusher.com/app/${key}?protocol=7&client=js&version=8.4.0&flash=false`;

    console.log(`[KickChat] Pusher bağlanıyor (key ${keyIndex + 1})...`);

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      const sub = {
        event: 'pusher:subscribe',
        data: {
          auth: '',
          channel: `chatrooms.${this.chatroomId}.v2`
        }
      };
      this.ws.send(JSON.stringify(sub));
      console.log(`[KickChat] Abone olundu: chatrooms.${this.chatroomId}.v2`);
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === 'pusher:connection_established') {
          // ok
          return;
        }
        if (msg.event === 'pusher:ping') {
          this.ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
          return;
        }

        // Chat mesajı
        if (
          msg.event === 'App\\Events\\ChatMessageEvent' ||
          msg.event === 'App\\Events\\ChatMessageSentEvent' ||
          (msg.event && msg.event.includes('ChatMessage'))
        ) {
          let data = msg.data;
          if (typeof data === 'string') {
            data = JSON.parse(data);
          }
          if (data && data.content) {
            this.onMessage({
              content: data.content,
              sender: data.sender || {},
              id: data.id,
              created_at: data.created_at
            });
          }
        }
      } catch (_) {
        // ignore parse errors
      }
    });

    this.ws.on('close', () => {
      console.log('[KickChat] Bağlantı kapandı');
      this.ws = null;
      if (!this.closed) this._scheduleReconnect(keyIndex + 1);
    });

    this.ws.on('error', (err) => {
      console.error('[KickChat] WS hata:', err.message);
      // bir sonraki key ile dene
    });
  }

  _scheduleReconnect(keyIndex = 0) {
    if (this.closed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this._connectPusher(keyIndex);
    }, 5000);
  }
}

module.exports = KickChat;
