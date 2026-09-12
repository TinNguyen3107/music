import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Disc, Heart, Headphones, ImageSquare, MagnifyingGlass, MusicNotes, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Sparkle, SpeakerHigh, SpeakerSlash, UploadSimple, X } from '@phosphor-icons/react';
import { upload as uploadToBlob } from '@vercel/blob/client';
import { api, IconButton, time } from './shared.jsx';

const imageAccept = 'image/jpeg,image/png,image/webp';

async function categoryCoverBody(category, file, storage) {
  const form = new FormData();
  form.set('category', category);
  form.set('image', file);
  if (storage.storage !== 'blob') return form;
  const ext = file.name.includes('.') ? `.${file.name.split('.').pop().replace(/[^a-z0-9]/gi, '').slice(0, 8)}` : '';
  const blob = await uploadToBlob(`melodik/image/${crypto.randomUUID()}${ext}`, file, { access: 'public', contentType: file.type || undefined, handleUploadUrl: '/api/admin/upload-token', clientPayload: JSON.stringify({ kind: 'image' }) });
  form.delete('image'); form.set('imageUrl', blob.url); form.set('imagePathname', blob.pathname);
  return JSON.stringify(Object.fromEntries(form));
}

export function Music({ catalog, player: p, me, personalSettings = {}, onPersonalSettingsChange }) {
  const [playlistId, setPlaylistId] = useState('');
  const [search, setSearch] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [storage, setStorage] = useState({ storage: 'local' });
  const [savingCover, setSavingCover] = useState('');
  useEffect(() => { api('/api/config').then(setStorage).catch(() => {}); }, []);

  const playlists = useMemo(() => {
    const grouped = new Map();
    for (const track of catalog.communityTracks || []) {
      const name = track.genre || 'Góc cộng đồng';
      if (!grouped.has(name)) {
        grouped.set(name, {
          id: name,
          name,
          description: name === 'Góc cộng đồng' ? 'Những bản nhạc bạn và bạn bè đã chọn chia sẻ.' : `Tuyển tập ${name} từ góc nhạc của bạn.`,
          label: track.visibility === 'self' ? 'CHỈ MÌNH TÔI' : 'BẠN BÈ',
          cover: personalSettings[`categoryCover:music:${name}`] || track.cover || '/artwork/sleeve.webp'
        });
      }
    }
    return [...grouped.values()];
  }, [catalog.communityTracks, personalSettings]);
  const selected = playlists.find(v => v.id === playlistId) || playlists[0] || null;
  const catalogTracks = catalog.communityTracks || [];
  const allTracks = selected ? catalogTracks.filter(t => (t.genre || 'Góc cộng đồng') === selected.id) : [];
  const tracks = allTracks.filter(t => (!onlyFavorites || p.favorites.includes(t.id)) && `${t.title} ${t.artist} ${t.owner}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const currentPlaylistId = p.current ? (p.current.genre || 'Góc cộng đồng') : '';
  const displayCover = p.current ? personalSettings[`categoryCover:music:${currentPlaylistId}`] || p.current.cover : '';
  useEffect(() => { if (!selected && playlists[0]) setPlaylistId(playlists[0].id); }, [selected, playlists]);

  async function saveCover(event, category) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSavingCover(category);
    try {
      const body = await categoryCoverBody(category, file, storage);
      await api('/api/users/category-covers/music', { method: 'POST', body });
      await onPersonalSettingsChange?.();
    } finally {
      setSavingCover('');
      event.target.value = '';
    }
  }

  return <>
    <section className="music-intro"><div><div className="eyebrow"><Sparkle size={14} /> YOUR LITTLE LISTENING ROOM</div><h1>Dreamy <span>Jukebox</span><span className="heading-star"><Sparkle weight="regular" /></span></h1><p>Bật một giai điệu từ chính bạn hoặc từ bạn bè đã kết nối.</p></div><div className="intro-note"><Headphones size={23} /><span>Một góc nhỏ,<br />dành riêng cho bạn.</span></div></section>
    {!me && <div className="empty-state compact"><MusicNotes size={30} /><p>Đăng nhập để xem nhạc cá nhân và nhạc bạn bè chia sẻ.</p></div>}
    {me && !playlists.length && <div className="empty-state compact"><MusicNotes size={30} /><p>Chưa có bài hát nào. Vào Góc của bạn để đăng bài đầu tiên.</p></div>}
    {me && playlists.length > 0 && <>
      <div className="mood-tabs" aria-label="Danh mục nhạc của bạn">{playlists.map((playlist, i) => <button key={playlist.id} className={selected?.id === playlist.id ? 'selected' : ''} aria-pressed={selected?.id === playlist.id} onClick={() => { setPlaylistId(playlist.id); setSearch(''); }}>{i === 0 && <Disc size={16} />}{playlist.name}</button>)}</div>
      <section className="listening-room" aria-label="Máy phát nhạc">
        <div className="record-player"><div className="player-topline"><span className="eyebrow">{p.playing ? 'ĐANG PHÁT' : 'CHẠM ĐỂ LẮNG NGHE'}</span><IconButton icon={Heart} label={p.favorites.includes(p.current?.id) ? 'Bỏ yêu thích bài đang phát' : 'Yêu thích bài đang phát'} active={p.favorites.includes(p.current?.id)} disabled={!p.current} onClick={() => p.favorite(p.current.id)} /></div>
          <button className="record-button" aria-label={p.playing ? 'Tạm dừng đĩa nhạc' : 'Phát đĩa nhạc'} onClick={p.toggle} disabled={!p.current}><span className={`vinyl-art ${p.playing ? 'rotating' : ''}`}><img className="vinyl" src="/artwork/record.webp" alt="Đĩa vinyl" />{p.current && <img className="record-cover" src={displayCover || '/artwork/sleeve.webp'} alt={`Ảnh bìa ${p.current.title}`} />}</span><span className="record-hover">{p.playing ? <Pause size={27} weight="fill" /> : <Play size={27} weight="fill" />}</span></button>
          <div className="now-playing"><span className="genre-label">{p.current?.genre || 'Góc nhạc yên tĩnh'}</span><h2>{p.current?.title || 'Chưa có bài hát'}</h2><p>{p.current?.artist || p.current?.owner || 'Đăng một giai điệu ở Góc của bạn'}</p></div>
          <div className="seek-control"><input aria-label="Tua bài hát" type="range" min="0" max={p.duration || 1} step=".1" value={Math.min(p.elapsed, p.duration || 1)} disabled={!p.current} onChange={e => p.seek(e.target.value)} /><div className="time-labels"><span>{time(p.elapsed)}</span><span>{time(p.duration)}</span></div></div>
          <div className="playback-controls"><IconButton icon={Shuffle} label="Phát ngẫu nhiên" active={p.shuffle} onClick={() => p.setShuffle(!p.shuffle)} /><IconButton icon={SkipBack} label="Bài trước" disabled={!p.current} onClick={() => p.skip(-1)} /><button className="main-play" aria-label={p.playing ? 'Tạm dừng' : 'Phát nhạc'} disabled={!p.current} onClick={p.toggle}>{p.playing ? <Pause size={25} weight="fill" /> : <Play size={25} weight="fill" />}</button><IconButton icon={SkipForward} label="Bài tiếp theo" disabled={!p.current} onClick={() => p.skip(1)} /><IconButton icon={Repeat} label="Lặp lại bài hiện tại" active={p.repeat} onClick={() => p.setRepeat(!p.repeat)} /></div>
          <div className="volume-control"><IconButton icon={p.volume ? SpeakerHigh : SpeakerSlash} label={p.volume ? 'Tắt tiếng' : 'Bật tiếng'} onClick={() => p.setVolume(p.volume ? 0 : .75)} /><input type="range" min="0" max="1" step=".01" value={p.volume} aria-label="Âm lượng" onChange={e => p.setVolume(Number(e.target.value))} /><span>{Math.round(p.volume * 100)}%</span></div>
        </div>
        <div className="track-panel"><div className="track-header"><div><span className="eyebrow">DANH MỤC ĐƯỢC CHỌN</span><h2>{selected?.name}</h2></div><span className="track-count">{allTracks.length} bài <span>· {time(allTracks.reduce((sum, t) => sum + t.duration, 0))}</span></span></div><p className="playlist-description">{selected?.description}</p>
          <div className="library-tools"><label className="search-box"><MagnifyingGlass size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm một giai điệu…" aria-label="Tìm bài hát" />{search && <button aria-label="Xóa tìm kiếm" onClick={() => setSearch('')}><X size={14} /></button>}</label><IconButton icon={Heart} label="Chỉ hiện bài yêu thích" active={onlyFavorites} onClick={() => setOnlyFavorites(!onlyFavorites)} /></div>
          <div className="track-list">{tracks.length ? tracks.map((track, i) => <div key={track.id} className={`track-row ${p.current?.id === track.id ? 'current' : ''}`}><span className="track-index">{p.current?.id === track.id && p.playing ? <MusicNotes size={17} /> : String(i + 1).padStart(2, '0')}</span><button className="track-main" onClick={() => p.select(track)} aria-label={`${p.current?.id === track.id && p.playing ? 'Tạm dừng' : 'Phát'} ${track.title}`}><img src={track.cover} alt="" /><span><strong>{track.title}</strong><small>{track.artist || track.owner}{track.userId === me.id ? ' · của bạn' : ` · ${track.owner}`}</small></span></button><span className="track-genre">{track.visibility === 'self' ? 'Chỉ mình tôi' : track.genre}</span><span className="track-duration">{time(track.duration)}</span><IconButton className="track-heart" icon={Heart} label={`${p.favorites.includes(track.id) ? 'Bỏ yêu thích' : 'Yêu thích'} ${track.title}`} active={p.favorites.includes(track.id)} onClick={() => p.favorite(track.id)} /><IconButton className="track-play" icon={p.current?.id === track.id && p.playing ? Pause : Play} label={`${p.current?.id === track.id && p.playing ? 'Tạm dừng' : 'Phát bài'} ${track.title}`} onClick={() => p.select(track)} /></div>) : <div className="empty-tracks"><MusicNotes size={30} /><p>Danh mục này chưa có bài phù hợp.</p></div>}</div>
          <div className="playlist-bottom"><span><Headphones size={15} /> Nghe theo cách của bạn</span><span className="keyboard-hint"><kbd>space</kbd> phát / dừng</span></div>
        </div>
      </section>
      <section className="playlist-section"><div className="section-heading"><div><div className="eyebrow"><Disc size={14} /> THE MIXTAPE SHELF</div><h2>Hôm nay, bạn muốn nghe gì?</h2></div><span>{playlists.length} danh mục riêng</span></div><div className="playlist-grid">{playlists.map((playlist, i) => <div className="playlist-card category-card" key={playlist.id}><button onClick={() => { setPlaylistId(playlist.id); setSearch(''); setOnlyFavorites(false); const first = catalogTracks.find(t => (t.genre || 'Góc cộng đồng') === playlist.id); if (first) p.select(first); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><div className="sleeve-image"><img src={playlist.cover} alt={playlist.name} loading="lazy" /><span className="sleeve-number">VOL. {String(i + 1).padStart(2, '0')}</span><span className="sleeve-play"><Play size={22} weight="fill" /></span></div><div className="playlist-card-title"><h3>{playlist.name}</h3><ArrowUpRight size={20} /></div><span className="playlist-label">{playlist.label}</span></button><label className="category-upload" title="Đổi ảnh danh mục chỉ riêng bạn thấy"><ImageSquare size={16} />{savingCover === playlist.id ? 'Đang lưu' : 'Đổi ảnh'}<input type="file" accept={imageAccept} onChange={event => saveCover(event, playlist.id)} /></label></div>)}</div></section>
    </>}
  </>;
}
