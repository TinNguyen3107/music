import { randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(appRoot, 'data');
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'melodik.sqlite'));
db.exec('PRAGMA foreign_keys = ON');

const columns = table => db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);
const ensureColumn = (table, name, sql) => {
  if (!columns(table).includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${sql}`);
};

ensureColumn('users', 'publicId', 'publicId TEXT');
ensureColumn('users', 'avatar', 'avatar TEXT');
ensureColumn('users', 'bio', "bio TEXT DEFAULT ''");
ensureColumn('users', 'lastActiveAt', 'lastActiveAt TEXT');
ensureColumn('chat_messages', 'attachment', 'attachment TEXT');
ensureColumn('chat_messages', 'attachmentName', 'attachmentName TEXT');
ensureColumn('chat_messages', 'replyTo', 'replyTo TEXT');
ensureColumn('chat_messages', 'forwardedFrom', 'forwardedFrom TEXT');
ensureColumn('chat_messages', 'reaction', 'reaction TEXT');
db.exec('CREATE TABLE IF NOT EXISTS chat_reads (userId TEXT NOT NULL REFERENCES users(id),friendId TEXT NOT NULL REFERENCES users(id),readAt TEXT NOT NULL,PRIMARY KEY(userId,friendId))');

const now = Date.now();
const isoAgo = milliseconds => new Date(now - milliseconds).toISOString();
const saltFor = value => `mock-${value}-salt`;
const hashFor = value => scryptSync(`mock-${value}-pass`, saltFor(value), 64).toString('hex');

const mockFriends = [
  ['mock-friend-01', 'An Nhiên', '#8101', '/artwork/avatar_cat_4.jpg', 'Thích nhạc chill, ảnh nắng chiều và vài câu chuyện nhỏ.', 0],
  ['mock-friend-02', 'Bảo Trân', '#8102', '/artwork/avatar_cat_1.jpg', 'Hay gửi lời chào vào buổi sáng.', 45_000],
  ['mock-friend-03', 'Minh Khang', '#8103', '/artwork/avatar_cat_1.jpg', 'Đi đâu cũng mang tai nghe.', 2 * 60_000],
  ['mock-friend-04', 'Gia Hân', '#8104', '/artwork/avatar_cat_4.jpg', 'Một người bạn thích trà nóng và playlist dịu.', 7 * 60_000],
  ['mock-friend-05', 'Duy Anh', '#8105', '/artwork/avatar_cat_2.jpg', 'Online trễ, nghe nhạc đêm nhiều hơn ban ngày.', 17 * 60_000],
  ['mock-friend-06', 'Linh Chi', '#8106', '/artwork/avatar_cat_3.jpg', 'Lưu lại kỷ niệm bằng vài dòng rất ngắn.', 34 * 60_000],
  ['mock-friend-07', 'Quỳnh Mai', '#8107', '/artwork/avatar_cat_2.jpg', 'Đang test giao diện bạn bè nhiều người.', 58 * 60_000],
  ['mock-friend-08', 'Hoàng Nam', '#8108', '/artwork/avatar_cat_3.jpg', 'Gu nhạc hơi buồn một chút.', 2 * 60 * 60_000],
  ['mock-friend-09', 'Tuấn Kiệt', '#8109', '/artwork/sleeve.webp', 'Bạn mẫu để kiểm tra trạng thái hoạt động.', 5 * 60 * 60_000],
  ['mock-friend-10', 'Mộc Lam', '#8110', '/artwork/avatar_cat_4.jpg', 'Thích gửi ảnh trong chat.', 9 * 60 * 60_000],
  ['mock-friend-11', 'Hải Yến', '#8111', '/artwork/avatar_cat_1.jpg', 'Một chiếc bio dài hơn một chút để xem card profile có bị vỡ layout trên màn hình nhỏ hay không.', 18 * 60 * 60_000],
  ['mock-friend-12', 'Thanh Vy', '#8112', '/artwork/avatar_cat_1.jpg', 'Thỉnh thoảng mới online.', 26 * 60 * 60_000],
  ['mock-friend-13', 'Phúc Lâm', '#8113', '/artwork/avatar_cat_4.jpg', 'Bạn bè mẫu số 13.', 2 * 24 * 60 * 60_000],
  ['mock-friend-14', 'Ngọc Ánh', '#8114', '/artwork/avatar_cat_2.jpg', 'Bạn bè mẫu số 14.', 3 * 24 * 60 * 60_000],
  ['mock-friend-15', 'Khánh Linh', '#8115', '/artwork/avatar_cat_3.jpg', 'Bạn bè mẫu số 15.', 4 * 24 * 60 * 60_000],
  ['mock-friend-16', 'Trúc Ly', '#8116', '/artwork/avatar_cat_2.jpg', 'Bạn bè mẫu số 16.', 5 * 24 * 60 * 60_000],
  ['mock-friend-17', 'Đức Minh', '#8117', '/artwork/avatar_cat_3.jpg', 'Bạn bè mẫu số 17.', 6 * 24 * 60 * 60_000],
  ['mock-friend-18', 'Vy Vy', '#8118', '/artwork/sleeve.webp', 'Bạn bè mẫu số 18.', 7 * 24 * 60 * 60_000],
];

const insertUser = db.prepare(`
  INSERT INTO users (id,name,email,publicId,avatar,bio,passwordHash,salt,lastActiveAt,createdAt)
  VALUES (?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    publicId=excluded.publicId,
    avatar=excluded.avatar,
    bio=excluded.bio,
    lastActiveAt=excluded.lastActiveAt
`);
const insertFriendship = db.prepare(`
  INSERT OR IGNORE INTO friendships (userId,friendId,status,createdAt)
  VALUES (?,?,?,?)
`);
const insertMessage = db.prepare(`
  INSERT OR IGNORE INTO chat_messages (id,senderId,recipientId,message,attachment,attachmentName,replyTo,forwardedFrom,reaction,createdAt)
  VALUES (?,?,?,?,?,?,?,?,?,?)
`);

for (const [id, name, publicId, avatar, bio, activeAgo] of mockFriends) {
  insertUser.run(id, name, `${id}@miuzig.local`, publicId, avatar, bio, hashFor(id), saltFor(id), isoAgo(activeAgo), isoAgo(activeAgo + 60_000));
}

const targetUsers = db.prepare(`
  SELECT id,name FROM users
  WHERE id NOT LIKE 'mock-friend-%'
  ORDER BY createdAt DESC
`).all();

if (!targetUsers.length) {
  console.log('Chưa có tài khoản người dùng nào để gắn bạn bè mẫu.');
  db.close();
  process.exit(0);
}

let friendships = 0;
let messages = 0;

for (const target of targetUsers) {
  for (const [index, [friendId, friendName]] of mockFriends.entries()) {
    insertFriendship.run(target.id, friendId, 'accepted', isoAgo((index + 1) * 90_000));
    friendships += 1;
    if (index < 7) {
      insertMessage.run(`mock-msg-${target.id}-${friendId}-hello`, friendId, target.id, `Chào ${target.name}, mình là ${friendName}. Test tin nhắn mobile nha ✨`, '', '', '', '', '', isoAgo((index + 1) * 75_000));
      messages += 1;
    }
    if (index % 5 === 0) {
      insertMessage.run(`mock-msg-${target.id}-${friendId}-reply`, target.id, friendId, 'Mình nhận được rồi nè.', '', '', '', '', '', isoAgo((index + 1) * 70_000));
      messages += 1;
    }
  }
}

console.log(`Đã tạo/cập nhật ${mockFriends.length} bạn bè mẫu.`);
console.log(`Đã gắn bạn bè mẫu cho ${targetUsers.length} tài khoản local.`);
console.log(`Đã thêm tối đa ${messages} tin nhắn mẫu để test unread/chat.`);

db.close();
