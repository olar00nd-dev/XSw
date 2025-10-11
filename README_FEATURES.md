# WFLY Music - Руководство по функциям

## Обзор изменений

Сервер был полностью переработан для поддержки профилей артистов, альбомов, улучшенного поиска и взаимодействия пользователей.

---

## 🎨 Функции для артистов

### 1. Регистрация и вход артистов

**Создание аккаунта артиста:**
```bash
POST /api/artists/auth/register
Content-Type: application/json

{
  "username": "artistname",
  "password": "securepassword123",
  "name": "Artist Display Name",
  "about": "Биография артиста (опционально)"
}
```

**Вход в аккаунт:**
```bash
POST /api/artists/auth/login
Content-Type: application/json

{
  "username": "artistname",
  "password": "securepassword123"
}
```

**Ответ:**
```json
{
  "accessToken": "jwt_token_here",
  "refreshToken": "refresh_token_here",
  "artist": {
    "_id": "artist_id",
    "username": "artistname",
    "name": "Artist Display Name",
    "role": "artist"
  }
}
```

### 2. Управление профилем артиста

**Получить свой профиль:**
```bash
GET /api/artists/me/profile
Authorization: Bearer {accessToken}
```

**Обновить профиль:**
```bash
PUT /api/artists/me/profile
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "name": "Новое имя",
  "about": "Обновленная биография",
  "bannerUrl": "/uploads/banner.jpg",
  "avatarUrl": "/uploads/avatar.jpg"
}
```

**Структура профиля:**
- `name` - Отображаемое имя артиста
- `about` - Биография/описание
- `bannerUrl` - URL баннера профиля (широкое изображение вверху)
- `avatarUrl` - URL аватарки (круглое изображение)

### 3. Управление треками

**Добавить трек:**
```bash
POST /api/artists/me/tracks
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "title": "Название трека",
  "genres": ["hip-hop", "rap"],
  "fileRel": "artist_name/track.mp3",
  "durationSec": 240,
  "albumId": "album_id_optional"
}
```

**Обновить трек:**
```bash
PUT /api/artists/me/tracks/:trackId
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "title": "Новое название",
  "genres": ["pop"],
  "albumId": "new_album_id"
}
```

**Удалить трек:**
```bash
DELETE /api/artists/me/tracks/:trackId
Authorization: Bearer {accessToken}
```

### 4. Управление альбомами

**Создать альбом:**
```bash
POST /api/artists/me/albums
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "title": "Название альбома",
  "releaseDate": "2024-10-11",
  "coverUrl": "/uploads/album_cover.jpg"
}
```

**Обновить альбом:**
```bash
PUT /api/artists/me/albums/:albumId
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "title": "Обновленное название",
  "releaseDate": "2024-10-12",
  "coverUrl": "/uploads/new_cover.jpg"
}
```

**Удалить альбом:**
```bash
DELETE /api/artists/me/albums/:albumId
Authorization: Bearer {accessToken}
```

---

## 👥 Публичный профиль артиста

**Просмотр профиля артиста (для всех):**
```bash
GET /api/artists/:artistId/profile
```

**Структура ответа:**
```json
{
  "artist": {
    "_id": "artist_id",
    "name": "Artist Name",
    "about": "Биография",
    "bannerUrl": "/uploads/banner.jpg",
    "avatarUrl": "/uploads/avatar.jpg",
    "slug": "artist-slug"
  },
  "tracks": [
    {
      "_id": "track_id",
      "title": "Track Name",
      "artistNames": ["Artist Name"],
      "genres": ["hip-hop"],
      "plays": 1234,
      "durationSec": 240
    }
  ],
  "albums": [
    {
      "_id": "album_id",
      "title": "Album Name",
      "releaseDate": "2024-10-11",
      "coverUrl": "/uploads/cover.jpg",
      "trackList": [...]
    }
  ]
}
```

### UI дизайн профиля:
1. **Баннер** - Широкое изображение в верхней части страницы
2. **Аватарка** - Круглое изображение, частично перекрывающее баннер снизу
3. **Информация** - Имя артиста и биография под аватаркой
4. **Альбомы** - Секция с альбомами артиста
5. **Треки** - Список всех треков артиста

