# Teltonika GPS Tracking Application - Loyiha Strukturasi

## Loyiha Haqida

**Teltonika-App** - Teltonika GPS qurilmalari bilan integratsiyalashgan GPS kuzatuv va avtoparkni boshqarish uchun NestJS backend ilovasi.

### Texnologiya Steki

| Texnologiya | Versiya | Maqsad |
|-------------|---------|--------|
| Node.js | - | Runtime |
| NestJS | 11.0 | Backend framework |
| PostgreSQL | - | Ma'lumotlar bazasi |
| Drizzle ORM | 1.0-beta | ORM |
| Redis | - | Kesh va sessiya |
| BullMQ | 5.70 | Job queue |
| Socket.io | 4.8 | Real-time kommunikatsiya |
| Swagger | - | API dokumentatsiya |

---

## Papka Strukturasi

```
teltonika-app/
├── src/
│   ├── main.ts                           # Ilovani ishga tushirish
│   ├── app.module.ts                     # Asosiy modul
│   │
│   ├── apps/backend/modules/             # Backend modullari
│   │   ├── auth/                         # Autentifikatsiya
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.dto.ts
│   │   │
│   │   ├── cars/                         # Mashinalar boshqaruvi
│   │   │   ├── car.module.ts
│   │   │   ├── car.controller.ts
│   │   │   ├── car.service.ts
│   │   │   └── car.dto.ts
│   │   │
│   │   ├── driver/                       # Haydovchilar boshqaruvi
│   │   │   ├── driver.module.ts
│   │   │   ├── driver.controller.ts
│   │   │   ├── driver.service.ts
│   │   │   └── driver.dto.ts
│   │   │
│   │   ├── device/                       # GPS qurilmalari
│   │   │   ├── device.module.ts
│   │   │   ├── device.controller.ts
│   │   │   ├── device.service.ts
│   │   │   └── device.dto.ts
│   │   │
│   │   └── history/                      # Tarix ma'lumotlari
│   │       ├── history.module.ts
│   │       ├── history.controller.ts
│   │       ├── history.service.ts
│   │       └── history.dto.ts
│   │
│   ├── teltonika/                        # Teltonika integratsiya
│   │   ├── teltonika.module.ts           # Modul
│   │   ├── teltonika.service.ts          # TCP server
│   │   ├── codec8.parser.ts              # Codec8 protokol parser
│   │   ├── position.service.ts           # Pozitsiya saqlash
│   │   ├── position.processor.ts         # BullMQ processor
│   │   ├── position.job.ts               # Job turlari
│   │   ├── motion-state.service.ts       # Harakat holati
│   │   └── motion-state.constants.ts     # Konstantalar
│   │
│   └── shared/                           # Umumiy modullar
│       ├── config/                       # Konfiguratsiya
│       │   ├── config.module.ts
│       │   ├── db.config.ts              # DB sozlamalari
│       │   ├── redis.config.ts           # Redis sozlamalari
│       │   ├── tcp.config.ts             # TCP sozlamalari
│       │   └── route.config.ts           # Marshrut sozlamalari
│       │
│       ├── database/                     # Ma'lumotlar bazasi
│       │   ├── database.module.ts
│       │   ├── database.provider.ts
│       │   ├── schema/                   # Jadval sxemalari
│       │   │   ├── users.schema.ts
│       │   │   ├── cars.schema.ts
│       │   │   ├── devices.schema.ts
│       │   │   ├── drivers.schema.ts
│       │   │   ├── car-positions.schema.ts
│       │   │   ├── car-last-position.schema.ts
│       │   │   ├── car-stop-events.schema.ts
│       │   │   ├── car-engine-events.schema.ts
│       │   │   ├── car-devices.schema.ts
│       │   │   └── car-drivers.schema.ts
│       │   ├── relations/                # Munosabatlar
│       │   │   └── index.ts
│       │   └── migrations/               # Migratsiyalar
│       │
│       ├── gateway/                      # WebSocket
│       │   ├── gateway.module.ts
│       │   └── tracking.gateway.ts       # Real-time tracking
│       │
│       ├── guards/                       # Himoya
│       │   ├── global-jwt.guard.ts
│       │   └── jwt.guard.ts
│       │
│       ├── decorators/                   # Dekoratorlar
│       │   ├── public.decorator.ts
│       │   ├── get-user.decorator.ts
│       │   └── api-paginated-response.ts
│       │
│       ├── dto/                          # DTO lar
│       │   ├── common.dto.ts
│       │   └── paginated-response.dto.ts
│       │
│       ├── exceptions/                   # Xatoliklar
│       │   └── global-exception.filter.ts
│       │
│       ├── helper/                       # Yordamchi funksiyalar
│       │   └── paginate.ts
│       │
│       └── types/                        # Turlar
│           ├── common.type.ts
│           └── express.ts
│
├── test/                                 # Testlar
│   ├── jest-e2e.json
│   ├── app.e2e-spec.ts
│   └── test-teltonika.ts
│
├── drizzle.config.ts                     # Drizzle konfiguratsiya
├── nest-cli.json                         # NestJS CLI
├── tsconfig.json                         # TypeScript
├── package.json                          # Dependencies
└── .env                                  # Environment variables
```

