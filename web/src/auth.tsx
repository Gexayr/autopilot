import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, Me, PublicConfig, setUnauthorizedHandler, token } from './api';
import { lang, onLangChange, setLang, t } from './i18n';
import { tgApp } from './telegram';

interface AuthState {
  me: Me | null;
  config: PublicConfig | null;
  loading: boolean;
  setSession: (s: { token: string; user: Me }) => void;
  refresh: () => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState>(null as any);

// the profile keeps the language, so the bot writes in it too
const saveLang = (language: string) => token.get() && api('me', { method: 'PATCH', body: { language } }).catch(() => undefined);
onLangChange(saveLang);

/** The profile wins (it may have been changed in the bot with /language); a new profile takes this device's language. */
function syncLang(user: Me) {
  if (!user.language) saveLang(lang());
  else if (user.language !== lang()) setLang(user.language);
}
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    token.set(null);
    setMe(null);
  }, []);

  const refresh = useCallback(async () => {
    const user = await api<Me>('me');
    setMe(user);
    syncLang(user);
  }, []);

  const setSession = useCallback((s: { token: string; user: Me }) => {
    token.set(s.token);
    setMe(s.user);
    syncLang(s.user);
  }, []);

  // re-read on focus: server settings (e.g. Instagram keys) may change while the tab / Mini App stays open
  const loadConfig = useCallback(() => {
    api<PublicConfig>('config').then(setConfig)
      .catch(() => setConfig((c) => c ?? { botUsername: null, googleClientId: null, instagramReady: false }));
  }, []);
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && loadConfig();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadConfig]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    (async () => {
      loadConfig();
      try {
        const app = tgApp();
        if (app) { // Mini App: Telegram vouches for the user, no login screen
          app.ready();
          app.expand();
          setSession(await api('auth/webapp', { body: { initData: app.initData } }));
        } else if (token.get()) {
          await refresh();
        }
      } catch {
        if (!tgApp()) token.set(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [logout, refresh, setSession, loadConfig]);

  return <Ctx.Provider value={{ me, config, loading, setSession, refresh, logout }}>{children}</Ctx.Provider>;
}

/** Login (or linking) through the bot: open t.me link, poll until the user pressed Start. */
export async function telegramLogin(mode: 'login' | 'link', open: (url: string) => void, signal: AbortSignal) {
  const base = mode === 'login' ? 'auth/telegram' : 'me/link/telegram';
  const { nonce, url } = await api<{ nonce: string; url: string }>(`${base}/start`, { body: {} });
  open(url);
  const until = Date.now() + 10 * 60_000;
  while (Date.now() < until && !signal.aborted) {
    await new Promise((r) => setTimeout(r, 2000));
    const r = await api<{ pending?: boolean; token?: string; user?: Me }>(`${base}/poll`, { body: { nonce } });
    if (r.token) return r as { token: string; user: Me };
  }
  throw new Error(signal.aborted ? t('login.cancelled') : t('login.timeout'));
}

/** Google Identity Services button; calls back with an ID token. */
export function loadGoogle(clientId: string, el: HTMLElement, onToken: (idToken: string) => void) {
  const render = () => {
    const g = (window as any).google?.accounts?.id;
    if (!g) return;
    g.initialize({ client_id: clientId, callback: (r: { credential: string }) => onToken(r.credential) });
    g.renderButton(el, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: lang(), width: 280 });
  };
  if ((window as any).google?.accounts?.id) return render();
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.onload = render;
  document.head.appendChild(s);
}