---

## 🔍 Улучшенный поиск

**Поиск с фильтрами:**
```bash
GET /api/search?q=query&genre=hip-hop&artistId=artist_id
```

**Параметры:**
- `q` - Текстовый поиск (название трека, имя артиста)
- `genre` - Фильтр по жанру (опционально)
- `artistId` - Фильтр по артисту (опционально)

**Ответ:**
```json
{
  "tracks": [...],
  "artists": [...],
  "albums": [...]
}
```

**Примеры использования:**
```bash
# Поиск по тексту
GET /api/search?q=love

# Поиск по жанру
GET /api/search?genre=hip-hop

# Комбинированный поиск
GET /api/search?q=summer&genre=pop

# Все треки артиста
GET /api/search?artistId=507f1f77bcf86cd799439011
```

---

## ❤️ Лайки и избранное

**Лайкнуть трек:**
```bash
POST /api/tracks/:trackId/like
Authorization: Bearer {accessToken}
```

**Убрать лайк:**
```bash
DELETE /api/tracks/:trackId/like
Authorization: Bearer {accessToken}
```

**Проверить лайк:**
```bash
GET /api/tracks/:trackId/liked
Authorization: Bearer {accessToken}
```

**Ответ:**
```json
{
  "liked": true
}
```

Лайкнутые треки автоматически добавляются в плейлист "Favorites".

---

## 📝 Плейлисты

**Получить все плейлисты:**
```bash
GET /api/playlists
Authorization: Bearer {accessToken}
```

**Создать плейлист:**
```bash
POST /api/playlists
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "name": "My Playlist"
}
```

**Добавить трек в плейлист:**
```bash
POST /api/playlists/:playlistId/tracks
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "trackId": "track_id_here"
}
```

**Удалить трек из плейлиста:**
```bash
DELETE /api/playlists/:playlistId/tracks/:trackId
Authorization: Bearer {accessToken}
```

---

## 🎵 Альбомы

**Получить альбом:**
```bash
GET /api/albums/:albumId
```

**Ответ:**
```json
{
  "album": {
    "_id": "album_id",
    "artistId": "artist_id",
    "artistName": "Artist Name",
    "title": "Album Title",
    "releaseDate": "2024-10-11",
    "coverUrl": "/uploads/cover.jpg",
    "tracks": ["track_id_1", "track_id_2"]
  },
  "tracks": [...]
}
```

---

## 💾 Структура базы данных

### Collections:

1. **users** - Обычные пользователи
   - email, displayName, password, role

2. **artists** - Артисты
   - username, password, name, about, bannerUrl, avatarUrl, slug

3. **tracks** - Треки
   - title, artistIds, artistNames, genres, fileRel, durationSec, albumId, plays

4. **albums** - Альбомы
   - artistId, artistName, title, releaseDate, coverUrl, tracks[]

5. **playlists** - Плейлисты пользователей
   - userId, name, slug, isSystem, tracks[]

6. **likes** - Лайки пользователей
   - userId, trackId, createdAt

7. **sessions** - Сессии (JWT refresh tokens)
   - uid, refreshHash, refreshFp, userType

---

## 🖥️ CLI команды

При запуске сервера доступна интерактивная консоль:

```bash
node server.js

# Доступные команды:
1) Create artist (with login credentials)
2) Add track to artist
3) Import folder
4) Create admin user
5) List artists & counts
6) Quit CLI
```

**Создание артиста через CLI:**
1. Выберите опцию `1`
2. Введите имя артиста
3. Введите username для входа
4. Введите пароль (минимум 8 символов)
5. Введите биографию (опционально)

**Добавление трека:**
1. Выберите опцию `2`
2. Выберите артиста
3. Введите название трека
4. Введите жанры через запятую
5. Укажите путь к аудио файлу

---

## 🔒 Авторизация

Система поддерживает два типа аккаунтов:

### Обычные пользователи (users):
- Регистрация: `/api/auth/register`
- Вход: `/api/auth/login`
- Роль: `user`
- Могут: слушать музыку, создавать плейлисты, лайкать треки

