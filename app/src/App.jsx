import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CaretDown, CircleNotch, Heart, MusicNotes, NotePencil, Pause, Play, SkipBack, SkipForward, Sparkle, X } from '@phosphor-icons/react';
import { Admin } from './Admin.jsx';
import { Music } from './Music.jsx';
import { Gallery, Guestbook } from './Pages.jsx';
import { Community } from './Community.jsx';
import { api, time, stored, IconButton } from './shared.jsx';
import '@fontsource/quicksand/400.css';
import '@fontsource/quicksand/500.css';
import '@fontsource/quicksand/600.css';
import '@fontsource/quicksand/700.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import './styles.css';
import './personal.css';
import './your-space.css';

export function App() {
  const [route, setRoute] = useState(window.location.pathname);
  const [catalog, setCatalog] = useState(null);
  const [me, setMe] = useState(null);
  const [userSettings, setUserSettings] = useState({});
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');
  const [currentId, setCurrentId] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => Math.min(1, Math.max(0, Number(stored('melodik.volume', .75)) || 0)));
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [miniPlayerCollapsed, setMiniPlayerCollapsed] = useState(false);
  const [favorites, setFavorites] = useState(() => { const v = stored('melodik.favorites', []); return Array.isArray(v) ? v : []; });
  const audio = useRef(null), shouldPlay = useRef(false);
  const allCatalogTracks = catalog ? [...(catalog.communityTracks || [])] : [];
  const current = allCatalogTracks.find(t => t.id === currentId) || null;
  const currentPlaylistId = current ? (current.genre || 'Góc cộng đồng') : '';
  const currentCover = current ? userSettings[`categoryCover:music:${currentPlaylistId}`] || current.cover : '';
  const notify = useCallback(message => setToast(message), []);
  const refreshCurrentUser = useCallback(async () => { try { const data = await api('/api/users/me'); setMe(data.user || null); return data.user || null; } catch { setMe(null); return null; } }, []);
  const refreshUserSettings = useCallback(async () => { try { const data = await api('/api/users/settings'); setUserSettings(data.settings || {}); } catch { setUserSettings({}); } }, []);
  const refresh = useCallback(async () => { try { const data = await api('/api/catalog'); setCatalog(data); setLoadError(''); return data; } catch (e) { setLoadError(e.message); } }, []);
  useEffect(() => { refreshCurrentUser(); refreshUserSettings(); refresh(); }, [refreshCurrentUser, refreshUserSettings, refresh]);
  useEffect(() => { const handle = () => setRoute(location.pathname); window.addEventListener('popstate', handle); return () => window.removeEventListener('popstate', handle); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (catalog && !current) { shouldPlay.current = false; setCurrentId(allCatalogTracks[0]?.id || null); } }, [catalog, current, allCatalogTracks.length]);
  useEffect(() => { audio.current.volume = volume; try { localStorage.setItem('melodik.volume', JSON.stringify(volume)); } catch {} }, [volume]);
  useEffect(() => { setElapsed(0); setDuration(0); if (current && shouldPlay.current) audio.current.play().catch(() => notify('Chạm nút phát để bắt đầu nghe nhạc.')); }, [current?.audio, notify]);

  function navigate(path) { if (path === route) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } history.pushState({}, '', path); setRoute(path); window.scrollTo(0, 0); }
  const toggle = useCallback(() => { if (!current) return; if (audio.current.paused) { shouldPlay.current = true; audio.current.play().catch(() => notify('Không phát được file này. Vui lòng thử bài khác.')); } else { shouldPlay.current = false; audio.current.pause(); } }, [current, notify]);
  function select(track) { if (currentId === track.id) { toggle(); return; } shouldPlay.current = true; setCurrentId(track.id); }
  const skip = useCallback((direction = 1, ended = false) => {
    if (!current) return;
    const queue = allCatalogTracks.filter(t => t.playlistId === current.playlistId);
    if (!queue.length) return;
    if (ended && repeat) { audio.current.currentTime = 0; audio.current.play().catch(() => {}); return; }
    if (direction < 0 && audio.current.currentTime > 3) { audio.current.currentTime = 0; return; }
    const index = queue.findIndex(t => t.id === currentId);
    const next = shuffle && queue.length > 1 ? (index + 1 + Math.floor(Math.random() * (queue.length - 1))) % queue.length : (index + direction + queue.length) % queue.length;
    shouldPlay.current = true;
    if (queue[next].id === currentId) { audio.current.currentTime = 0; audio.current.play().catch(() => {}); } else setCurrentId(queue[next].id);
  }, [allCatalogTracks, current, currentId, repeat, shuffle]);
  useEffect(() => { const handle = e => { if (e.code === 'Space' && !e.repeat && !e.target.closest('input,textarea,button,a,select,[contenteditable],dialog')) { e.preventDefault(); toggle(); } }; window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle); }, [toggle]);
  function favorite(trackId) { setFavorites(old => { const next = old.includes(trackId) ? old.filter(v => v !== trackId) : [...old, trackId]; try { localStorage.setItem('melodik.favorites', JSON.stringify(next)); } catch {} return next; }); }
  function seek(value) { if (Number.isFinite(audio.current.duration)) { audio.current.currentTime = Number(value); setElapsed(Number(value)); } }
  const player = { current, playing, elapsed, duration: duration || current?.duration || 0, volume, setVolume, shuffle, setShuffle, repeat, setRepeat, select, toggle, skip, seek, favorites, favorite };
  const link = (path, label) => <a href={path} aria-current={route === path || (path === '/music' && route === '/') ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate(path); }}>{label}</a>;
  const isAdmin = route === '/admin';

  return <>
    <a className="skip-link" href="#main">Đến nội dung chính</a>
    <audio ref={audio} src={current?.audio} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={e => setElapsed(e.currentTarget.currentTime)} onLoadedMetadata={e => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onEnded={() => skip(1, true)} onError={() => { setPlaying(false); if (current) notify('File âm thanh chưa phát được. Hãy chọn bài khác hoặc kiểm tra định dạng file.'); }} />
    <header className="site-header"><div className="header-inner"><a className="wordmark" href="/" onClick={e => { e.preventDefault(); navigate('/'); }}>MIUZIG<span className="logo-star"><Sparkle size={18} weight="fill" /></span></a><nav aria-label="Điều hướng chính">{link('/music', 'Góc nghe nhạc')}{link('/gallery', 'Kỷ niệm')}{link('/community', 'Góc của bạn')}{link('/guestbook', 'Sổ lưu bút')}</nav><a className={`hello-link ${me ? 'profile-link' : ''}`} href="/community" onClick={e => { e.preventDefault(); navigate('/community'); }}>{me ? <img src={me.avatar || '/artwork/sleeve.webp'} alt="" /> : <NotePencil size={17} />}{me ? <span>{me.name}</span> : 'Đăng ký / Đăng nhập'}<ArrowUpRight size={15} /></a></div></header>
    <main id="main" className={isAdmin ? 'admin-main' : 'main-content'}>
      {loadError ? <div className="empty-state"><h2>Góc nhạc chưa kết nối được.</h2><p>{loadError}</p><button className="button primary" onClick={refresh}>Thử lại</button></div> : !catalog ? <div className="empty-state"><CircleNotch className="spin" size={32} /><p>Đang mở góc nhạc của bạn…</p></div> : isAdmin ? <Admin catalog={catalog} refresh={refresh} notify={notify} /> : route === '/gallery' ? <Gallery photos={catalog.communityPhotos || []} /> : route === '/community' ? <Community catalog={catalog} refresh={refresh} notify={notify} me={me} onUserChange={refreshCurrentUser} personalSettings={userSettings} onPersonalSettingsChange={refreshUserSettings} /> : route === '/guestbook' ? <Guestbook settings={{ ...(catalog.settings || {}), ...userSettings }} /> : ['/', '/music'].includes(route) ? <Music catalog={catalog} player={player} me={me} personalSettings={userSettings} onPersonalSettingsChange={refreshUserSettings} /> : <div className="empty-state"><h1>Trang này đi lạc rồi.</h1><button className="button primary" onClick={() => navigate('/')}>Về góc nghe nhạc</button></div>}
    </main>
    <footer className="site-footer"><div><a className="wordmark small" href="/" onClick={e => { e.preventDefault(); navigate('/'); }}>MIUZIG</a><p>Một chút nhạc. Một chút bình yên.</p></div><span className="footer-note">Made for slow days <Heart size={14} /></span><a href="/admin" onClick={e => { e.preventDefault(); navigate('/admin'); }}>Quản trị <ArrowUpRight size={14} /></a></footer>
    {!['/', '/music'].includes(route) && current && (miniPlayerCollapsed ? <button className="mini-player-dock" aria-label="Mở trình phát nhạc" onClick={() => setMiniPlayerCollapsed(false)}><MusicNotes size={21} /></button> : <div className="mini-player"><img src={currentCover || current.cover} alt="" /><div className="mini-title"><strong>{current.title}</strong><span>{current.artist || current.owner}</span></div><div className="mini-controls"><IconButton icon={SkipBack} label="Bài trước" onClick={() => skip(-1)} /><IconButton className="primary" icon={playing ? Pause : Play} label={playing ? 'Tạm dừng' : 'Phát nhạc'} onClick={toggle} /><IconButton icon={SkipForward} label="Bài tiếp theo" onClick={() => skip(1)} /></div><input aria-label="Tiến trình phát nhạc" type="range" min="0" max={duration || current.duration} value={Math.min(elapsed, duration || current.duration)} step=".1" onChange={e => seek(e.target.value)} /><span className="mono">{time(elapsed)}</span><button className="mini-return" onClick={() => navigate('/music')}>Góc nhạc <ArrowUpRight size={16} /></button><IconButton className="mini-collapse" icon={CaretDown} label="Thu gọn trình phát" onClick={() => setMiniPlayerCollapsed(true)} /></div>)}
    {toast && <div role="status" className="toast">{toast}<IconButton icon={X} label="Đóng thông báo" onClick={() => setToast('')} /></div>}
  </>;
}
