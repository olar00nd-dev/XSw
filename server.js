/**
 * WFLY Music — server.js (enhanced with artist profiles & albums)
 * Node 18+ (tested on 20), MongoDB 5+
 * HTTPS + WSS (:7412), REST API + Range streaming (MP3/M4A/FLAC/OGG)
 * Multi‑device sync (iOS today, macOS later): devices, player state, remote control via WS/HTTP
 *
 * Features:
 * - Artist authentication (username/password)
 * - Artist profile management (banner, avatar, bio)
 * - Album management
 * - Enhanced search (text, genre, artist filters)
 * - User likes tracking
 * - Playlist management
 * - Multi-device sync
 *
 * Install:
 *   npm i express ws mongodb pino dotenv cors helmet express-rate-limit bcryptjs jsonwebtoken compression zod nanoid multer
 *
 * Run:
 *   node server.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const { MongoClient, ObjectId } = require('mongodb');
const pino = require('pino');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { customAlphabet } = require('nanoid');
const readline = require('readline');

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

// ===========================
// Config
// ===========================
const CFG = {
  NODE_ENV: process.env.NODE_ENV || 'production',
  HOST: process.env.HOST || '0.0.0.0',
  PORT: Number(process.env.PORT || 7412),
  PUBLIC_URL: process.env.PUBLIC_URL || 'https://flip.wfly.me:7412',
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'https://flip.wfly.me').split(',').map(s => s.trim()).filter(Boolean),

  TLS_ENABLED: (process.env.TLS_ENABLED || 'false').toLowerCase() === 'true',
  TLS_CERT: process.env.TLS_CERT || '/etc/letsencrypt/live/flip.wfly.me/fullchain.pem',
  TLS_KEY: process.env.TLS_KEY || '/etc/letsencrypt/live/flip.wfly.me/privkey.pem',

  // Mongo
  MONGO_URI:
    process.env.MONGODB_URI ||
    `mongodb://superadmin:pashroot17@127.0.0.1:27017/wfly_music?authSource=admin`,

  JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-prod-super-long-secret',
  ACCESS_TTL_SEC: Number(process.env.ACCESS_TTL_SEC || 15 * 60), // 15m
  REFRESH_TTL_SEC: Number(process.env.REFRESH_TTL_SEC || 30 * 24 * 3600), // 30d

  STORE_DIR: process.env.STORE_DIR || path.resolve(process.cwd(), 'store', 'tracks'),
  UPLOADS_DIR: process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'store', 'uploads'),

  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};

const LOG = pino({ level: CFG.LOG_LEVEL });

// ensure store dirs
fs.mkdirSync(CFG.STORE_DIR, { recursive: true });
fs.mkdirSync(CFG.UPLOADS_DIR, { recursive: true });

// ===========================
/** Mongo bootstrap */
let db, colUsers, colArtists, colTracks, colAlbums, colPlaylists, colSessions, colEvents, colDevices, colStates, colLikes;
const client = new MongoClient(CFG.MONGO_URI, { maxPoolSize: 20 });

// ===========================
/** Express app */
const app = express();
const TRUST_PROXY_HOPS = parseInt(process.env.TRUST_PROXY_HOPS || '0', 10);
app.set('trust proxy', TRUST_PROXY_HOPS > 0 ? TRUST_PROXY_HOPS : false);

// Security middlewares
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow curl / native apps
    if (CFG.ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed'), false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression({ filter: (req, res) => {
  if (req.path.startsWith('/api/tracks/') && req.path.endsWith('/stream')) return false;
  return compression.filter(req, res);
}}));

const limiterAuth = rateLimit({ windowMs: 5 * 60 * 1000, limit: 50 });
const limiterGeneral = rateLimit({ windowMs: 60 * 1000, limit: 300 });
app.use('/api/auth/', limiterAuth);
app.use('/api/artists/auth/', limiterAuth);
app.use('/api/', limiterGeneral);

// Static uploads
app.use('/uploads', express.static(CFG.UPLOADS_DIR));

// ===========================
// Utils
// ===========================
function ipOf(req) {
  return (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.socket.remoteAddress || '';
}

function primaryLocale(req) {
  const al = (req.headers['accept-language'] || '').toString().split(',')[0].trim();
  return al || 'en';
}

function safeContentTypeByExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a' || ext === '.mp4' || ext === '.aac') return 'audio/mp4';
  if (ext === '.ogg' || ext === '.oga') return 'audio/ogg';
  if (ext === '.flac') return 'audio/flac';
  if (ext === '.wav') return 'audio/wav';
  return 'application/octet-stream';
}

function assertRelativeToStore(abs) {
  const rel = path.relative(CFG.STORE_DIR, abs);
  if (rel.startsWith('..')) throw new Error('File must be inside STORE_DIR');
  return rel.split(path.sep).join('/');
}

function authHeaderToken(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(h);
  return m ? m[1] : null;
}

function signAccess(u, role) {
  return jwt.sign(
    { uid: u._id.toString(), role: role || u.role || 'user' },
    CFG.JWT_SECRET,
    { expiresIn: CFG.ACCESS_TTL_SEC }
  );
}

const REFRESH_BYTES = 48;
function generateRefresh() { return crypto.randomBytes(REFRESH_BYTES).toString('hex'); }
function hashToken(raw) { return bcrypt.hashSync(raw, 10); }
function fpToken(raw) { return crypto.createHash('sha256').update(raw).digest('hex'); }

async function verifyRefreshByFp(fp) {
  const sess = await colSessions.findOne({ refreshFp: fp, disabled: { $ne: true } });
  if (!sess) return null;
  return sess;
}

