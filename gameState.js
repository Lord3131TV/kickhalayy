/**
 * Oyun durumu yöneticisi
 */

class GameState {
  constructor(channel, maxPlayers = 50) {
    this.channel = channel;
    this.maxPlayers = maxPlayers;
    this.players = new Map(); // username(lower) -> player object
    this.leaderId = null;
    this.dancing = true;
    this.order = []; // sıralı username listesi (katılım sırası)
  }

  join(username, userId) {
    const key = String(username).toLowerCase().trim();
    if (!key) return { ok: false, error: 'Geçersiz kullanıcı adı' };

    if (this.players.has(key)) {
      return { ok: false, error: 'Zaten katıldınız' };
    }

    if (this.players.size >= this.maxPlayers) {
      return { ok: false, error: `Halay dolu (maksimum ${this.maxPlayers} kişi)` };
    }

    const player = {
      id: userId || key,
      username: username.trim(),
      key,
      joinedAt: Date.now(),
      colorIndex: this.players.size % 12, // karakter rengi çeşitliliği
      isLeader: false
    };

    this.players.set(key, player);
    this.order.push(key);

    // İlk katılan lider olur
    if (this.players.size === 1 || !this.leaderId) {
      this.leaderId = key;
      player.isLeader = true;
    }

    return { ok: true, player: this._publicPlayer(player) };
  }

  leave(username) {
    const key = String(username).toLowerCase().trim();
    if (!this.players.has(key)) {
      return { ok: false, error: 'Oyuncu bulunamadı' };
    }

    this.players.delete(key);
    this.order = this.order.filter(k => k !== key);

    // Lider ayrıldıysa sıradaki lider olsun
    if (this.leaderId === key) {
      this.leaderId = this.order.length > 0 ? this.order[0] : null;
      if (this.leaderId && this.players.has(this.leaderId)) {
        this.players.get(this.leaderId).isLeader = true;
      }
    }

    return { ok: true };
  }

  hasPlayer(username) {
    return this.players.has(String(username).toLowerCase().trim());
  }

  setLeader(username) {
    const key = String(username).toLowerCase().trim();
    if (!this.players.has(key)) {
      return { ok: false, error: 'Oyuncu bulunamadı' };
    }

    // Eski lideri kaldır
    if (this.leaderId && this.players.has(this.leaderId)) {
      this.players.get(this.leaderId).isLeader = false;
    }

    this.leaderId = key;
    this.players.get(key).isLeader = true;

    // Lideri sıranın başına taşı (görsel olarak önde olsun)
    this.order = this.order.filter(k => k !== key);
    this.order.unshift(key);

    return { ok: true };
  }

  setDancing(val) {
    this.dancing = !!val;
  }

  clear() {
    this.players.clear();
    this.order = [];
    this.leaderId = null;
  }

  getPlayers() {
    // Sıralı liste döndür
    return this.order
      .filter(k => this.players.has(k))
      .map(k => this._publicPlayer(this.players.get(k)));
  }

  _publicPlayer(p) {
    return {
      id: p.id,
      username: p.username,
      isLeader: p.isLeader || p.key === this.leaderId,
      colorIndex: p.colorIndex,
      joinedAt: p.joinedAt
    };
  }
}

module.exports = GameState;
