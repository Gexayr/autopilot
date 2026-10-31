import { Alert, Box, Button, Center, Divider, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { IconBrandTelegram } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { loadGoogle, telegramLogin, useAuth } from '../auth';
import { LangMenu } from '../components/LangSwitch';
import { t } from '../i18n';
import { errText } from '../util';

export default function Login() {
  const { config, setSession } = useAuth();
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const googleEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!config?.googleClientId || !googleEl.current) return;
    loadGoogle(config.googleClientId, googleEl.current, async (idToken) => {
      try {
        setSession(await api('auth/google', { body: { idToken } }));
      } catch (e) {
        setError(errText(e));
      }
    });
  }, [config?.googleClientId, setSession]);

  useEffect(() => () => abort.current?.abort(), []);

  const viaTelegram = async () => {
    setError(null);
    setWaiting(true);
    abort.current = new AbortController();
    // open the tab synchronously (popup blockers), then point it at the bot link
    const tab = window.open('about:blank', '_blank');
    try {
      setSession(await telegramLogin('login', (url) => (tab ? (tab.location.href = url) : (window.location.href = url)), abort.current.signal));
    } catch (e) {
      tab?.close();
      setError(errText(e));
    } finally {
      setWaiting(false);
    }
  };

  return (
    <Center mih="100vh" p="md" pos="relative">
      <Group pos="absolute" top={12} right={12}><LangMenu /></Group>
      <Paper withBorder shadow="sm" p="xl" radius="lg" w="100%" maw={420}>
        <Stack align="center" gap="md">
          <Text fz={48} lh={1}>🚀</Text>
          <Title order={2} ta="center">{t('app.title')}</Title>
          <Text c="dimmed" ta="center" size="sm">{t('login.tagline')}</Text>
          {error && <Alert color="red" w="100%">{error}</Alert>}
          {waiting ? (
            <Stack align="center" gap="xs" py="sm">
              <Loader size="sm" />
              <Text size="sm" ta="center" maw={300}>{t('login.waiting')}</Text>
              <Button variant="subtle" size="xs" onClick={() => abort.current?.abort()}>{t('common.cancel')}</Button>
            </Stack>
          ) : (
            <Button fullWidth size="md" radius="xl" color="#229ED9" leftSection={<IconBrandTelegram />} onClick={viaTelegram} disabled={!config?.botUsername}>
              {t('login.telegram')}
            </Button>
          )}
          {config?.googleClientId && (
            <>
              <Divider label={t('login.or')} w="100%" />
              <Box ref={googleEl} />
            </>
          )}
          <Text size="xs" c="dimmed" ta="center">{t('login.footnote')}</Text>
        </Stack>
      </Paper>
    </Center>
  );
}