function requireAuth(handler) {
  return async (req, res, next) => {
    try {
      const token = authHeaderToken(req);
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      const payload = jwt.verify(token, CFG.JWT_SECRET);
      const uid = new ObjectId(payload.uid);
      const user = await colUsers.findOne({ _id: uid }, { projection: { password: 0 } });
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      req.user = user;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

function requireArtist(handler) {
  return async (req, res, next) => {
    try {
      const token = authHeaderToken(req);
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      const payload = jwt.verify(token, CFG.JWT_SECRET);
      if (payload.role !== 'artist') return res.status(403).json({ error: 'Artists only' });
      const aid = new ObjectId(payload.uid);
      const artist = await colArtists.findOne({ _id: aid }, { projection: { password: 0 } });
      if (!artist) return res.status(401).json({ error: 'Unauthorized' });
      req.artist = artist;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

// ===========================
// Schemas
// ===========================
const AuthRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(60),
  device: z.object({
    platform: z.string().optional(),
    os: z.string().optional(),
    model: z.string().optional(),
    appVersion: z.string().optional(),
    region: z.string().optional(),
  }).partial().optional(),
});

const AuthLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  device: AuthRegisterSchema.shape.device.optional(),
});

const ArtistRegisterSchema = z.object({
  username: z.string().min(3).max(30),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(100),
  about: z.string().max(1000).optional(),
});

const ArtistLoginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const TrackCreateSchema = z.object({
  title: z.string().min(1).max(200),
  genres: z.array(z.string()).optional(),
  albumId: z.string().length(24).optional(),
  fileRel: z.string().min(1),
  durationSec: z.number().int().optional(),
});

const AlbumCreateSchema = z.object({
  title: z.string().min(1).max(200),
  releaseDate: z.string().optional(),
  coverUrl: z.string().optional(),
});

const PlaylistCreateSchema = z.object({ name: z.string().min(1).max(100) });
const PlaylistTracksSchema = z.object({ trackId: z.string().length(24) });

const DeviceHeartbeatSchema = z.object({
  deviceId: z.string().min(4).max(64),
  name: z.string().min(1).max(80).optional(),
  app: z.string().min(1).max(40).optional(),
  platform: z.string().min(2).max(40).optional(),
  capabilities: z.object({ playback: z.boolean().optional() }).optional(),
});

const PlayerStateUpdateSchema = z.object({
  deviceId: z.string().min(4).max(64),
  trackId: z.string().length(24).optional(),
  positionMs: z.number().int().min(0).max(24 * 3600 * 1000).optional(),
  isPlaying: z.boolean().optional(),
  queue: z.array(z.string().length(24)).optional(),
  currentIndex: z.number().int().min(0).optional(),
});

const PlayerActivateSchema = z.object({ deviceId: z.string().min(4).max(64) });
const PlayerControlSchema = z.object({ cmd: z.enum(['play', 'pause', 'toggle', 'next', 'prev', 'seek']), args: z.any().optional() });

// ===========================
// API Routes
// ===========================
app.get('/healthz', (req, res) => res.json({ ok: true, now: Date.now() }));

// --- User Auth
app.post('/api/auth/register', async (req, res) => {
  try {
    const body = AuthRegisterSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const existed = await colUsers.findOne({ email });
    if (existed) return res.status(409).json({ error: 'Email already registered' });

    const hash = bcrypt.hashSync(body.password, 10);
    const userDoc = { email, displayName: body.displayName, password: hash, role: 'user', createdAt: new Date(), devices: [] };
    const r = await colUsers.insertOne(userDoc);
    const uid = r.insertedId;

    // default "Favorites" playlist
    await colPlaylists.insertOne({ userId: uid, name: 'Favorites', slug: 'favorites', isSystem: true, createdAt: new Date(), tracks: [] });

    // session + tokens
    const refreshRaw = generateRefresh();
    const refreshHash = hashToken(refreshRaw);
    const refreshFp = fpToken(refreshRaw);
    await colSessions.insertOne({ uid, refreshHash, refreshFp, createdAt: new Date(), expiresAt: new Date(Date.now() + CFG.REFRESH_TTL_SEC * 1000), userType: 'user', device: { ...(body.device || {}), ip: ipOf(req), locale: primaryLocale(req) } });

    const access = signAccess({ _id: uid, role: 'user' }, 'user');
    res.json({ accessToken: access, refreshToken: refreshRaw, user: { _id: uid, email, displayName: body.displayName, role: 'user' } });
  } catch (e) {
    LOG.warn({ e }, '[auth/register] failed');
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues });
    res.status(500).json({ error: 'Register failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const body = AuthLoginSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const user = await colUsers.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Wrong email or password' });
    if (!bcrypt.compareSync(body.password, user.password)) return res.status(401).json({ error: 'Wrong email or password' });

    const refreshRaw = generateRefresh();
    const refreshHash = hashToken(refreshRaw);
    const refreshFp = fpToken(refreshRaw);
    await colSessions.updateOne(
      { uid: user._id },
      { $set: { refreshHash, refreshFp, disabled: false, updatedAt: new Date(), expiresAt: new Date(Date.now() + CFG.REFRESH_TTL_SEC * 1000), userType: 'user', device: { ...(body.device || {}), ip: ipOf(req), locale: primaryLocale(req) } }, $setOnInsert: { uid: user._id, createdAt: new Date() } },
      { upsert: true }
    );

    const access = signAccess(user, 'user');
    res.json({ accessToken: access, refreshToken: refreshRaw, user: { _id: user._id, email: user.email, displayName: user.displayName, role: user.role || 'user' } });
  } catch (e) {
    LOG.warn({ e }, '[auth/login] failed');
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues });
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'Missing refreshToken' });
    const sess = await verifyRefreshByFp(fpToken(refreshToken));
    if (!sess) return res.status(401).json({ error: 'Invalid session' });
    if (!bcrypt.compareSync(refreshToken, sess.refreshHash)) return res.status(401).json({ error: 'Invalid refresh' });
    
    // Check if user or artist
    let user = await colUsers.findOne({ _id: sess.uid });
    let role = 'user';
    if (!user) {
      user = await colArtists.findOne({ _id: sess.uid });
      role = 'artist';
    }
    if (!user) return res.status(401).json({ error: 'User not found' });
    
    const access = signAccess(user, role);
    return res.json({ accessToken: access });
  } catch (e) {
    return res.status(401).json({ error: 'Refresh failed' });
  }
});

