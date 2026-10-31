// Telegram Mini App bridge (script loaded in index.html). Outside Telegram, initData is empty.
declare global {
  interface Window { Telegram?: { WebApp?: any } }
}

export const tgApp = () => {
  const w = window.Telegram?.WebApp;
  return w && w.initData ? w : null;
};

export const inTelegram = () => !!tgApp();

/** Open an external link: inside Telegram, in the system browser (the Mini App would lose its state). */
export function openExternal(url: string) {
  const app = tgApp();
  if (app && url.startsWith('https://t.me/')) return app.openTelegramLink(url);
  if (app) return app.openLink(url);
  window.open(url, '_blank', 'noopener');
}
