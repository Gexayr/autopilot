import { notifications } from '@mantine/notifications';
import { t } from './i18n';

// Bundle name of the running build, e.g. "/assets/index-AbC123.js" (absent in `vite dev`).
const BUNDLE_RE = /\/assets\/index-[\w-]+\.js/;
const current = () => [...document.scripts].map((s) => s.src.match(BUNDLE_RE)?.[0]).find(Boolean);

/** A tab left open across a deploy keeps running old code: check index.html on focus and offer a reload. */
export function watchForUpdates() {
  const mine = current();
  if (!mine) return;
  let shown = false;
  const check = async () => {
    if (shown || document.visibilityState !== 'visible') return;
    const html = await fetch('/', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => '');
    const latest = html.match(BUNDLE_RE)?.[0];
    if (!latest || latest === mine) return;
    shown = true;
    notifications.show({
      id: 'update', color: 'violet', autoClose: false, withCloseButton: true, title: t('update.title'),
      message: t('update.text'), style: { cursor: 'pointer' }, onClick: () => window.location.reload(),
    });
  };
  document.addEventListener('visibilitychange', check);
  setInterval(check, 10 * 60_000);
}
