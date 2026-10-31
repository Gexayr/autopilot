import { Button, Center, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconLogout } from '@tabler/icons-react';
import { useAuth } from '../auth';
import { LangMenu } from '../components/LangSwitch';
import { useLoad } from '../hooks';
import { t } from '../i18n';

export default function Pending() {
  const { me, refresh, logout } = useAuth();
  useLoad(refresh, [], 15_000); // status flips to active as soon as the admin approves
  const blocked = me?.status === 'blocked';
  return (
    <Center mih="100vh" p="md" pos="relative">
      <Group pos="absolute" top={12} right={12}><LangMenu /></Group>
      <Paper withBorder p="xl" radius="lg" maw={420}>
        <Stack align="center">
          <Text fz={44}>{blocked ? '⛔' : '⏳'}</Text>
          <Title order={3} ta="center">{blocked ? t('pending.blockedTitle') : t('pending.sentTitle')}</Title>
          <Text c="dimmed" ta="center">
            {blocked ? t('pending.blockedText') : t('pending.sentText', { name: me?.name || t('pending.friend') }) + (me?.telegram ? t('pending.tgNote') : '')}
          </Text>
          <Button variant="default" leftSection={<IconLogout size={16} />} onClick={logout}>{t('common.logout')}</Button>
        </Stack>
      </Paper>
    </Center>
  );
}
