# Teltonika App — Server Migratsiya Rejasi

Loyihani eski serverdan **yangi serverga** (`gps.megago.uz` / `195.158.20.195`) ko'chirish bo'yicha to'liq qo'llanma.

> ⚠️ **Maxfiylik:** Bu fayl gitга commit qilinadi — bu yerga **parol, SSH key, JWT_SECRET** kabi maxfiy ma'lumotlarni YOZMANG. Ular faqat serverdagi `.env` faylida va GitHub Secrets'da saqlanadi.

---

## 1. Arxitektura (nimani ko'chiramiz)

Bu oddiy web app emas — real **Teltonika GPS qurilmalari** TCP orqali ulanadigan tizim.

| Komponent | Tavsif | Port |
|---|---|---|
| NestJS app | PM2 process `teltonika-api`, `/var/www/teltonika-app` | HTTP `8000` |
| TCP server | Teltonika GPS qurilmalari (Codec8) ulanadi | `5027` ⚠️ |
| WebSocket | Socket.io `/tracking` namespace | HTTP bilan |
| PostgreSQL | `teltonika_db` (~2.5GB / 8M qator) | `5432` |
| Redis | BullMQ navbat + cache | `6379` |
| Nginx | reverse proxy + SSL | `80/443` |
| PM2 logrotate | hourly rotate, retain 7, compress off | — |

---

## 2. Yangi server holati (tahlil natijasi)

**Server:** Ubuntu 24.04, 4 CPU, 3.8GB RAM, 66GB bo'sh disk.

### ✅ Tayyor (o'rnatilgan)
- Node `v20.20.2` (CI ham Node 20 — mos)
- PostgreSQL `16.14`
- Redis `7.0.15`
- Nginx `1.24.0`
- Git `2.43.0`

### ❌ O'rnatish kerak
- `pnpm` (v9)
- `pm2` + `pm2-logrotate` moduli

