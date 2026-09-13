import React, { useEffect, useMemo, useState } from 'react';
import { DownloadSimple, X } from '@phosphor-icons/react';
import { IconButton } from './shared.jsx';

const dismissedKey = 'miuzig.install.dismissed';

export function InstallAppPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissedKey) === '1');
  const [standalone, setStandalone] = useState(false);

  const isIos = useMemo(() => /iphone|ipad|ipod/i.test(navigator.userAgent || ''), []);

  useEffect(() => {
    const updateStandalone = () => setStandalone(
      window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
    );
    const onBeforeInstallPrompt = event => {
      event.preventDefault();
      setInstallEvent(event);
      setDismissed(localStorage.getItem(dismissedKey) === '1');
    };
    const onInstalled = () => {
      setStandalone(true);
      setInstallEvent(null);
      localStorage.setItem(dismissedKey, '1');
    };
    updateStandalone();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (standalone || dismissed || (!installEvent && !isIos)) return null;

  async function install() {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    setInstallEvent(null);
  }

  function close() {
    localStorage.setItem(dismissedKey, '1');
    setDismissed(true);
  }

  return <aside className="install-app-prompt" aria-label="Cài MIUZIG">
    <div>
      <strong>Cài MIUZIG trên điện thoại</strong>
      <span>{isIos && !installEvent ? 'iPhone: bấm Chia sẻ → Thêm vào Màn hình chính.' : 'Mở nhanh như app, dùng camera để chụp kỷ niệm.'}</span>
    </div>
    {installEvent && <button type="button" className="button primary" onClick={install}><DownloadSimple size={17} /> Cài app</button>}
    <IconButton icon={X} label="Ẩn gợi ý cài app" onClick={close} />
  </aside>;
}
