import { Alert, Button, Text } from '@mantine/core';
import { IconStar } from '@tabler/icons-react';
import { api } from '../api';
import { useAction, useLoad } from '../hooks';
import { t } from '../i18n';

export interface Quota { used: number; limit: number | null }

export const loadQuota = () => api<Quota>('video-quota');

/** "Activate PRO" sends the request to the admins in Telegram. */
export function ProButton({ size = 'sm' }: { size?: 'xs' | 'sm' }) {
  const { busy, run } = useAction();
  return (
    <Button size={size} color="yellow" leftSection={<IconStar size={16} />} loading={busy === 'pro'}
      onClick={() => run('pro', () => api('pro-request', { method: 'POST' }), t('pro.requested'))}>
      {t('pro.activate')}
    </Button>
  );
}

/** Shown on the overview once this month's free AI Reels are used up. */
export function VideoQuotaAlert() {
  const q = useLoad(loadQuota, [], 60_000);
  if (!q.data || q.data.limit === null || q.data.used < q.data.limit) return null;
  return (
    <Alert color="yellow" title={t('pro.limitTitle')}>
      <Text size="sm" mb="sm">{t('pro.limitText', { n: q.data.limit })}</Text>
      <ProButton />
    </Alert>
  );
}

/** One line for the profile card: "AI videos this month: 3 of 5" or PRO. */
export function VideoQuotaLine() {
  const q = useLoad(loadQuota);
  if (!q.data) return null;
  return (
    <Text size="sm" c="dimmed">
      {q.data.limit === null ? t('pro.unlimited') : t('pro.used', { used: q.data.used, limit: q.data.limit })}
    </Text>
  );
}