### Артисты (artists):
- Регистрация: `/api/artists/auth/register`
- Вход: `/api/artists/auth/login`
- Роль: `artist`
- Могут: управлять своими треками, альбомами и профилем

### JWT токены:
- `accessToken` - Срок жизни 15 минут, используется для всех запросов
- `refreshToken` - Срок жизни 30 дней, используется для обновления access token

**Обновление токена:**
```bash
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "refresh_token_here"
}
```

---

## 📁 Загрузка файлов

### Структура директорий:
```
store/
├── tracks/        # Аудио файлы
│   └── artist_name/
│       └── track.mp3
└── uploads/       # Изображения (баннеры, аватарки, обложки)
    ├── banners/
    ├── avatars/
    └── covers/
```

### Загрузка изображений:
Файлы загружаются в `store/uploads/` и доступны по пути `/uploads/filename.jpg`

**Пример:**
- Загрузить файл в `store/uploads/banner_123.jpg`
- Обновить профиль с `bannerUrl: "/uploads/banner_123.jpg"`

---

## 🎮 Интеграция с iOS приложением

Существующее iOS приложение можно расширить следующим образом:

### 1. Добавить экран профиля артиста:
```swift
struct ArtistProfileView: View {
    let artistId: String
    @State private var profile: ArtistProfile?
    
    var body: some View {
        ScrollView {
            VStack {
                // Баннер
                AsyncImage(url: profile?.bannerUrl)
                    .frame(height: 200)
                
                // Аватарка (перекрывает баннер)
                AsyncImage(url: profile?.avatarUrl)
                    .frame(width: 120, height: 120)
                    .clipShape(Circle())
                    .offset(y: -60)
                
                // Информация
                Text(profile?.name ?? "")
                    .font(.title)
                Text(profile?.about ?? "")
                    .font(.body)
                
                // Альбомы
                Section("Albums") {
                    ForEach(profile?.albums ?? []) { album in
                        AlbumRow(album: album)
                    }
                }
                
                // Треки
                Section("Tracks") {
                    ForEach(profile?.tracks ?? []) { track in
                        TrackRow(track: track)
                    }
                }
            }
        }
        .task {
            profile = try? await APIClient.shared.getArtistProfile(artistId: artistId)
        }
    }
}
```

### 2. Добавить функции лайков:
```swift
extension APIClient {
    func likeTrack(_ trackId: String) async throws {
        let _: SimpleOK = try await request("/api/tracks/\(trackId)/like", method: "POST", auth: true)
    }
    
    func unlikeTrack(_ trackId: String) async throws {
        let _: SimpleOK = try await request("/api/tracks/\(trackId)/like", method: "DELETE", auth: true)
    }
    
    func checkLiked(_ trackId: String) async throws -> Bool {
        struct R: Codable { let liked: Bool }
        let r: R = try await request("/api/tracks/\(trackId)/liked", auth: true)
        return r.liked
    }
}
```

### 3. Улучшенный поиск:
```swift
func performSearch(query: String, genre: String? = nil) async {
    var urlString = "/api/search?q=\(query)"
    if let genre = genre {
        urlString += "&genre=\(genre)"
    }
    let result: SearchResponse = try await APIClient.shared.request(urlString)
    // Теперь result содержит tracks, artists и albums
}
```

---

## 🚀 Запуск

### Установка зависимостей:
```bash
npm install express ws mongodb pino dotenv cors helmet express-rate-limit bcryptjs jsonwebtoken compression zod nanoid
```

### Переменные окружения (.env):
```bash
NODE_ENV=production
HOST=0.0.0.0
PORT=7412
PUBLIC_URL=https://flip.wfly.me:7412
ALLOWED_ORIGINS=https://flip.wfly.me

TLS_ENABLED=true
TLS_CERT=/etc/letsencrypt/live/flip.wfly.me/fullchain.pem
TLS_KEY=/etc/letsencrypt/live/flip.wfly.me/privkey.pem

MONGODB_URI=mongodb://superadmin:pashroot17@127.0.0.1:27017/wfly_music?authSource=admin

JWT_SECRET=your-super-secret-key-change-in-production
ACCESS_TTL_SEC=900
REFRESH_TTL_SEC=2592000

STORE_DIR=./store/tracks
UPLOADS_DIR=./store/uploads

LOG_LEVEL=info
```