app.post('/api/auth/logout', requireAuth(), async (req, res) => {
  await colSessions.updateOne({ uid: req.user._id }, { $set: { disabled: true, updatedAt: new Date() } });
  res.json({ ok: true });
});

// --- Artist Auth
app.post('/api/artists/auth/register', async (req, res) => {
  try {
    const body = ArtistRegisterSchema.parse(req.body);
    const username = body.username.toLowerCase();
    const existed = await colArtists.findOne({ username });
    if (existed) return res.status(409).json({ error: 'Username already taken' });

    const hash = bcrypt.hashSync(body.password, 10);
    const artistDoc = {
      username,
      password: hash,
      name: body.name,
      about: body.about || '',
      slug: slugify(body.name),
      bannerUrl: null,
      avatarUrl: null,
      createdAt: new Date(),
    };
    const r = await colArtists.insertOne(artistDoc);
    const aid = r.insertedId;

    const access = signAccess({ _id: aid }, 'artist');
    const refreshRaw = generateRefresh();
    const refreshHash = hashToken(refreshRaw);
    const refreshFp = fpToken(refreshRaw);
    await colSessions.insertOne({
      uid: aid,
      refreshHash,
      refreshFp,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + CFG.REFRESH_TTL_SEC * 1000),
      userType: 'artist',
      device: { ip: ipOf(req), locale: primaryLocale(req) },
    });

    res.json({
      accessToken: access,
      refreshToken: refreshRaw,
      artist: { _id: aid, username, name: body.name, role: 'artist' },
    });
  } catch (e) {
    LOG.warn({ e }, '[artist/register] failed');
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues });
    res.status(500).json({ error: 'Register failed' });
  }
});

app.post('/api/artists/auth/login', async (req, res) => {
  try {
    const body = ArtistLoginSchema.parse(req.body);
    const username = body.username.toLowerCase();
    const artist = await colArtists.findOne({ username });
    if (!artist) return res.status(401).json({ error: 'Wrong username or password' });
    if (!bcrypt.compareSync(body.password, artist.password))
      return res.status(401).json({ error: 'Wrong username or password' });

    const refreshRaw = generateRefresh();
    const refreshHash = hashToken(refreshRaw);
    const refreshFp = fpToken(refreshRaw);
    await colSessions.updateOne(
      { uid: artist._id },
      {
        $set: {
          refreshHash,
          refreshFp,
          disabled: false,
          updatedAt: new Date(),
          expiresAt: new Date(Date.now() + CFG.REFRESH_TTL_SEC * 1000),
          userType: 'artist',
          device: { ip: ipOf(req), locale: primaryLocale(req) },
        },
        $setOnInsert: { uid: artist._id, createdAt: new Date() },
      },
      { upsert: true }
    );

    const access = signAccess(artist, 'artist');
    res.json({
      accessToken: access,
      refreshToken: refreshRaw,
      artist: { _id: artist._id, username: artist.username, name: artist.name, role: 'artist' },
    });
  } catch (e) {
    LOG.warn({ e }, '[artist/login] failed');
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues });
    res.status(500).json({ error: 'Login failed' });
  }
});

// --- Me
app.get('/api/me', requireAuth(), async (req, res) => {
  const user = req.user;
  const lists = await colPlaylists.find({ userId: user._id }).project({ tracks: 0 }).toArray();
  res.json({ user, playlists: lists });
});

// --- Home sections
app.get('/api/home', async (req, res) => {
  try {
    const latest = await colTracks.find().sort({ createdAt: -1 }).limit(20).toArray();
    const hiphop = await colTracks.find({ genres: 'hip-hop' }).sort({ createdAt: -1 }).limit(20).toArray();
    const pop = await colTracks.find({ genres: 'pop' }).sort({ createdAt: -1 }).limit(20).toArray();
    const trending = await colTracks.find().sort({ plays: -1, createdAt: -1 }).limit(20).toArray();
    res.json({ sections: [
      { id: 'new', title: 'New Releases', items: latest },
      { id: 'hiphop', title: 'Hip-Hop', items: hiphop },
      { id: 'pop', title: 'Pop', items: pop },
      { id: 'trending', title: 'Trending', items: trending },
    ]});
  } catch (e) { LOG.error({ e }, 'home failed'); res.status(500).json({ error: 'home failed' }); }
});

// --- Enhanced Search
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const genre = req.query.genre ? req.query.genre.toString().trim() : undefined;
    const artistId = req.query.artistId ? req.query.artistId.toString().trim() : undefined;
    
    if (!q && !genre && !artistId) {
      return res.json({ tracks: [], artists: [], albums: [] });
    }

    let tracksQuery = {};
    let artistsQuery = {};
    let albumsQuery = {};

    if (q) {
      tracksQuery.$text = { $search: q };
      artistsQuery.$text = { $search: q };
      albumsQuery.$text = { $search: q };
    }

    if (genre) {
      tracksQuery.genres = genre;
    }

    if (artistId) {
      tracksQuery.artistIds = new ObjectId(artistId);
      albumsQuery.artistId = new ObjectId(artistId);
    }

    const tracksPromise = q 
      ? colTracks.find(tracksQuery, { projection: { score: { $meta: 'textScore' } } })
          .sort({ score: { $meta: 'textScore' }, plays: -1 }).limit(30).toArray()
      : colTracks.find(tracksQuery).sort({ plays: -1, createdAt: -1 }).limit(30).toArray();

    const artistsPromise = q && !artistId
      ? colArtists.find(artistsQuery, { projection: { score: { $meta: 'textScore' }, password: 0 } })
          .sort({ score: { $meta: 'textScore' } }).limit(20).toArray()
      : Promise.resolve([]);

    const albumsPromise = colAlbums.find(albumsQuery)
      .sort({ releaseDate: -1 }).limit(20).toArray();

    const [tracks, artists, albums] = await Promise.all([tracksPromise, artistsPromise, albumsPromise]);
    
    res.json({ tracks, artists, albums });
  } catch (e) {
    LOG.error({ e }, 'search failed');
    res.status(500).json({ error: 'search failed' });
  }
});

