import { Alert, Anchor, Badge, Button, Checkbox, Group, List, Modal, Stack, Text, TextInput } from '@mantine/core';
import { IconArrowRight, IconBrandInstagram, IconExternalLink, IconRefresh, IconSend } from '@tabler/icons-react';
import { useState } from 'react';
import { AccessRequest, api } from '../api';
import { useAuth } from '../auth';
import { useAction, useLoad } from '../hooks';
import { t } from '../i18n';
import { openExternal } from '../telegram';
import { Rich } from './Rich';

/** Starts Instagram login; the callback brings the user back to /accounts?connected=… */
export async function connectInstagram(returnTo?: string) {
  const { url } = await api<{ url: string }>('accounts/connect-url');
  try {
    returnTo ? localStorage.setItem(RETURN_KEY, returnTo) : localStorage.removeItem(RETURN_KEY);
    localStorage.setItem(ATTEMPT_KEY, String(Date.now()));
  } catch { /* ignore */ }
  window.location.href = url;
}
export const RETURN_KEY = 'autopilot.afterConnect';
/** Set when we send the user to Instagram; cleared on success. Still there later = they came back without connecting. */
export const ATTEMPT_KEY = 'autopilot.connectAttempt';
const INVITES_URL = 'https://www.instagram.com/accounts/manage_access/';

function recentAttempt() {
  try { return Date.now() - Number(localStorage.getItem(ATTEMPT_KEY) ?? 0) < 60 * 60_000; } catch { return false; }
}
function clearAttempt() {
  try { localStorage.removeItem(ATTEMPT_KEY); } catch { /* ignore */ }
}

/**
 * Instagram shows a bare "Invalid request" (and never comes back to us) when the invite isn't accepted or the
 * account is personal, so the user ticks these off before we send them there.
 */
function Checklist({ opened, onClose, onGo, account, busy }: { opened: boolean; onClose: () => void; onGo: () => void; account?: string; busy: boolean }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const tick = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.currentTarget.checked; // read now: currentTarget is gone by the time the updater runs
    setDone((d) => ({ ...d, [k]: checked }));
  };
  const all = done.invite && done.pro && done.login;
  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={600}>{t('connect.check.title')}</Text>} centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">{t('connect.check.intro')}</Text>
        <Stack gap={6}>
          <Checkbox checked={!!done.invite} onChange={tick('invite')} label={<Text size="sm" fw={500}>{t('connect.check.invite')}</Text>} />
          <Text size="xs" c="dimmed" pl={32}>{t('connect.check.inviteHint')}</Text>
          <Anchor size="sm" pl={32} href={INVITES_URL} target="_blank" onClick={(e) => { e.preventDefault(); openExternal(INVITES_URL); }}>
            <Group gap={4} component="span"><IconExternalLink size={14} />{t('connect.check.openInvites')}</Group>
          </Anchor>
        </Stack>
        <Stack gap={6}>
          <Checkbox checked={!!done.pro} onChange={tick('pro')} label={<Text size="sm" fw={500}>{t('connect.check.pro')}</Text>} />
          <Text size="xs" c="dimmed" pl={32}>{t('connect.check.proHint')}</Text>
        </Stack>
        <Checkbox checked={!!done.login} onChange={tick('login')}
          label={<Text size="sm" fw={500}>{account ? t('connect.check.login', { acc: '@' + account }) : t('connect.check.loginAny')}</Text>} />
        <Button fullWidth rightSection={<IconArrowRight size={16} />} disabled={!all} loading={busy} onClick={onGo}>{t('connect.check.go')}</Button>
      </Stack>
    </Modal>
  );
}

const STATUS_COLOR: Record<AccessRequest['status'], string> = { requested: 'yellow', invited: 'green', rejected: 'red', connected: 'gray' };

const ProHint = () => <List.Item><Rich k="connect.pro" /></List.Item>;
const AcceptHint = () => <List.Item><Rich k="connect.accept" /></List.Item>;

/**
 * While the Meta app is in dev mode only tester accounts can log in, so a regular user first asks the admin
 * (request → Telegram → admin adds the tester → user accepts the invite) and only then connects.
 */
