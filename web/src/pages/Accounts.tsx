import { Alert, Anchor, Avatar, Badge, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { Account, api } from '../api';
import InstagramConnect, { ATTEMPT_KEY, RETURN_KEY } from '../components/InstagramConnect';
import { useAction, useLoad } from '../hooks';
import { t, tn } from '../i18n';
import { dayjs, fmtNum } from '../util';


export default function Accounts() {
  const list = useLoad(() => api<Account[]>('accounts'));
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const { busy, run } = useAction();

  useEffect(() => {
    const connected = params.get('connected');
    const error = params.get('error');
    if (connected) notifications.show({ color: 'green', title: t('accounts.done'), message: t('accounts.connected', { name: connected }) });
    if (error) notifications.show({ color: 'red', title: t('accounts.notConnected'), message: error, autoClose: false });
    if (connected || error) setParams({}, { replace: true });
    let back: string | null = null;
    try {
      back = localStorage.getItem(RETURN_KEY);
      localStorage.removeItem(RETURN_KEY);
      if (connected) localStorage.removeItem(ATTEMPT_KEY);
    } catch { /* ignore */ }
    if (connected && back) nav(back, { replace: true });
  }, [params, setParams, nav]);

  const remove = (a: Account) => confirm(t('accounts.disconnectConfirm', { name: a.username })) && run(`d${a.id}`, async () => {
    await api(`accounts/${a.id}`, { method: 'DELETE' });
    await list.reload();
  }, t('accounts.disconnected'));

  return (
    <Stack>
      <Title order={2}>{t('accounts.title')}</Title>
      <Card withBorder><InstagramConnect hasAccounts={!!list.data?.length} /></Card>
      {list.loading && <Loader />}
      {list.error && <Alert color="red">{list.error}</Alert>}
      {list.data?.map((a) => {
        const days = a.tokenExpiresAt ? dayjs(a.tokenExpiresAt).diff(dayjs(), 'day') : null;
        return (
          <Card key={a.id} withBorder>
            <Group justify="space-between" wrap="wrap" gap="sm">
              <Group wrap="nowrap" style={{ minWidth: 0 }}>
                <Avatar src={a.avatarUrl} radius="xl" size="lg">{a.username.slice(0, 1)}</Avatar>
                <div>
                  <Anchor href={`https://instagram.com/${a.username}`} target="_blank" fw={600}>@{a.username}</Anchor>
                  <Text size="sm" c="dimmed">{tn('accounts.followers', a.followers ?? 0, { n: fmtNum(a.followers) })} · {tn('accounts.posts', a.mediaCount ?? 0, { n: fmtNum(a.mediaCount) })}</Text>
                  <Group gap={6} mt={4}>
                    {a.pages.map((p) => <Badge key={p.id} variant="light">{p.title}</Badge>)}
                    {days != null && <Badge color={days < 10 ? 'red' : 'gray'} variant="outline">{t('accounts.tokenDays', { n: days })}</Badge>}
                  </Group>
                  {a.lastError && <Text size="xs" c="red" mt={4}>{a.lastError}</Text>}
                </div>
              </Group>
              <Button variant="subtle" color="red" size="xs" leftSection={<IconTrash size={14} />} loading={busy === `d${a.id}`}
                disabled={a.pages.length > 0} title={a.pages.length ? t('accounts.removeRubricsFirst') : ''} onClick={() => remove(a)}>{t('accounts.disconnect')}</Button>
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}