// --- Artist Profile (Public)
app.get('/api/artists/:id/profile', async (req, res) => {
  try {
    const id = new ObjectId(req.params.id);
    const artist = await colArtists.findOne({ _id: id }, { projection: { password: 0 } });
    if (!artist) return res.status(404).json({ error: 'Artist not found' });
    
    const tracks = await colTracks.find({ artistIds: id }).sort({ createdAt: -1 }).toArray();
    const albums = await colAlbums.find({ artistId: id }).sort({ releaseDate: -1 }).toArray();
    
    // Populate album tracks
    for (const album of albums) {
      if (album.tracks && album.tracks.length > 0) {
        album.trackList = await colTracks.find({ _id: { $in: album.tracks } }).toArray();
      } else {
        album.trackList = [];
      }
    }

    res.json({ artist, tracks, albums });
  } catch (e) {
    LOG.error({ e }, 'artist profile failed');
    res.status(400).json({ error: 'Invalid id' });
  }
});

// Legacy endpoint for compatibility
app.get('/api/artists/:id', async (req, res) => {
  try {
    const id = new ObjectId(req.params.id);
    const art = await colArtists.findOne({ _id: id }, { projection: { password: 0 } });
    if (!art) return res.status(404).json({ error: 'Artist not found' });
    const tracks = await colTracks.find({ artistIds: id }).sort({ createdAt: -1 }).toArray();
    res.json({ artist: art, tracks });
  } catch (e) {
    res.status(400).json({ error: 'Invalid id' });
  }
});

// --- Artist Management (Authenticated)
app.get('/api/artists/me/profile', requireArtist(), async (req, res) => {
  const tracks = await colTracks.find({ artistIds: req.artist._id }).sort({ createdAt: -1 }).toArray();
  const albums = await colAlbums.find({ artistId: req.artist._id }).sort({ releaseDate: -1 }).toArray();
  res.json({ artist: req.artist, tracks, albums });
});

app.put('/api/artists/me/profile', requireArtist(), async (req, res) => {
  try {
    const { name, about, bannerUrl, avatarUrl } = req.body;
    const update = {};
    if (name) update.name = name;
    if (about !== undefined) update.about = about;
    if (bannerUrl !== undefined) update.bannerUrl = bannerUrl;
    if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;
    
    await colArtists.updateOne({ _id: req.artist._id }, { $set: update });
    const updated = await colArtists.findOne({ _id: req.artist._id }, { projection: { password: 0 } });
    res.json({ artist: updated });
  } catch (e) {
    LOG.error({ e }, 'profile update failed');
    res.status(500).json({ error: 'Update failed' });
  }
});

// --- Artist Tracks Management
app.post('/api/artists/me/tracks', requireArtist(), async (req, res) => {
  try {
    const body = TrackCreateSchema.parse(req.body);
    const trackDoc = {
      title: body.title,
      artistIds: [req.artist._id],
      artistNames: [req.artist.name],
      genres: body.genres || [],
      fileRel: body.fileRel,
      durationSec: body.durationSec || null,
      albumId: body.albumId ? new ObjectId(body.albumId) : null,
      createdAt: new Date(),
      plays: 0,
    };
    const r = await colTracks.insertOne(trackDoc);
    
    // Add to album if specified
    if (body.albumId) {
      await colAlbums.updateOne(
        { _id: new ObjectId(body.albumId), artistId: req.artist._id },
        { $addToSet: { tracks: r.insertedId } }
      );
    }
    
    res.json({ _id: r.insertedId, ...trackDoc });
  } catch (e) {
    LOG.error({ e }, 'track create failed');
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues });
    res.status(500).json({ error: 'Create failed' });
  }
});

app.put('/api/artists/me/tracks/:id', requireArtist(), async (req, res) => {
  try {
    const tid = new ObjectId(req.params.id);
    const track = await colTracks.findOne({ _id: tid, artistIds: req.artist._id });
    if (!track) return res.status(404).json({ error: 'Track not found' });
    
    const { title, genres, albumId } = req.body;
    const update = {};
    if (title) update.title = title;
    if (genres) update.genres = genres;
    if (albumId !== undefined) update.albumId = albumId ? new ObjectId(albumId) : null;
    
    await colTracks.updateOne({ _id: tid }, { $set: update });
    const updated = await colTracks.findOne({ _id: tid });
    res.json({ track: updated });
  } catch (e) {
    res.status(400).json({ error: 'Invalid id' });
  }
});

app.delete('/api/artists/me/tracks/:id', requireArtist(), async (req, res) => {
  try {
    const tid = new ObjectId(req.params.id);
    const track = await colTracks.findOne({ _id: tid, artistIds: req.artist._id });
    if (!track) return res.status(404).json({ error: 'Track not found' });
    
    await colTracks.deleteOne({ _id: tid });
    // Remove from albums
    await colAlbums.updateMany({ artistId: req.artist._id }, { $pull: { tracks: tid } });
    // Remove from playlists
    await colPlaylists.updateMany({}, { $pull: { tracks: tid } });
    
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Invalid id' });
  }
});

// --- Artist Albums Management
app.post('/api/artists/me/albums', requireArtist(), async (req, res) => {
  try {
    const body = AlbumCreateSchema.parse(req.body);
    const albumDoc = {
      artistId: req.artist._id,
      artistName: req.artist.name,
      title: body.title,
      releaseDate: body.releaseDate || new Date().toISOString(),
      coverUrl: body.coverUrl || null,
      tracks: [],
      createdAt: new Date(),
    };
    const r = await colAlbums.insertOne(albumDoc);
    res.json({ _id: r.insertedId, ...albumDoc });
  } catch (e) {
    LOG.error({ e }, 'album create failed');
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues });
    res.status(500).json({ error: 'Create failed' });
  }
});