### Запуск:
```bash
node server.js
```

---

## 📊 Мониторинг

**Health check:**
```bash
GET /healthz
```

**Ответ:**
```json
{
  "ok": true,
  "now": 1697000000000
}
```

---

## 🔧 Рекомендации по настройке

### 1. Nginx прокси (рекомендуется для продакшена):
```nginx
upstream wfly_backend {
    server 127.0.0.1:7412;
}

server {
    listen 443 ssl http2;
    server_name flip.wfly.me;

    ssl_certificate /etc/letsencrypt/live/flip.wfly.me/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/flip.wfly.me/privkey.pem;

    location / {
        proxy_pass http://wfly_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads {
        alias /path/to/store/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 2. Индексы MongoDB (создаются автоматически):
- Текстовый поиск по артистам, трекам и альбомам
- Уникальные индексы для email, username
- Индексы для быстрого поиска по жанрам, артистам

---

## 📝 Примеры использования

### Сценарий 1: Артист добавляет новый альбом с треками

```bash
# 1. Вход артиста
curl -X POST https://flip.wfly.me:7412/api/artists/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "artist123", "password": "password123"}'

# 2. Создание альбома
curl -X POST https://flip.wfly.me:7412/api/artists/me/albums \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "My New Album", "releaseDate": "2024-10-11"}'

# 3. Добавление треков в альбом
curl -X POST https://flip.wfly.me:7412/api/artists/me/tracks \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Track 1", "fileRel": "artist/track1.mp3", "albumId": "ALBUM_ID", "genres": ["pop"]}'
```

### Сценарий 2: Пользователь ищет и лайкает музыку

```bash
# 1. Поиск треков по жанру
curl "https://flip.wfly.me:7412/api/search?genre=hip-hop"

# 2. Лайк трека
curl -X POST https://flip.wfly.me:7412/api/tracks/TRACK_ID/like \
  -H "Authorization: Bearer USER_ACCESS_TOKEN"

# 3. Добавление в плейлист
curl -X POST https://flip.wfly.me:7412/api/playlists/PLAYLIST_ID/tracks \
  -H "Authorization: Bearer USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"trackId": "TRACK_ID"}'
```

---

## ✅ Чек-лист функций

- ✅ Регистрация и вход артистов с username/password
- ✅ Управление профилем артиста (баннер, аватарка, биография)
- ✅ Публичная страница профиля артиста
- ✅ Управление треками артиста (создание, редактирование, удаление)
- ✅ Управление альбомами артиста
- ✅ Улучшенный поиск с фильтрами (текст, жанр, артист)
- ✅ Система лайков с отслеживанием
- ✅ Плейлисты пользователей
- ✅ Автоматическое добавление лайкнутых треков в Favorites
- ✅ WebSocket для real-time синхронизации
- ✅ Range streaming для аудио
- ✅ CLI для администрирования
- ✅ JWT авторизация с refresh tokens
- ✅ Rate limiting
- ✅ CORS настройка
- ✅ Логирование (pino)

---

## 🐛 Отладка

### Включить подробное логирование:
```bash
LOG_LEVEL=debug node server.js
```

### Проверка подключения к MongoDB:
```bash
mongo mongodb://superadmin:pashroot17@127.0.0.1:27017/wfly_music?authSource=admin --eval "db.stats()"
```

### Проверка индексов:
```javascript
db.artists.getIndexes()
db.tracks.getIndexes()
db.albums.getIndexes()
```

---

## 📚 Дополнительные ресурсы

- [Express.js документация](https://expressjs.com/)
- [MongoDB Node.js драйвер](https://mongodb.github.io/node-mongodb-native/)
- [JWT токены](https://jwt.io/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

---

**Автор:** WFLY Music Team  
**Версия:** 2.0.0  
**Дата:** 11.10.2024