### ⚠️ Shared xizmatlar — EHTIYOT BO'LING (boshqa projectlar ishlayapti)
- **PostgreSQL:** mavjud bazalar `lorddb`, `megalord_dev`, `water_db`. → `teltonika_db` nomi **bo'sh**, alohida user/db yaratamiz, eskilarга tegmaymiz.
- **Redis:** `db0` (86k kalit) va `db1` (42 kalit) band. → Biz **`db2`** ishlatamiz (kodda `REDIS_DB` qo'shildi). To'qnashuv bo'lmaydi.
- **Nginx:** mavjud saytlar `devices.megago.uz`, `lord.megago.uz`. → `gps.megago.uz` yangi config qo'shamiz, eskilarга tegmaymiz.

### ✅ Bo'sh portlar
- `5027` (GPS) — bo'sh ✅
- `8000` (app) — bo'sh ✅

---

## 3. ⭐ GPS qurilmalar — eng muhim nuqta

GPS qurilmalar **IP orqali** ulangan, LEKIN DNS tekshiruvi shuni ko'rsatdi:

```
gps.megago.uz  →  195.158.20.195  (= aynan yangi server)
```

**Aniqlash kerak:** qurilmalar config'ida **xom IP** yozilganmi yoki **`gps.megago.uz`** domeni?

- **Agar domen (`gps.megago.uz`)** → migratsiya oson. Yangi serverda `5027` ishlasa, oqim avtomatik keladi. IP ko'chirish kerak emas.
- **Agar xom IP (eski server)** → cutover paytida eski IP'ni yangi serverga biriktirish (floating IP) yoki qurilmalarni qayta sozlash kerak.

> Buni bitta qurilma sozlamasidan tekshiring.

---

## 4. Kod o'zgarishlari (migratsiya uchun qo'shildi)

Shared Redis'dan izolyatsiya uchun `REDIS_DB` qo'shildi:
- `src/shared/config/redis.config.ts` — `REDIS_DB` (default `0`)
- `src/app.module.ts` — Cache (KeyvRedis) + BullMQ endi `config.db` ishlatadi

`.env` da `REDIS_DB=2` qilinadi → app boshqa projectlardan to'liq ajralgan Redis bazasida ishlaydi.

---

## 5. Bosqichma-bosqich o'rnatish

### 5.1. Muhitni o'rnatish (faqat yetishmaganini)
```bash
# pnpm + pm2 (Node 20 allaqachon bor)
sudo npm i -g pnpm@9 pm2

# pm2-logrotate (eski serverdagidek sozlamalar)
pm2 install pm2-logrotate
pm2 set pm2-logrotate:rotateInterval '0 * * * *'
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress false
pm2 set pm2-logrotate:workerInterval 60
```

### 5.2. PostgreSQL — alohida user + baza
```bash
sudo -u postgres psql -c "CREATE USER teltonika WITH PASSWORD '<KUCHLI_PAROL>';"
sudo -u postgres psql -c "CREATE DATABASE teltonika_db OWNER teltonika;"
```

### 5.3. Bazani ko'chirish (~2.5GB)
```bash
# --- ESKI serverda ---
pg_dump -U teltonika -h localhost -F c -d teltonika_db -f /tmp/teltonika_db.dump

# yangi serverga uzatish (yangi SSH porti 1170!)
scp -P 1170 /tmp/teltonika_db.dump megasoft@195.158.20.195:/tmp/

# --- YANGI serverda ---
pg_restore -U teltonika -h localhost -d teltonika_db --no-owner --no-acl /tmp/teltonika_db.dump
```
> PG versiyasi: eski ≤ 16 bo'lsa muammosiz. Eski server versiyasini oldindan tekshiring (`psql --version`).

### 5.4. Kodni joylash
```bash
sudo git clone <REPO_URL> /var/www/teltonika-app
sudo chown -R $USER:$USER /var/www/teltonika-app
cd /var/www/teltonika-app
pnpm install --frozen-lockfile
pnpm build
```

### 5.5. `.env` faylni qo'lda yaratish
> Repoда yo'q (gitignored). Maxfiy qiymatlar pastda placeholder.
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=teltonika
DB_PASSWORD=<KUCHLI_PAROL>
DB_NAME=teltonika_db

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=2

TCP_PORT=5027
TCP_HOST=0.0.0.0
PORT=8000

JWT_SECRET=<ESKI_SERVERDAGI_AYNAN_QIYMAT>

ROUTE_MIN_SPEED=2
ROUTE_MIN_DISTANCE=10
ROUTE_SEGMENT_GAP_MINUTES=30
ROUTE_MAX_DISTANCE=500
```
> ⚠️ `JWT_SECRET` eski serverdagi qiymat bilan **aynan bir xil** bo'lishi shart — aks holda foydalanuvchilar token'lari bekor bo'ladi.

### 5.6. App'ni ishga tushirish
```bash
cd /var/www/teltonika-app
pm2 start dist/src/main.js --name teltonika-api
pm2 save
pm2 startup   # chiqarган buyruqni copy-paste qiling (reboot'da avtostart)
```
> Build chiqishi `dist/src/main.js` (`dist/main.js` EMAS).

### 5.7. Nginx — yangi config (eskilarga tegmasdan)
`/etc/nginx/sites-available/gps.megago.uz`:
```nginx
server {
    listen 80;
    server_name gps.megago.uz;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        # WebSocket (Socket.io) uchun SHART:
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/gps.megago.uz /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d gps.megago.uz   # SSL
```
> TCP `5027` nginx orqali O'TMAYDI — u to'g'ridan-to'g'ri app'ga ulanadi.

### 5.8. Firewall
```bash
sudo ufw allow 1170/tcp   # SSH (nostandart port!)
sudo ufw allow 80,443/tcp # nginx
sudo ufw allow 5027/tcp   # ⚠️ GPS qurilmalar — TASHQARIGA OCHIQ shart
sudo ufw enable
# 5432, 6379 OCHILMAYDI — faqat localhost
```

---

## 6. CI/CD (GitHub Actions)

`.github/workflows/deploy.yml` — push `main` → build-check → SSH deploy.

**GitHub → Settings → Secrets'da yangilang:**
| Secret | Qiymat |
|---|---|
| `SERVER_HOST` | `195.158.20.195` |
| `SERVER_USER` | `megasoft` |
| `SERVER_SSH_KEY` | yangi server SSH private key |

⚠️ **Diqqat:** SSH porti nostandart (`1170`). `appleboy/ssh-action` da `port: 1170` qo'shilishi kerak:
```yaml
with:
  host: ${{ secrets.SERVER_HOST }}
  username: ${{ secrets.SERVER_USER }}
  key: ${{ secrets.SERVER_SSH_KEY }}
  port: 1170          # <-- QO'SHISH KERAK
  script: |
    cd /var/www/teltonika-app
    git pull origin main
    pnpm install --frozen-lockfile
    pnpm build
    pm2 restart teltonika-api
```
> Eslatma: deploy script'da DB migratsiya qadami yo'q. Schema o'zgarsa qo'lda `pnpm drizzle-kit migrate` qilinadi.

---

## 7. Cutover (almashtirish) va tekshirish

1. Eski serverda app'ni to'xtatib, **oxirgi DB dump**'ni oling (yangi yozuvlar yo'qolmasin).
2. Yangi serverga restore qiling.
3. **GPS oqimini yo'naltirish:**
   - domen orqali bo'lsa → allaqachon yangi serverга ishora qilyapti, qo'shimcha ish yo'q;
   - xom IP bo'lsa → IP'ni ko'chiring yoki qurilmalarni qayta sozlang.
4. Tekshirish:
```bash
pm2 logs teltonika-api              # toza loglar, xato yo'qmi
ss -tlnp | grep -E '5027|8000'      # portlar tinglayaptimi
pm2 logs teltonika-api | grep -iE "Engine|record"   # GPS kelyaptimi
```
5. Frontend orqali API + WebSocket ishlayotganini tekshiring.

---

## 8. Yakuniy cheklist

- [ ] GPS qurilmalar IP'gami yoki `gps.megago.uz` domengami — aniqlangan
- [ ] pnpm + pm2 + pm2-logrotate o'rnatildi (sozlamalar bilan)
- [ ] PostgreSQL: `teltonika` user + `teltonika_db` (alohida)
- [ ] DB dump → restore (2.5GB)
- [ ] `.env` qo'lda yaratildi (`REDIS_DB=2`, JWT_SECRET aynan)
- [ ] `git clone` + build + pm2 start + save + startup
- [ ] Nginx `gps.megago.uz` config + SSL (WebSocket headers!)
- [ ] UFW: 1170/80/443/5027 ochiq; 5432/6379 yopiq
- [ ] GitHub Secrets yangilandi + `port: 1170` deploy.yml'da
- [ ] Cutover: GPS oqimi + frontend tekshirildi
- [ ] Server paroli almashtirildi (`passwd`)