app.put('/api/artists/me/albums/:id', requireArtist(), async (req, res) => {
  try {
    const aid = new ObjectId(req.params.id);
    const album = await colAlbums.findOne({ _id: aid, artistId: req.artist._id });
    if (!album) return res.status(404).json({ error: 'Album not found' });
    
    const { title, releaseDate, coverUrl } = req.body;
    const update = {};
    if (title) update.title = title;
    if (releaseDate) update.releaseDate = releaseDate;
    if (coverUrl !== undefined) update.coverUrl = coverUrl;
    
    await colAlbums.updateOne({ _id: aid }, { $set: update });
    const updated = await colAlbums.findOne({ _id: aid });
    res.json({ album: updated });
  } catch (e) {
    res.status(400).json({ error: 'Invalid id' });
  }
});

app.delete('/api/artists/me/albums/:id', requireArtist(), async (req, res) => {
  try {
    const aid = new ObjectId(req.params.id);
    const album = await colAlbums.findOne({ _id: aid, artistId: req.artist._id });
    if (!album) return res.status(404).json({ error: 'Album not found' });
    
    // Remove album reference from tracks
    await colTracks.updateMany({ albumId: aid }, { $set: { albumId: null } });
    await colAlbums.deleteOne({ _id: aid });
    
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Invalid id' });
  }
});

app.get('/api/albums/:id', async (req, res) => {
  try {
    const aid = new ObjectId(req.params.id);
    const album = await colAlbums.findOne({ _id: aid });
    if (!album) return res.status(404).json({ error: 'Album not found' });
    
    const tracks = album.tracks && album.tracks.length > 0
      ? await colTracks.find({ _id: { $in: album.tracks } }).toArray()
      : [];
    
    res.json({ album, tracks });
  } catch (e) {
    res.status(400).json({ error: 'Invalid id' });
  }
});

// --- Library / Playlists
app.get('/api/playlists', requireAuth(), async (req, res) => {
  const lists = await colPlaylists.find({ userId: req.user._id }).toArray();
  res.json({ playlists: lists });
});

app.post('/api/playlists', requireAuth(), async (req, res) => {
  try {
    const body = PlaylistCreateSchema.parse(req.body);
    if (body.name.toLowerCase() === 'favorites') return res.status(400).json({ error: 'Reserved playlist name' });
    const doc = { userId: req.user._id, name: body.name, slug: nanoid(), isSystem: false, createdAt: new Date(), tracks: [] };
    const r = await colPlaylists.insertOne(doc);
    res.json({ _id: r.insertedId, ...doc });
  } catch (e) { if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues }); res.status(500).json({ error: 'Create playlist failed' }); }
});

app.post('/api/playlists/:id/tracks', requireAuth(), async (req, res) => {
  try {
    const pid = new ObjectId(req.params.id);
    const { trackId } = PlaylistTracksSchema.parse(req.body);
    const tid = new ObjectId(trackId);
    const pl = await colPlaylists.findOne({ _id: pid, userId: req.user._id });
    if (!pl) return res.status(404).json({ error: 'Playlist not found' });
    await colPlaylists.updateOne({ _id: pid }, { $addToSet: { tracks: tid } });
    res.json({ ok: true });
  } catch (e) { if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues }); res.status(400).json({ error: 'Invalid id' }); }
});

app.delete('/api/playlists/:id/tracks/:trackId', requireAuth(), async (req, res) => {
  try {
    const pid = new ObjectId(req.params.id);
    const tid = new ObjectId(req.params.trackId);
    const pl = await colPlaylists.findOne({ _id: pid, userId: req.user._id });
    if (!pl) return res.status(404).json({ error: 'Playlist not found' });
    await colPlaylists.updateOne({ _id: pid }, { $pull: { tracks: tid } });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: 'Invalid id' }); }
});

// --- Likes (Enhanced)
app.post('/api/tracks/:id/like', requireAuth(), async (req, res) => {
  try {
    const tid = new ObjectId(req.params.id);
    const track = await colTracks.findOne({ _id: tid });
    if (!track) return res.status(404).json({ error: 'Track not found' });
    
    // Add to favorites playlist
    let fav = await colPlaylists.findOne({ userId: req.user._id, slug: 'favorites' });
    if (!fav) {
      const r = await colPlaylists.insertOne({
        userId: req.user._id,
        name: 'Favorites',
        slug: 'favorites',
        isSystem: true,
        createdAt: new Date(),
        tracks: [],
      });
      fav = await colPlaylists.findOne({ _id: r.insertedId });
    }
    await colPlaylists.updateOne({ _id: fav._id }, { $addToSet: { tracks: tid } });
    
    // Track like
    await colLikes.updateOne(
      { userId: req.user._id, trackId: tid },
      { $set: { userId: req.user._id, trackId: tid, createdAt: new Date() } },
      { upsert: true }
    );
    
    res.json({ ok: true, liked: true });
  } catch (e) {
    LOG.error({ e }, 'like failed');
    res.status(400).json({ error: 'Invalid id' });
  }
});

app.delete('/api/tracks/:id/like', requireAuth(), async (req, res) => {
  try {
    const tid = new ObjectId(req.params.id);
    const fav = await colPlaylists.findOne({ userId: req.user._id, slug: 'favorites' });
    if (fav) {
      await colPlaylists.updateOne({ _id: fav._id }, { $pull: { tracks: tid } });
    }
    await colLikes.deleteOne({ userId: req.user._id, trackId: tid });
    res.json({ ok: true, liked: false });
  } catch (e) {
    res.status(400).json({ error: 'Invalid id' });
  }
});

app.get('/api/tracks/:id/liked', requireAuth(), async (req, res) => {
  try {
    const tid = new ObjectId(req.params.id);
    const like = await colLikes.findOne({ userId: req.user._id, trackId: tid });
    res.json({ liked: !!like });
  } catch (e) {
    res.status(400).json({ error: 'Invalid id' });
  }
});

