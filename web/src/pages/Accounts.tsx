import { Alert, Anchor, Avatar, Badge, Button, Card, Group, List, Loader, Modal, Stack, Text, Title } from '@mantine/core';
import { PageLoader } from '../components/PageLoader';
import { IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
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

  const [removing, setRemoving] = useState<Account | null>(null);
  const remove = (a: Account) => run(`d${a.id}`, async () => {
    await api(`accounts/${a.id}`, { method: 'DELETE' });
    setRemoving(null);
    await list.reload();
  }, t('accounts.disconnected'));

  return (
    <Stack>
      <Modal opened={!!removing} onClose={() => setRemoving(null)} centered
        title={<Text fw={600}>{t('accounts.disconnectConfirm', { name: removing?.username ?? '' })}</Text>}>
        {removing && (
          <Stack gap="md">
            {removing.pages.length > 0 ? (
              <Alert color="red" variant="light">
                <Text size="sm" mb={6}>{t('accounts.willDelete')}</Text>
                <List size="sm" spacing={2}>
                  {removing.pages.map((p) => <List.Item key={p.id}><b>{p.title}</b></List.Item>)}
                </List>
                {removing.queued > 0 && <Text size="sm" mt={6}>{tn('accounts.willDeletePosts', removing.queued)}</Text>}
              </Alert>
            ) : (
              <Text size="sm">{t('accounts.nothingToDelete')}</Text>
            )}
            <Text size="xs" c="dimmed">{t('accounts.publishedStay')}</Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setRemoving(null)}>{t('common.cancel')}</Button>
              <Button color="red" leftSection={<IconTrash size={16} />} loading={busy === `d${removing.id}`} onClick={() => remove(removing)}>
                {removing.pages.length ? t('accounts.disconnectAndDelete') : t('accounts.disconnect')}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
      <Title order={2}>{t('accounts.title')}</Title>
      <Card withBorder><InstagramConnect hasAccounts={!!list.data?.length} /></Card>
      {list.loading && <PageLoader />}
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
                    {a.pages.map((p) => <Badge key={p.id} variant="light" component={RouterLink} to={`/pages/${p.id}`} style={{ cursor: 'pointer' }}>{p.title}</Badge>)}
                    {days != null && <Badge color={days < 10 ? 'red' : 'gray'} variant="outline">{t('accounts.tokenDays', { n: days })}</Badge>}
                  </Group>
                  {a.lastError && <Text size="xs" c="red" mt={4}>{a.lastError}</Text>}
                </div>
              </Group>
              <Button variant="subtle" color="red" size="xs" leftSection={<IconTrash size={14} />} onClick={() => setRemoving(a)}>{t('accounts.disconnect')}</Button>
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}