export default function InstagramConnect({ returnTo, hasAccounts }: { returnTo?: string; hasAccounts?: boolean }) {
  const { me, config } = useAuth();
  const { busy, run } = useAction();
  const isAdmin = me?.role === 'admin';
  const requests = useLoad(() => (isAdmin ? Promise.resolve([] as AccessRequest[]) : api<AccessRequest[]>('access-requests')), [isAdmin], 30_000);
  const meta = useLoad(() => (isAdmin ? api<{ metaUrl: string }>('admin/access-requests') : Promise.resolve(null)), [isAdmin]);
  const [username, setUsername] = useState('');
  const [checklist, setChecklist] = useState(false);
  const [cameBack, setCameBack] = useState(recentAttempt);

  const open = (requests.data ?? []).filter((r) => r.status !== 'connected');
  const invited = open.filter((r) => r.status === 'invited');
  const ready = !!config?.instagramReady;

  const connectBtn = (primary: boolean) => (
    <Button leftSection={<IconBrandInstagram size={16} />} variant={primary ? 'filled' : 'default'} w="fit-content"
      disabled={!ready} onClick={() => setChecklist(true)}>
      {t('connect.button')}
    </Button>
  );

  const extras = (
    <>
      <Checklist opened={checklist} onClose={() => setChecklist(false)} busy={busy === 'connect'}
        account={invited.length === 1 ? invited[0].username : undefined} onGo={() => run('connect', () => connectInstagram(returnTo))} />
      {cameBack && (
        <Alert color="yellow" title={t('connect.back.title')} withCloseButton onClose={() => { clearAttempt(); setCameBack(false); }}>
          <Text size="sm" mb="xs">{t('connect.back.text')}</Text>
          <Button size="xs" variant="light" color="yellow" leftSection={<IconRefresh size={14} />} onClick={() => setChecklist(true)}>{t('connect.back.retry')}</Button>
        </Alert>
      )}
    </>
  );

  const ask = () => run('ask', async () => {
    await api('access-requests', { body: { username } });
    setUsername('');
    await requests.reload();
  }, t('connect.requested'));

  if (!ready) return <Alert color="yellow">{t('connect.notReady')}</Alert>;

  if (isAdmin) return (
    <Stack gap="sm">
      {extras}
      <List size="sm" spacing={4} c="dimmed">
        <ProHint />
        <List.Item><Rich k="connect.adminAdd" href={meta.data?.metaUrl ?? 'https://developers.facebook.com/apps/'} /></List.Item>
        <AcceptHint />
        <List.Item>{t('connect.adminLogin')}</List.Item>
      </List>
      {connectBtn(!hasAccounts)}
    </Stack>
  );

  return (
    <Stack gap="sm">
      {extras}
      {invited.length > 0 && (
        <Alert color="green" title={t('connect.invitedTitle', { list: invited.map((r) => '@' + r.username).join(', ') })}>
          <List size="sm" spacing={4}>
            <AcceptHint />
            <List.Item>{t('connect.loginThat')}</List.Item>
          </List>
        </Alert>
      )}
      {invited.length > 0 && connectBtn(true)}
      {invited.length === 0 && (
        <Text size="sm" c="dimmed">{t('connect.intro')}</Text>
      )}
      <List size="sm" c="dimmed"><ProHint /></List>
      <Group align="flex-end" gap="xs">
        <TextInput label={invited.length ? t('connect.otherIg') : t('connect.yourIg')} placeholder="username" leftSection="@" w={240} value={username}
          onChange={(e) => setUsername(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && username.trim() && ask()} />
        <Button leftSection={<IconSend size={16} />} variant={invited.length ? 'default' : 'filled'} disabled={!username.trim()} loading={busy === 'ask'} onClick={ask}>{t('connect.request')}</Button>
      </Group>
      {open.length > 0 && (
        <Stack gap={4}>
          {open.map((r) => (
            <Group key={r.id} gap="xs">
              <Text size="sm" fw={500}>@{r.username}</Text>
              <Badge size="sm" variant="light" color={STATUS_COLOR[r.status]}>{t(`connect.st.${r.status}`)}</Badge>
            </Group>
          ))}
        </Stack>
      )}
      {invited.length === 0 && open.length > 0 && (
        <Group gap="xs">
          <Text size="xs" c="dimmed">{t('connect.already')}</Text>
          {connectBtn(false)}
        </Group>
      )}
    </Stack>
  );
}