// --- Devices & Player Sync
app.post('/api/devices/heartbeat', requireAuth(), async (req, res) => {
  try {
    const body = DeviceHeartbeatSchema.parse(req.body);
    const doc = { uid: req.user._id, deviceId: body.deviceId, name: body.name || body.deviceId, app: body.app || 'unknown', platform: body.platform || 'unknown', capabilities: { playback: !!(body.capabilities?.playback) }, ip: ipOf(req), lastSeenAt: new Date(), createdAt: new Date() };
    await colDevices.updateOne({ uid: req.user._id, deviceId: body.deviceId }, { $set: doc, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
    res.json({ ok: true });
  } catch (e) { if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues }); res.status(500).json({ error: 'heartbeat failed' }); }
});

app.get('/api/devices', requireAuth(), async (req, res) => {
  const list = await colDevices.find({ uid: req.user._id }).sort({ lastSeenAt: -1 }).limit(50).toArray();
  res.json({ devices: list });
});

app.get('/api/player/state', requireAuth(), async (req, res) => {
  const st = await colStates.findOne({ uid: req.user._id }) || { uid: req.user._id, isPlaying: false, positionMs: 0, queue: [], currentIndex: 0 };
  res.json({ state: st });
});

app.post('/api/player/state', requireAuth(), async (req, res) => {
  try {
    const body = PlayerStateUpdateSchema.parse(req.body);
    const patch = { updatedAt: new Date(), updatedBy: body.deviceId };
    if (body.trackId) patch.trackId = new ObjectId(body.trackId);
    if (typeof body.positionMs === 'number') patch.positionMs = body.positionMs;
    if (typeof body.isPlaying === 'boolean') patch.isPlaying = body.isPlaying;
    if (Array.isArray(body.queue)) patch.queue = body.queue.map(id => new ObjectId(id));
    if (typeof body.currentIndex === 'number') patch.currentIndex = body.currentIndex;
    await colStates.updateOne({ uid: req.user._id }, { $set: patch, $setOnInsert: { uid: req.user._id, createdAt: new Date() } }, { upsert: true });

    // broadcast to this user's sockets
    broadcastToUser(req.user._id.toString(), { type: 'player_state', state: { ...patch, trackId: patch.trackId?.toString?.() } });
    res.json({ ok: true });
  } catch (e) { if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues }); res.status(500).json({ error: 'state update failed' }); }
});

app.post('/api/player/activate', requireAuth(), async (req, res) => {
  try {
    const { deviceId } = PlayerActivateSchema.parse(req.body);
    await colStates.updateOne({ uid: req.user._id }, { $set: { activeDeviceId: deviceId, updatedAt: new Date() }, $setOnInsert: { uid: req.user._id, createdAt: new Date() } }, { upsert: true });
    broadcastToUser(req.user._id.toString(), { type: 'active_device', deviceId });
    res.json({ ok: true });
  } catch (e) { if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues }); res.status(500).json({ error: 'activate failed' }); }
});

app.post('/api/player/control', requireAuth(), async (req, res) => {
  try {
    const { cmd, args } = PlayerControlSchema.parse(req.body);
    const st = await colStates.findOne({ uid: req.user._id });
    const to = st?.activeDeviceId;
    if (!to) return res.status(400).json({ error: 'No active device' });
    broadcastToUser(req.user._id.toString(), { type: 'control', to, cmd, args, from: 'api' });
    res.json({ ok: true });
  } catch (e) { if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues }); res.status(500).json({ error: 'control failed' }); }
});

// --- Streaming (Range support)
app.get('/api/tracks/:id/stream', async (req, res) => {
  try {
    const tid = new ObjectId(req.params.id);
    const track = await colTracks.findOne({ _id: tid });
    if (!track) return res.status(404).end();

    const fileRel = track.fileRel;
    const fileAbs = path.resolve(CFG.STORE_DIR, fileRel);
    const stat = fs.statSync(fileAbs);
    const total = stat.size;
    const ctype = safeContentTypeByExt(fileAbs);

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', ctype);
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

    const range = req.headers.range;
    if (!range) {
      res.setHeader('Content-Length', total);
      fs.createReadStream(fileAbs).pipe(res);
    } else {
      const m = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!m) return res.status(416).end();
      const start = parseInt(m[1], 10);
      const end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : Math.min(start + 1024 * 1024 - 1, total - 1);
      if (start >= total || end >= total) return res.status(416).end();
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', end - start + 1);
      fs.createReadStream(fileAbs, { start, end }).pipe(res);
    }

    colTracks.updateOne({ _id: tid }, { $inc: { plays: 1 }, $set: { lastPlayedAt: new Date() } }).catch(() => {});
  } catch (e) { LOG.warn({ e }, 'stream failed'); res.status(400).end(); }
});

// --- Fallback 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ===========================
// WebSocket (WSS)
// ===========================
let wss;
const WS_CLIENTS = new Map();

function broadcastRaw(predicate, msgObj) {
  const data = JSON.stringify(msgObj);
  for (const [id, meta] of WS_CLIENTS.entries()) {
    if (predicate(meta)) {
      try { if (meta.ws.readyState === meta.ws.OPEN) meta.ws.send(data); } catch (_) {}
    }
  }
}
function broadcastToUser(uidStr, msgObj) { broadcastRaw(m => m.uid?.toString() === uidStr, msgObj); }

async function authenticateAccessToken(tok) {
  try {
    const p = jwt.verify(tok, CFG.JWT_SECRET);
    const uid = new ObjectId(p.uid);
    let user = await colUsers.findOne({ _id: uid });
    if (!user) user = await colArtists.findOne({ _id: uid });
    if (!user) return null;
    return user;
  } catch (_) { return null; }
}

