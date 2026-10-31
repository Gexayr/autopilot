import { Alert, Anchor, Avatar, Badge, Box, Button, Card, Group, Loader, NumberInput, Stack, Table, Text, Title } from '@mantine/core';
import { IconBrandGoogle, IconBrandInstagram, IconBrandTelegram, IconCheck, IconChevronRight, IconLink, IconLogout, IconX } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { AccessRequest, Account, AdminUser, api } from '../api';
import { loadGoogle, telegramLogin, useAuth } from '../auth';
import { useAction, useLoad } from '../hooks';
import { LangSegmented } from '../components/LangSwitch';
import { Rich } from '../components/Rich';
import { t, tn } from '../i18n';
import { inTelegram, openExternal } from '../telegram';
import { dayjs, errText } from '../util';

export default function Settings() {
  const { me, config, setSession, logout } = useAuth();
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!config?.googleClientId || me?.email || !googleEl.current) return;
    loadGoogle(config.googleClientId, googleEl.current, async (idToken) => {
      try { setSession(await api('me/link/google', { body: { idToken } })); } catch (e) { setError(errText(e)); }
    });
  }, [config?.googleClientId, me?.email, setSession]);

  const linkTelegram = async () => {
    setError(null);
    setLinking(true);
    try {
      setSession(await telegramLogin('link', openExternal, new AbortController().signal));
    } catch (e) {
      setError(errText(e));
    } finally {
      setLinking(false);
    }
  };

  return (
    <Stack maw={860}>
      <Title order={2}>{t('settings.title')}</Title>
      <Card withBorder>
        <Group>
          <Avatar src={me!.avatarUrl} size="lg" radius="xl">{me!.name.slice(0, 1)}</Avatar>
          <div>
            <Text fw={600}>{me!.name || '-'}</Text>
            <Text size="sm" c="dimmed">{me!.role === 'admin' ? t('settings.admin') : t('settings.user')} · {tn('settings.limit', me!.maxPages)}</Text>
          </div>
        </Group>
      </Card>

      <InstagramCard />

      <Card withBorder>
        <Text fw={600}>{t('settings.interfaceLang')}</Text>
        <Text size="xs" c="dimmed" mb="sm">{t('settings.langHint')}</Text>
        <LangSegmented />
      </Card>

      <Card withBorder>
        <Text fw={600} mb="sm">{t('settings.logins')}</Text>
        {error && <Alert color="red" mb="sm">{error}</Alert>}
        <Stack gap="sm">
          <Group justify="space-between">
            <Group gap="xs"><IconBrandTelegram color="#229ED9" /><Text>Telegram</Text><Text size="xs" c="dimmed" visibleFrom="xs">{t('settings.tgHint')}</Text></Group>
            {me!.telegram ? <Badge color="green" leftSection={<IconCheck size={12} />}>{t('settings.linked')}</Badge>
              : <Button size="xs" leftSection={<IconLink size={14} />} loading={linking} onClick={linkTelegram}>{t('settings.link')}</Button>}
          </Group>
          {linking && <Text size="xs" c="dimmed">{t('settings.openBot')}</Text>}
          <Group justify="space-between">
            <Group gap="xs"><IconBrandGoogle /><Text>Google</Text>{me!.email && <Text size="xs" c="dimmed">{me!.email}</Text>}</Group>
            {me!.email ? <Badge color="green" leftSection={<IconCheck size={12} />}>{t('settings.linked')}</Badge>
              : config?.googleClientId ? <Box ref={googleEl} /> : <Text size="xs" c="dimmed">{t('settings.unavailable')}</Text>}
          </Group>
        </Stack>
      </Card>

      {me!.role === 'admin' && <AdminAccessRequests />}
      {me!.role === 'admin' && <AdminUsers />}
      {!inTelegram() && <Button variant="default" color="red" w="fit-content" leftSection={<IconLogout size={16} />} onClick={logout}>{t('common.logout')}</Button>}
    </Stack>
  );
}

