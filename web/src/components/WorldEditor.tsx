import { ActionIcon, Box, Button, Divider, FileButton, Image, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
import { IconPhotoPlus, IconSparkles, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { Key, t } from '../i18n';

export const MAX_REFS = 4;
// keys match VISUAL_STYLES in app/src/visual.ts; anything else is the user's own words
export const STYLES = ['photo', 'cinematic', 'game', 'anime', 'cartoon', 'fantasy', 'pixel'] as const;

/** What the form edits; `style` holds a preset key or the user's own words. */
export interface WorldDraft {
  style: string;
  world: string;
  enabled: boolean;
  description: string;
  refsMode: 'character' | 'style';
  people: string;
}

export const emptyWorld = (): WorldDraft => ({ style: 'photo', world: '', enabled: false, description: '', refsMode: 'style', people: '' });

const presetOf = (s: string) => (!s ? 'photo' : (STYLES as readonly string[]).includes(s) ? s : 'custom');

/**
 * "World & style" fields, shared by the wizard (pictures kept locally until the page exists) and the
 * page settings (pictures uploaded at once). The parent owns the state and the pictures.
 */
export function WorldEditor({ v, set, refs, onAddRef, onRemoveRef, onExpand, busy }: {
  v: WorldDraft;
  set: (patch: Partial<WorldDraft>) => void;
  refs: { key: string; url: string }[];
  onAddRef: (file: File) => void;
  onRemoveRef: (key: string) => void;
  onExpand: () => void;
  busy: string | null;
}) {
  const [custom, setCustom] = useState(presetOf(v.style) === 'custom');
  const preset = custom ? 'custom' : presetOf(v.style);
  return (
    <Stack>
      <Select label={t('world.style')} allowDeselect={false} value={preset}
        onChange={(x) => { if (!x) return; setCustom(x === 'custom'); set({ style: x === 'custom' ? '' : x }); }}
        data={[...STYLES, 'custom'].map((s) => ({ value: s, label: t(`world.style.${s}` as Key) }))} />
      {preset === 'custom' && (
        <TextInput placeholder={t('world.customStylePh')} maxLength={300} value={v.style} onChange={(e) => set({ style: e.currentTarget.value })} />
      )}

      <div>
        <Textarea label={t('world.title')} description={t('world.hint')} placeholder={t('world.ph')}
          autosize minRows={3} maxLength={2000} value={v.world} onChange={(e) => set({ world: e.currentTarget.value })} />
        <Button mt="xs" size="xs" variant="light" leftSection={<IconSparkles size={14} />} disabled={v.world.trim().length < 3}
          loading={busy === 'world'} onClick={onExpand}>{t('world.expand')}</Button>
      </div>

      <TextInput label={t('world.people')} description={t('world.peopleHint')} placeholder={t('world.peoplePh')} maxLength={200}
        value={v.people} onChange={(e) => set({ people: e.currentTarget.value })} />

      <Divider />
      <Switch checked={v.enabled} onChange={(e) => set({ enabled: e.currentTarget.checked })} label={t('char.enabled')} description={t('char.optional')} />
      {v.enabled && (
        <Textarea label={t('char.description')} description={t('char.descriptionHint')} placeholder={t('char.descriptionPh')}
          autosize minRows={2} maxLength={500} value={v.description} onChange={(e) => set({ description: e.currentTarget.value })} />
      )}

      <Divider />
      <div>
        <Text size="sm" fw={500}>{t('world.refs')}</Text>
        <Text size="xs" c="dimmed" mb="xs">{t('world.refsHint')}</Text>
        <SegmentedControl mb="sm" size="xs" value={v.refsMode} onChange={(x) => set({ refsMode: x as WorldDraft['refsMode'] })}
          data={[{ value: 'style', label: t('world.refsStyle') }, { value: 'character', label: t('world.refsCharacter') }]} />
        <SimpleGrid cols={{ base: 2, xs: 4 }} spacing="xs">
          {refs.map((r) => (
            <Box key={r.key} pos="relative">
              <Image src={r.url} radius="md" h={140} fit="cover" alt="" />
              <ActionIcon size="sm" color="red" variant="filled" radius="xl" pos="absolute" top={6} right={6}
                loading={busy === `rm${r.key}`} onClick={() => onRemoveRef(r.key)} aria-label={t('common.delete')}>
                <IconX size={14} />
              </ActionIcon>
            </Box>
          ))}
          {refs.length < MAX_REFS && (
            <FileButton onChange={(f) => f && onAddRef(f)} accept="image/jpeg,image/png,image/webp">
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
    </Stack>
  );
}
