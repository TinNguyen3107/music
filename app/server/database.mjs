import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const sqliteSchema = `
  PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS playlists (id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,cover TEXT NOT NULL,label TEXT NOT NULL,position INTEGER,createdAt TEXT);
  CREATE TABLE IF NOT EXISTS tracks (id TEXT PRIMARY KEY,playlistId TEXT NOT NULL REFERENCES playlists(id),title TEXT NOT NULL,artist TEXT NOT NULL,genre TEXT NOT NULL,cover TEXT NOT NULL,audio TEXT NOT NULL,duration REAL NOT NULL,isDemo INTEGER DEFAULT 0,position INTEGER,createdAt TEXT);
  CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY,title TEXT NOT NULL,image TEXT NOT NULL,category TEXT NOT NULL,location TEXT,caption TEXT,date TEXT,createdAt TEXT);
  CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL,message TEXT NOT NULL,createdAt TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id=1),email TEXT NOT NULL,passwordHash TEXT NOT NULL,salt TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS upload_tokens (pathname TEXT PRIMARY KEY,kind TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,publicId TEXT UNIQUE,avatar TEXT,passwordHash TEXT NOT NULL,salt TEXT NOT NULL,createdAt TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS user_sessions (token TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS community_tracks (id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,artist TEXT NOT NULL,genre TEXT NOT NULL,cover TEXT NOT NULL,audio TEXT NOT NULL,duration REAL NOT NULL,visibility TEXT NOT NULL DEFAULT 'friends' CHECK(visibility IN ('self','friends')),createdAt TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS community_photos (id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,image TEXT NOT NULL,category TEXT NOT NULL,location TEXT,caption TEXT,date TEXT,visibility TEXT NOT NULL DEFAULT 'friends' CHECK(visibility IN ('self','friends')),createdAt TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS friendships (userId TEXT NOT NULL REFERENCES users(id),friendId TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('pending','accepted')),createdAt TEXT NOT NULL,PRIMARY KEY(userId,friendId));
  CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY,senderId TEXT NOT NULL REFERENCES users(id),recipientId TEXT NOT NULL REFERENCES users(id),message TEXT NOT NULL,attachment TEXT,attachmentName TEXT,replyTo TEXT,forwardedFrom TEXT,reaction TEXT,createdAt TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS user_settings (userId TEXT NOT NULL REFERENCES users(id),key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(userId,key));
`;

const postgresSchema = [
  'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
  'CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS playlists (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, cover TEXT NOT NULL, label TEXT NOT NULL, position INTEGER, "createdAt" TEXT)',
  'CREATE TABLE IF NOT EXISTS tracks (id TEXT PRIMARY KEY, "playlistId" TEXT NOT NULL REFERENCES playlists(id), title TEXT NOT NULL, artist TEXT NOT NULL, genre TEXT NOT NULL, cover TEXT NOT NULL, audio TEXT NOT NULL, duration DOUBLE PRECISION NOT NULL, "isDemo" INTEGER NOT NULL DEFAULT 0, position INTEGER, "createdAt" TEXT)',
  'CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, title TEXT NOT NULL, image TEXT NOT NULL, category TEXT NOT NULL, location TEXT, caption TEXT, date TEXT, "createdAt" TEXT)',
  'CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL, "createdAt" TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL, "passwordHash" TEXT NOT NULL, salt TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires BIGINT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until BIGINT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS upload_tokens (pathname TEXT PRIMARY KEY, kind TEXT NOT NULL, expires BIGINT NOT NULL, used INTEGER NOT NULL DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, "publicId" TEXT UNIQUE, avatar TEXT, "passwordHash" TEXT NOT NULL, salt TEXT NOT NULL, "createdAt" TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS user_sessions (token TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES users(id), expires BIGINT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS community_tracks (id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, artist TEXT NOT NULL, genre TEXT NOT NULL, cover TEXT NOT NULL, audio TEXT NOT NULL, duration DOUBLE PRECISION NOT NULL, visibility TEXT NOT NULL DEFAULT \'friends\' CHECK(visibility IN (\'self\',\'friends\')), "createdAt" TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS community_photos (id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, image TEXT NOT NULL, category TEXT NOT NULL, location TEXT, caption TEXT, date TEXT, visibility TEXT NOT NULL DEFAULT \'friends\' CHECK(visibility IN (\'self\',\'friends\')), "createdAt" TEXT NOT NULL)',
  "CREATE TABLE IF NOT EXISTS friendships (\"userId\" TEXT NOT NULL REFERENCES users(id), \"friendId\" TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL CHECK(status IN ('pending','accepted')), \"createdAt\" TEXT NOT NULL, PRIMARY KEY(\"userId\",\"friendId\"))",
  'CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, "senderId" TEXT NOT NULL REFERENCES users(id), "recipientId" TEXT NOT NULL REFERENCES users(id), message TEXT NOT NULL, attachment TEXT, "attachmentName" TEXT, "replyTo" TEXT, "forwardedFrom" TEXT, reaction TEXT, "createdAt" TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS user_settings ("userId" TEXT NOT NULL REFERENCES users(id), key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY("userId", key))',
  'CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires)',
  'CREATE INDEX IF NOT EXISTS tracks_playlist_idx ON tracks ("playlistId")',
  'CREATE INDEX IF NOT EXISTS messages_created_idx ON messages ("createdAt" DESC)',
  'CREATE INDEX IF NOT EXISTS chat_created_idx ON chat_messages ("createdAt")',
  'CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_idx ON users ("publicId") WHERE "publicId" IS NOT NULL'
];

function pgSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`).replace(/\b(playlistId|createdAt|passwordHash|isDemo|userId|friendId|senderId|recipientId|publicId|attachmentName|replyTo|forwardedFrom)\b/g, '"$1"');
}

async function runCompatibleMigrations(db, production) {
  const sqliteColumn = table => db.native.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);
  const add = async (statement) => {
    try { await db.query(statement); } catch (error) {
      if (!String(error?.message || '').match(/duplicate column|already exists/i)) throw error;
    }
  };
  if (production) {
    await add('ALTER TABLE users ADD COLUMN "publicId" TEXT');
    await add('ALTER TABLE users ADD COLUMN avatar TEXT');
    await add("ALTER TABLE community_tracks ADD COLUMN visibility TEXT NOT NULL DEFAULT 'friends'");
    await add("ALTER TABLE community_photos ADD COLUMN visibility TEXT NOT NULL DEFAULT 'friends'");
    await add('ALTER TABLE chat_messages ADD COLUMN attachment TEXT');
    await add('ALTER TABLE chat_messages ADD COLUMN "attachmentName" TEXT');
    await add('ALTER TABLE chat_messages ADD COLUMN "replyTo" TEXT');
    await add('ALTER TABLE chat_messages ADD COLUMN "forwardedFrom" TEXT');
    await add('ALTER TABLE chat_messages ADD COLUMN reaction TEXT');
    await db.query("UPDATE users SET \"publicId\"='#0001' WHERE email='user@gmail.com' AND \"publicId\" IS NULL");
    await db.query("UPDATE users SET avatar='/artwork/sleeve.webp' WHERE email='user@gmail.com' AND avatar IS NULL");
    await db.query('CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_idx ON users ("publicId") WHERE "publicId" IS NOT NULL');
    return;
  }
  if (!sqliteColumn('users').includes('publicId')) db.native.exec('ALTER TABLE users ADD COLUMN publicId TEXT');
  if (!sqliteColumn('users').includes('avatar')) db.native.exec('ALTER TABLE users ADD COLUMN avatar TEXT');
  if (!sqliteColumn('community_tracks').includes('visibility')) db.native.exec("ALTER TABLE community_tracks ADD COLUMN visibility TEXT NOT NULL DEFAULT 'friends'");
  if (!sqliteColumn('community_photos').includes('visibility')) db.native.exec("ALTER TABLE community_photos ADD COLUMN visibility TEXT NOT NULL DEFAULT 'friends'");
  if (!sqliteColumn('chat_messages').includes('attachment')) db.native.exec('ALTER TABLE chat_messages ADD COLUMN attachment TEXT');
  if (!sqliteColumn('chat_messages').includes('attachmentName')) db.native.exec('ALTER TABLE chat_messages ADD COLUMN attachmentName TEXT');
  if (!sqliteColumn('chat_messages').includes('replyTo')) db.native.exec('ALTER TABLE chat_messages ADD COLUMN replyTo TEXT');
  if (!sqliteColumn('chat_messages').includes('forwardedFrom')) db.native.exec('ALTER TABLE chat_messages ADD COLUMN forwardedFrom TEXT');
  if (!sqliteColumn('chat_messages').includes('reaction')) db.native.exec('ALTER TABLE chat_messages ADD COLUMN reaction TEXT');
  db.native.exec("UPDATE users SET publicId='#0001' WHERE email='user@gmail.com' AND publicId IS NULL");
  db.native.exec("UPDATE users SET avatar='/artwork/sleeve.webp' WHERE email='user@gmail.com' AND avatar IS NULL");
  db.native.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_idx ON users (publicId) WHERE publicId IS NOT NULL');
}

export async function createDatabase({ dataDir, production = false, migrate = false } = {}) {
  if (production) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL chưa được thiết lập cho môi trường production.');
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const db = {
      async query(statement, values = []) { return { rows: await sql.query(pgSql(statement), values), changes: 0 }; },
      async close() {},
      async migrate() {
        for (const statement of postgresSchema) await this.query(statement);
        await runCompatibleMigrations(this, true);
        await this.query('INSERT INTO schema_migrations (version) VALUES (?) ON CONFLICT (version) DO NOTHING', [1]);
      }
    };
    if (migrate) await db.migrate();
    return { db, mediaDir: null, production: true };
  }
  mkdirSync(dataDir, { recursive: true });
  const mediaDir = path.join(dataDir, 'uploads'); mkdirSync(mediaDir, { recursive: true });
  const native = new DatabaseSync(path.join(dataDir, 'melodik.sqlite'));
  native.exec(sqliteSchema);
  const db = {
    native,
    async query(statement, values = []) {
      const prepared = native.prepare(statement);
      if (/^\s*(SELECT|WITH)/i.test(statement)) return { rows: prepared.all(...values), changes: 0 };
      return { rows: [], changes: prepared.run(...values).changes };
    },
    async close() { native.close(); }
  };
  await runCompatibleMigrations(db, false);
  return { db, mediaDir, production: false };
}

export { postgresSchema };
