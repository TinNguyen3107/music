import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsClockwise, ChatCircleText, Check, CircleNotch, Eye, EyeSlash, Heart, Image, Images, MusicNotes, PaperPlaneTilt, PencilSimple, SignOut, UserCircle, UserPlus, UsersThree, X } from '@phosphor-icons/react';
import { upload as uploadToBlob } from '@vercel/blob/client';
import { api, IconButton, Modal, time } from './shared.jsx';

const imageAccept = 'image/jpeg,image/png,image/webp';
const audioAccept = 'audio/mpeg,audio/wav,audio/ogg,audio/flac,audio/mp4,.mp3,.wav,.ogg,.flac,.m4a';
const randomPublicId = () => `#${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

function durationOf(file) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(), url = URL.createObjectURL(file);
    const timer = setTimeout(() => done(reject, new Error('Không đọc được thời lượng file âm thanh.')), 15000);
    const done = (fn, value) => { clearTimeout(timer); audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); fn(value); };
    audio.onloadedmetadata = () => done(resolve, audio.duration);
    audio.onerror = () => done(reject, new Error('Trình duyệt không hỗ trợ file âm thanh này.'));
    audio.src = url;
  });
}
async function uploadFiles(form, storage, fields) {
  if (storage.storage !== 'blob') return form;
  for (const [field, kind] of fields) {
    const file = form.get(field); if (!(file instanceof File) || !file.size) continue;
    const ext = file.name.includes('.') ? `.${file.name.split('.').pop().replace(/[^a-z0-9]/gi, '').slice(0, 8)}` : '';
    const blob = await uploadToBlob(`melodik/${kind}/${crypto.randomUUID()}${ext}`, file, { access: 'public', contentType: file.type || undefined, handleUploadUrl: '/api/admin/upload-token', clientPayload: JSON.stringify({ kind }) });
    form.delete(field); form.set(`${field}Url`, blob.url); form.set(`${field}Pathname`, blob.pathname);
  }
  return JSON.stringify(Object.fromEntries(form));
}

function SuggestionChips({ items, onPick }) {
  if (!items.length) return null;
  return <div className="suggestion-chips">{items.slice(0, 8).map(item => <button type="button" key={item} onClick={() => onPick(item)}>{item}</button>)}</div>;
}

export function Community({ catalog, refresh, notify, me: appUser, onUserChange, onPersonalSettingsChange }) {
  const [me, setMe] = useState(appUser), [ready, setReady] = useState(false), [mode, setMode] = useState('login'), [error, setError] = useState(''), [showPassword, setShowPassword] = useState(false);
  const [storage, setStorage] = useState({ storage: 'local' }), [composer, setComposer] = useState(null), [friends, setFriends] = useState([]), [selectedFriend, setSelectedFriend] = useState(null), [chat, setChat] = useState([]), [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(''), [results, setResults] = useState([]), [replyTo, setReplyTo] = useState(null), [attachmentFile, setAttachmentFile] = useState(null);
  const [genreDraft, setGenreDraft] = useState(''), [categoryDraft, setCategoryDraft] = useState('');
  const [registerId, setRegisterId] = useState(randomPublicId), fileRef = useRef(null), chatLogRef = useRef(null);
  const myTracks = useMemo(() => (catalog.communityTracks || []).filter(track => track.userId === me?.id), [catalog.communityTracks, me?.id]);
  const myPhotos = useMemo(() => (catalog.communityPhotos || []).filter(photo => photo.userId === me?.id), [catalog.communityPhotos, me?.id]);
  const genreSuggestions = useMemo(() => [...new Set(myTracks.map(track => track.genre).filter(Boolean))], [myTracks]);
  const categorySuggestions = useMemo(() => [...new Set(myPhotos.map(photo => photo.category).filter(Boolean))], [myPhotos]);

  async function check() { try { const user = await onUserChange?.() || (await api('/api/users/me')).user; setMe(user); } catch (e) { setError(e.message); } finally { setReady(true); } }
  async function loadFriends() { const data = await api('/api/friends'); setFriends(data); return data; }
  async function loadChat(friend = selectedFriend) { if (!friend) return; setChat(await api(`/api/chat/${friend.id}`)); }
  useEffect(() => { setMe(appUser); }, [appUser]);
  useEffect(() => { check(); api('/api/config').then(setStorage).catch(() => {}); }, []);
  useEffect(() => { if (me) loadFriends().catch(e => setError(e.message)); }, [me?.id]);
  useEffect(() => { if (!selectedFriend) return; loadChat(selectedFriend).catch(e => setError(e.message)); const timer = setInterval(() => loadChat(selectedFriend).catch(() => {}), 10000); return () => clearInterval(timer); }, [selectedFriend?.id]);
  useEffect(() => { if (chatLogRef.current) chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight; }, [chat]);

  async function auth(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const form = new FormData(event.currentTarget);
      if (mode === 'register') form.set('password', form.get('accountPass') || '');
      const body = mode === 'register' ? await uploadFiles(form, storage, [['avatar', 'image']]) : JSON.stringify({ email: form.get('email'), password: form.get('accountPass') || form.get('password') || '' });
      const data = await api(`/api/users/${mode}`, { method: 'POST', body });
      setMe(data.user); await onUserChange?.(); await onPersonalSettingsChange?.(); await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function logout() { await api('/api/users/logout', { method: 'POST' }); setMe(null); setFriends([]); setSelectedFriend(null); setChat([]); await onUserChange?.(); await onPersonalSettingsChange?.(); await refresh(); }
  async function saveProfile(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const body = await uploadFiles(new FormData(event.currentTarget), storage, [['avatar', 'image']]); const data = await api('/api/users/profile', { method: 'PUT', body }); setMe(data.user); await onUserChange?.(); notify('Đã cập nhật hồ sơ.'); setComposer(null); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function submitTrack(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const form = new FormData(event.currentTarget), audio = form.get('audio');
      form.set('genre', genreDraft);
      if (!audio?.size) throw new Error('Chọn file âm thanh trước khi đăng.');
      if (audio.size > 50 * 1024 * 1024) throw new Error('File âm thanh tối đa 50 MB.');
      if (form.get('cover')?.size > 8 * 1024 * 1024) throw new Error('Ảnh bìa tối đa 8 MB.');
      form.set('duration', String(await durationOf(audio)));
      await api('/api/users/tracks', { method: 'POST', body: await uploadFiles(form, storage, [['audio', 'audio'], ['cover', 'cover']]) });
      await refresh(); setComposer(null); setGenreDraft(''); notify('Bài hát đã được đăng.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function submitPhoto(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const form = new FormData(event.currentTarget), image = form.get('image');
      form.set('category', categoryDraft);
      if (!image?.size) throw new Error('Chọn ảnh trước khi đăng.');
      if (image.size > 8 * 1024 * 1024) throw new Error('Ảnh tối đa 8 MB.');
      await api('/api/users/photos', { method: 'POST', body: await uploadFiles(form, storage, [['image', 'image']]) });
      await refresh(); setComposer(null); setCategoryDraft(''); notify('Kỷ niệm đã được đăng.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function findPeople(event) { event.preventDefault(); setError(''); const q = search.trim(); if (!q) return setResults([]); const data = await api(`/api/users/find?q=${encodeURIComponent(q)}`); setResults(data.users || []); }
  async function addFriend(user) { setBusy(true); setError(''); try { await api('/api/friends', { method: 'POST', body: JSON.stringify({ userId: user.id }) }); await loadFriends(); notify(`Đã gửi lời mời đến ${user.name}.`); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function accept(friend) { setBusy(true); setError(''); try { await api(`/api/friends/${friend.id}/accept`, { method: 'POST' }); const data = await loadFriends(); setSelectedFriend(data.find(item => item.id === friend.id) || friend); await refresh(); notify(`Bạn và ${friend.name} đã là bạn bè.`); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function reject(friend) { setBusy(true); setError(''); try { await api(`/api/friends/${friend.id}/reject`, { method: 'POST' }); await loadFriends(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function sendChat(event) {
    event.preventDefault(); if (!selectedFriend) return; const formEl = event.currentTarget, form = new FormData(formEl), file = form.get('attachment');
    if (!String(form.get('message') || '').trim() && !file?.size) return;
    setBusy(true); setError('');
    try {
      if (file?.size) form.set('attachmentName', file.name);
      if (replyTo) form.set('replyTo', replyTo.id);
      await api(`/api/chat/${selectedFriend.id}`, { method: 'POST', body: await uploadFiles(form, storage, [['attachment', 'chat']]) });
      formEl.reset(); setReplyTo(null); setAttachmentFile(null); await loadChat(selectedFriend);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function react(message, reaction) { await api(`/api/chat/${message.id}/react`, { method: 'POST', body: JSON.stringify({ reaction }) }); await loadChat(selectedFriend); }
  const isImageAttachment = item => Boolean(
    item?.attachment &&
    (
      /\.(jpg|jpeg|png|webp)(\?|#|$)/i.test(item.attachment) ||
      /\.(jpg|jpeg|png|webp)$/i.test(item.attachmentName || '')
    )
  );
  const shortText = value => value && value.length > 35 ? `${value.slice(0, 35)}…` : value;
  function jumpToMessage(id) {
    const node = document.getElementById(`chat-message-${id}`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('jump-highlight');
    window.setTimeout(() => node.classList.remove('jump-highlight'), 1400);
  }

  if (!ready) return <div className="empty-state"><CircleNotch className="spin" size={30} /></div>;
  if (!me) return <section className="auth-layout community-auth"><div className="auth-copy"><span className="eyebrow"><UsersThree size={15} /> MUZIG SPACE</span><h1>Góc riêng<br /><span>của bạn.</span></h1><p>Đăng nhạc, lưu kỷ niệm, kết bạn và trò chuyện với những người cùng gu.</p><img src={catalog.settings?.communityImage || '/artwork/flowers.webp'} alt="Ảnh góc của bạn" /></div><form className="auth-form" onSubmit={auth} autoComplete="off"><span className="genre-label">TÀI KHOẢN</span><h2>{mode === 'register' ? 'Tạo tài khoản' : 'Chào mừng trở lại.'}</h2>{mode === 'register' && <><label>Tên hiển thị<input name="name" required maxLength={80} autoComplete="off" placeholder="Tên bạn muốn gọi" /></label><label>ID cá nhân<span className="id-picker"><input name="publicId" required pattern="#[0-9]{4}" maxLength={5} value={registerId} onChange={e => setRegisterId(e.target.value)} autoComplete="off" placeholder="#1234" title="ID có dạng # và 4 chữ số (ví dụ: #1234)" /><button type="button" onClick={() => setRegisterId(randomPublicId())}>Tạo ID</button></span></label><label>Avatar<input name="avatar" type="file" accept={imageAccept} /></label></>}<label>Email<input type="email" name="email" required maxLength={254} autoComplete="off" placeholder="ban@example.com" /></label><label className="password-field">Mật khẩu<span className="password-input"><input type={showPassword ? 'text' : 'password'} name="accountPass" required minLength={mode === 'register' ? 6 : 1} maxLength={128} autoComplete="off" data-lpignore="true" data-1p-ignore="true" placeholder={mode === 'register' ? 'Ít nhất 6 ký tự' : 'Mật khẩu'} /><button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onMouseDown={e => e.preventDefault()} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeSlash size={19} /> : <Eye size={19} />}</button></span></label>{mode === 'register' && <p className="form-footnote">Nếu ID bị trùng, hệ thống sẽ báo để bạn chọn 4 số khác. Mật khẩu cần ít nhất 6 ký tự.</p>}{error && <p className="form-error">{error}</p>}<button className="button primary wide" disabled={busy}>{busy && <CircleNotch className="spin" size={18} />}{mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'}</button><button type="button" className="text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setShowPassword(false); }}>{mode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}</button></form></section>;

  return <><section className="your-space"><div className="profile-hero"><img src={me.avatar || '/artwork/sleeve.webp'} alt="" /><div><span className="eyebrow"><UserCircle size={15} /> GÓC CỦA BẠN</span><h1>{me.name}</h1><p>{me.publicId || '#0000'} · {me.email}</p></div><button className="button secondary" onClick={() => setComposer('profile')}><PencilSimple size={17} /> Hồ sơ</button><button className="button secondary" onClick={logout}><SignOut size={17} /> Đăng xuất</button></div><div className="community-actions"><button className="button primary" onClick={() => setComposer('track')}><MusicNotes size={18} /> Đăng bài hát</button><button className="button secondary" onClick={() => setComposer('photo')}><Images size={18} /> Đăng kỷ niệm</button></div></section>
    <section className="space-layout"><aside className="social-sidebar"><form className="friend-search" onSubmit={findPeople}><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm theo tên bạn bè" /><button className="button primary" disabled={busy}><UserPlus size={17} /></button></form>{results.length > 0 && <div className="search-results">{results.map(user => <div className="friend-row" key={user.id}><img className="friend-avatar image" src={user.avatar || '/artwork/sleeve.webp'} alt="" /><div><strong>{user.name}</strong><small>{user.publicId}</small></div><button className="button secondary" disabled={busy} onClick={() => addFriend(user)}>Gửi</button></div>)}</div>}<div className="friend-list">{friends.length ? friends.map(friend => <div key={friend.id} className={`friend-row ${selectedFriend?.id === friend.id ? 'selected' : ''}`}><button className="friend-main" onClick={() => friend.status === 'accepted' && setSelectedFriend(friend)}><img className="friend-avatar image" src={friend.avatar || '/artwork/sleeve.webp'} alt="" /><span><strong>{friend.name}</strong><small>{friend.publicId} · {friend.status === 'accepted' ? 'Bạn bè' : friend.direction === 'incoming' ? 'Đang chờ bạn' : 'Đã gửi lời mời'}</small></span></button>{friend.status === 'accepted' ? <ChatCircleText size={18} /> : friend.direction === 'incoming' && <span className="inline-actions"><IconButton icon={Check} label="Đồng ý" onClick={() => accept(friend)} /><IconButton icon={X} label="Từ chối" onClick={() => reject(friend)} /></span>}</div>) : <p className="muted">Chưa có kết nối nào.</p>}</div></aside><main className="chat-workspace">{selectedFriend ? <><div className="chat-header"><img src={selectedFriend.avatar || '/artwork/sleeve.webp'} alt="" /><div><strong>{selectedFriend.name}</strong><span>{selectedFriend.publicId}</span></div><IconButton icon={ArrowsClockwise} label="Tải lại tin nhắn" onClick={() => loadChat(selectedFriend)} /></div><div className="chat-log expanded" ref={chatLogRef}>{chat.length ? chat.map(message => { const isMine = message.senderId === me.id; const repliedMsg = message.replyTo ? chat.find(m => m.id === message.replyTo) : null; const replyAuthor = repliedMsg ? (repliedMsg.senderId === me.id ? 'Bạn' : (selectedFriend?.name || 'Bạn bè')) : ''; const replyPreview = repliedMsg ? (repliedMsg.message || repliedMsg.attachmentName || 'Tệp đính kèm') : 'Tin nhắn cũ'; return <div id={`chat-message-${message.id}`} className={`chat-message-row ${isMine ? 'mine' : ''}`} key={message.id}><div className="message-bubble">{repliedMsg && <button type="button" className="reply-quote" onClick={() => jumpToMessage(repliedMsg.id)}><span className="reply-quote-bar" /><div className="reply-quote-content"><strong className="reply-quote-author">{replyAuthor}</strong>{isImageAttachment(repliedMsg) ? <span className="reply-image-preview"><img className="reply-thumb" src={repliedMsg.attachment} alt={repliedMsg.attachmentName || 'Ảnh được phản hồi'} /><span>Ảnh được phản hồi</span></span> : <span className="reply-quote-text">{shortText(replyPreview)}</span>}</div></button>}{message.message && <p>{message.message}</p>}{message.attachment && (isImageAttachment(message) ? <img src={message.attachment} alt={message.attachmentName || 'Ảnh đính kèm'} /> : <a href={message.attachment} target="_blank" rel="noreferrer">{message.attachmentName || 'Tệp đính kèm'}</a>)}{message.reaction && <span className="reaction">{message.reaction}</span>}</div><div className="message-actions"><button type="button" onClick={() => setReplyTo(message)}>Phản hồi</button></div></div>; }) : <p className="muted">Chưa có tin nhắn. Gửi một lời chào nhé.</p>}</div><form className="chat-compose expanded" onSubmit={sendChat}>{replyTo && <span className="compose-chip reply-chip">{isImageAttachment(replyTo) && <img className="compose-thumb" src={replyTo.attachment} alt="" />}<span>Đang trả lời <strong>{replyTo.senderId === me.id ? 'chính bạn' : selectedFriend?.name}</strong>: <em>{replyTo.message ? shortText(replyTo.message) : isImageAttachment(replyTo) ? 'Ảnh' : (replyTo.attachmentName || 'Tệp đính kèm')}</em></span><button type="button" onClick={() => setReplyTo(null)}>×</button></span>}{attachmentFile && <span className="compose-chip file-chip"><span>📷 {attachmentFile.name}</span><button type="button" onClick={() => { setAttachmentFile(null); if (fileRef.current) fileRef.current.value = ''; }}>×</button></span>}<IconButton icon={Image} label="Gửi ảnh" onClick={() => fileRef.current?.click()} /><input ref={fileRef} name="attachment" type="file" accept="image/jpeg,image/png,image/webp,image/*" hidden onChange={e => setAttachmentFile(e.target.files?.[0] || null)} /><input name="message" maxLength={2000} placeholder="Viết một lời nhắn…" autoComplete="off" /><button className="button primary" disabled={busy}><PaperPlaneTilt size={18} /></button></form></> : <div className="empty-state compact"><ChatCircleText size={34} /><p>Chọn một người bạn để bắt đầu trò chuyện.</p></div>}</main><aside className="posts-sidebar"><div className="community-card"><div className="eyebrow"><MusicNotes size={15} /> BÀI ĐÃ ĐĂNG</div>{myTracks.length ? myTracks.map(track => <div className="mini-post" key={track.id}><img src={track.cover} alt="" /><span><strong>{track.title}</strong><small>{track.genre} · {track.visibility === 'self' ? 'Chỉ mình tôi' : 'Bạn bè'} · {time(track.duration)}</small></span></div>) : <p className="muted">Chưa có bài hát nào.</p>}</div><div className="community-card"><div className="eyebrow"><Heart size={15} /> KỶ NIỆM</div>{myPhotos.length ? myPhotos.map(photo => <div className="mini-post" key={photo.id}><img src={photo.image} alt="" /><span><strong>{photo.title}</strong><small>{photo.category} · {photo.visibility === 'self' ? 'Chỉ mình tôi' : 'Bạn bè'}</small></span></div>) : <p className="muted">Chưa có kỷ niệm nào.</p>}</div></aside></section>{error && <p className="form-error community-error">{error}</p>}
    {composer === 'profile' && <Modal title="Chỉnh hồ sơ" onClose={() => !busy && setComposer(null)}><form className="editor-form" onSubmit={saveProfile}><label>Tên hiển thị<input name="name" required maxLength={80} defaultValue={me.name} /></label><label>ID cá nhân<input name="publicId" required pattern="#[0-9]{4}" maxLength={5} defaultValue={me.publicId || ''} title="ID có dạng # và 4 chữ số (ví dụ: #1234)" /></label><p className="form-footnote">Nếu ID bị trùng, hệ thống sẽ báo để bạn chọn 4 số khác.</p><label>Avatar<input name="avatar" type="file" accept={imageAccept} /></label><button className="button primary wide" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu hồ sơ'}</button></form></Modal>}
    {composer === 'track' && <Modal title="Đăng một bài hát" onClose={() => !busy && setComposer(null)}><form className="editor-form" onSubmit={submitTrack}><label>Tên bài hát<input name="title" required maxLength={120} /></label><label>Nghệ sĩ<input name="artist" maxLength={120} placeholder="Có thể để trống" /></label><label>Thể loại tự thêm<input name="genre" required maxLength={50} value={genreDraft} onChange={e => setGenreDraft(e.target.value)} placeholder="Ví dụ: lofi, ballad, tự thu..." /></label><SuggestionChips items={genreSuggestions} onPick={setGenreDraft} /><label>Hiển thị<select name="visibility" defaultValue="self"><option value="self">Chỉ mình tôi</option><option value="friends">Bạn bè đã kết bạn</option></select></label><label className="file-field"><MusicNotes size={24} /><strong>File âm thanh</strong><span>MP3, WAV, OGG, FLAC, M4A · tối đa 50 MB</span><input name="audio" type="file" accept={audioAccept} required /></label><label>Ảnh bìa<input name="cover" type="file" accept={imageAccept} /></label><p className="form-footnote">Chỉ đăng file bạn sở hữu hoặc được phép chia sẻ.</p><button className="button primary wide" disabled={busy}>{busy ? 'Đang đăng…' : 'Chia sẻ bài hát'}</button></form></Modal>}
    {composer === 'photo' && <Modal title="Đăng một kỷ niệm" onClose={() => !busy && setComposer(null)}><form className="editor-form" onSubmit={submitPhoto}><label>Tiêu đề<input name="title" required maxLength={120} /></label><label>Danh mục tự thêm<input name="category" required maxLength={50} value={categoryDraft} onChange={e => setCategoryDraft(e.target.value)} placeholder="Ví dụ: du lịch, bạn bè, sinh nhật..." /></label><SuggestionChips items={categorySuggestions} onPick={setCategoryDraft} /><label>Hiển thị<select name="visibility" defaultValue="self"><option value="self">Chỉ mình tôi</option><option value="friends">Bạn bè đã kết bạn</option></select></label><label>Ảnh<input name="image" type="file" accept={imageAccept} required /></label><label>Địa điểm<input name="location" maxLength={150} /></label><label>Câu chuyện nhỏ<textarea name="caption" maxLength={1000} rows={3} /></label><label>Ngày<input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label><button className="button primary wide" disabled={busy}>{busy ? 'Đang đăng…' : 'Chia sẻ kỷ niệm'}</button></form></Modal>}
  </>;
}
