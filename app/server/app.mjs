import express from 'express';
import multer from 'multer';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './database.mjs';
import { seed } from './seed.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const makeId = () => randomBytes(12).toString('hex');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const passwordMatches = (password, salt, storedHash) => {
  const expected = Buffer.from(String(storedHash || ''), 'hex');
  const actual = scryptSync(password, salt || 'missing-user', 64);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
};
const text = (value, max = 200, required = true) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw fail('Vui lòng kiểm tra nội dung và độ dài các trường.');
  return value.trim();
};
const email = value => { const clean = text(value, 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw fail('Địa chỉ email chưa hợp lệ.'); return clean; };
const profileId = value => { const clean = text(String(value || '').startsWith('#') ? value : `#${value}`, 5); if (!/^#\d{4}$/.test(clean)) throw fail('ID cần có dạng #1234.'); return clean; };
const visibleTo = value => ['self', 'friends'].includes(value) ? value : 'friends';
const first = result => result.rows[0];
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const audioTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/mp4', 'audio/x-m4a'];
const chatFileTypes = [...imageTypes, ...audioTypes, 'application/pdf', 'text/plain'];
const mediaLimits = { audio: 50 * 1024 * 1024, cover: 8 * 1024 * 1024, image: 8 * 1024 * 1024 };

function extension(file, kind) {
  const bytes = file.buffer;
  if (kind === 'image' || kind === 'chat') {
    if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'jpg';
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
    if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  }
  if (kind !== 'image') {
    if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return 'wav';
    if (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224)) return 'mp3';
    if (bytes.toString('ascii', 0, 4) === 'OggS') return 'ogg';
    if (bytes.toString('ascii', 0, 4) === 'fLaC') return 'flac';
    if (bytes.toString('ascii', 4, 8) === 'ftyp') return 'm4a';
    if (kind === 'chat' && bytes.toString('ascii', 0, 4) === '%PDF') return 'pdf';
    if (kind === 'chat' && /^[\x09\x0a\x0d\x20-\x7e]*$/.test(bytes.toString('utf8', 0, Math.min(bytes.length, 2048)))) return 'txt';
  }
  throw fail(kind === 'image' ? 'Ảnh cần ở định dạng JPG, PNG hoặc WebP.' : 'File cần ở định dạng JPG, PNG, WebP, MP3, WAV, OGG, FLAC, M4A, PDF hoặc TXT.');
}

export async function createApp({ dataDir = process.env.DATA_DIR || path.join(appRoot, 'data'), seedData = true, seedDefaultAccounts = true, production = process.env.VERCEL === '1' } = {}) {
  const { db, mediaDir } = await createDatabase({ dataDir, production });
  if (!production && seedData) seed(db.native, mediaDir, { seedAccounts: seedDefaultAccounts });
  const app = express();
  const query = (statement, values = []) => db.query(statement, values);
  const row = async (statement, values = []) => first(await query(statement, values));
  const all = async (statement, values = []) => (await query(statement, values)).rows;

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' });
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      let allowed = false;
      try {
        const origin = new URL(req.headers.origin);
        const vercelPreview = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
        const isLoopback = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
        allowed = production
          ? [process.env.APP_ORIGIN, vercelPreview].filter(Boolean).includes(origin.origin) || origin.host === req.headers.host
          : origin.hostname === req.hostname || (isLoopback(origin.hostname) && isLoopback(req.hostname));
      } catch {}
      if (!allowed) return res.status(403).json({ error: 'Yêu cầu không hợp lệ.' });
    }
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  const tokenFrom = req => { const raw = (req.headers.cookie || '').split(';').find(value => value.trim().startsWith('melodik_session=')); return raw ? raw.trim().slice(16) : ''; };
  const session = req => row('SELECT token FROM sessions WHERE token=? AND expires>?', [digest(tokenFrom(req)), Date.now()]);
  const userTokenFrom = req => { const raw = (req.headers.cookie || '').split(';').find(value => value.trim().startsWith('melodik_user=')); return raw ? raw.trim().slice(13) : ''; };
  const userSession = req => row('SELECT users.id,users.name,users.email,users.publicId,users.avatar,users.bio,users.lastActiveAt FROM user_sessions JOIN users ON users.id=user_sessions.userId WHERE user_sessions.token=? AND user_sessions.expires>?', [digest(userTokenFrom(req)), Date.now()]);
  const auth = async (req, res, next) => { try { if (!await session(req)) return res.status(401).json({ error: 'Vui lòng đăng nhập quản trị.' }); next(); } catch (error) { next(error); } };
  const authUser = async (req, res, next) => { try { const user = await userSession(req); if (!user) return res.status(401).json({ error: 'Vui lòng đăng nhập để dùng Góc của bạn.' }); req.user = user; next(); } catch (error) { next(error); } };
  async function limit(key, max = 8) {
    if (!production) return;
    const now = Date.now(), prior = await row('SELECT count,until FROM rate_limits WHERE key=?', [key]);
    const count = !prior || Number(prior.until) < now ? 1 : Number(prior.count) + 1;
    const until = !prior || Number(prior.until) < now ? now + 600000 : Number(prior.until);
    await query('INSERT INTO rate_limits (key,count,until) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,until=excluded.until', [key, count, until]);
    if (count > max) throw fail('Bạn thử hơi nhiều lần. Vui lòng quay lại sau 10 phút.', 429);
  }
  const createSession = async res => {
    const token = randomBytes(32).toString('hex');
    await query('DELETE FROM sessions WHERE expires<?', [Date.now()]);
    await query('INSERT INTO sessions (token,expires) VALUES (?,?)', [digest(token), Date.now() + 86400000]);
    res.cookie('melodik_session', token, { httpOnly: true, sameSite: 'strict', secure: production || process.env.COOKIE_SECURE === 'true', maxAge: 86400000, path: '/' });
  };
  const createUserSession = async (res, userId) => {
    const token = randomBytes(32).toString('hex');
    await query('DELETE FROM user_sessions WHERE expires<?', [Date.now()]);
    await query("UPDATE users SET lastActiveAt=? WHERE id=? AND publicId != '#3107'", [new Date().toISOString(), userId]);
    await query('INSERT INTO user_sessions (token,userId,expires) VALUES (?,?,?)', [digest(token), userId, Date.now() + 86400000 * 30]);
    res.cookie('melodik_user', token, { httpOnly: true, sameSite: 'strict', secure: production || process.env.COOKIE_SECURE === 'true', maxAge: 86400000 * 30, path: '/' });
  };
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: mediaLimits.audio, files: 2, fields: 16, fieldSize: 10000 } });
  const saveLocalFile = (file, kind) => {
    if (kind === 'image' && file.size > mediaLimits.cover) throw fail('Ảnh tối đa 8 MB.');
    const filename = `${makeId()}.${extension(file, kind)}`;
    writeFileSync(path.join(mediaDir, filename), file.buffer, { flag: 'wx' });
    return `/media/${filename}`;
  };
  async function blobMedia(body, field, kind, previous) {
    const url = body[`${field}Url`], pathname = body[`${field}Pathname`];
    if (!url && previous) return previous;
    if (!url || !pathname || !pathname.startsWith(`melodik/${kind}/`)) throw fail(`Vui lòng tải ${kind === 'audio' ? 'file âm thanh' : 'ảnh'} lên trước.`);
    const { head } = await import('@vercel/blob');
    const blob = await head(url), allowed = kind === 'audio' ? audioTypes : kind === 'chat' ? chatFileTypes : imageTypes;
    const maxSize = kind === 'audio' || kind === 'chat' ? mediaLimits.audio : mediaLimits[kind];
    if (blob.pathname !== pathname || !allowed.includes(blob.contentType) || blob.size > maxSize) throw fail('File tải lên không hợp lệ.');
    return blob.url;
  }
  async function media(req, field, kind, previous) {
    if (production) return blobMedia(req.body, field, kind, previous);
    const file = field === 'audio' ? req.files?.audio?.[0] : field === 'cover' ? req.files?.cover?.[0] : req.file;
    return file ? saveLocalFile(file, kind === 'audio' || kind === 'chat' ? kind : 'image') : previous;
  }
  const friendIdsFor = async userId => (await all("SELECT CASE WHEN userId=? THEN friendId ELSE userId END AS id FROM friendships WHERE (userId=? OR friendId=?) AND status='accepted'", [userId, userId, userId])).map(item => item.id);

  app.get('/api/health', (_req, res) => res.json({ ok: true, storage: production ? 'blob' : 'local' }));
  app.get('/api/config', (_req, res) => res.json({ storage: production ? 'blob' : 'local', maxAudioBytes: mediaLimits.audio, maxImageBytes: mediaLimits.cover }));
  app.get('/api/catalog', async (req, res) => {
    const settings = Object.fromEntries((await all('SELECT key,value FROM site_settings')).map(item => [item.key, item.value]));
    const user = await userSession(req);
    const friendIds = user ? await friendIdsFor(user.id) : [];
    const friendFilter = friendIds.length ? `OR (visibility='friends' AND community_tracks.userId IN (${friendIds.map(() => '?').join(',')}))` : '';
    const photoFriendFilter = friendIds.length ? `OR (visibility='friends' AND community_photos.userId IN (${friendIds.map(() => '?').join(',')}))` : '';
    const communityTracks = user ? await all(`SELECT community_tracks.*,users.name AS owner,users.publicId AS ownerPublicId,users.avatar AS ownerAvatar,community_tracks.genre AS playlistId FROM community_tracks JOIN users ON users.id=community_tracks.userId WHERE community_tracks.userId=? ${friendFilter} ORDER BY community_tracks.createdAt DESC`, [user.id, ...friendIds]) : [];
    const communityPhotos = user ? await all(`SELECT community_photos.*,users.name AS owner,users.publicId AS ownerPublicId,users.avatar AS ownerAvatar FROM community_photos JOIN users ON users.id=community_photos.userId WHERE community_photos.userId=? ${photoFriendFilter} ORDER BY community_photos.date DESC`, [user.id, ...friendIds]) : [];
    res.json({ playlists: await all('SELECT * FROM playlists ORDER BY position,createdAt'), tracks: await all('SELECT * FROM tracks ORDER BY position,createdAt'), photos: await all('SELECT * FROM photos ORDER BY date DESC'), communityTracks, communityPhotos, settings });
  });
  app.get('/api/auth/me', async (req, res) => {
    const admin = await row('SELECT email,name,avatar FROM admin WHERE id=1');
    const authenticated = Boolean(await session(req));
    res.json({ authenticated, needsSetup: !admin, requiresSetupToken: production, ...(authenticated && admin ? { email: admin.email, name: admin.name || 'Quản trị viên', avatar: admin.avatar || '/artwork/sleeve.webp' } : {}) });
  });
  app.post('/api/auth/setup', async (req, res) => {
    if (await row('SELECT id FROM admin')) throw fail('Tài khoản quản trị đã được tạo.', 409);
    if (production) { const expected = process.env.ADMIN_BOOTSTRAP_TOKEN || ''; if (!expected || req.body.setupToken !== expected) throw fail('Mã thiết lập quản trị chưa đúng.', 403); }
    else if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw fail('Chỉ thiết lập quản trị từ máy chủ cục bộ.', 403);
    const mail = email(req.body.email), password = text(req.body.password, 128);
    if (password.length < 6) throw fail('Mật khẩu cần ít nhất 6 ký tự.');
    const salt = randomBytes(16).toString('hex');
    await query('INSERT INTO admin (id,email,name,passwordHash,salt) VALUES (1,?,?,?,?)', [mail, 'Quản trị viên', scryptSync(password, salt, 64).toString('hex'), salt]);
    await createSession(res); res.status(201).json({ ok: true });
  });
  app.post('/api/auth/login', async (req, res) => {
    await limit(`login:${req.ip}`);
    const mail = email(req.body.email), password = text(req.body.password, 128), admin = await row('SELECT * FROM admin WHERE email=?', [mail]);
    if (!admin || !passwordMatches(password, admin.salt, admin.passwordHash)) throw fail('Email hoặc mật khẩu chưa đúng.', 401);
    await createSession(res); res.json({ ok: true });
  });
  app.post('/api/auth/logout', async (req, res) => { await query('DELETE FROM sessions WHERE token=?', [digest(tokenFrom(req))]); res.clearCookie('melodik_session', { path: '/' }); res.json({ ok: true }); });
  async function updateAdminProfile(req, res) {
    const name = text(req.body.name, 80), mail = email(req.body.email);
    const admin = await row('SELECT avatar FROM admin WHERE id=1');
    const avatar = await media(req, 'avatar', 'image', admin?.avatar || '/artwork/sleeve.webp');
    await query('UPDATE admin SET name=?,email=?,avatar=? WHERE id=1', [name, mail, avatar]);
    res.json({ name, email: mail, avatar });
  }
  const adminProfileMiddleware = production ? updateAdminProfile : [upload.single('avatar'), updateAdminProfile];
  app.post('/api/auth/profile', auth, ...[].concat(adminProfileMiddleware));
  app.get('/api/users/me', async (req, res) => res.json({ user: await userSession(req) || null }));
  app.get('/api/users/settings', async (req, res) => {
    const user = await userSession(req);
    if (!user) return res.json({ settings: {} });
    const settings = Object.fromEntries((await all('SELECT key,value FROM user_settings WHERE userId=?', [user.id])).map(item => [item.key, item.value]));
    res.json({ settings });
  });
  async function registerUser(req, res) {
    const name = text(req.body.name, 80), mail = email(req.body.email), password = text(req.body.password, 128), userPublicId = profileId(req.body.publicId), bio = text(req.body.bio || '', 280, false);
    if (password.length < 6) throw fail('Mật khẩu cần ít nhất 6 ký tự.');
    if (await row('SELECT id FROM users WHERE email=?', [mail])) throw fail('Email này đã có tài khoản.', 409);
    if (await row('SELECT id FROM users WHERE publicId=?', [userPublicId])) throw fail('ID này đã có người dùng. Hãy chọn 4 số khác.', 409);
    const userId = makeId(), salt = randomBytes(16).toString('hex');
    const defaultAvatars = ['/artwork/coffee.webp', '/artwork/desk.webp', '/artwork/evening.webp', '/artwork/flowers.webp', '/artwork/forest.webp', '/artwork/night.webp', '/artwork/reading.webp', '/artwork/record.webp', '/artwork/sleeve.webp', '/artwork/tea.webp'];
    const randomAvatar = defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)];
    const avatar = await media(req, 'avatar', 'image', randomAvatar);
    const now = new Date().toISOString();
    await query('INSERT INTO users (id,name,email,publicId,avatar,bio,passwordHash,salt,lastActiveAt,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)', [userId, name, mail, userPublicId, avatar, bio, scryptSync(password, salt, 64).toString('hex'), salt, now, now]);
    await createUserSession(res, userId); res.status(201).json({ user: { id: userId, name, email: mail, publicId: userPublicId, avatar, bio } });
  }
  const registerMiddleware = production ? registerUser : [upload.single('avatar'), registerUser];
  app.post('/api/users/register', ...[].concat(registerMiddleware));
  app.post('/api/users/login', async (req, res) => {
    await limit(`user-login:${req.ip}`);
    const mail = email(req.body.email), password = text(req.body.password, 128), user = await row('SELECT * FROM users WHERE email=?', [mail]);
    if (!user || !passwordMatches(password, user.salt, user.passwordHash)) throw fail('Email hoặc mật khẩu chưa đúng.', 401);
    await createUserSession(res, user.id); res.json({ user: { id: user.id, name: user.name, email: user.email, publicId: user.publicId, avatar: user.avatar, bio: user.bio || '', lastActiveAt: user.publicId === '#3107' ? user.lastActiveAt : new Date().toISOString() } });
  });
  app.post('/api/users/heartbeat', authUser, async (req, res) => { const now = new Date().toISOString(); await query("UPDATE users SET lastActiveAt=? WHERE id=? AND publicId != '#3107'", [now, req.user.id]); res.json({ ok: true, lastActiveAt: req.user.publicId === '#3107' ? req.user.lastActiveAt : now }); });
  async function updateUserProfile(req, res) {
    const name = text(req.body.name, 80), userPublicId = profileId(req.body.publicId), bio = text(req.body.bio || '', 280, false);
    if (await row('SELECT id FROM users WHERE publicId=? AND id<>?', [userPublicId, req.user.id])) throw fail('ID này đã có người dùng. Hãy chọn 4 số khác.', 409);
    const avatar = await media(req, 'avatar', 'image', req.user.avatar || '/artwork/sleeve.webp');
    await query('UPDATE users SET name=?,publicId=?,avatar=?,bio=? WHERE id=?', [name, userPublicId, avatar, bio, req.user.id]);
    res.json({ user: { ...req.user, name, publicId: userPublicId, avatar, bio } });
  }
  const profileMiddleware = production ? updateUserProfile : [upload.single('avatar'), updateUserProfile];
  app.put('/api/users/profile', authUser, ...[].concat(profileMiddleware));
  app.post('/api/users/logout', async (req, res) => { await query('DELETE FROM user_sessions WHERE token=?', [digest(userTokenFrom(req))]); res.clearCookie('melodik_user', { path: '/' }); res.json({ ok: true }); });
  app.post('/api/messages', async (req, res) => { await limit(`message:${req.ip}`, 5); await query('INSERT INTO messages (id,name,email,message,createdAt) VALUES (?,?,?,?,?)', [makeId(), text(req.body.name, 80), email(req.body.email), text(req.body.message, 3000), new Date().toISOString()]); res.status(201).json({ ok: true }); });
  app.get('/api/admin/users', auth, async (_req, res) => {
  const results = await all(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.publicId,
      u.avatar,
      u.bio,
      u.lastActiveAt,
      u.createdAt,
      COALESCE(tc.count, 0) AS trackCount,
      COALESCE(pc.count, 0) AS photoCount,
      COALESCE(fc.count, 0) AS friendCount
    FROM users u
    LEFT JOIN (
      SELECT userId, COUNT(*) AS count
      FROM community_tracks
      GROUP BY userId
    ) tc ON u.id = tc.userId
    LEFT JOIN (
      SELECT userId, COUNT(*) AS count
      FROM community_photos
      GROUP BY userId
    ) pc ON u.id = pc.userId
    LEFT JOIN ( SELECT user_id AS userId, COUNT(*) AS count FROM ( SELECT userId AS user_id FROM friendships WHERE status = 'accepted' UNION ALL SELECT friendId AS user_id FROM friendships WHERE status = 'accepted' ) sub GROUP BY user_id ) fc ON u.id = fc.userId
    ORDER BY u.createdAt DESC
  `);
  res.json(results);
});
  app.get('/api/admin/users/:id/tracks', auth, async (req, res) => {
    const { id } = req.params;
    // Ensure the logged-in admin is requesting data for a valid user
    const userExists = await row('SELECT id FROM users WHERE id=?', [id]);
    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const tracks = await all('SELECT community_tracks.*,users.name AS owner,users.publicId AS ownerPublicId,users.avatar AS ownerAvatar FROM community_tracks JOIN users ON users.id=community_tracks.userId WHERE community_tracks.userId=? ORDER BY community_tracks.createdAt DESC', [id]);
    res.json(tracks);
  });
  app.get('/api/admin/users/:id/photos', auth, async (req, res) => {
    const { id } = req.params;
    const userExists = await row('SELECT id FROM users WHERE id=?', [id]);
    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const photos = await all('SELECT community_photos.*,users.name AS owner,users.publicId AS ownerPublicId,users.avatar AS ownerAvatar FROM community_photos JOIN users ON users.id=community_photos.userId WHERE community_photos.userId=? ORDER BY community_photos.date DESC', [id]);
    res.json(photos);
  });
  app.get('/api/admin/users/:id/friends', auth, async (req, res) => {
    const { id } = req.params;
    const userExists = await row('SELECT id FROM users WHERE id=?', [id]);
    if (!userExists) return res.status(404).json({ error: 'User not found' });
    const friends = await all(`
      SELECT u.id, u.name, u.email, u.publicId, u.avatar, f.createdAt
      FROM friendships f
      JOIN users u ON (u.id = f.friendId AND f.userId = ?) OR (u.id = f.userId AND f.friendId = ?)
      WHERE f.status = 'accepted'
      ORDER BY f.createdAt DESC
    `, [id, id]);
    res.json(friends);
  });
  app.delete('/api/admin/users/:id', auth, async (req, res) => {
    const { id } = req.params;
    await query('DELETE FROM user_sessions WHERE userId=?', [id]);
    await query('DELETE FROM user_settings WHERE userId=?', [id]);
    await query('DELETE FROM chat_reads WHERE userId=? OR friendId=?', [id, id]);
    await query('DELETE FROM chat_messages WHERE senderId=? OR recipientId=?', [id, id]);
    await query('DELETE FROM friendships WHERE userId=? OR friendId=?', [id, id]);
    await query('DELETE FROM community_tracks WHERE userId=?', [id]);
    await query('DELETE FROM community_photos WHERE userId=?', [id]);
    await query('DELETE FROM users WHERE id=?', [id]);
    res.json({ ok: true });
  });
  app.get('/api/admin/messages', auth, async (_req, res) => res.json(await all('SELECT * FROM messages ORDER BY createdAt DESC')));
app.post('/api/auth/password', auth, async (req, res) => {
  // Ensure the logged-in user is an admin
  const admin = await row('SELECT * FROM admin WHERE id=?', [1]); // Assuming admin ID is 1
  if (!admin) {
    return res.status(401).json({ error: 'Admin not found' });
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  // Verify current password
  if (!passwordMatches(currentPassword, admin.salt, admin.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  // Update password
  const salt = randomBytes(16).toString('hex');
  const passwordHash = scryptSync(newPassword, salt, 64).toString('hex');
  await query('UPDATE admin SET passwordHash=?, salt=? WHERE id=?', [passwordHash, salt, 1]);

  res.json({ ok: true });
});
  app.post('/api/admin/upload-token', async (req, res) => {
    if (!production) throw fail('Chức năng này chỉ dùng khi đã triển khai.', 404);
    if (req.body?.type === 'blob.generate-client-token' && !await session(req) && !await userSession(req)) {
      let payload; try { payload = JSON.parse(req.body?.payload?.clientPayload || req.body?.clientPayload || '{}'); } catch {}
      if (!['avatar', 'image'].includes(payload?.kind)) throw fail('Vui lòng đăng nhập.', 401);
    }
    const { handleUpload } = await import('@vercel/blob/client');
    const response = await handleUpload({ body: req.body, request: req, onBeforeGenerateToken: async (pathname, clientPayload) => {
      let payload; try { payload = JSON.parse(clientPayload || '{}'); } catch { throw fail('Yêu cầu tải file không hợp lệ.'); }
      const kind = payload.kind;
      if (!['audio', 'cover', 'image', 'avatar', 'chat'].includes(kind) || !pathname.startsWith(`melodik/${kind}/`)) throw fail('Đường dẫn tải file không hợp lệ.');
      return { allowedContentTypes: kind === 'audio' ? audioTypes : kind === 'chat' ? chatFileTypes : imageTypes, maximumSizeInBytes: kind === 'audio' || kind === 'chat' ? mediaLimits.audio : mediaLimits.cover, addRandomSuffix: true, tokenPayload: JSON.stringify({ kind }) };
    }, onUploadCompleted: async () => {} });
    res.json(response);
  });
  async function saveSiteImage(req, res) {
    const key = req.params.key;
    if (!['communityImage', 'guestbookImage'].includes(key)) throw fail('Không tìm thấy ảnh giao diện.', 404);
    const existing = await row('SELECT value FROM site_settings WHERE key=?', [key]);
    const value = await media(req, 'image', 'image', existing?.value);
    if (!value) throw fail('Vui lòng chọn ảnh JPG, PNG hoặc WebP.');
    await query('INSERT INTO site_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value]);
    res.json({ key, value });
  }
  const siteImageMiddleware = production ? saveSiteImage : [upload.single('image'), saveSiteImage];
  app.post('/api/admin/settings/:key', auth, ...[].concat(siteImageMiddleware));
  async function saveUserSiteImage(req, res) {
    const key = req.params.key;
    if (!['communityImage', 'guestbookImage'].includes(key)) throw fail('Không tìm thấy ảnh giao diện.', 404);
    const existing = await row('SELECT value FROM user_settings WHERE userId=? AND key=?', [req.user.id, key]);
    const value = await media(req, 'image', 'image', existing?.value);
    if (!value) throw fail('Vui lòng chọn ảnh JPG, PNG hoặc WebP.');
    await query('INSERT INTO user_settings (userId,key,value) VALUES (?,?,?) ON CONFLICT(userId,key) DO UPDATE SET value=excluded.value', [req.user.id, key, value]);
    res.json({ key, value });
  }
  const userSiteImageMiddleware = production ? saveUserSiteImage : [upload.single('image'), saveUserSiteImage];
  const limitSiteImage = async (req, _res, next) => { try { await limit(`site-image:${req.user.id}`, 5); next(); } catch (error) { next(error); } };
  app.post('/api/users/settings/:key', authUser, limitSiteImage, ...[].concat(userSiteImageMiddleware));
  async function saveCategoryCover(req, res) {
    const kind = ['music', 'photo'].includes(req.params.kind) ? req.params.kind : null;
    if (!kind) throw fail('Không tìm thấy danh mục.', 404);
    const category = text(req.body.category, 50), key = `categoryCover:${kind}:${category}`;
    const existing = await row('SELECT value FROM user_settings WHERE userId=? AND key=?', [req.user.id, key]);
    const value = await media(req, 'image', 'image', existing?.value);
    if (!value) throw fail('Vui lòng chọn ảnh JPG, PNG hoặc WebP.');
    await query('INSERT INTO user_settings (userId,key,value) VALUES (?,?,?) ON CONFLICT(userId,key) DO UPDATE SET value=excluded.value', [req.user.id, key, value]);
    res.json({ key, value });
  }
  const categoryCoverMiddleware = production ? saveCategoryCover : [upload.single('image'), saveCategoryCover];
  app.post('/api/users/category-covers/:kind', authUser, limitSiteImage, ...[].concat(categoryCoverMiddleware));
  async function saveCommunityTrack(req, res) {
    const title = text(req.body.title, 120), artist = text(req.body.artist || '', 120, false), genre = text(req.body.genre, 50), access = visibleTo(req.body.visibility);
    const audio = await media(req, 'audio', 'audio'); if (!audio) throw fail('Vui lòng chọn file âm thanh.');
    const duration = Number(req.body.duration); if (!Number.isFinite(duration) || duration <= 0 || duration > 86400) throw fail('Không đọc được thời lượng âm thanh.');
    const cover = await media(req, 'cover', 'cover', '/artwork/sleeve.webp'), trackId = makeId();
    await query('INSERT INTO community_tracks (id,userId,title,artist,genre,cover,audio,duration,visibility,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)', [trackId, req.user.id, title, artist, genre, cover, audio, duration, access, new Date().toISOString()]);
    res.status(201).json({ id: trackId });
  }
  const communityTrackMiddleware = production ? saveCommunityTrack : [upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), saveCommunityTrack];
  app.post('/api/users/tracks', authUser, ...[].concat(communityTrackMiddleware));
  app.delete('/api/users/tracks/:id', authUser, async (req, res) => { const item = await row('SELECT id FROM community_tracks WHERE id=? AND userId=?', [req.params.id, req.user.id]); if (!item) throw fail('Không tìm thấy bài hát của bạn.', 404); await query('DELETE FROM community_tracks WHERE id=? AND userId=?', [req.params.id, req.user.id]); res.json({ ok: true }); });
  async function saveCommunityPhoto(req, res) {
    const title = text(req.body.title, 120), category = text(req.body.category, 50), location = text(req.body.location || '', 150, false), caption = text(req.body.caption || '', 1000, false), date = text(req.body.date, 10), access = visibleTo(req.body.visibility);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) throw fail('Ngày chưa hợp lệ.');
    const image = await media(req, 'image', 'image'); if (!image) throw fail('Vui lòng chọn ảnh.');
    const photoId = makeId(); await query('INSERT INTO community_photos (id,userId,title,image,category,location,caption,date,visibility,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)', [photoId, req.user.id, title, image, category, location, caption, date, access, new Date().toISOString()]);
    res.status(201).json({ id: photoId });
  }
  const communityPhotoMiddleware = production ? saveCommunityPhoto : [upload.single('image'), saveCommunityPhoto];
  app.post('/api/users/photos', authUser, ...[].concat(communityPhotoMiddleware));
  app.delete('/api/users/photos/:id', authUser, async (req, res) => { const item = await row('SELECT id FROM community_photos WHERE id=? AND userId=?', [req.params.id, req.user.id]); if (!item) throw fail('Không tìm thấy ảnh của bạn.', 404); await query('DELETE FROM community_photos WHERE id=? AND userId=?', [req.params.id, req.user.id]); res.json({ ok: true }); });
  const areFriends = (userId, otherId) => row("SELECT status FROM friendships WHERE ((userId=? AND friendId=?) OR (userId=? AND friendId=?)) AND status='accepted'", [userId, otherId, otherId, userId]);
  app.get('/api/users/find', authUser, async (req, res) => {
    const term = text(String(req.query.q || ''), 80, false);
    if (!term) return res.json({ users: [] });
    res.json({ users: await all('SELECT id,name,publicId,avatar,bio,lastActiveAt FROM users WHERE id<>? AND lower(name) LIKE ? ORDER BY name LIMIT 12', [req.user.id, `%${term.toLowerCase()}%`]) });
  });
  app.get('/api/friends', authUser, async (req, res) => res.json(await all("SELECT users.id,users.name,users.publicId,users.avatar,users.bio,users.lastActiveAt,friendships.status,CASE WHEN friendships.userId=? THEN 'outgoing' ELSE 'incoming' END AS direction,(SELECT COUNT(*) FROM chat_messages cm LEFT JOIN chat_reads cr ON cr.userId=? AND cr.friendId=users.id WHERE cm.senderId=users.id AND cm.recipientId=? AND (cr.readAt IS NULL OR cm.createdAt > cr.readAt)) AS unreadCount FROM friendships JOIN users ON users.id=CASE WHEN friendships.userId=? THEN friendships.friendId ELSE friendships.userId END WHERE friendships.userId=? OR friendships.friendId=? ORDER BY CASE WHEN (SELECT COUNT(*) FROM chat_messages cm LEFT JOIN chat_reads cr ON cr.userId=? AND cr.friendId=users.id WHERE cm.senderId=users.id AND cm.recipientId=? AND (cr.readAt IS NULL OR cm.createdAt > cr.readAt)) > 0 THEN 0 ELSE 1 END, friendships.createdAt DESC", [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id])));
  app.post('/api/friends', authUser, async (req, res) => {
    const friendId = text(req.body.userId, 60); if (friendId === req.user.id) throw fail('Bạn không thể tự kết bạn với mình.');
    if (!await row('SELECT id FROM users WHERE id=?', [friendId])) throw fail('Không tìm thấy người dùng.', 404);
    const existing = await row('SELECT * FROM friendships WHERE (userId=? AND friendId=?) OR (userId=? AND friendId=?)', [req.user.id, friendId, friendId, req.user.id]);
    if (existing) throw fail(existing.status === 'accepted' ? 'Hai bạn đã là bạn bè.' : 'Lời mời kết bạn đã tồn tại.', 409);
    await query('INSERT INTO friendships (userId,friendId,status,createdAt) VALUES (?,?,?,?)', [req.user.id, friendId, 'pending', new Date().toISOString()]); res.status(201).json({ ok: true });
  });
  app.post('/api/friends/:id/accept', authUser, async (req, res) => { const invite = await row("SELECT userId FROM friendships WHERE userId=? AND friendId=? AND status='pending'", [req.params.id, req.user.id]); if (!invite) throw fail('Không có lời mời phù hợp.', 404); await query("UPDATE friendships SET status='accepted' WHERE userId=? AND friendId=?", [req.params.id, req.user.id]); res.json({ ok: true }); });
  app.post('/api/friends/:id/reject', authUser, async (req, res) => { await query("DELETE FROM friendships WHERE userId=? AND friendId=? AND status='pending'", [req.params.id, req.user.id]); res.json({ ok: true }); });
  app.get('/api/chat/:id', authUser, async (req, res) => { if (!await areFriends(req.user.id, req.params.id)) throw fail('B�n ch� c� th� tr� chuy�n v�i b�n b�.', 403); const rows = await all('SELECT c.*, r.attachment AS replyAttachment, r.message AS replyMessage, r.attachmentName AS replyAttachmentName, r.senderId AS replySenderId FROM chat_messages c LEFT JOIN chat_messages r ON c.replyTo = r.id WHERE (c.senderId=? AND c.recipientId=?) OR (c.senderId=? AND c.recipientId=?) ORDER BY c.createdAt ASC LIMIT 200', [req.user.id, req.params.id, req.params.id, req.user.id]); await query('INSERT INTO chat_reads (userId,friendId,readAt) VALUES (?,?,?) ON CONFLICT(userId,friendId) DO UPDATE SET readAt=excluded.readAt', [req.user.id, req.params.id, new Date().toISOString()]); res.json(rows); });
  async function saveChatMessage(req, res) {
    if (!await areFriends(req.user.id, req.params.id)) throw fail('Bạn chỉ có thể trò chuyện với bạn bè.', 403);
    const message = text(req.body.message || '', 2000, false);
    const hasUploadedChatFile = Boolean(req.file || req.body.attachmentUrl || req.body.attachmentPathname);
    const attachment = hasUploadedChatFile ? await media(req, 'attachment', 'chat') : '';
    const attachmentName = attachment ? text(req.body.attachmentName || req.file?.originalname || 'Tệp đính kèm', 120, false) : '';
    if (!message && !attachment) throw fail('Vui lòng nhập tin nhắn hoặc chọn file.');
    await query('INSERT INTO chat_messages (id,senderId,recipientId,message,attachment,attachmentName,replyTo,forwardedFrom,reaction,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)', [makeId(), req.user.id, req.params.id, message, attachment || '', attachmentName, text(req.body.replyTo || '', 60, false), text(req.body.forwardedFrom || '', 60, false), '', new Date().toISOString()]);
    res.status(201).json({ ok: true });
  }
  const chatMiddleware = production ? saveChatMessage : [upload.single('attachment'), saveChatMessage];
  app.post('/api/chat/:id', authUser, ...[].concat(chatMiddleware));
  app.post('/api/chat/:id/react', authUser, async (req, res) => { const reaction = text(req.body.reaction || '', 20, false), message = await row('SELECT * FROM chat_messages WHERE id=?', [req.params.id]); if (!message || (message.senderId !== req.user.id && message.recipientId !== req.user.id)) throw fail('Không tìm thấy tin nhắn.', 404); await query('UPDATE chat_messages SET reaction=? WHERE id=?', [reaction, req.params.id]); res.json({ ok: true }); });

app.delete('/api/chat/:messageId', authUser, async (req, res) => {
  const { messageId } = req.params;
  // Verify the message exists and user is either sender or recipient
  const message = await row('SELECT * FROM chat_messages WHERE id=?', [messageId]);
  if (!message) {
    return res.status(404).json({ error: 'Không tìm thấy tin nhắn.' });
  }
  if (message.senderId !== req.user.id && message.recipientId !== req.user.id) {
    return res.status(403).json({ error: 'Bạn không có quyền xóa tin nhắn này.' });
  }
  await query('DELETE FROM chat_messages WHERE id=?', [messageId]);
  res.json({ ok: true });
});

  async function saveTrack(req, res) {
    const previous = req.params.id ? await row('SELECT * FROM tracks WHERE id=?', [req.params.id]) : null;
    if (req.params.id && !previous) throw fail('Không tìm thấy bài hát.', 404);
    const title = text(req.body.title, 120), artist = text(req.body.artist, 120), genre = text(req.body.genre, 50), playlistId = text(req.body.playlistId, 60);
    if (!await row('SELECT id FROM playlists WHERE id=?', [playlistId])) throw fail('Playlist không tồn tại.');
    const audio = await media(req, 'audio', 'audio', previous?.audio); if (!audio) throw fail('Vui lòng chọn file âm thanh.');
    const duration = Number(req.body.duration ?? previous?.duration); if (!Number.isFinite(duration) || duration <= 0 || duration > 86400) throw fail('Không đọc được thời lượng âm thanh.');
    const cover = await media(req, 'cover', 'cover', previous?.cover || '/artwork/sleeve.webp'), trackId = previous?.id || makeId();
    await query('INSERT INTO tracks (id,playlistId,title,artist,genre,cover,audio,duration,isDemo,position,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET playlistId=excluded.playlistId,title=excluded.title,artist=excluded.artist,genre=excluded.genre,cover=excluded.cover,audio=excluded.audio,duration=excluded.duration,isDemo=excluded.isDemo', [trackId, playlistId, title, artist, genre, cover, audio, duration, production ? 0 : (req.files?.audio?.[0] ? 0 : previous?.isDemo || 0), previous?.position ?? 100, previous?.createdAt || new Date().toISOString()]);
    res.status(previous ? 200 : 201).json({ id: trackId });
  }
  const trackMiddleware = production ? saveTrack : [upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), saveTrack];
  app.post('/api/admin/tracks', auth, ...[].concat(trackMiddleware)); app.put('/api/admin/tracks/:id', auth, ...[].concat(trackMiddleware));
  async function savePlaylist(req, res) {
    const previous = req.params.id ? await row('SELECT * FROM playlists WHERE id=?', [req.params.id]) : null;
    if (req.params.id && !previous) throw fail('Không tìm thấy playlist.', 404);
    const name = text(req.body.name, 80), description = text(req.body.description, 500, false), label = text(req.body.label || 'MỘT PLAYLIST NHỎ', 80);
    const cover = await media(req, 'cover', 'cover', previous?.cover || '/artwork/tea.webp'), playlistId = previous?.id || makeId();
    await query('INSERT INTO playlists (id,name,description,cover,label,position,createdAt) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,cover=excluded.cover,label=excluded.label', [playlistId, name, description, cover, label, previous?.position ?? 100, previous?.createdAt || new Date().toISOString()]);
    res.status(previous ? 200 : 201).json({ id: playlistId });
  }
  const playlistMiddleware = production ? savePlaylist : [upload.single('cover'), savePlaylist];
  app.post('/api/admin/playlists', auth, ...[].concat(playlistMiddleware)); app.put('/api/admin/playlists/:id', auth, ...[].concat(playlistMiddleware));
  async function savePhoto(req, res) {
    const previous = req.params.id ? await row('SELECT * FROM photos WHERE id=?', [req.params.id]) : null;
    if (req.params.id && !previous) throw fail('Không tìm thấy ảnh.', 404);
    const title = text(req.body.title, 120), category = text(req.body.category, 50), location = text(req.body.location || '', 150, false), caption = text(req.body.caption || '', 1000, false), date = text(req.body.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) throw fail('Ngày chưa hợp lệ.');
    const image = await media(req, 'image', 'image', previous?.image); if (!image) throw fail('Vui lòng chọn ảnh.');
    const photoId = previous?.id || makeId();
    await query('INSERT INTO photos (id,title,image,category,location,caption,date,createdAt) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,image=excluded.image,category=excluded.category,location=excluded.location,caption=excluded.caption,date=excluded.date', [photoId, title, image, category, location, caption, date, previous?.createdAt || new Date().toISOString()]);
    res.status(previous ? 200 : 201).json({ id: photoId });
  }
  const photoMiddleware = production ? savePhoto : [upload.single('image'), savePhoto];
  app.post('/api/admin/photos', auth, ...[].concat(photoMiddleware)); app.put('/api/admin/photos/:id', auth, ...[].concat(photoMiddleware));
  app.delete('/api/admin/:collection/:id', auth, async (req, res) => {
    const table = req.params.collection;
    if (!['tracks', 'playlists', 'photos', 'messages'].includes(table)) throw fail('Không tìm thấy.', 404);
    if (table === 'playlists' && await row('SELECT id FROM tracks WHERE playlistId=? LIMIT 1', [req.params.id])) throw fail('Hãy chuyển hoặc xóa các bài hát trước khi xóa playlist.', 409);
    if (!(await query(`DELETE FROM ${table} WHERE id=?`, [req.params.id])).changes) throw fail('Không tìm thấy nội dung.', 404);
    res.json({ ok: true });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Không tìm thấy chức năng.' }));
  if (!production) { app.use('/media', express.static(mediaDir, { dotfiles: 'deny', maxAge: '1d', immutable: true })); app.use(express.static(path.join(appRoot, 'public'))); app.use(express.static(path.join(appRoot, 'dist/client'))); app.get(['/', '/music', '/gallery', '/guestbook', '/community', '/admin'], (_req, res) => res.sendFile(path.join(appRoot, 'dist/client/index.html'))); }
  app.use((error, _req, res, _next) => { const status = error instanceof multer.MulterError ? 400 : error.status || 500; if (status === 500) console.error(error); res.status(status).json({ error: error instanceof multer.MulterError ? 'File quá lớn hoặc số lượng file không hợp lệ (âm thanh tối đa 50 MB).' : status === 500 ? 'Có lỗi khi lưu dữ liệu. Vui lòng thử lại.' : error.message }); });
  return { app, db, production };
}

