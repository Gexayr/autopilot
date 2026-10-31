import { ActionIcon, Alert, Box, Button, Divider, FileButton, Group, Image, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
import { IconCheck, IconPhotoPlus, IconSparkles, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { api, Page } from '../api';
import { useAction } from '../hooks';
import { Key, lang, t } from '../i18n';

const MAX_REFS = 4;
// keys match VISUAL_STYLES in app/src/visual.ts; anything else is the user's own words
const STYLES = ['photo', 'cinematic', 'game', 'anime', 'cartoon', 'fantasy', 'pixel'] as const;

/**
 * "World and style" of AI scenes: picture style, the world every scene happens in (e.g. a game universe),
 * an optional recurring character and reference pictures. Pictures are uploaded / removed right away,
 * the rest is saved with its own button (the tab lives outside the main form).
 */
export function CharacterFields({ page, onChange }: { page: Page; onChange: (p: Page) => void }) {
  const c = page.character;
  const preset = (s?: string) => (!s ? 'photo' : (STYLES as readonly string[]).includes(s) ? s : 'custom');
  const [style, setStyle] = useState(preset(c?.style));
  const [customStyle, setCustomStyle] = useState(preset(c?.style) === 'custom' ? c!.style! : '');
  const [world, setWorld] = useState(c?.world ?? '');
  const [enabled, setEnabled] = useState(c?.enabled ?? false);
  const [description, setDescription] = useState(c?.description ?? '');
  const [refsMode, setRefsMode] = useState<'character' | 'style'>(c?.refsMode ?? 'character');
  const { busy, run } = useAction();
  const refs = c?.refs ?? [];

  useEffect(() => {
    setStyle(preset(c?.style));
    setCustomStyle(preset(c?.style) === 'custom' ? c!.style! : '');
    setWorld(c?.world ?? '');
    setEnabled(c?.enabled ?? false);
    setDescription(c?.description ?? '');
    setRefsMode(c?.refsMode ?? 'character');
  }, [page.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = (file: File | null) => file && run('upload', async () => {
    const form = new FormData();
    form.append('file', file);
    onChange(await api<Page>(`pages/${page.id}/character/refs`, { form }));
  });
  const remove = (file: string) => run(`rm${file}`, async () => {
    onChange(await api<Page>(`pages/${page.id}/character/refs/${file}`, { method: 'DELETE' }));
  });
  const expand = () => run('world', async () => {
    const r = await api<{ world: string }>(`pages/${page.id}/world`, { body: { brief: world, language: lang() } });
    setWorld(r.world);
  });
  const save = () => run('save', async () => {
    const body = { character: { enabled, description, refsMode, world, style: style === 'custom' ? customStyle : style } };
    onChange(await api<Page>(`pages/${page.id}`, { method: 'PATCH', body }));
  }, t('common.saved'));

  return (
    <Stack>
      {page.style.media !== 'ai' && <Alert color="yellow">{t('char.needAi')}</Alert>}

      <Select label={t('world.style')} allowDeselect={false} value={style} onChange={(x) => x && setStyle(x)}
        data={[...STYLES, 'custom'].map((s) => ({ value: s, label: t(`world.style.${s}` as Key) }))} />
      {style === 'custom' && (
        <TextInput placeholder={t('world.customStylePh')} maxLength={300} value={customStyle} onChange={(e) => setCustomStyle(e.currentTarget.value)} />
      )}

      <div>
        <Textarea label={t('world.title')} description={t('world.hint')} placeholder={t('world.ph')}
          autosize minRows={3} maxLength={2000} value={world} onChange={(e) => setWorld(e.currentTarget.value)} />
        <Button mt="xs" size="xs" variant="light" leftSection={<IconSparkles size={14} />} disabled={world.trim().length < 3}
          loading={busy === 'world'} onClick={expand}>{t('world.expand')}</Button>
      </div>

      <Divider />
      <Switch checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} label={t('char.enabled')} description={t('char.optional')} />
      {enabled && (
        <Textarea label={t('char.description')} description={t('char.descriptionHint')} placeholder={t('char.descriptionPh')}
          autosize minRows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
      )}

      <Divider />
      <div>
        <Text size="sm" fw={500}>{t('world.refs')}</Text>
        <Text size="xs" c="dimmed" mb="xs">{t('world.refsHint')}</Text>
        <SegmentedControl mb="sm" size="xs" value={refsMode} onChange={(x) => setRefsMode(x as 'character' | 'style')}
          data={[{ value: 'style', label: t('world.refsStyle') }, { value: 'character', label: t('world.refsCharacter') }]} />
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