function AdminUsers() {
  const users = useLoad(() => api<AdminUser[]>('admin/users'), [], 30_000);
  const { busy, run } = useAction();
  const patch = (u: AdminUser, body: Partial<AdminUser>) => run(`u${u.id}`, async () => {
    await api(`admin/users/${u.id}`, { method: 'PATCH', body });
    await users.reload();
  });
  return (
    <Card withBorder>
      <Text fw={600} mb="sm">{t('settings.users')}</Text>
      <Text size="xs" c="dimmed" mb="sm">{t('settings.usersHint')}</Text>
      {users.loading && <Loader size="sm" />}
      <Table.ScrollContainer minWidth={620}>
        <Table verticalSpacing="xs">
          <Table.Thead><Table.Tr><Table.Th>{t('settings.col.who')}</Table.Th><Table.Th>{t('settings.col.login')}</Table.Th><Table.Th>{t('settings.col.rubrics')}</Table.Th><Table.Th>{t('settings.col.limit')}</Table.Th><Table.Th>{t('settings.col.status')}</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {users.data?.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td><Text size="sm" fw={500}>{u.name || '-'}</Text><Text size="xs" c="dimmed">{t('settings.since', { date: dayjs(u.createdAt).format('D MMM YYYY') })}</Text></Table.Td>
                <Table.Td><Text size="xs">{[u.telegram && 'Telegram', u.email].filter(Boolean).join(', ')}</Text></Table.Td>
                <Table.Td>{u.pages}</Table.Td>
                <Table.Td><NumberInput size="xs" w={70} min={0} max={100} defaultValue={u.maxPages} onBlur={(e) => Number(e.currentTarget.value) !== u.maxPages && patch(u, { maxPages: Number(e.currentTarget.value) })} /></Table.Td>
                <Table.Td>
                  {u.role === 'admin' ? <Badge>{t('settings.adminBadge')}</Badge> : u.status === 'active' ? (
                    <Button size="xs" variant="subtle" color="red" loading={busy === `u${u.id}`} onClick={() => patch(u, { status: 'blocked' })}>{t('settings.block')}</Button>
                  ) : (
                    <Group gap={4}>
                      <Badge color={u.status === 'pending' ? 'yellow' : 'gray'}>{u.status === 'pending' ? t('settings.waits') : t('settings.blocked')}</Badge>
                      <Button size="xs" color="green" leftSection={<IconCheck size={14} />} loading={busy === `u${u.id}`} onClick={() => patch(u, { status: 'active' })}>{t('settings.allow')}</Button>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

const REQ_COLOR: Record<AccessRequest['status'], string> = { requested: 'yellow', invited: 'blue', rejected: 'gray', connected: 'green' };

function AdminAccessRequests() {
  const data = useLoad(() => api<{ metaUrl: string; requests: AccessRequest[] }>('admin/access-requests'), [], 30_000);
  const { busy, run } = useAction();
  const decide = (r: AccessRequest, status: 'invited' | 'rejected') => run(`r${r.id}`, async () => {
    await api(`admin/access-requests/${r.id}`, { method: 'PATCH', body: { status } });
    await data.reload();
  });
  const list = data.data?.requests ?? [];
  return (
    <Card withBorder>
      <Text fw={600} mb={4}>{t('settings.requests')}</Text>
      <Text size="xs" c="dimmed" mb="sm"><Rich k="settings.requestsHint" href={data.data?.metaUrl} /></Text>
      {data.loading && <Loader size="sm" />}
      {!data.loading && !list.length && <Text size="sm" c="dimmed">{t('settings.noRequests')}</Text>}
      <Stack gap="xs">
        {list.map((r) => (
          <Group key={r.id} justify="space-between" wrap="wrap" gap="xs">
            <div>
              <Text size="sm"><Anchor href={`https://instagram.com/${r.username}`} target="_blank" fw={500}>@{r.username}</Anchor> · {r.userName}</Text>
              <Text size="xs" c="dimmed">{dayjs(r.createdAt).format('D MMM HH:mm')}</Text>
            </div>
            {r.status === 'requested' ? (
              <Group gap={4} wrap="nowrap">
                <Button size="xs" color="green" leftSection={<IconCheck size={14} />} loading={busy === `r${r.id}`} onClick={() => decide(r, 'invited')}>{t('settings.added')}</Button>
                <Button size="xs" variant="subtle" color="red" leftSection={<IconX size={14} />} onClick={() => decide(r, 'rejected')}>{t('settings.reject')}</Button>
              </Group>
            ) : <Badge color={REQ_COLOR[r.status]} variant="light">{t(`settings.rq.${r.status}`)}</Badge>}
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

/** On phones the bottom bar has no room for "Instagram", so accounts are reached from here. */
function InstagramCard() {
  const nav = useNavigate();
  const accounts = useLoad(() => api<Account[]>('accounts'));
  const list = accounts.data ?? [];
  return (
    <Card withBorder>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <IconBrandInstagram color="#E1306C" />
          <div style={{ minWidth: 0 }}>
            <Text fw={600}>{t('accounts.title')}</Text>
            <Text size="sm" c="dimmed" truncate>{list.length ? list.map((a) => '@' + a.username).join(', ') : t('settings.noAccounts')}</Text>
          </div>
        </Group>
        <Button variant="default" rightSection={<IconChevronRight size={16} />} onClick={() => nav('/accounts')} style={{ flexShrink: 0 }}>
          {t('settings.manage')}
        </Button>
      </Group>
    </Card>
  );
}
