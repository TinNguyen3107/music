import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, ArrowDown, CalendarBlank, CircleNotch, Clock, Eye, EyeSlash, LockKey, ChatCircle, NotePencil, SignOut, Sparkle, UserCircle, UsersThree } from '@phosphor-icons/react';
import { api, Modal } from './shared.jsx';

const activeWindowMs = 60 * 1000;

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Chưa rõ';
  return date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function activityText(value) {
  const time = Date.parse(value || '');
  if (!Number.isFinite(time)) return { online: false, text: 'Chưa hoạt động' };
  const diff = Math.max(0, Date.now() - time);
  if (diff < activeWindowMs) return { online: true, text: 'Đang hoạt động' };
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return { online: false, text: `Hoạt động ${minutes} phút trước` };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { online: false, text: `Hoạt động ${hours} giờ trước` };
  return { online: false, text: `Lần cuối ${new Date(time).toLocaleDateString('vi-VN')}` };
}

function StatCard({ icon: Icon, label, value, note }) {
  return <article className="admin-stat-card">
    <span><Icon size={22} /></span>
    <div>
      <strong>{value}</strong>
      <p>{label}</p>
      {note && <small>{note}</small>}
    </div>
  </article>;
}

export function Admin({ notify, navigate }) {
  const [auth, setAuth] = useState(null);
  const [authError, setAuthError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [query, setQuery] = useState('');
  const [modalType, setModalType] = useState(null);
  const [modalUser, setModalUser] = useState(null);
  const [modalData, setModalData] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  // Password change modal state
  const [changePasswordModal, setChangePasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  // Messages tab state
  const [activeTab, setActiveTab] = useState('users');
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  // Profile dropdown and modal state
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [editName, setEditName] = useState(auth?.name || '');
  const [editEmail, setEditEmail] = useState(auth?.email || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(auth?.avatar || null);

  const check = () => api('/api/auth/me').then(setAuth).catch(error => setAuthError(error.message));

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      setUsers(await api('/api/admin/users'));
    } catch (error) {
      notify?.(error.message);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function loadMessages() {
    setLoadingMessages(true);
    try {
      const data = await api('/api/admin/messages');
      setMessages(data);
    } catch (error) {
      notify?.(error.message);
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => { check(); }, []);
  useEffect(() => { if (auth?.authenticated) loadUsers(); }, [auth?.authenticated]);
  useEffect(() => { if (auth?.authenticated) loadMessages(); }, [auth?.authenticated]);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (profileDropdownOpen) {
        const header = document.querySelector('.admin-header');
        if (header && !header.contains(event.target)) {
          setProfileDropdownOpen(false);
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileDropdownOpen]);

  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setAuthError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/api/auth/${auth.needsSetup ? 'setup' : 'login'}`, { method: 'POST', body: JSON.stringify(values) });
      await check();
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordChange(event) {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Vui lòng điền đầy đủ thông tin');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Mật khẩu mới và xác nhận mật khẩu không khớp');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }

    setChangingPassword(true);
    try {
      await api(`/api/auth/password`, {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Auto-close modal after success
      setTimeout(() => {
        setChangePasswordModal(false);
        setPasswordSuccess(false);
      }, 1500);
    } catch (error) {
      setPasswordError(error.message || 'Đã xảy ra lỗi khi đổi mật khẩu');
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    setProfileError('');
    setProfileSuccess(false);

    if (!editName || !editEmail) {
      setProfileError('Vui lòng điền đầy đủ thông tin');
      return;
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editEmail)) {
      setProfileError('Email không hợp lệ');
      return;
    }

    setProfileLoading(true);
    try {
      // Prepare data for upload
      let formData = new FormData();
      formData.append('name', editName);
      formData.append('email', editEmail);
      if (avatarFile) {
        formData.append('avatar', avatarFile);
      }

      const updatedAuth = await api('/api/auth/profile', {
        method: 'POST',
        body: formData
      });

      // Update auth state with new data
      setAuth(prev => ({
        ...prev,
        ...updatedAuth,
        name: editName,
        email: editEmail,
        avatar: updatedAuth.avatar || prev.avatar
      }));

      // Update preview state
      setAvatarPreview(updatedAuth.avatar || prev.avatar);

      setProfileSuccess(true);

      // Auto-close modal after success
      setTimeout(() => {
        setShowProfileModal(false);
        setProfileSuccess(false);
        // Reset form
        setEditName(auth?.name || '');
        setEditEmail(auth?.email || '');
        setAvatarFile(null);
        setAvatarPreview(auth?.avatar || '/artwork/sleeve.webp');
      }, 1500);
    } catch (error) {
      setProfileError(error.message || 'Đã xảy ra lỗi khi lưu hồ sơ');
    } finally {
      setProfileLoading(false);
    }
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      setAuth({ authenticated: false, needsSetup: false });
      setUsers([]);
      setMessages([]);
    } catch (error) {
      notify?.(error.message);
    }
  }

  const openProfileModal = () => {
    setEditName(auth?.name || '');
    setEditEmail(auth?.email || '');
    setAvatarFile(null);
    setAvatarPreview(auth?.avatar || '/artwork/sleeve.webp');
    setShowProfileModal(true);
    setProfileError('');
    setProfileSuccess('');
  };

  const handleAvatarChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setAvatarFile(file);
      // Preview the image
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const stats = useMemo(() => {
    const today = new Date().toLocaleDateString('vi-VN');
    return {
      total: users.length,
      online: users.filter(user => activityText(user.lastActiveAt).online).length,
      today: users.filter(user => new Date(user.createdAt).toLocaleDateString('vi-VN') === today).length,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter(user => [user.name, user.email, user.publicId].some(value => String(value || '').toLowerCase().includes(term)));
  }, [users, query]);

  const tabClasses = (tab) => `admin-tab ${activeTab === tab ? 'active' : ''}`;

  if (!auth) return <div className="empty-state">{authError ? <><p role="alert">{authError}</p><button className="button secondary" onClick={check}>Thử lại</button></> : <CircleNotch size={30} className="spin" />}</div>;

  if (!auth.authenticated) return <section className="auth-layout">
    <div className="auth-copy">
      <span className="eyebrow"><LockKey size={15} /> MIUZIG STUDIO</span>
      <h1>Quản lý<br /><span>người dùng.</span></h1>
      <p>Trang này chỉ dành cho quản trị viên để xem tài khoản thành viên, thời gian tạo tài khoản và trạng thái hoạt động.</p>
      <img src="/artwork/desk.webp" alt="Góc quản trị MIUZIG" />
    </div>
    <form className="auth-form" onSubmit={signIn}>
      <span className="genre-label">QUẢN TRỊ VIÊN</span>
      <h2>{auth.needsSetup ? 'Tạo tài khoản quản trị' : 'Chào mừng trở lại.'}</h2>
      <p>{auth.needsSetup ? 'Thiết lập một lần để quản lý người dùng MIUZIG.' : 'Đăng nhập bằng tài khoản quản trị.'}</p>
      <label>Email<input type="email" name="email" required autoComplete="username" maxLength={254} placeholder="admin@gmail.com" /></label>
      <label className="password-field">Mật khẩu<span className="password-input"><input type={showPassword ? 'text' : 'password'} name="password" required minLength={auth.needsSetup ? 6 : 1} maxLength={128} autoComplete={auth.needsSetup ? 'new-password' : 'current-password'} placeholder={auth.needsSetup ? 'Ít nhất 6 ký tự' : 'Mật khẩu quản trị'} /><button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeSlash size={19} /> : <Eye size={19} />}</button></span></label>
      {auth.needsSetup && auth.requiresSetupToken && <label className="password-field">Mã thiết lập<span className="password-input"><input type={showPassword ? 'text' : 'password'} name="setupToken" required autoComplete="one-time-code" placeholder="Mã chỉ dùng cho lần thiết lập đầu" /><button type="button" aria-label={showPassword ? 'Ẩn mã thiết lập' : 'Hiện mã thiết lập'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeSlash size={19} /> : <Eye size={19} />}</button></span></label>}
    {authError && <p className="form-error" role="alert">{authError}</p>}
      <button className="button primary wide" disabled={busy}>{busy ? <CircleNotch className="spin" size={18} /> : <LockKey size={18} />}{auth.needsSetup ? 'Tạo tài khoản & bắt đầu' : 'Đăng nhập quản trị'}<ArrowRight size={17} /></button>
      <a className="auth-community-link" href="/community">Bạn là thành viên? Vào Góc của bạn</a>
    </form>
  </section>;

  const renderModal = () => {
    if (!modalType) return null;

    return (
      <Modal
        title={modalType === 'tracks' ? 'Bài hát của ' + modalUser.name : 'Kỷ niệm của ' + modalUser.name}
        onClose={() => {
          setModalType(null);
          setModalUser(null);
          setModalData([]);
        }}
        className="admin-modal"
      >
        {modalLoading ? (
          <div className="empty-state">
            <CircleNotch className="spin" size={30} />
          </div>
        ) : (
          modalData.length ? (
            <div className="admin-modal-content">
              {modalType === 'tracks' ? (
                modalData.map(track => (
                  <div key={track.id} className="admin-modal-item">
                    <div className="admin-modal-item-info">
                      <strong>{track.title}</strong> - {track.artist || 'N/A'}
                      <br />
                      <small>Thể loại: {track.genre}</small>
                    </div>
                    {track.cover && (
                      <img
                        src={track.cover}
                        alt={track.title}
                        className="admin-modal-item-cover"
                      />
                    )}
                  </div>
                ))
              ) : (
                modalData.map(photo => (
                  <div key={photo.id} className="admin-modal-item">
                    <div className="admin-modal-item-info">
                      <strong>{photo.title}</strong>
                      <br />
                      <small>Danh mục: {photo.category}</small>
                      <br />
                      <small>Ngày: {new Date(photo.date).toLocaleDateString('vi-VN')}</small>
                    </div>
                    <img
                      src={photo.image}
                      alt={photo.title}
                      className="admin-modal-item-image"
                    />
                  </div>
                ))
              )}
            </div>
          ) : (
            <p>Không có dữ liệu.</p>
          )
        )}
      </Modal>
    );
  };

  const renderPasswordChangeModal = () => {
    if (!changePasswordModal) return null;

    return (
      <Modal
        title="Đổi mật khẩu quản trị"
        onClose={() => {
          setChangePasswordModal(false);
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setPasswordError('');
          setPasswordSuccess(false);
        }}
        className="admin-modal"
      >
        {changingPassword ? (
          <div className="empty-state">
            <CircleNotch className="spin" size={30} />
            <p>Đang đổi mật khẩu...</p>
          </div>
        ) : (
          <form className="admin-form" onSubmit={handlePasswordChange}>
            <label className="password-field">Mật khẩu hiện tại<span className="password-input"><input
                type={showPassword ? 'text' : 'password'}
                name="currentPassword"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                minLength={6}
                maxLength={128}
                autoComplete="current-password"
                placeholder="Nhập mật khẩu hiện tại"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeSlash size={19} /> : <Eye size={19} />}
              </button></span></label>
            {passwordError && <p className="form-error" role="alert">{passwordError}</p>}
            <label className="password-field">Mật khẩu mới<span className="password-input"><input
                type={showPassword ? 'text' : 'password'}
                name="newPassword"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                maxLength={128}
                autoComplete="new-password"
                placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeSlash size={19} /> : <Eye size={19} />}
              </button></span></label>
            <label className="password-field">Xác nhận mật khẩu mới<span className="password-input"><input
                type={showPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                maxLength={128}
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu mới"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeSlash size={19} /> : <Eye size={19} />}
              </button></span></label>
            {passwordSuccess && <p className="form-success" role="status">Đã đổi mật khẩu thành công!</p>}
            <button className="button primary wide" disabled={changingPassword}>
              {changingPassword ? <CircleNotch className="spin" size={18} /> : <LockKey size={18} />}
              Đổi mật khẩu
              <ArrowRight size={17} />
            </button>
            <button className="button secondary" onClick={() => {
              setChangePasswordModal(false);
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
              setPasswordError('');
              setPasswordSuccess(false);
            }}>
              Hủy
            </button>
          </form>
        )}
      </Modal>
    );
  };

  const renderProfileModal = () => {
    if (!showProfileModal) return null;

    return (
      <Modal
        title="Hồ sơ quản trị"
        onClose={() => {
          setShowProfileModal(false);
          setEditName(auth?.name || '');
          setEditEmail(auth?.email || '');
          setAvatarFile(null);
          setAvatarPreview(auth?.avatar || '/artwork/sleeve.webp');
          setProfileError('');
          setProfileSuccess(false);
        }}
        className="admin-modal"
      >
        {profileLoading ? (
          <div className="empty-state">
            <CircleNotch className="spin" size={30} />
            <p>Đang lưu hồ sơ...</p>
          </div>
        ) : (
          <form className="admin-form" onSubmit={handleProfileSave}>
            <div className="avatar-preview">
              <img src={avatarPreview} alt="Avatar preview" className="avatar-preview-image" />
              <input type="file" accept="image/*" onChange={handleAvatarChange} className="avatar-upload-input" />
              <label className="avatar-upload-label" htmlFor="avatar-upload">Thay đổi avatar</label>
            </div>
            {profileError && <p className="form-error" role="alert">{profileError}</p>}
            <div className="form-group">
              <label>Tên</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                required
                placeholder="Nhập tên quản trị"
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                required
                placeholder="Nhập email quản trị"
                className="form-input"
              />
            </div>
            {profileSuccess && <p className="form-success" role="status">Đã lưu hồ sơ thành công!</p>}
            <div className="form-actions">
              <button className="button primary wide" disabled={profileLoading}>
                {profileLoading ? <CircleNotch className="spin" size={18} /> : <LockKey size={18} />}
                Lưu thay đổi
                <ArrowRight size={17} />
              </button>
              <button className="button secondary" onClick={() => {
                setShowProfileModal(false);
                setEditName(auth?.name || '');
                setEditEmail(auth?.email || '');
                setAvatarFile(null);
                setAvatarPreview(auth?.avatar || '/artwork/sleeve.webp');
                setProfileError('');
                setProfileSuccess(false);
              }}>
                Hủy
              </button>
            </div>
          </form>
        )}
      </Modal>
    );
  };

  return (
    <>
      {/* New Admin Header */}
      <header className="admin-header">
        <div className="admin-header-content">
          <div className="admin-logo">
            <a href="/" onClick={e => { e.preventDefault(); navigate('/'); }}>
              MIUZIG<span className="logo-star"><Sparkle size={18} weight="fill" /></span>
            </a>
          </div>
          <div className="admin-header-actions">
            <button className="admin-header-button" onClick={() => setActiveTab('users')}>
              <UsersThree size={18} /> Quản trị người dùng
            </button>
            <button className="admin-header-button" onClick={() => setActiveTab('messages')}>
              <ChatCircle size={18} /> Tin nhắn
            </button>
            <div className="admin-profile-dropdown" onClick={(e) => { e.stopPropagation(); setProfileDropdownOpen(!profileDropdownOpen); }}>
              <img src={auth.avatar || '/artwork/sleeve.webp'} alt={auth.name} className="admin-avatar" />
              <div className="admin-profile-info">
                <span className="admin-name">{auth.name}</span>
                <span className="admin-email">{auth.email}</span>
              </div>
              <ArrowDown size={14} className="admin-dropdown-arrow" />
            </div>
          </div>
        </div>
        {profileDropdownOpen && (
          <div className="admin-profile-dropdown-menu">
            <div className="admin-profile-dropdown-item" onClick={openProfileModal}>
              <img src={auth.avatar || '/artwork/sleeve.webp'} alt={auth.name} className="admin-dropdown-avatar" />
              <span>{auth.name}</span>
            </div>
            <div className="admin-profile-dropdown-item" onClick={openProfileModal}>
              Hồ sơ
            </div>
            <div className="admin-profile-dropdown-item" onClick={handleLogout}>
              Đăng xuất
            </div>
          </div>
        )}
      </header>

      {/* Admin Content Tabs (now as buttons in header, so we remove the old tab container) */}
      {/* Content area */}
      <div className="admin-content">
        {activeTab === 'users' ? (
          <div className="admin-users-dashboard">
            <section className="admin-stats">
              <StatCard icon={UsersThree} label="Tài khoản đã tạo" value={stats.total} note="Tổng số thành viên" />
              <StatCard icon={Clock} label="Đang hoạt động" value={stats.online} note="Trong khoảng 1 phút gần đây" />
              <StatCard icon={CalendarBlank} label="Tạo hôm nay" value={stats.today} note={new Date().toLocaleDateString('vi-VN')} />
            </section>

            <section className="admin-panel admin-users-panel">
              <div className="admin-toolbar">
                <div>
                  <h2>Người dùng <span>{filteredUsers.length}</span></h2>
                  <p>Xem ai đã tạo tài khoản, tạo lúc nào và hoạt động gần nhất.</p>
                </div>
                <div className="admin-user-tools">
                  <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm tên, email hoặc ID..." />
                  <button className="button secondary" onClick={loadUsers} disabled={loadingUsers}>{loadingUsers ? <CircleNotch className="spin" size={17} /> : 'Tải lại'}</button>
                </div>
              </div>

              {loadingUsers && !users.length ? (
                <div className="empty-state">
                  <CircleNotch className="spin" size={30} />
                  <p>Đang tải người dùng…</p>
                </div>
              ) : filteredUsers.length ? (
                <div className="admin-users-table-wrap">
                  <table className="admin-users-table">
                    <thead>
                      <tr>
                        <th>Người dùng</th>
                        <th>Email</th>
                        <th>Ngày tạo</th>
                        <th>Hoạt động</th>
                        <th>ID Công khai</th>
                        <th>Bài hát</th>
                        <th>Kỷ niệm</th>
                        <th>Bạn bè</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map(user => {
                        const activity = activityText(user.lastActiveAt);
                        return (
                          <tr key={user.id}>
                            <td>
                              <span className="admin-user-cell">
                                <img src={user.avatar || '/artwork/sleeve.webp'} alt="" />
                                <span>
                                  <strong>{user.name}</strong>
                                  <small>{user.publicId || '#0000'}</small>
                                </span>
                              </span>
                            </td>
                            <td>{user.email}</td>
                            <td>{formatDate(user.createdAt)}</td>
                            <td>
                              <span className={`admin-status ${activity.online ? 'online' : ''}`}>
                                {activity.text}
                              </span>
                            </td>
                            <td>{user.publicId || '#0000'}</td>
                            <td
                              onClick={() => {
                                setModalType('tracks');
                                setModalUser(user);
                                setModalLoading(true);
                                api(`/api/admin/users/${user.id}/tracks`)
                                  .then(data => {
                                    setModalData(data);
                                    setModalLoading(false);
                                  })
                                  .catch(err => {
                                    notify?.(err.message);
                                    setModalLoading(false);
                                  })
                              }}
                            >
                              {Number(user.trackcount || user.trackCount || 0)}
                            </td>
                            <td
                              onClick={() => {
                                setModalType('photos');
                                setModalUser(user);
                                setModalLoading(true);
                                api(`/api/admin/users/${user.id}/photos`)
                                  .then(data => {
                                    setModalData(data);
                                    setModalLoading(false);
                                  })
                                  .catch(err => {
                                    notify?.(err.message);
                                    setModalLoading(false);
                                  })
                              }}
                            >
                              {Number(user.photocount || user.photoCount || 0)}
                            </td>
                            <td>{Number(user.friendcount || user.friendCount || 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <UserCircle size={34} />
                  <h3>Chưa có người dùng phù hợp.</h3>
                  <p>{query ? 'Thử tìm bằng tên, email hoặc ID khác.' : 'Khi thành viên đăng ký, tài khoản sẽ xuất hiện ở đây.'}</p>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="admin-messages-panel">
            <div className="admin-toolbar">
              <div>
                <h2>Tin nhắn <span>{messages.length}</span></h2>
                <p>Những tin nhắn từ khách truy cập qua Sổ lưu bút.</p>
              </div>
              <div className="admin-user-tools">
                <button className="button secondary" onClick={loadMessages} disabled={loadingMessages}>{loadingMessages ? <CircleNotch className="spin" size={17} /> : 'Tải lại'}</button>
              </div>
            </div>

            {loadingMessages && !messages.length ? (
              <div className="empty-state">
                <CircleNotch className="spin" size={30} />
                <p>Đang tải tin nhắn...</p>
              </div>
            ) : messages.length ? (
              <div className="admin-messages-list">
                {messages.map(message => (
                  <div key={message.id} className="admin-message-item">
                    <div className="admin-message-header">
                      <strong>{message.name || 'Khách ẩn danh'}</strong>
                      <span>{new Date(message.createdAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                    {message.email && (
                      <div className="admin-message-email">
                        <a href={`mailto:${message.email}`}>{message.email}</a>
                      </div>
                    )}
                    <div className="admin-message-content">
                      {message.message}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <ChatCircle size={34} />
                <h3>Chưa có tin nhắn nào.</h3>
                <p>Khi khách truy cập để lại tin nhắn qua Sổ lưu bút, tin nhắn sẽ xuất hiện ở đây.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {renderModal()}
      {renderPasswordChangeModal()}
      {renderProfileModal()}
      {/* Global styles for new components */}
      <style>{`
        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 2rem;
          background-color: var(--background, #fff);
          border-bottom: 1px solid var(--border-color, #eee);
        }
        .admin-header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }
        .admin-logo {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .admin-logo a {
          text-decoration: none;
          color: inherit;
          font-weight: bold;
          font-size: 1.5rem;
        }
        .admin-logo .logo-star {
          color: var(--accent, #ff9800);
        }
        .admin-header-actions {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .admin-header-button {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: none;
          border: none;
          color: var(--text-color, #333);
          font-size: 1rem;
          cursor: pointer;
          padding: 0.5rem 1rem;
          border-radius: var(--border-radius, 4px);
          transition: background-color 0.2s;
        }
        .admin-header-button:hover {
          background-color: var(--hover-bg, #f5f5f5);
        }
        .admin-header-button .UsersThree,
        .admin-header-button .ChatCircle {
          color: var(--icon-color, #555);
        }
        .admin-profile-dropdown {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          cursor: pointer;
          padding: 0.5rem;
          border-radius: var(--border-radius, 4px);
          transition: background-color 0.2s;
        }
        .admin-profile-dropdown:hover {
          background-color: var(--hover-bg, #f5f5f5);
        }
        .admin-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid var(--border-color, #ddd);
        }
        .admin-profile-info {
          display: flex;
          flex-direction: column;
          font-size: 0.875rem;
        }
        .admin-name {
          font-weight: 600;
          color: var(--text-color, #333);
        }
        .admin-email {
          color: var(--text-light, #666);
          font-size: 0.75rem;
        }
        .admin-dropdown-arrow {
          transition: transform 0.2s;
        }
        .admin-profile-dropdown.open .admin-dropdown-arrow {
          transform: rotate(180deg);
        }
        .admin-profile-dropdown-menu {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 0.5rem;
          background-color: var(--background, #fff);
          border: 1px solid var(--border-color, #eee);
          border-radius: var(--border-radius, 4px);
          box-shadow: var(--shadow, 0 4px 6px rgba(0,0,0,0.1));
          width: 200px;
          padding: 0.5rem 0;
          z-index: 1000;
        }
        .admin-profile-dropdown-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .admin-profile-dropdown-item:hover {
          background-color: var(--hover-bg, #f5f5f5);
        }
        .admin-dropdown-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          object-fit: cover;
        }
        .admin-content {
          padding: 2rem;
        }
        .avatar-preview {
          text-align: center;
          margin-bottom: 1.5rem;
        }
        .avatar-preview-image {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid var(--border-color, #eee);
          margin-bottom: 0.5rem;
        }
        .avatar-upload-input {
          display: none;
        }
        .avatar-upload-label {
          display: inline-block;
          padding: 0.5rem 1rem;
          background-color: var(--accent, #ff9800);
          color: white;
          border-radius: var(--border-radius, 4px);
          cursor: pointer;
          font-size: 0.875rem;
        }
        .avatar-upload-label:hover {
          background-color: #e68900;
        }
        .form-group {
          margin-bottom: 1rem;
        }
        .form-group label {
          display: block;
          margin-bottom: 0.25rem;
          font-weight: 500;
        }
        .form-input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid var(--border-color, #ddd);
          border-radius: var(--border-radius, 4px);
          font-size: 0.875rem;
        }
        .form-input:focus {
          outline: none;
          border-color: var(--accent, #ff9800);
          box-shadow: 0 0 0 2px rgba(255,152,0,0.2);
        }
        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          margin-top: 2rem;
        }
        .form-success {
          color: var(--success, #4caf50);
          margin: 1rem 0;
        }
        .form-error {
          color: var(--error, #f44336);
          margin: 1rem 0;
        }
      `}</style>
    </>
  );
}