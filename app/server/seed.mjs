import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';

// Original synthesized demo loops: no external recordings or music services.
export function makeDemoWav(file, variant = 0, seconds = 36) {
  if (existsSync(file)) return;
  const rate = 22050, count = rate * seconds;
  const pcm = Buffer.alloc(44 + count * 2);
  pcm.write('RIFF'); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(rate, 24); pcm.writeUInt32LE(rate * 2, 28);
  pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(count * 2, 40);
  const chords = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 53, 59]];
  const beat = .65 + variant * .012;
  const freq = n => 440 * 2 ** ((n - 69) / 12);
  for (let i = 0; i < count; i++) {
    const t = i / rate, chord = chords[Math.floor(t / (beat * 4)) % 4];
    const phase = t % beat, note = chord[Math.floor(t / beat) % 4] + 12 + (variant % 3);
    let s = .15 * Math.sin(2 * Math.PI * freq(note) * phase) * Math.exp(-phase * 5) * Math.min(phase * 100, 1);
    for (const n of chord) s += .023 * Math.sin(2 * Math.PI * freq(n + variant % 3) * t) * (.6 + .4 * Math.sin(t * .7));
    const kick = t % (beat * 2);
    s += .08 * Math.sin(2 * Math.PI * (42 * kick + 6 * (1 - Math.exp(-kick * 20)))) * Math.exp(-kick * 15);
    const fade = Math.min(1, t / 1.5, (seconds - t) / 2);
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s * fade * 32767))), 44 + i * 2);
  }
  writeFileSync(file, pcm);
}

function addDemoAccounts(db) {
  if (!db.prepare('SELECT id FROM admin').get()) {
    const salt = randomBytes(16).toString('hex');
    db.prepare('INSERT INTO admin (id,email,passwordHash,salt) VALUES (1,?,?,?)').run('admin@gmail.com', scryptSync('admin123', salt, 64).toString('hex'), salt);
  }
  if (!db.prepare('SELECT id FROM users WHERE email=?').get('user@gmail.com')) {
    const salt = randomBytes(16).toString('hex');
    db.prepare('INSERT INTO users (id,name,email,publicId,avatar,passwordHash,salt,createdAt) VALUES (?,?,?,?,?,?,?,?)').run('demo-user', 'User Demo', 'user@gmail.com', '#0001', '/artwork/sleeve.webp', scryptSync('user123', salt, 64).toString('hex'), salt, new Date().toISOString());
  }
}

export function seed(db, mediaDir, { seedAccounts = true } = {}) {
  if (seedAccounts) addDemoAccounts(db);
  if (db.prepare("SELECT value FROM app_meta WHERE key='seeded'").get()) return;
  if (db.prepare('SELECT COUNT(*) AS n FROM playlists').get().n) {
    db.prepare("INSERT INTO app_meta VALUES ('seeded','1')").run();
    return;
  }
  const playlists = [
    ['lofi', 'Lo-Fi Café', 'Một tách trà, vài giai điệu nhẹ. Thế là đủ cho một chiều thong thả.', 'tea', 'CHO NHỮNG NGÀY CHẬM RÃI'],
    ['sunset', 'Sunset Reverie', 'Chút ấm áp còn vương khi hoàng hôn ghé qua ô cửa.', 'evening', 'ĐỂ TÂM TRÍ ĐI DẠO'],
    ['midnight', 'Midnight Journal', 'Đêm yên, đèn vàng và một trang giấy còn đang viết dở.', 'night', 'CÙNG BẠN THỨC KHUYA'],
    ['acoustic', 'Pastel Acoustic', 'Những nốt nhạc trong trẻo cho một khởi đầu dịu dàng.', 'desk', 'CHO MỘT NGÀY MỚI'],
  ];
  const titles = [['Strawberry Milk Tea', 'Afternoon Drizzle', 'Sunday Stationery'], ['Golden Hour', 'Windowsill Dreams', 'Apricot Sky'], ['Letters at Midnight', 'Moonlit Pages', 'A Quiet Thought'], ['Morning Paper', 'Little Sunshine', 'Slow Sunday']];
  const artists = ['Melodik Studio', 'Melodik Studio', 'Melodik Studio'];
  const tags = ['Lo-Fi Beat', 'Chillhop', 'Bedroom Beat'];
  playlists.forEach(([id, name, description, cover, label], p) => {
    db.prepare('INSERT INTO playlists VALUES (?,?,?,?,?,?,?)').run(id, name, description, `/artwork/${cover}.webp`, label, p, new Date().toISOString());
    titles[p].forEach((title, t) => {
      const filename = `demo-${p}-${t}.wav`, duration = 36 + t * 4;
      makeDemoWav(path.join(mediaDir, filename), p * 3 + t, duration);
      db.prepare('INSERT INTO tracks (id,playlistId,title,artist,genre,cover,audio,duration,isDemo,position,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(`track-${p}-${t}`, id, title, artists[t], tags[t], `/artwork/${t === 0 ? 'sleeve' : t === 1 ? 'coffee' : 'desk'}.webp`, `/media/${filename}`, duration, 1, t, new Date().toISOString());
    });
  });
  const photos = [
    ['Morning Coffee', 'coffee', 'Đời thường', 'Một góc quán quen', 'Cốc cà phê còn ấm, bản nhạc vẫn đang phát. Một buổi sáng không cần vội.'],
    ['Starry Night', 'evening', 'Ngày đặc biệt', 'Dưới giàn đèn nhỏ', 'Đi dạo khi thành phố vừa lên đèn. Những câu chuyện chưa muốn kết thúc.'],
    ['Forest Walk', 'forest', 'Đi đó đây', 'Con đường trong rừng', 'Nghe tiếng lá dưới chân và để những suy nghĩ ở lại phía sau.'],
    ['Flower Picking', 'flowers', 'Đi đó đây', 'Cánh đồng mùa hè', 'Mang một chút sắc màu về nhà, mang cả buổi chiều vào ký ức.'],
    ['Cozy Reading', 'reading', 'Đời thường', 'Góc đọc sách', 'Một chiếc ghế êm, một quyển sách hay và chút nhạc thật khẽ.'],
    ['Sunny Morning Tea', 'tea', 'Đời thường', 'Bên ô cửa', 'Ngày mới bắt đầu bằng những điều bé xíu, như mùi trà vừa pha.'],
  ];
  photos.forEach(([title, cover, category, location, caption], i) => db.prepare('INSERT INTO photos (id,title,image,category,location,caption,date,createdAt) VALUES (?,?,?,?,?,?,?,?)').run(`photo-${i}`, title, `/artwork/${cover}.webp`, category, location, caption, `2026-09-0${i + 1}`, new Date().toISOString()));
  db.prepare("INSERT INTO app_meta VALUES ('seeded','1')").run();
}
