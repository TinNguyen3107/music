import React, { useEffect, useMemo, useState } from 'react';
import { DownloadSimple, X } from '@phosphor-icons/react';
import { IconButton } from './shared.jsx';

export function InstallAppPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [standalone, setStandalone] = useState(false);

  const isIos = useMemo(() => /iphone|ipad|ipod/i.test(navigator.userAgent || ''), []);

  useEffect(() => {
    const updateStandalone = () => setStandalone(
      window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
    );
    const onBeforeInstallPrompt = event => {
      event.preventDefault();
      setInstallEvent(event);
    };
    const onInstalled = () => {
      setStandalone(true);
      setInstallEvent(null);
      setCollapsed(false);
    };
    updateStandalone();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (standalone || (!installEvent && !isIos)) return null;

  async function install() {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    setInstallEvent(null);
  }

  if (collapsed) {
    return <button type="button" className="install-app-dock" onClick={() => setCollapsed(false)} aria-label="Mở hướng dẫn cài MIUZIG">
      <DownloadSimple size={19} />
      <span>Cài app</span>
    </button>;
  }

  return <aside className="install-app-prompt" aria-label="Cài MIUZIG">
    <div>
      <strong>Cài MIUZIG trên điện thoại</strong>
      <span>{isIos && !installEvent ? 'iPhone: bấm Chia sẻ → Thêm vào Màn hình chính.' : 'Mở nhanh như app, dùng camera để chụp kỷ niệm.'}</span>
    </div>
    {installEvent && <button type="button" className="button primary" onClick={install}><DownloadSimple size={17} /> Cài app</button>}
    <IconButton icon={X} label="Thu gọn gợi ý cài app" onClick={() => setCollapsed(true)} />
  </aside>;
}
