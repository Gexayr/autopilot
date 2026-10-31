import { ActionIcon, Alert, Box, Button, FileButton, Group, Image, SimpleGrid, Stack, Switch, Text, Textarea } from '@mantine/core';
import { IconCheck, IconPhotoPlus, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { api, Page } from '../api';
import { useAction } from '../hooks';
import { t } from '../i18n';

const MAX_REFS = 4;

/**
 * The page's recurring character: reference pictures are uploaded / removed right away,
 * the switch and the description are saved with their own button (the tab lives outside the main form).
 */
export function CharacterFields({ page, onChange }: { page: Page; onChange: (p: Page) => void }) {
  const [enabled, setEnabled] = useState(page.character?.enabled ?? true);
  const [description, setDescription] = useState(page.character?.description ?? '');
  const { busy, run } = useAction();
  const refs = page.character?.refs ?? [];

  useEffect(() => {
    setEnabled(page.character?.enabled ?? true);
    setDescription(page.character?.description ?? '');
  }, [page.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = (file: File | null) => file && run('upload', async () => {
    const form = new FormData();
    form.append('file', file);
    onChange(await api<Page>(`pages/${page.id}/character/refs`, { form }));
  });
  const remove = (file: string) => run(`rm${file}`, async () => {
    onChange(await api<Page>(`pages/${page.id}/character/refs/${file}`, { method: 'DELETE' }));
  });
  const save = () => run('save', async () => {
    onChange(await api<Page>(`pages/${page.id}`, { method: 'PATCH', body: { character: { enabled, description } } }));
  }, t('common.saved'));

  return (
    <Stack>
      {page.style.media !== 'ai' && <Alert color="yellow">{t('char.needAi')}</Alert>}
      <Switch checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} label={t('char.enabled')} />
      <Textarea label={t('char.description')} description={t('char.descriptionHint')} placeholder={t('char.descriptionPh')}
        autosize minRows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
      <div>
        <Text size="sm" fw={500}>{t('char.refs')}</Text>
        <Text size="xs" c="dimmed" mb="xs">{t('char.refsHint')}</Text>
        <SimpleGrid cols={{ base: 2, xs: 4 }} spacing="xs">
          {refs.map((r) => (
            <Box key={r.file} pos="relative">
              <Image src={r.url} radius="md" h={140} fit="cover" alt="" />
              <ActionIcon size="sm" color="red" variant="filled" radius="xl" pos="absolute" top={6} right={6}
                loading={busy === `rm${r.file}`} onClick={() => remove(r.file)} aria-label={t('common.delete')}>
                <IconX size={14} />
              </ActionIcon>
            </Box>
          ))}
          {refs.length < MAX_REFS && (
            <FileButton onChange={upload} accept="image/jpeg,image/png,image/webp">
              {(props) => (
                <Button {...props} variant="default" h={140} loading={busy === 'upload'} styles={{ label: { whiteSpace: 'normal' } }}>
                  <Stack align="center" gap={4}><IconPhotoPlus size={22} /><Text size="xs">{t('char.add')}</Text></Stack>
                </Button>
              )}
            </FileButton>
          )}
        </SimpleGrid>
      </div>
      <Text size="xs" c="dimmed">{t('char.rights')}</Text>
      <Group justify="flex-end">
        <Button leftSection={<IconCheck size={16} />} loading={busy === 'save'} onClick={save}>{t('common.save')}</Button>
      </Group>
    </Stack>
  );
}