---

## Ma'lumotlar Bazasi Sxemasi

| Jadval | Maqsad | Asosiy Maydonlar |
|--------|--------|------------------|
| `users` | Foydalanuvchilar | id, email, password_hash |
| `cars` | Mashinalar | id, user_id, name, car_number |
| `devices` | GPS qurilmalar | id, imei, model |
| `drivers` | Haydovchilar | id, name, license_number |
| `car_positions` | GPS tarix | id, car_id, lat, lng, timestamp |
| `car_last_position` | Joriy pozitsiya | id, car_id, lat, lng |
| `car_stop_events` | To'xtash hodisalari | id, car_id, start_time, end_time |
| `car_engine_events` | Dvigatel hodisalari | id, car_id, is_on, timestamp |
| `car_devices` | Mashina-qurilma bog'lanishi | car_id, device_id |
| `car_drivers` | Mashina-haydovchi bog'lanishi | car_id, driver_id |

---

## API Endpointlar

### Autentifikatsiya
- `POST /api/auth/login` - Tizimga kirish
- `POST /api/auth/register` - Ro'yxatdan o'tish

### Mashinalar
- `GET /api/car` - Barcha mashinalar (paginatsiya)
- `GET /api/car/last-positions` - Oxirgi pozitsiyalar
- `GET /api/car/:id` - Bitta mashina
- `POST /api/car` - Yangi mashina
- `PUT /api/car/:id` - Mashinani yangilash
- `DELETE /api/car/:id` - Mashinani o'chirish

### Haydovchilar
- `GET /api/driver` - Barcha haydovchilar
- `POST /api/driver` - Yangi haydovchi
- `PUT /api/driver/:id` - Haydovchini yangilash
- `DELETE /api/driver/:id` - Haydovchini o'chirish

### Qurilmalar
- `GET /api/device` - Barcha qurilmalar
- `POST /api/device` - Yangi qurilma
- `PUT /api/device/:id` - Qurilmani yangilash
- `DELETE /api/device/:id` - Qurilmani o'chirish

### Tarix
- `GET /api/history/positions` - Pozitsiya tarixi
- `GET /api/history/stops` - To'xtash tarixi
- `GET /api/history/engine` - Dvigatel tarixi

---

## WebSocket Events

**Namespace:** `/tracking`

| Event | Yo'nalish | Maqsad |
|-------|-----------|--------|
| `track:subscribe` | Client → Server | Kuzatuvga obuna |
| `track:unsubscribe` | Client → Server | Obunani bekor qilish |
| `car:location` | Server → Client | Joylashuv yangilanishi |

---

## Ma'lumot Oqimi

### GPS Ma'lumotlarni Qabul Qilish

```
Teltonika GPS Qurilma (TCP:5027)
         ↓
    TCP Server (teltonika.service.ts)
         ↓
    IMEI Tekshirish
         ↓
    Codec8 Parsing
         ↓
    BullMQ Job Queue
         ↓
    Position Processor
         ↓
    Database + Motion State
         ↓
    WebSocket Broadcast
         ↓
    Connected Clients
```

---

## Portlar

| Port | Xizmat |
|------|--------|
| 3000 | HTTP Server (API) |
| 5027 | TCP Server (Teltonika) |

---

## Skriptlar

```bash
pnpm run build        # Production build
pnpm run start:dev    # Development server
pnpm run start:prod   # Production server
pnpm run test         # Unit testlar
pnpm run test:e2e     # E2E testlar
pnpm run lint         # ESLint
pnpm run format       # Prettier
```

---

## Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=teltonika

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Server
PORT=3000
TCP_PORT=5027
TCP_HOST=0.0.0.0

# JWT
JWT_SECRET=your-secret-key

# Route
ROUTE_MIN_SPEED=5
ROUTE_MIN_DISTANCE=50
ROUTE_SEGMENT_GAP_MINUTES=10
```