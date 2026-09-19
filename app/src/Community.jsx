import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsClockwise, Camera, ChatCircleText, Check, CircleNotch, Eye, EyeSlash, Heart, Image, Images, MusicNotes, PaperPlaneTilt, PencilSimple, SignOut, Trash, UserCircle, UserPlus, UsersThree, X } from '@phosphor-icons/react';
import { upload as uploadToBlob } from '@vercel/blob/client';
import { api, IconButton, Modal, time } from './shared.jsx';

const imageAccept = 'image/jpeg,image/png,image/webp';
const audioAccept = 'audio/mpeg,audio/wav,audio/ogg,audio/flac,audio/mp4,.mp3,.wav,.ogg,.flac,.m4a';
const randomPublicId = () => `#${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
const activeWindowMs = 60 * 1000;

function activityStatus(lastActiveAt, now = Date.now()) {
  const time = Date.parse(lastActiveAt || '');
  if (!Number.isFinite(time)) return { online: false, text: 'Chưa có hoạt động' };
  const diff = Math.max(0, now - time);
  if (diff < activeWindowMs) return { online: true, text: 'Đang hoạt động' };
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return { online: false, text: `Hoạt động ${minutes} phút trước` };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { online: false, text: `Hoạt động ${hours} giờ trước` };
  return { online: false, text: `Hoạt động lần cuối vào ngày ${new Date(time).toLocaleDateString('vi-VN')}` };
}

async function optimizeImageFile(file, kind) {
  if (!file?.type?.startsWith('image/') || file.size < 350 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const isCameraShot = /^miuzig-camera-/i.test(file.name || '');
    const maxSide = kind === 'avatar' ? 512 : kind === 'chat' ? 1400 : isCameraShot ? 1920 : 1600;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', isCameraShot ? .9 : .82));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${name}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  }
}

function sharpenCanvas(canvas, amount = .34) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !canvas.width || !canvas.height) return;
  try {
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const src = image.data;
    const out = new Uint8ClampedArray(src);
    const width = canvas.width, height = canvas.height;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          const center = src[i + c];
          const blur = (src[i - 4 + c] + src[i + 4 + c] + src[i - width * 4 + c] + src[i + width * 4 + c]) / 4;
          out[i + c] = Math.max(0, Math.min(255, center + (center - blur) * amount));
        }
      }
    }
    image.data.set(out);
    ctx.putImageData(image, 0, 0);
  } catch {}
}

async function enhanceCameraBlob(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const maxSide = 2400;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    sharpenCanvas(canvas, .24);
    const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .94));
    return jpeg || blob;
  } catch {
    return blob;
  }
}

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
  const prepared = await Promise.all(fields.map(async ([field, kind]) => {
    const original = form.get(field);
    if (!(original instanceof File) || !original.size) return null;
    const file = kind !== 'audio' ? await optimizeImageFile(original, kind) : original;
    if (file !== original) form.set(field, file);
    return { field, kind, file };
  }));
  if (storage.storage !== 'blob') return form;
  const uploaded = await Promise.all(prepared.filter(Boolean).map(async ({ field, kind, file }) => {
    const ext = file.name.includes('.') ? `.${file.name.split('.').pop().replace(/[^a-z0-9]/gi, '').slice(0, 8)}` : '';
    const blob = await uploadToBlob(`melodik/${kind}/${crypto.randomUUID()}${ext}`, file, { access: 'public', contentType: file.type || undefined, handleUploadUrl: '/api/admin/upload-token', clientPayload: JSON.stringify({ kind }) });
    return { field, url: blob.url, pathname: blob.pathname };
  }));
  for (const item of uploaded) {
    form.delete(item.field); form.set(`${item.field}Url`, item.url); form.set(`${item.field}Pathname`, item.pathname);
  }
  return JSON.stringify(Object.fromEntries(form));
}

function setBodyField(body, key, value) {
  if (typeof body !== 'string') {
    body.set(key, value);
    return body;
  }
  const data = JSON.parse(body);
  data[key] = value;
  return JSON.stringify(data);
}

function SuggestionChips({ items, onPick, visible }) {
  if (!items.length || !visible) return null;
  return <div className="suggestion-dropdown-list">{items.slice(0, 8).map(item => <button type="button" key={item} onMouseDown={e => e.preventDefault()} onClick={() => onPick(item)}>{item}</button>)}</div>;
}

function ProfileCard({ user, activity, isSelf, onImage }) {
  const avatar = user?.avatar || '/artwork/sleeve.webp';
  return <div className="profile-card">
    <button type="button" className="profile-card-avatar" onClick={() => onImage({ src: avatar, name: `Avatar của ${user?.name || 'người dùng'}` })}><img src={avatar} alt={user?.name || 'Avatar'} /></button>
    <div className="profile-card-main">
      <h3>{user?.name || 'Người dùng'} <em>{user?.publicId || '#0000'}</em></h3>
      {activity && <p className={activity.online ? 'profile-status online' : 'profile-status'}>{activity.text}</p>}
      {isSelf && user?.email && <p className="profile-email">{user.email}</p>}
      <div className="profile-bio"><span>Giới thiệu</span><p>{user?.bio?.trim() || 'Chưa có bio.'}</p></div>
    </div>
  </div>;
}

export function Community({ catalog, refresh, notify, me: appUser, onUserChange, personalSettings = {}, onPersonalSettingsChange }) {
  const [me, setMe] = useState(appUser), [ready, setReady] = useState(false), [mode, setMode] = useState('login'), [error, setError] = useState(''), [showPassword, setShowPassword] = useState(false);
  const [storage, setStorage] = useState({ storage: 'local' }), [composer, setComposer] = useState(null), [friends, setFriends] = useState([]), [selectedFriend, setSelectedFriend] = useState(null), [chat, setChat] = useState([]), [busy, setBusy] = useState(false), [imageViewer, setImageViewer] = useState(null), [profileViewer, setProfileViewer] = useState(null), [clock, setClock] = useState(Date.now());
  const [prevFriends, setPrevFriends] = useState([]);
  const [prevChatLength, setPrevChatLength] = useState(0);
  const [search, setSearch] = useState(''), [results, setResults] = useState([]), [replyTo, setReplyTo] = useState(null), [attachmentFile, setAttachmentFile] = useState(null);
  const [genreDraft, setGenreDraft] = useState(''), [categoryDraft, setCategoryDraft] = useState('');
  const [genreFocus, setGenreFocus] = useState(false), [categoryFocus, setCategoryFocus] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('environment'), [cameraStream, setCameraStream] = useState(null), [cameraPhoto, setCameraPhoto] = useState(null), [cameraPreview, setCameraPreview] = useState(''), [cameraStep, setCameraStep] = useState('capture'), [isMobileCamera, setIsMobileCamera] = useState(false);
  const [registerId, setRegisterId] = useState(randomPublicId), fileRef = useRef(null), chatLogRef = useRef(null), cameraVideoRef = useRef(null), cameraCanvasRef = useRef(null), cameraStreamRef = useRef(null), shouldStickToBottomRef = useRef(true), forceScrollToBottomRef = useRef(false);
  const myTracks = useMemo(() => (catalog.communityTracks || []).filter(track => track.userId === me?.id), [catalog.communityTracks, me?.id]);
  const myPhotos = useMemo(() => (catalog.communityPhotos || []).filter(photo => photo.userId === me?.id), [catalog.communityPhotos, me?.id]);
  const genreSuggestions = useMemo(() => [...new Set(myTracks.map(track => track.genre).filter(Boolean))], [myTracks]);
  const categorySuggestions = useMemo(() => [...new Set(myPhotos.map(photo => photo.category).filter(Boolean))], [myPhotos]);
  const selectedActivity = activityStatus(selectedFriend?.lastActiveAt, clock);

  async function check() { try { const user = await onUserChange?.() || (await api('/api/users/me')).user; setMe(user); } catch (e) { setError(e.message); } finally { setReady(true); } }
  async function loadFriends() {
    const data = await api('/api/friends');
    setFriends(data);
    setSelectedFriend(current => current ? (data.find(item => item.id === current.id) || current) : current);
    return data;
  }
  async function loadChat(friend = selectedFriend) {
    if (!friend) return;
    shouldStickToBottomRef.current = isChatNearBottom();
    setChat(await api(`/api/chat/${friend.id}`));
    setFriends(old => old.map(item => item.id === friend.id ? { ...item, unreadCount: 0 } : item));
  }
  useEffect(() => { setMe(appUser); }, [appUser]);
  useEffect(() => { check(); api('/api/config').then(setStorage).catch(() => {}); }, []);
  useEffect(() => {
    if (!me) return;
    loadFriends().catch(e => setError(e.message));
    const timer = setInterval(() => loadFriends().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [me?.id]);
  useEffect(() => {
    if (!me) return;
    const beat = () => api('/api/users/heartbeat', { method: 'POST' }).then(data => {
      if (data?.lastActiveAt) {
        setMe(user => user ? { ...user, lastActiveAt: data.lastActiveAt } : user);
        setProfileViewer(user => user?.self ? { ...user, lastActiveAt: data.lastActiveAt } : user);
      }
    }).catch(() => {});
    beat();
    const timer = setInterval(beat, 30000);
    return () => clearInterval(timer);
  }, [me?.id]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!selectedFriend) return;
    forceScrollToBottomRef.current = true;
    loadChat(selectedFriend).catch(e => setError(e.message));
    const timer = setInterval(() => loadChat(selectedFriend).catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, [selectedFriend?.id]);

  // Check for friend request acceptance and new messages
  useEffect(() => {
    if (!me) return;

    // Check for new friend acceptances
    if (prevFriends.length > 0) {
      const newlyAccepted = friends.filter(friend =>
        friend.status === 'accepted' &&
        !prevFriends.some(prev => prev.id === friend.id && prev.status === 'accepted')
      );

      newlyAccepted.forEach(friend => {
        notify(`${friend.name} đã chấp nhận lời mời kết bạn của bạn!`);
      });
    }

    // Check for new messages
    if (selectedFriend && chat.length > prevChatLength) {
      const newMessages = chat.slice(prevChatLength);
      newMessages.forEach(message => {
        if (message.senderId !== me?.id) { // Only notify for messages from others
          const senderName = message.senderId === me?.id ? 'Bạn' : (selectedFriend?.name || 'Bạn bè');
          const messagePreview = message.message ||
            (message.attachmentName || 'Tệp đính kèm') ||
            'Tin nhắn';
          notify(`${senderName}: ${messagePreview}`);
        }
      });
    }

    // Update prev states
    setPrevFriends([...friends]);
    setPrevChatLength(chat.length);
  }, [friends, chat, me, selectedFriend, notify]);
  useEffect(() => {
    const log = chatLogRef.current;
    if (!log) return;
    if (!forceScrollToBottomRef.current && !shouldStickToBottomRef.current) return;
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
      forceScrollToBottomRef.current = false;
    });
  }, [chat]);
  useEffect(() => {
    cameraStreamRef.current = cameraStream;
    if (cameraVideoRef.current && cameraStream) cameraVideoRef.current.srcObject = cameraStream;

    // Cleanup function to stop camera tracks when component unmounts or stream changes
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
    };
  }, [cameraStream]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setIsMobileCamera(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  useEffect(() => () => stopCamera(), []);
  useEffect(() => () => { if (cameraPreview) URL.revokeObjectURL(cameraPreview); }, [cameraPreview]);

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
      const [duration, uploadedBody] = await Promise.all([
        durationOf(audio),
        uploadFiles(form, storage, [['audio', 'audio'], ['cover', 'cover']])
      ]);
      await api('/api/users/tracks', { method: 'POST', body: setBodyField(uploadedBody, 'duration', String(duration)) });
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
  function stopCamera() {
    const stream = cameraStreamRef.current;
    if (stream) stream.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
  }
  async function startCamera(facing = cameraFacing) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Trình duyệt này chưa hỗ trợ mở camera.');
    stopCamera();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facing },
        width: { ideal: isMobileCamera ? 1440 : 1920 },
        height: { ideal: isMobileCamera ? 2560 : 1080 },
        aspectRatio: { ideal: isMobileCamera ? 9 / 16 : 16 / 9 },
        frameRate: { ideal: 30 }
      },
      audio: false
    });
    const track = stream.getVideoTracks?.()[0];
    await track?.applyConstraints?.({ advanced: [{ focusMode: 'continuous' }, { exposureMode: 'continuous' }] }).catch(() => {});
    setCameraFacing(facing);
    setCameraStream(stream);
  }
  async function openCameraComposer() {
    setError('');
    setCameraPhoto(null);
    setCameraStep('capture');
    if (cameraPreview) { URL.revokeObjectURL(cameraPreview); setCameraPreview(''); }
    setComposer('camera');
    try { await startCamera(cameraFacing); }
    catch (e) { setError(e.message || 'Không mở được camera. Hãy kiểm tra quyền camera của trình duyệt.'); }
  }
  async function flipCamera() {
    try { await startCamera(cameraFacing === 'environment' ? 'user' : 'environment'); }
    catch (e) { setError(e.message || 'Không đổi được camera.'); }
  }
  async function focusCamera(event) {
    const stream = cameraStreamRef.current, track = stream?.getVideoTracks?.()[0], rect = event.currentTarget.getBoundingClientRect();
    if (!track?.applyConstraints || !rect.width || !rect.height) return;
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }, { pointsOfInterest: [{ x, y }] }] }).catch(() => {});
    window.setTimeout(() => track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {}), 900);
  }
  async function captureCameraPhoto() {
    const stream = cameraStreamRef.current, track = stream?.getVideoTracks?.()[0];
    const video = cameraVideoRef.current, canvas = cameraCanvasRef.current;
    let blob = null;
    if (track && 'ImageCapture' in window) {
      try {
        const capture = new ImageCapture(track);
        blob = await capture.takePhoto();
      } catch {}
    }
    if (!blob) {
      if (!video || !canvas || !video.videoWidth) return setError('Camera chưa sẵn sàng, thử chờ thêm một chút.');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .95));
    }
    if (!blob) return setError('Không chụp được ảnh. Hãy thử lại.');
    const enhanced = await enhanceCameraBlob(blob);
    const file = new File([enhanced], `miuzig-camera-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    if (cameraPreview) URL.revokeObjectURL(cameraPreview);
    setCameraPhoto(file);
    setCameraPreview(URL.createObjectURL(file));
    setCameraStep(isMobileCamera ? 'review' : 'details');
    stopCamera();
  }
  async function retakeCameraPhoto() {
    setCameraPhoto(null);
    setCameraStep('capture');
    if (cameraPreview) { URL.revokeObjectURL(cameraPreview); setCameraPreview(''); }
    try { await startCamera(cameraFacing); }
    catch (e) { setError(e.message || 'Không mở lại được camera.'); }
  }
  function closeCameraComposer() {
    stopCamera();
    setCameraPhoto(null);
    setCameraStep('capture');
    if (cameraPreview) { URL.revokeObjectURL(cameraPreview); setCameraPreview(''); }
    if (!busy) setComposer(null);
  }
  async function submitCameraPhoto(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (!cameraPhoto) throw new Error('Bạn cần chụp ảnh trước khi đăng.');
      const form = new FormData(event.currentTarget);
      form.set('category', categoryDraft);
      form.set('image', cameraPhoto);
      await api('/api/users/photos', { method: 'POST', body: await uploadFiles(form, storage, [['image', 'image']]) });
      await refresh(); closeCameraComposer(); setCategoryDraft(''); notify('Kỷ niệm từ camera đã được đăng.');
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
      forceScrollToBottomRef.current = true;
      formEl.reset(); setReplyTo(null); setAttachmentFile(null); await loadChat(selectedFriend);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function react(message, reaction) { await api(`/api/chat/${message.id}/react`, { method: 'POST', body: JSON.stringify({ reaction }) }); await loadChat(selectedFriend); }

async function deleteChatMessage(messageId) {
  try {
    await api(`/api/chat/${messageId}`, { method: 'DELETE' });
    await loadChat(selectedFriend);
  } catch (error) {
    notify?.(error.message || 'Không thể xóa tin nhắn');
  }
}
  const trackCover = track => personalSettings[`categoryCover:music:${track.genre || 'Góc cộng đồng'}`] || track.cover || '/artwork/sleeve.webp';
  const isImageAttachment = item => Boolean(
    item?.attachment &&
    (
      /\.(jpg|jpeg|png|webp)(\?|#|$)/i.test(item.attachment) ||
      /\.(jpg|jpeg|png|webp)$/i.test(item.attachmentName || '')
    )
  );
  const shortText = value => value && value.length > 35 ? `${value.slice(0, 35)}…` : value;
  function isChatNearBottom() {
    const log = chatLogRef.current;
    if (!log) return true;
    return log.scrollHeight - log.scrollTop - log.clientHeight < 96;
  }
  function jumpToMessage(id) {
    const node = document.getElementById(`chat-message-${id}`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('jump-highlight');
    window.setTimeout(() => node.classList.remove('jump-highlight'), 1400);
  }
  if (!ready) return <div className="empty-state"><CircleNotch className="spin" size={30} /></div>;
  if (!me) return <section className="auth-layout community-auth"><div className="auth-copy"><span className="eyebrow"><UsersThree size={15} /> MIUZIG SPACE</span><h1>Góc riêng<br /><span>của bạn.</span></h1><p>Đăng nhạc, lưu kỷ niệm, kết bạn và trò chuyện với những người cùng gu.</p><img src={catalog.settings?.communityImage || '/artwork/flowers.webp'} alt="Ảnh góc của bạn" /></div><form className="auth-form" onSubmit={auth} autoComplete="off"><span className="genre-label">TÀI KHOẢN</span><h2>{mode === 'register' ? 'Tạo tài khoản' : 'Chào mừng trở lại.'}</h2>{mode === 'register' && <><label>Tên hiển thị<input name="name" required maxLength={80} autoComplete="off" placeholder="Tên bạn muốn gọi" /></label><label>ID cá nhân<span className="id-picker"><input name="publicId" required pattern="#[0-9]{4}" maxLength={5} value={registerId} onChange={e => setRegisterId(e.target.value)} autoComplete="off" placeholder="#1234" title="ID có dạng # và 4 chữ số (ví dụ: #1234)" /><button type="button" onClick={() => setRegisterId(randomPublicId())}>Tạo ID</button></span></label><label>Avatar<input name="avatar" type="file" accept={imageAccept} /></label></>}<label>Email<input type="email" name="email" required maxLength={254} autoComplete="off" placeholder="ban@example.com" /></label><label className="password-field">Mật khẩu<span className="password-input"><input type={showPassword ? 'text' : 'password'} name="accountPass" required minLength={mode === 'register' ? 6 : 1} maxLength={128} autoComplete="off" data-lpignore="true" data-1p-ignore="true" placeholder={mode === 'register' ? 'Ít nhất 6 ký tự' : 'Mật khẩu'} /><button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onMouseDown={e => e.preventDefault()} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeSlash size={19} /> : <Eye size={19} />}</button></span></label>{mode === 'register' && <p className="form-footnote">Nếu ID bị trùng, hệ thống sẽ báo để bạn chọn 4 số khác. Mật khẩu cần ít nhất 6 ký tự.</p>}{error && <p className="form-error">{error}</p>}<button className="button primary wide" disabled={busy}>{busy && <CircleNotch className="spin" size={18} />}{mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'}</button><button type="button" className="text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setShowPassword(false); }}>{mode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}</button></form></section>;

  return <><section className="your-space"><div className="profile-hero"><button type="button" className="profile-avatar-button" onClick={() => setProfileViewer({ ...me, self: true })}><img src={me.avatar || '/artwork/sleeve.webp'} alt="" /></button><div><span className="eyebrow"><UserCircle size={15} /> GÓC CỦA BẠN</span><h1>{me.name}</h1><p>{me.publicId || '#0000'} · {me.email}</p>{me.bio && <p className="profile-hero-bio">{me.bio}</p>}</div><button className="button secondary" onClick={() => setComposer('profile')}><PencilSimple size={17} /> Hồ sơ</button><button className="button secondary" onClick={logout}><SignOut size={17} /> Đăng xuất</button></div><div className="community-actions"><button className="button primary" onClick={() => setComposer('track')}><MusicNotes size={18} /> Đăng bài hát</button><button className="button secondary" onClick={() => setComposer('photo')}><Images size={18} /> Đăng kỷ niệm</button><button className="button secondary" onClick={openCameraComposer}><Camera size={18} /> Chụp kỷ niệm</button></div></section>
    <section className={`space-layout ${selectedFriend ? 'mobile-chat-open' : ''}`}><aside className="social-sidebar"><form className="friend-search" onSubmit={findPeople}><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm theo tên bạn bè" /><button className="button primary" disabled={busy}><UserPlus size={17} /></button></form>{results.length > 0 && <div className="search-results">{results.map(user => <div className="friend-row" key={user.id}><button type="button" className="friend-avatar-open" onClick={() => setProfileViewer(user)}><img className="friend-avatar image" src={user.avatar || '/artwork/sleeve.webp'} alt="" /></button><div><strong>{user.name}</strong><small>{user.publicId}</small></div><button className="button secondary" disabled={busy} onClick={() => addFriend(user)}>Gửi</button></div>)}</div>}<div className="friend-list">{friends.length ? friends.map(friend => <div key={friend.id} className={`friend-row ${selectedFriend?.id === friend.id ? 'selected' : ''}`}><button className="friend-main" onClick={() => friend.status === 'accepted' && setSelectedFriend(friend)}><span className="friend-avatar-wrap avatar-clickable" role="button" tabIndex={0} onClick={event => { event.stopPropagation(); setProfileViewer(friend); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setProfileViewer(friend); } }}><img className="friend-avatar image" src={friend.avatar || '/artwork/sleeve.webp'} alt="" />{friend.status === 'accepted' && activityStatus(friend.lastActiveAt, clock).online && <span className="online-dot" />}</span><span><strong>{friend.name} <em className="friend-public-id">{friend.publicId}</em></strong><small>{friend.status === 'accepted' ? activityStatus(friend.lastActiveAt, clock).text : friend.direction === 'incoming' ? 'Đang chờ bạn' : 'Đã gửi lời mời'}</small></span></button>{friend.status === 'accepted' ? (Number(friend.unreadCount || 0) > 0 ? <span className="unread-badge" title={`${friend.unreadCount} tin nhắn mới`}>{Number(friend.unreadCount) > 9 ? '9+' : friend.unreadCount}</span> : <ChatCircleText size={18} />) : friend.direction === 'incoming' && <span className="inline-actions"><IconButton icon={Check} label="Đồng ý" onClick={() => accept(friend)} /><IconButton icon={X} label="Từ chối" onClick={() => reject(friend)} /></span>}</div>) : <p className="muted">Chưa có kết nối nào.</p>}</div></aside><main className="chat-workspace">{selectedFriend ? <><div className="chat-header"><button type="button" className="chat-avatar-wrap avatar-clickable" onClick={() => setProfileViewer(selectedFriend)}><img src={selectedFriend.avatar || '/artwork/sleeve.webp'} alt="" />{selectedActivity.online && <span className="online-dot large" />}</button><div><strong>{selectedFriend.name} <em className="friend-public-id">{selectedFriend.publicId}</em></strong><span>{selectedActivity.text}</span></div><IconButton icon={ArrowsClockwise} label="Tải lại tin nhắn" onClick={() => loadChat(selectedFriend)} /><IconButton icon={X} label="Đóng chat" className="chat-close-mobile" onClick={() => { setSelectedFriend(null); setChat([]); setReplyTo(null); setAttachmentFile(null); }} /></div><div className="chat-log expanded" ref={chatLogRef}>{chat.length ? chat.map(message => { const isMine = message.senderId === me.id; const repliedMsg = message.replyTo ? chat.find(m => m.id === message.replyTo) : null; const replyAuthor = repliedMsg ? (repliedMsg.senderId === me.id ? 'Bạn' : (selectedFriend?.name || 'Bạn bè')) : ''; const replyPreview = repliedMsg ? (repliedMsg.message || repliedMsg.attachmentName || 'Tệp đính kèm') : 'Tin nhắn cũ'; return <div id={`chat-message-${message.id}`} className={`chat-message-row ${isMine ? 'mine' : ''}`} key={message.id}>
  <div className="message-content">
    {isMine && (
      <>
        <div className="message-actions">
          <button type="button" onClick={() => setReplyTo(message)}><ChatCircleText size={16} /></button>
          <button type="button" onClick={() => { if (window.confirm('Bạn có chắc chắn muốn xóa tin nhắn này?')) { deleteChatMessage(message.id); } }}><Trash size={16} /></button>
        </div>
        <div className="message-bubble">
          {repliedMsg && <button type="button" className="reply-quote" onClick={() => jumpToMessage(repliedMsg.id)}><span className="reply-quote-bar" /><div className="reply-quote-content"><strong className="reply-quote-author">{replyAuthor}</strong>{isImageAttachment(repliedMsg) ? <span className="reply-image-preview"><img className="reply-thumb" src={repliedMsg.attachment} alt={repliedMsg.attachmentName || 'Ảnh được phản hồi'} /><span>Ảnh được phản hồi</span></span> : <span className="reply-quote-text">{shortText(replyPreview)}</span>}</div></button>}
          {message.message && <p>{message.message}</p>}
          {message.attachment && (isImageAttachment(message) ? <button type="button" className="chat-image-button" onClick={() => setImageViewer({ src: message.attachment, name: message.attachmentName || 'Ảnh đính kèm' })}><img src={message.attachment} alt={message.attachmentName || 'Ảnh đính kèm'} /></button> : <a href={message.attachment} target="_blank" rel="noreferrer">{message.attachmentName || 'Tệp đính kèm'}</a>)}
          {message.reaction && <span className="reaction">{message.reaction}</span>}
        </div>
      </>
    )}
    {!isMine && (
      <>
        <div className="message-bubble">
          {repliedMsg && <button type="button" className="reply-quote" onClick={() => jumpToMessage(repliedMsg.id)}><span className="reply-quote-bar" /><div className="reply-quote-content"><strong className="reply-quote-author">{replyAuthor}</strong>{isImageAttachment(repliedMsg) ? <span className="reply-image-preview"><img className="reply-thumb" src={repliedMsg.attachment} alt={repliedMsg.attachmentName || 'Ảnh được phản hồi'} /><span>Ảnh được phản hồi</span></span> : <span className="reply-quote-text">{shortText(replyPreview)}</span>}</div></button>}
          {message.message && <p>{message.message}</p>}
          {message.attachment && (isImageAttachment(message) ? <button type="button" className="chat-image-button" onClick={() => setImageViewer({ src: message.attachment, name: message.attachmentName || 'Ảnh đính kèm' })}><img src={message.attachment} alt={message.attachmentName || 'Ảnh đính kèm'} /></button> : <a href={message.attachment} target="_blank" rel="noreferrer">{message.attachmentName || 'Tệp đính kèm'}</a>)}
          {message.reaction && <span className="reaction">{message.reaction}</span>}
        </div>
        <div className="message-actions reply-only">
          <button type="button" onClick={() => setReplyTo(message)}><ChatCircleText size={16} /></button>
        </div>
      </>
    )}
  </div>
  <div className="message-time">{new Date(message.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}, {new Date(message.createdAt).toLocaleDateString('vi-VN')}</div>
</div>; }) : <p className="muted">Chưa có tin nhắn. Gửi một lời chào nhé.</p>}</div><form className="chat-compose expanded" onSubmit={sendChat}>{replyTo && <span className="compose-chip reply-chip">{isImageAttachment(replyTo) && <img className="compose-thumb" src={replyTo.attachment} alt="" />}<span>Đang trả lời <strong>{replyTo.senderId === me.id ? 'chính bạn' : selectedFriend?.name}</strong>: <em>{replyTo.message ? shortText(replyTo.message) : isImageAttachment(replyTo) ? 'Ảnh' : (replyTo.attachmentName || 'Tệp đính kèm')}</em></span><button type="button" onClick={() => setReplyTo(null)}>×</button></span>}{attachmentFile && <span className="compose-chip file-chip"><span>📷 {attachmentFile.name}</span><button type="button" onClick={() => { setAttachmentFile(null); if (fileRef.current) fileRef.current.value = ''; }}>×</button></span>}<IconButton icon={Image} label="Gửi ảnh" onClick={() => fileRef.current?.click()} /><input ref={fileRef} name="attachment" type="file" accept="image/jpeg,image/png,image/webp,image/*" hidden onChange={e => setAttachmentFile(e.target.files?.[0] || null)} /><input name="message" maxLength={2000} placeholder="Viết một lời nhắn…" autoComplete="off" /><button className="button primary" disabled={busy}><PaperPlaneTilt size={18} /></button></form></> : <div className="empty-state compact"><ChatCircleText size={34} /><p>Chọn một người bạn để bắt đầu trò chuyện.</p></div>}</main><aside className="posts-sidebar"><div className="community-card"><div className="eyebrow"><MusicNotes size={15} /> BÀI ĐÃ ĐĂNG</div>{myTracks.length ? myTracks.map(track => <div className="mini-post" key={track.id}><img src={trackCover(track)} alt="" /><span><strong>{track.title}</strong><small>{track.genre} · {track.visibility === 'self' ? 'Chỉ mình tôi' : 'Bạn bè'} · {time(track.duration)}</small></span></div>) : <p className="muted">Chưa có bài hát nào.</p>}</div><div className="community-card"><div className="eyebrow"><Heart size={15} /> KỶ NIỆM</div>{myPhotos.length ? myPhotos.map(photo => <div className="mini-post" key={photo.id}><img src={photo.image} alt="" /><span><strong>{photo.title}</strong><small>{photo.category} · {photo.visibility === 'self' ? 'Chỉ mình tôi' : 'Bạn bè'}</small></span></div>) : <p className="muted">Chưa có kỷ niệm nào.</p>}</div></aside></section>{error && <p className="form-error community-error">{error}</p>}{imageViewer && <Modal title={imageViewer.name} onClose={() => setImageViewer(null)} className="chat-image-modal"><img className="chat-lightbox-image" src={imageViewer.src} alt={imageViewer.name} /><a className="button secondary wide" href={imageViewer.src} target="_blank" rel="noreferrer">Mở ảnh gốc</a></Modal>}{profileViewer && <Modal title={profileViewer.self ? 'Hồ sơ của bạn' : 'Thông tin bạn bè'} onClose={() => setProfileViewer(null)} className="profile-info-modal"><ProfileCard user={profileViewer} activity={profileViewer.self ? activityStatus(me?.lastActiveAt, clock) : activityStatus(profileViewer.lastActiveAt, clock)} isSelf={profileViewer.self} onImage={setImageViewer} /></Modal>}
    {composer === 'profile' && <Modal title="Chỉnh hồ sơ" onClose={() => !busy && setComposer(null)}><form className="editor-form" onSubmit={saveProfile}><label>Tên hiển thị<input name="name" required maxLength={80} defaultValue={me.name} /></label><label>ID cá nhân<input name="publicId" required pattern="#[0-9]{4}" maxLength={5} defaultValue={me.publicId || ''} title="ID có dạng # và 4 chữ số (ví dụ: #1234)" /></label><p className="form-footnote">Nếu ID bị trùng, hệ thống sẽ báo để bạn chọn 4 số khác.</p><label>Bio / Giới thiệu<textarea name="bio" maxLength={280} rows={4} defaultValue={me.bio || ''} placeholder="Viết vài dòng về bạn, gu nhạc, điều bạn thích..." /></label><label>Avatar<input name="avatar" type="file" accept={imageAccept} /></label><button className="button primary wide" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu hồ sơ'}</button></form></Modal>}
    {composer === 'track' && <Modal title="Đăng một bài hát" onClose={() => !busy && setComposer(null)}><form className="editor-form" onSubmit={submitTrack}><label>Tên bài hát<input name="title" required maxLength={120} autoComplete="off" /></label><label>Nghệ sĩ<input name="artist" maxLength={120} placeholder="Có thể để trống" autoComplete="off" /></label><div style={{ position: 'relative' }}><label>Thể loại tự thêm<input name="genre" required maxLength={50} value={genreDraft} onChange={e => setGenreDraft(e.target.value)} placeholder="Ví dụ: lofi, ballad, tự thu..." autoComplete="off" onFocus={() => setGenreFocus(true)} onBlur={() => setGenreFocus(false)} /></label><SuggestionChips items={genreSuggestions} onPick={v => { setGenreDraft(v); setGenreFocus(false); }} visible={genreFocus} /></div><label>Hiển thị<select name="visibility" defaultValue="self"><option value="self">Chỉ mình tôi</option><option value="friends">Bạn bè đã kết bạn</option></select></label><label className="file-field"><MusicNotes size={24} /><strong>File âm thanh</strong><span>MP3, WAV, OGG, FLAC, M4A · tối đa 50 MB</span><input name="audio" type="file" accept={audioAccept} required /></label><label>Ảnh bìa<input name="cover" type="file" accept={imageAccept} /></label><p className="form-footnote">Chỉ đăng file bạn sở hữu hoặc được phép chia sẻ.</p><button className="button primary wide" disabled={busy}>{busy ? 'Đang đăng…' : 'Chia sẻ bài hát'}</button></form></Modal>}
    {composer === 'photo' && <Modal title="Đăng một kỷ niệm" onClose={() => !busy && setComposer(null)}><form className="editor-form" onSubmit={submitPhoto}><label>Tiêu đề<input name="title" required maxLength={120} autoComplete="off" /></label><div style={{ position: 'relative' }}><label>Danh mục tự thêm<input name="category" required maxLength={50} value={categoryDraft} onChange={e => setCategoryDraft(e.target.value)} placeholder="Ví dụ: du lịch, bạn bè, sinh nhật..." autoComplete="off" onFocus={() => setCategoryFocus(true)} onBlur={() => setCategoryFocus(false)} /></label><SuggestionChips items={categorySuggestions} onPick={v => { setCategoryDraft(v); setCategoryFocus(false); }} visible={categoryFocus} /></div><label>Hiển thị<select name="visibility" defaultValue="self"><option value="self">Chỉ mình tôi</option><option value="friends">Bạn bè đã kết bạn</option></select></label><label>Ảnh<input name="image" type="file" accept={imageAccept} required /></label><label>Địa điểm<input name="location" maxLength={150} autoComplete="off" /></label><label>Câu chuyện nhỏ<textarea name="caption" maxLength={1000} rows={3} /></label><label>Ngày<input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label><button className="button primary wide" disabled={busy}>{busy ? 'Đang đăng…' : 'Chia sẻ kỷ niệm'}</button></form></Modal>}
    {composer === 'camera' && <Modal title={cameraStep === 'details' ? 'Thêm nội dung kỷ niệm' : 'Chụp một kỷ niệm'} onClose={closeCameraComposer} className={`camera-modal ${isMobileCamera ? 'camera-mobile-flow' : ''} camera-step-${cameraStep}`}>
      <form className="editor-form camera-form" onSubmit={submitCameraPhoto}>
        <div className="camera-capture-panel">
          <div className="camera-stage" onPointerUp={focusCamera}>
            {cameraPreview ? <img src={cameraPreview} alt="Ảnh vừa chụp" /> : <video ref={cameraVideoRef} autoPlay playsInline muted />}
            {!cameraStream && !cameraPreview && <div className="camera-placeholder"><Camera size={34} /><span>Camera chưa mở. Hãy cấp quyền camera rồi thử lại.</span></div>}
            {cameraStream && !cameraPreview && <span className="camera-focus-hint">Chạm vào ảnh để lấy nét</span>}
            <canvas ref={cameraCanvasRef} hidden />
          </div>
          <div className="camera-actions">
            {cameraPreview ? <>
              <button type="button" className="button secondary" onClick={retakeCameraPhoto}>Chụp lại</button>
              {isMobileCamera && cameraStep === 'review' && <button type="button" className="button primary" onClick={() => setCameraStep('details')}>Dùng ảnh này</button>}
            </> : <>
              <button type="button" className="button secondary" onClick={flipCamera}><ArrowsClockwise size={17} /> Đổi camera</button>
              <button type="button" className="button primary" onClick={captureCameraPhoto}><Camera size={17} /> Chụp ảnh</button>
            </>}
          </div>
        </div>
        {(!isMobileCamera || cameraStep === 'details') && <div className="camera-details-panel">
          {isMobileCamera && cameraPreview && <button type="button" className="text-button camera-back" onClick={() => setCameraStep('review')}>← Quay lại xem ảnh / chụp lại</button>}
          {cameraPreview && <button type="button" className="camera-small-preview" onClick={() => setCameraStep('review')}><img src={cameraPreview} alt="Ảnh đã chọn" /><span>Xem ảnh đã chụp</span></button>}
          <label>Tiêu đề<input name="title" required maxLength={120} placeholder="Ví dụ: Một buổi chiều thật đẹp" autoComplete="off" /></label>
          <div style={{ position: 'relative' }}><label>Danh mục tự thêm<input name="category" required maxLength={50} value={categoryDraft} onChange={e => setCategoryDraft(e.target.value)} placeholder="Ví dụ: du lịch, bạn bè, sinh nhật..." autoComplete="off" onFocus={() => setCategoryFocus(true)} onBlur={() => setCategoryFocus(false)} /></label>
          <SuggestionChips items={categorySuggestions} onPick={v => { setCategoryDraft(v); setCategoryFocus(false); }} visible={categoryFocus} /></div>
          <label>Hiển thị<select name="visibility" defaultValue="self"><option value="self">Chỉ mình tôi</option><option value="friends">Bạn bè đã kết bạn</option></select></label>
          <label>Địa điểm<input name="location" maxLength={150} autoComplete="off" /></label>
          <label>Câu chuyện nhỏ<textarea name="caption" maxLength={1000} rows={3} /></label>
          <label>Ngày<input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
          <button className="button primary wide" disabled={busy || !cameraPhoto}>{busy ? 'Đang đăng…' : 'Đăng kỷ niệm từ camera'}</button>
          <p className="form-footnote">Camera hoạt động trên HTTPS như link Vercel hoặc trên localhost. Ảnh sau khi đăng sẽ hiển thị trong Kỷ niệm như ảnh upload thường.</p>
        </div>}
      </form>
    </Modal>}
  </>;
}
