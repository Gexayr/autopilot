import { ActionIcon, Alert, Avatar, Badge, Button, Card, Group, Loader, SimpleGrid, Stack, Switch, Text, Title, Tooltip } from '@mantine/core';
import { PageLoader } from '../components/PageLoader';
import { IconBrandInstagram, IconCalendar, IconChecks, IconPlus, IconSettings } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import { Account, api, Page } from '../api';
import { useAction, useLoad } from '../hooks';
import { t } from '../i18n';
import { fmtNum, fmtTime, pageColor } from '../util';
import { VideoQuotaAlert } from '../components/VideoQuota';

export default function Overview() {
  const pages = useLoad(() => api<Page[]>('pages'), [], 30_000);
  const accounts = useLoad(() => api<Account[]>('accounts'));
  const nav = useNavigate();
  const { run } = useAction();

  const toggle = (p: Page) => run(`t${p.id}`, async () => {
    await api(`pages/${p.id}`, { method: 'PATCH', body: { active: !p.active } });
    await pages.reload();
  });

  if (pages.loading) return <PageLoader />;
  const avatar = (p: Page) => accounts.data?.find((a) => a.id === p.igAccountId)?.avatarUrl;

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t('overview.title')}</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => nav('/pages/new')}>{t('overview.new')}</Button>
      </Group>
      {pages.error && <Alert color="red">{pages.error}</Alert>}
      <VideoQuotaAlert />

      {pages.data?.length === 0 && (
        <Card withBorder p="xl">
          <Stack align="center" gap="xs">
            <Text fz={40}>✨</Text>
            <Title order={4} ta="center">{t('overview.emptyTitle')}</Title>
            <Text c="dimmed" ta="center" maw={420}>{t('overview.emptyText')}</Text>
            <Button mt="sm" leftSection={<IconPlus size={16} />} onClick={() => nav('/pages/new')}>{t('overview.start')}</Button>
          </Stack>
        </Card>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {pages.data?.map((p) => (
          <Card key={p.id} withBorder padding="lg" style={{ borderTop: `3px solid var(--mantine-color-${pageColor(p.id)}-6)` }}>
            <Group justify="space-between" wrap="nowrap" mb="sm">
              <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                <Avatar src={avatar(p)} radius="xl">{p.title.slice(0, 1)}</Avatar>
                <div style={{ minWidth: 0 }}>
                  <Text fw={600} truncate>{t('overview.cardTitle', { title: p.title })}</Text>
                  <Text size="xs" c="dimmed" truncate>→ @{p.account?.username} · {p.slots.join(', ')}</Text>
                </div>
              </Group>
              <Group gap={6} wrap="nowrap">
                <Tooltip label={t('common.openInstagram')}>
                  <ActionIcon variant="subtle" color="gray" component="a" href={`https://instagram.com/${p.account?.username}`} target="_blank"
                    aria-label={t('common.openInstagram')}>
                    <IconBrandInstagram size={18} />
                  </ActionIcon>
                </Tooltip>
                <Switch checked={p.active} onChange={() => toggle(p)} aria-label={t('overview.running')} />
              </Group>
            </Group>

            <SimpleGrid cols={3} spacing="xs" mb="md">
              <Stat label={t('overview.followers')} value={fmtNum(p.followers)}
                sub={p.growth7d != null ? t('overview.growth', { n: `${p.growth7d >= 0 ? '+' : ''}${p.growth7d}` }) : undefined} />
              <Stat label={t('overview.queued')} value={String(p.queued)} />
              <Stat label={t('overview.waiting')} value={String(p.waiting)} highlight={p.waiting > 0} />
            </SimpleGrid>

            <Text size="sm" c="dimmed" mb="md">
              {p.active ? <>{t('overview.next')} <b>{fmtTime(p.nextAt, p.timezone)}</b></> : <Badge color="gray">{t('overview.paused')}</Badge>}
            </Text>

            <Stack gap="xs" mt="auto">
              {p.waiting > 0 && (
                <Button fullWidth size="sm" leftSection={<IconChecks size={16} />} component={Link} to={`/approvals?page=${p.id}`}>
                  {t('overview.approve', { n: p.waiting })}
                </Button>
              )}
              <SimpleGrid cols={2} spacing="xs">
                <Button size="sm" px="xs" variant="light" leftSection={<IconCalendar size={16} />} component={Link} to={`/calendar?page=${p.id}`}>
                  {t('overview.calendar')}
                </Button>
                <Button size="sm" px="xs" variant="default" leftSection={<IconSettings size={16} />} component={Link} to={`/pages/${p.id}`}>
                  {t('overview.settings')}
                </Button>
              </SimpleGrid>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div>
      <Text size="xs" c="dimmed" truncate>{label}</Text>
      <Text fw={700} fz="lg" c={highlight ? 'yellow.7' : undefined}>{value}</Text>
      {sub && <Text size="xs" c={sub.startsWith('-') ? 'red' : 'teal'}>{sub}</Text>}
    </div>
  );
}
