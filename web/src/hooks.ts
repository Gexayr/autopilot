import { notifications } from '@mantine/notifications';
import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { t } from './i18n';
import { errText } from './util';

/** Load data on mount / when deps change; `reload()` refetches quietly; optional polling. */
export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList = [], pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void reload();
    if (!pollMs) return;
    const t = setInterval(() => document.visibilityState === 'visible' && void reload(), pollMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload, setData };
}

/** Wrap an action: busy flag + error toast + optional success toast. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    setBusy(key);
    try {
      const r = await fn();
      if (ok) notifications.show({ message: ok, color: 'green' });
      return r;
    } catch (e) {
      notifications.show({ title: t('common.failed'), message: errText(e), color: 'red' });
      return undefined;
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, run };
}
