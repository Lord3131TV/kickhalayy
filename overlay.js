/**
 * Kick Halay - Overlay Render Motoru
 * Canvas tabanlı, senkronize 2D stilize karakterler
 * Şeffaf arka plan, ekranın alt kısmında yatay halay zinciri
 */

(function () {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const infoEl = document.getElementById('info');
  const zilgitEl = document.getElementById('zilgit');

  // URL parametreleri
  const params = new URLSearchParams(location.search);
  const channel = (params.get('channel') || 'default').toLowerCase();

  // Sabitler
  const BASE_HEIGHT = 300;
  const CHAR_SPACING = 70;
  const CHAR_SCALE = 0.9;
  const BEAT_MS = 480; // ~125 BPM (halay ritmi)

  let players = [];
  let leaderId = null;
  let dancing = true;
  let scrollOffset = 0;
  let targetScroll = 0;
  let actions = {}; // username -> { type, until }
  let lastBeat = 0;
  let beatPhase = 0; // 0..1

  // Renk paleti (stilize, yetişkin görünümlü)
  const SKIN_TONES = ['#e8b48a', '#d4a574', '#c68642', '#8d5524', '#f1c27d', '#ffdbac'];
  const SHIRT_COLORS = [
    '#2c3e50', '#c0392b', '#27ae60', '#2980b9', '#8e44ad',
    '#d35400', '#16a085', '#2c3e50', '#7f8c8d', '#c0392b',
    '#1abc9c', '#e74c3c'
  ];
  const PANTS_COLORS = ['#1a1a2e', '#16213e', '#0f3460', '#2c2c54', '#1e272e'];

  // ---- WebSocket ----
  let ws;
  let reconnectDelay = 1000;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}?channel=${encodeURIComponent(channel)}`);

    ws.onopen = () => {
      reconnectDelay = 1000;
      console.log('[Halay] Bağlandı:', channel);
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        handleMessage(data);
      } catch (_) {}
    };

    ws.onclose = () => {
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
    };

    ws.onerror = () => ws.close();
  }

  function handleMessage(data) {
    if (data.channel && data.channel !== channel && data.channel !== '*') return;

    switch (data.type) {
      case 'state':
      case 'player_joined':
      case 'player_left':
      case 'leader_changed':
      case 'cleared':
        if (data.players) players = data.players;
        if (data.leaderId !== undefined) leaderId = data.leaderId;
        if (data.dancing !== undefined) dancing = data.dancing;
        break;
      case 'dance':
        dancing = data.dancing;
        break;
      case 'player_action':
        if (data.action === 'zilgit') {
          triggerZilgit();
        } else {
          actions[data.username.toLowerCase()] = {
            type: data.action,
            until: performance.now() + 2200
          };
        }
        break;
      case 'info':
        showInfo(data.message);
        break;
    }
  }

  function showInfo(text) {
    infoEl.textContent = text;
    infoEl.classList.add('show');
    setTimeout(() => infoEl.classList.remove('show'), 3000);
  }

  function triggerZilgit() {
    zilgitEl.classList.add('active');
    setTimeout(() => zilgitEl.classList.remove('active'), 900);
  }

  // ---- Canvas boyut ----
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = Math.min(window.innerHeight, BASE_HEIGHT);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', resize);
  resize();

  // ---- Karakter çizimi (stilize 2D, doğal oranlar) ----
  function drawCharacter(x, y, player, phase, isLeader) {
    const scale = CHAR_SCALE;
    const skin = SKIN_TONES[player.colorIndex % SKIN_TONES.length];
    const shirt = SHIRT_COLORS[player.colorIndex % SHIRT_COLORS.length];
    const pants = PANTS_COLORS[player.colorIndex % PANTS_COLORS.length];

    // Dans fazı: 0..1
    // Adım + sallanma + diz kırma
    const step = Math.sin(phase * Math.PI * 2);
    const step2 = Math.sin(phase * Math.PI * 2 + Math.PI);
    const bob = Math.abs(Math.sin(phase * Math.PI * 2)) * 4; // dikey zıplama
    const sway = Math.sin(phase * Math.PI * 2) * 6; // yatay sallanma
    const knee = Math.abs(Math.sin(phase * Math.PI * 2)) * 3;

    const act = actions[player.username.toLowerCase()];
    let special = null;
    if (act && performance.now() < act.until) {
      special = act.type;
    }

    ctx.save();
    ctx.translate(x + sway, y - bob);

    // Gölge
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 18 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bacaklar (adım atma)
    const legSpread = 8 * scale;
    const legLen = 28 * scale;

    // Sol bacak
    ctx.strokeStyle = pants;
    ctx.lineWidth = 7 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-legSpread * 0.3, -legLen * 0.3);
    ctx.lineTo(-legSpread + step * 10 * scale, knee);
    ctx.stroke();

    // Sağ bacak
    ctx.beginPath();
    ctx.moveTo(legSpread * 0.3, -legLen * 0.3);
    ctx.lineTo(legSpread + step2 * 10 * scale, knee);
    ctx.stroke();

    // Ayakkabı
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(-legSpread + step * 10 * scale, knee + 3, 7 * scale, 3.5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(legSpread + step2 * 10 * scale, knee + 3, 7 * scale, 3.5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gövde (gömlek)
    const bodyY = -legLen * 0.35 - 22 * scale;
    ctx.fillStyle = shirt;
    roundRect(ctx, -14 * scale, bodyY, 28 * scale, 26 * scale, 5 * scale);
    ctx.fill();

    // Kol + el tutma
    const armY = bodyY + 6 * scale;
    const armSway = Math.sin(phase * Math.PI * 2 + 0.5) * 4;

    ctx.strokeStyle = skin;
    ctx.lineWidth = 5.5 * scale;
    ctx.lineCap = 'round';

    // Sol kol (önceki kişiye doğru)
    ctx.beginPath();
    ctx.moveTo(-12 * scale, armY);
    ctx.lineTo(-28 * scale + armSway, armY + 8 * scale + (special === 'dans' ? -12 : 0));
    ctx.stroke();

    // Sağ kol (sonraki kişiye doğru)
    ctx.beginPath();
    ctx.moveTo(12 * scale, armY);
    ctx.lineTo(28 * scale - armSway, armY + 8 * scale + (special === 'dans' ? -12 : 0));
    ctx.stroke();

    // Kafa
    const headY = bodyY - 14 * scale;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, headY, 11 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Saç (basit)
    ctx.fillStyle = '#2c1810';
    ctx.beginPath();
    ctx.arc(0, headY - 3 * scale, 11.5 * scale, Math.PI * 1.1, Math.PI * 1.9);
    ctx.fill();

    // Gözler
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(-3.5 * scale, headY - 1 * scale, 1.4 * scale, 0, Math.PI * 2);
    ctx.arc(3.5 * scale, headY - 1 * scale, 1.4 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Lider mendil
    if (isLeader || special === 'mendil') {
      const mx = 30 * scale;
      const my = armY - 5 * scale + Math.sin(phase * Math.PI * 4) * 10 * scale;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.sin(phase * Math.PI * 4) * 0.6);
      // Mendil
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(10 * scale, -4 * scale);
      ctx.lineTo(14 * scale, 8 * scale);
      ctx.lineTo(2 * scale, 6 * scale);
      ctx.closePath();
      ctx.fill();
      // Sap
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-6 * scale, 4 * scale);
      ctx.stroke();
      ctx.restore();
    }

    // Özel dans animasyonu
    if (special === 'dans') {
      ctx.save();
      ctx.translate(0, headY - 25 * scale);
      ctx.fillStyle = 'rgba(255,215,0,0.85)';
      ctx.font = `bold ${14 * scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('✦', 0, 0);
      ctx.restore();
    }

    // Kullanıcı adı
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const name = player.username.length > 12
      ? player.username.slice(0, 11) + '…'
      : player.username;
    ctx.font = `600 ${11 * scale}px "Segoe UI", system-ui, sans-serif`;
    const tw = ctx.measureText(name).width;
    roundRect(ctx, -tw / 2 - 5, headY - 28 * scale, tw + 10, 16 * scale, 4);
    ctx.fill();

    ctx.fillStyle = isLeader ? '#ffd700' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 0, headY - 20 * scale);

    if (isLeader) {
      ctx.fillStyle = '#ffd700';
      ctx.font = `${10 * scale}px sans-serif`;
      ctx.fillText('★', 0, headY - 34 * scale);
    }

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- Ana render döngüsü ----
  function draw(now) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    ctx.clearRect(0, 0, w, h);

    // Beat senkronizasyonu
    if (dancing) {
      const t = now / BEAT_MS;
      beatPhase = t % 1;
    }

    const count = players.length;
    if (count === 0) {
      // Boş durumda küçük ipucu
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!katıl yazarak halaya katılın', w / 2, h - 40);
      requestAnimationFrame(draw);
      return;
    }

    // Zincir genişliği
    const totalWidth = (count - 1) * CHAR_SPACING + 80;
    const baseY = h - 35;

    // Otomatik yatay kaydırma (ekran taşarsa)
    if (totalWidth > w - 40) {
      // Yavaşça kaydır veya merkeze hizala
      const maxScroll = totalWidth - w + 60;
      targetScroll = Math.min(maxScroll, Math.max(0, (totalWidth - w) / 2));
    } else {
      targetScroll = 0;
    }
    scrollOffset += (targetScroll - scrollOffset) * 0.08;

    const startX = (w - Math.min(totalWidth, w - 40)) / 2 + 40 - scrollOffset;

    // El tutma çizgileri (arkada)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    for (let i = 0; i < count - 1; i++) {
      const x1 = startX + i * CHAR_SPACING;
      const x2 = startX + (i + 1) * CHAR_SPACING;
      ctx.beginPath();
      ctx.moveTo(x1 + 20, baseY - 55);
      ctx.lineTo(x2 - 20, baseY - 55);
      ctx.stroke();
    }

    // Karakterler
    for (let i = 0; i < count; i++) {
      const p = players[i];
      const x = startX + i * CHAR_SPACING;
      // Hafif faz kayması (dalga hissi, ama ortak ritim)
      const phaseOffset = i * 0.04;
      const phase = dancing ? (beatPhase + phaseOffset) % 1 : 0.25;
      const isLeader = p.isLeader || (leaderId && p.username.toLowerCase() === String(leaderId).toLowerCase());
      drawCharacter(x, baseY, p, phase, isLeader);
    }

    // Oyuncu sayısı
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${count} / 50`, w - 12, 18);

    // Eski action temizliği
    const nowMs = performance.now();
    for (const k of Object.keys(actions)) {
      if (actions[k].until < nowMs) delete actions[k];
    }

    requestAnimationFrame(draw);
  }

  // Başlat
  connect();
  requestAnimationFrame(draw);
})();