function handleWSConnection(ws, req) {
  const id = nanoid();
  WS_CLIENTS.set(id, { ws });
  const ip = ipOf(req);

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'hello') {
        let user = null;
        if (msg.accessToken) user = await authenticateAccessToken(msg.accessToken);
        WS_CLIENTS.get(id).app = msg.app || 'unknown';
        WS_CLIENTS.get(id).deviceId = msg.deviceId || id;
        if (user) {
          WS_CLIENTS.get(id).uid = user._id;
          await colDevices.updateOne(
            { uid: user._id, deviceId: WS_CLIENTS.get(id).deviceId },
            { $set: { uid: user._id, deviceId: WS_CLIENTS.get(id).deviceId, name: msg.name || msg.deviceId || id, app: msg.app || 'unknown', platform: msg.platform || 'unknown', ip, lastSeenAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
          );
        }
        ws.send(JSON.stringify({ type: 'hello_ack', id, server: 'wfly-music', ts: Date.now(), authed: !!user }));
      }
      else if (msg.type === 'now_playing') {
        const meta = WS_CLIENTS.get(id);
        const uid = meta?.uid; if (!uid) return;
        const patch = { updatedAt: new Date(), updatedBy: msg.deviceId || meta.deviceId };
        if (msg.trackId) patch.trackId = new ObjectId(msg.trackId);
        if (typeof msg.positionMs === 'number') patch.positionMs = msg.positionMs;
        if (typeof msg.isPlaying === 'boolean') patch.isPlaying = msg.isPlaying;
        await colStates.updateOne({ uid }, { $set: patch, $setOnInsert: { uid, createdAt: new Date() } }, { upsert: true });
        broadcastToUser(uid.toString(), { type: 'player_state', state: { ...patch, trackId: msg.trackId } });
      }
      else if (msg.type === 'control') {
        const meta = WS_CLIENTS.get(id); const uid = meta?.uid; if (!uid) return;
        const to = msg.to || (await colStates.findOne({ uid }))?.activeDeviceId;
        broadcastRaw(m => m.uid?.toString() === uid.toString() && m.deviceId === to, { type: 'control', cmd: msg.cmd, args: msg.args, from: meta.deviceId });
      }
      else if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong', t: Date.now() })); }
    } catch (_) {}
  });

  ws.on('close', () => { WS_CLIENTS.delete(id); });

  ws.send(JSON.stringify({ type: 'welcome', id, ip, ts: Date.now() }));
}

// ===========================
// CLI Panel
// ===========================
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(q) { return new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim()))); }

async function cliMenu() {
  LOG.info('[CLI] Commands:\n' +
    ' 1) Create artist (with login credentials)\n' +
    ' 2) Add track to artist\n' +
    ' 3) Import folder\n' +
    ' 4) Create admin user\n' +
    ' 5) List artists & counts\n' +
    ' 6) Quit CLI\n'
  );
  while (true) {
    const choice = await ask('> ');
    try {
      if (choice === '1') await cliCreateArtist();
      else if (choice === '2') await cliAddTrack();
      else if (choice === '3') await cliImportFolder();
      else if (choice === '4') await cliCreateAdmin();
      else if (choice === '5') await cliListCounts();
      else if (choice === '6') { LOG.info('[CLI] Bye'); break; }
      else LOG.info('Unknown option');
    } catch (e) { LOG.error({ e }, '[CLI] error'); }
  }
}

async function cliCreateArtist() {
  const name = await ask('Artist name: ');
  const username = await ask('Username (for login): ');
  const password = await ask('Password (>=8 chars): ');
  const about = await ask('About (optional): ');
  if (!name) return LOG.warn('Name required');
  if (!username) return LOG.warn('Username required');
  if (!password || password.length < 8) return LOG.warn('Password must be at least 8 characters');
  
  const usernameLC = username.toLowerCase();
  const existed = await colArtists.findOne({ username: usernameLC });
  if (existed) return LOG.warn('Username already exists');
  
  const hash = bcrypt.hashSync(password, 10);
  const doc = {
    username: usernameLC,
    password: hash,
    name,
    about: about || '',
    slug: slugify(name),
    bannerUrl: null,
    avatarUrl: null,
    createdAt: new Date(),
  };
  await colArtists.insertOne(doc);
  LOG.info(`Artist created: ${name} (username: ${usernameLC})`);
}

async function cliAddTrack() {
  const artistName = await ask('Artist name (exact or empty to list): ');
  let artist;
  if (!artistName) {
    const arr = await colArtists.find().limit(20).toArray();
    LOG.info('Artists:'); arr.forEach(a => LOG.info(`- ${a._id} :: ${a.name}`));
    const id = await ask('Pick artist by _id: ');
    artist = await colArtists.findOne({ _id: new ObjectId(id) });
  } else {
    artist = await colArtists.findOne({ name: artistName });
  }
  if (!artist) return LOG.warn('Artist not found');

  const title = await ask('Track title: ');
  const genres = (await ask('Genres (comma, e.g. hip-hop,pop): ')).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const file = await ask(`Audio file under STORE_DIR (${CFG.STORE_DIR}) (absolute or relative): `);
  const abs = path.isAbsolute(file) ? file : path.resolve(CFG.STORE_DIR, file);
  if (!fs.existsSync(abs)) return LOG.warn('File not found');
  const rel = assertRelativeToStore(abs);
  const durationSec = Number(await ask('Duration (seconds, optional): ')) || null;

  const doc = { title, artistIds: [artist._id], artistNames: [artist.name], genres, fileRel: rel, durationSec, albumId: null, createdAt: new Date(), plays: 0 };
  await colTracks.insertOne(doc);
  LOG.info(`Track added: ${artist.name} — ${title} (${rel})`);
}

