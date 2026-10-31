import { ActionIcon, AppShell, Avatar, Badge, Box, Center, Group, Loader, Menu, NavLink, Text, Title, useMantineColorScheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconBrandInstagram, IconCalendar, IconChartLine, IconChecks, IconHome, IconLogout, IconMoon, IconSettings, IconSun } from '@tabler/icons-react';
import { NavLink as RouterLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, Post } from './api';
import { useAuth } from './auth';
import { useLoad } from './hooks';
import Accounts from './pages/Accounts';
import Approvals from './pages/Approvals';
import CalendarPage from './pages/Calendar';
import Login from './pages/Login';
import Overview from './pages/Overview';
import PageEdit from './pages/PageEdit';
import PageWizard from './pages/PageWizard';
import Pending from './pages/Pending';
import Settings from './pages/Settings';
import StatsPage from './pages/Stats';
import { LangMenu } from './components/LangSwitch';
import { Key, t } from './i18n';
import { inTelegram } from './telegram';

const NAV: { to: string; key: string; icon: typeof IconHome }[] = [
  { to: '/', key: 'overview', icon: IconHome },
  { to: '/approvals', key: 'approvals', icon: IconChecks },
  { to: '/calendar', key: 'calendar', icon: IconCalendar },
  { to: '/stats', key: 'stats', icon: IconChartLine },
  { to: '/accounts', key: 'instagram', icon: IconBrandInstagram },
  { to: '/settings', key: 'settings', icon: IconSettings },
];
const navLabel = (key: string, short = false) => t(`nav.${short ? 'short.' : ''}${key}` as Key);

export default function App() {
  const { me, loading } = useAuth();
  if (loading) return <Center h="100vh"><Loader /></Center>;
  if (!me) return <Login />;
  if (me.status !== 'active') return <Pending />;
  return <Shell />;
}

function Shell() {
  const { me, logout } = useAuth();
  const mobile = useMediaQuery('(max-width: 48em)');
  const { pathname } = useLocation();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  // badge with the number of posts waiting for approval; refreshes every 30 s
  const waiting = useLoad(() => api<Post[]>('posts?status=awaiting_approval'), [pathname], 30_000);
  const nWaiting = waiting.data?.length ?? 0;
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: true } }}
      footer={mobile ? { height: 60 } : undefined}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap={8}><Text fz={22}>🚀</Text><Title order={4}>{t('app.name')}</Title></Group>
          <Group gap={6}>
            <LangMenu />
            {!inTelegram() && (
              <ActionIcon variant="subtle" color="gray" onClick={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')} aria-label={t('common.toggleTheme')}>
                {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            )}
            <Menu position="bottom-end">
              <Menu.Target><Avatar src={me!.avatarUrl} radius="xl" size="sm" style={{ cursor: 'pointer' }}>{me!.name.slice(0, 1)}</Avatar></Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{me!.name || me!.email}</Menu.Label>
                <Menu.Item component={RouterLink} to="/settings" leftSection={<IconSettings size={14} />}>{t('nav.settings')}</Menu.Item>
                {!inTelegram() && <Menu.Item color="red" leftSection={<IconLogout size={14} />} onClick={logout}>{t('common.logout')}</Menu.Item>}
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {NAV.map((n) => (
          <NavLink key={n.to} component={RouterLink} to={n.to} label={navLabel(n.key)} active={isActive(n.to)} leftSection={<n.icon size={18} />}
            rightSection={n.to === '/approvals' && nWaiting ? <Badge size="sm" circle>{nWaiting}</Badge> : null} />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Box maw={1200} mx="auto">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/approvals" element={<Approvals onChange={waiting.reload} />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/pages/new" element={<PageWizard />} />
            <Route path="/pages/:id" element={<PageEdit />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Box>
      </AppShell.Main>

      {mobile && (
        <AppShell.Footer>
          <Group className="bottom-nav" gap={0} h="100%" wrap="nowrap">
            {NAV.filter((n) => n.to !== '/accounts').map((n) => (
              <RouterLink key={n.to} to={n.to} className={isActive(n.to) || (n.to === '/settings' && isActive('/accounts')) ? 'active' : ''}>
                <Box pos="relative" display="inline-block">
                  <n.icon size={22} />
                  {n.to === '/approvals' && nWaiting > 0 && <Badge size="xs" circle pos="absolute" top={-4} right={-10}>{nWaiting}</Badge>}
                </Box>
                <div className="bottom-nav-label">{navLabel(n.key, true)}</div>
              </RouterLink>
            ))}
          </Group>
        </AppShell.Footer>
      )}
    </AppShell>
  );
}
