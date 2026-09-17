import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarBlank, CircleNotch, Clock, Eye, EyeSlash, LockKey, SignOut, UserCircle, UsersThree } from '@phosphor-icons/react';
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

export function Admin({ notify }) {
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

  useEffect(() => { check(); }, []);
  useEffect(() => { if (auth?.authenticated) loadUsers(); }, [auth?.authenticated]);

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

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      setAuth({ authenticated: false, needsSetup: false });
      setUsers([]);
    } catch (error) {
      notify?.(error.message);
    }
  }

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

  return (
    <>
      <div className="admin-heading">
        <div>
          <div className="eyebrow">MIUZIG STUDIO</div>
          <h1>Quản lý người dùng.</h1>
        </div>
        <div>
          <button className="button secondary" onClick={() => setChangePasswordModal(true)}>
            <LockKey size={18} /> Đổi mật khẩu
          </button>
          <button className="button secondary" onClick={logout}><SignOut size={18} /> Đăng xuất</button>
        </div>
      </div>

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
                              });
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
      {renderModal()}
{renderPasswordChangeModal()}
    </>
  );
}