async function cliImportFolder() {
  const artistName = await ask('Artist name for import: ');
  const artist = await colArtists.findOne({ name: artistName });
  if (!artist) return LOG.warn('Artist not found');

  const dir = await ask(`Folder under STORE_DIR (${CFG.STORE_DIR}) (absolute or relative): `);
  const absBase = path.isAbsolute(dir) ? dir : path.resolve(CFG.STORE_DIR, dir);
  if (!fs.existsSync(absBase)) return LOG.warn('Folder not found');

  const files = fs.readdirSync(absBase).filter(f => /\.(mp3|m4a|mp4|aac|ogg|oga|flac|wav)$/i.test(f));
  if (!files.length) return LOG.warn('No audio files');
  const genre = (await ask('Default genre (e.g. hip-hop): ')).trim().toLowerCase() || null;

  for (const f of files) {
    const abs = path.resolve(absBase, f);
    const rel = assertRelativeToStore(abs);
    const title = path.basename(f).replace(/\.[^.]+$/, '');
    const doc = { title, artistIds: [artist._id], artistNames: [artist.name], genres: genre ? [genre] : [], fileRel: rel, durationSec: null, albumId: null, createdAt: new Date(), plays: 0 };
    await colTracks.insertOne(doc);
    LOG.info(`Imported: ${title}`);
  }
  LOG.info('Import done.');
}

async function cliCreateAdmin() {
  const email = (await ask('Admin email: ')).toLowerCase();
  const displayName = await ask('Display name: ');
  const pwd = await ask('Password (>=8): ');
  if (pwd.length < 8) return LOG.warn('Too short');
  const existed = await colUsers.findOne({ email });
  if (existed) return LOG.warn('User exists');
  const hash = bcrypt.hashSync(pwd, 10);
  const r = await colUsers.insertOne({ email, displayName, password: hash, role: 'admin', createdAt: new Date(), devices: [] });
  await colPlaylists.insertOne({ userId: r.insertedId, name: 'Favorites', slug: 'favorites', isSystem: true, createdAt: new Date(), tracks: [] });
  LOG.info('Admin created');
}

async function cliListCounts() {
  const [a, t, u, alb] = await Promise.all([
    colArtists.countDocuments(),
    colTracks.countDocuments(),
    colUsers.countDocuments(),
    colAlbums.countDocuments()
  ]);
  LOG.info(`Artists: ${a}, Tracks: ${t}, Albums: ${alb}, Users: ${u}`);
}

function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || nanoid(); }

// ===========================
// Server bootstrap
// ===========================
async function createIndexes() {
  await colUsers.createIndex({ email: 1 }, { unique: true });

  // artists: text search + username uniqueness
  try { await colArtists.dropIndex('artist_text'); } catch {}
  await colArtists.createIndex({ name: 'text', about: 'text' }, { name: 'artist_text' });
  await colArtists.createIndex({ username: 1 }, { unique: true });
  await colArtists.createIndex({ slug: 1 });

  // tracks: text search + various filters
  try { await colTracks.dropIndex('track_text'); } catch {}
  await colTracks.createIndex({ title: 'text', artistNames: 'text' }, { name: 'track_text' });
  await colTracks.createIndex({ createdAt: -1 });
  await colTracks.createIndex({ plays: -1 });
  await colTracks.createIndex({ genres: 1 });
  await colTracks.createIndex({ artistIds: 1 });
  await colTracks.createIndex({ albumId: 1 });

  // albums: text search
  try { await colAlbums.dropIndex('album_text'); } catch {}
  await colAlbums.createIndex({ title: 'text', artistName: 'text' }, { name: 'album_text' });
  await colAlbums.createIndex({ artistId: 1 });
  await colAlbums.createIndex({ releaseDate: -1 });

  await colPlaylists.createIndex({ userId: 1, slug: 1 });
  await colSessions.createIndex({ uid: 1 });
  await colSessions.createIndex({ refreshFp: 1 });

  await colLikes.createIndex({ userId: 1, trackId: 1 }, { unique: true });
  await colLikes.createIndex({ trackId: 1 });

  await colDevices.createIndex({ uid: 1, deviceId: 1 }, { unique: true });
  await colDevices.createIndex({ lastSeenAt: -1 });
  await colStates.createIndex({ uid: 1 }, { unique: true });
}

async function main() {
  try {
    await client.connect();
    db = client.db();
    colUsers = db.collection('users');
    colArtists = db.collection('artists');
    colTracks = db.collection('tracks');
    colAlbums = db.collection('albums');
    colPlaylists = db.collection('playlists');
    colSessions = db.collection('sessions');
    colEvents = db.collection('events');
    colDevices = db.collection('devices');
    colStates = db.collection('player_states');
    colLikes = db.collection('likes');

    await createIndexes();
    LOG.info('[DB] Connected and indexes ensured');

    // HTTP(S) server
    let server;
    if (CFG.TLS_ENABLED) {
      const creds = { cert: fs.readFileSync(CFG.TLS_CERT), key: fs.readFileSync(CFG.TLS_KEY), minVersion: 'TLSv1.2' };
      server = https.createServer(creds, app);
      LOG.info('[HTTP] HTTPS enabled (WSS)');
    } else {
      server = http.createServer(app);
      LOG.warn('[HTTP] TLS_DISABLED. Use Nginx TLS termination if exposing to Internet.');
    }

    // WSS
    wss = new WebSocketServer({ server, path: '/ws' });
    wss.on('connection', handleWSConnection);

    server.listen(CFG.PORT, CFG.HOST, () => {
      LOG.info(`[HTTP] listening on ${CFG.TLS_ENABLED ? 'https' : 'http'}://${CFG.HOST}:${CFG.PORT} (wss path=/ws)`);
      LOG.info(`[WFLY] Public URL: ${CFG.PUBLIC_URL}`);
      LOG.info(`[STORE] Audio base: ${CFG.STORE_DIR}`);
      LOG.info(`[UPLOADS] Uploads: ${CFG.UPLOADS_DIR}`);
    });

    // start CLI (non-blocking)
    cliMenu().catch(() => {});

    // graceful
    const shutdown = async () => {
      LOG.info('Shutting down...');
      try { await client.close(); } catch {}
      try { wss?.close(); } catch {}
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (e) { LOG.error({ e }, 'Fatal bootstrap error'); process.exit(1); }
}

main();
