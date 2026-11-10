# KICK HALAY

Kick canlı yayınlarına entegre, izleyici sohbet komutlarıyla çalışan etkileşimli **Halay** oyunu.

OBS Browser Source üzerinden şeffaf overlay olarak çalışır. İzleyiciler sohbete `!katıl` yazarak karakterleriyle halay sırasına girer.

---

## Özellikler

- Maksimum **50 oyuncu**
- Senkronize halay animasyonu (adım, sallanma, diz kırma)
- İlk katılan otomatik **halay başı** (mendil)
- Kick sohbet komutları
- OBS için tamamen şeffaf arka plan
- Yerel test paneli (Kick bağlantısı olmadan da çalışır)
- Resmi Kick Webhook + opsiyonel unofficial Pusher dinleyici

---

## Hızlı Başlangıç (Windows)

1. [Node.js LTS](https://nodejs.org) kurulu olsun (18+).
2. Bu klasörde `start.bat` dosyasına çift tıklayın.
3. İlk çalıştırmada bağımlılıklar otomatik yüklenir.
4. Tarayıcıda açın: **http://localhost:3000/admin**

### OBS Ayarları

1. OBS → Kaynaklar → **+** → **Tarayıcı**
2. URL örneği:
   ```
   http://localhost:3000/overlay?channel=KANAL_ADINIZ
   ```
3. Genişlik: `1920`  
   Yükseklik: `300` (veya ihtiyaca göre 250–350)
4. **“Şeffaf arka planı kapat”** kutusunun işaretini **kaldırın** (şeffaf kalsın).
5. Kaynağı sahnenin **altına** yerleştirin; kamera görüntüsünün üzerine binmesin.

---

## Sohbet Komutları

| Komut       | Açıklama                                      |
|-------------|-----------------------------------------------|
| `!katıl`    | Halaya katıl                                  |
| `!ayrıl`    | Halaydan çık                                  |
| `!halay`    | Mevcut oyuncu sayısını göster                 |
| `!dans`     | Özel dans animasyonu                          |
| `!mendil`   | Mendil sallama animasyonu                     |
| `!zılgıt`   | Ekranda zılgıt efekti                         |
| `!lider`    | Liderlik iste (halay başı ol)                 |

Kurallar:
- Aynı kullanıcı birden fazla kez katılamaz.
- 50 kişi dolunca yeni katılım reddedilir.
- Lider ayrılırsa sıradaki oyuncu lider olur.

---

## Yönetim Paneli

**http://localhost:3000/admin**

- Oyuncu ekle / çıkar
- Halayı başlat / durdur
- Lider değiştir
- Sohbet komutu simüle et
- Overlay URL’sini kopyala

Kick bağlantısı olmadan da tüm özellikleri test edebilirsiniz.

---

## Kick API Kurulumu (Gerçek Sohbet)

### 1. Developer App oluştur

1. Kick hesabınızla giriş yapın.
2. [Kick Developer / App Settings](https://kick.com/settings/developer) bölümüne gidin.
3. Yeni bir uygulama oluşturun.
4. **Redirect URI**: `http://localhost:3000/auth/callback`
5. Gerekli scope’lar:
   - `chat:write`
   - `events:subscribe`
   - `user:read`
   - `channel:read`

### 2. .env dosyasını düzenleyin

`start.bat` ilk çalıştırmada `.env.example` dosyasını `.env` olarak kopyalar. Düzenleyin:

```env
PORT=3000
KICK_CLIENT_ID=your_client_id
KICK_CLIENT_SECRET=your_client_secret
KICK_REDIRECT_URI=http://localhost:3000/auth/callback
KICK_CHANNEL_SLUG=yayinci_kanal_adi
USE_UNOFFICIAL_CHAT=true
TEST_MODE=false
MAX_PLAYERS=50
```

### 3. OAuth (opsiyonel, mesaj göndermek için)

Tarayıcıda: **http://localhost:3000/auth**

Yetkilendirme sonrası tokenlar `tokens.json` dosyasına kaydedilir.

### 4. Webhook (resmi yöntem – önerilen üretim)

1. Kick Developer Portal’da uygulamanızın webhook URL’sini ayarlayın:
   ```
   https://SIZIN_DOMAIN/webhook/kick
   ```
   (Yerelde test için ngrok vb. kullanabilirsiniz.)
2. `chat.message.sent` event’ine abone olun.
3. `events:subscribe` scope’u gereklidir.

Yerel geliştirme için `USE_UNOFFICIAL_CHAT=true` ile Pusher üzerinden sohbet dinlenebilir (resmi olmayan yöntem; değişebilir).

---

## Proje Yapısı

```
kick-halay/
├── start.bat              # Windows tek tıkla başlat
├── package.json
├── .env.example
├── README.md
├── src/
│   ├── server.js          # Express + WebSocket sunucu
│   ├── gameState.js       # Oyuncu / lider yönetimi
│   ├── kickChat.js        # Sohbet dinleyici (Pusher)
│   └── kickAuth.js        # OAuth yardımcı
└── public/
    ├── overlay.html       # OBS Browser Source
    ├── overlay.js         # Canvas animasyon motoru
    └── admin.html         # Yönetim / test paneli
```

---

## Teknik Notlar

- **Arka plan**: Tamamen şeffaf (`background: transparent`).
- **Performans**: 50 karaktere kadar canvas çizimi, düşük CPU.
- **Senkron dans**: Ortak beat döngüsü; karakterler aynı ritme göre hareket eder.
- **Kaydırma**: Zincir ekran genişliğini aşarsa otomatik yatay hizalama yapılır.
- **Yenileme**: Overlay tarayıcı yenilense bile sunucudan güncel oyuncu listesi alınır.

---

## Sorun Giderme

| Sorun | Çözüm |
|-------|--------|
| Node bulunamadı | nodejs.org üzerinden LTS kurun |
| Overlay boş | Admin panelinden test oyuncu ekleyin; kanal adını kontrol edin |
| Kick sohbeti gelmiyor | `KICK_CHANNEL_SLUG` doğru mu? `USE_UNOFFICIAL_CHAT=true` deneyin veya webhook kurun |
| Karakterler üst üste | Yükseklik 300+ olsun; oyuncu sayısı 50’yi geçmesin |
| Port kullanımda | `.env` içinde `PORT=3001` gibi başka port verin |

---

## Lisans

MIT – Kendi yayınlarınızda özgürce kullanabilirsiniz.

İyi yayınlar, bol zılgıtlı halaylar!
