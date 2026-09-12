import React, { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';
export const time = seconds => `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`;
export async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Không thể kết nối. Vui lòng thử lại.');
  return data;
}
export const stored = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
export function IconButton({ icon: Icon, label, active, className = '', ...props }) {
  return <button type="button" className={`icon-button ${active ? 'active' : ''} ${className}`} title={label} aria-label={label} {...(active !== undefined ? { 'aria-pressed': active } : {})} {...props}><Icon size={19} weight={active ? 'fill' : 'regular'} /></button>;
}
export function Modal({ title, onClose, children, className = '' }) {
  const dialog = useRef(null), closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => { const el = dialog.current; el.showModal(); const handle = event => { event.preventDefault(); closeRef.current(); }; el.addEventListener('cancel', handle); return () => { el.removeEventListener('cancel', handle); el.close(); }; }, []);
  return <dialog ref={dialog} className={`modal ${className}`} aria-label={title} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-header"><h2>{title}</h2><IconButton icon={X} label="Đóng" onClick={onClose} /></div>{children}</dialog>;
}
