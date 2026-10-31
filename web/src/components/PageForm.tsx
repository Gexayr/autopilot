import { Alert, Box, Button, Chip, Group, Image, Loader, NumberInput, SegmentedControl, Select, SimpleGrid, Slider, Stack, Switch, TagsInput, Text, Textarea, TextInput, UnstyledButton } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { api, Page, PageStyle, Theme } from '../api';
import { useLoad } from '../hooks';
import { Key, lang, t, variants } from '../i18n';
import { LANGUAGES, SLOT_GAP_MIN, SLOT_RE, slotConflicts, TIMEZONES } from '../util';

export interface PageDraft {
  title: string; niche: string; language: string; slots: string[]; reelsRatio: number; timezone: string;
  bufferDays: number; aiEnabled: boolean; autoApprove: boolean; style: PageStyle;
}

const PRESET_KEYS = [
  { key: 'motivation', emoji: '🔥' },
  { key: 'business', emoji: '💼' },
  { key: 'it', emoji: '💻' },
  { key: 'psy', emoji: '🌿' },
  { key: 'custom', emoji: '✍️' },
] as const;
const presetNiche = (key: string) => (key === 'custom' ? '' : t(`preset.${key}.niche` as Key));
const presetOf = (niche: string) => PRESET_KEYS.find((p) => p.key !== 'custom' && variants(`preset.${p.key}.niche` as Key).includes(niche))?.key ?? 'custom';

const HOURS = Array.from({ length: 17 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`);
const h2 = (h: number) => `${String(h).padStart(2, '0')}:00`;
// fixed hours plus one-hour windows (a random minute inside, so posts don't look scheduled)
const TIME_OPTIONS = [...HOURS, ...Array.from({ length: 16 }, (_, i) => `${h2(i + 7)}-${h2(i + 8)}`)];

export const emptyDraft = (): PageDraft => ({
  title: '', niche: presetNiche('motivation'), language: lang(), slots: ['12:00'], reelsRatio: 0.3, timezone: 'Asia/Yerevan',
  bufferDays: 2, aiEnabled: true, autoApprove: false, style: {},
});

type Set = (patch: Partial<PageDraft>) => void;

export function TopicFields({ v, set }: { v: PageDraft; set: Set }) {
  const preset = presetOf(v.niche);
  return (
    <Stack>
      <TextInput label={t('form.title')} description={t('form.titleHint')} placeholder={t('form.titlePh')} value={v.title} onChange={(e) => set({ title: e.currentTarget.value })} required />
      <div>
        <Text size="sm" fw={500} mb={6}>{t('form.topic')}</Text>
        <Chip.Group value={preset} onChange={(k) => set({ niche: presetNiche(k as string) })}>
          <Group gap="xs">{PRESET_KEYS.map((p) => <Chip key={p.key} value={p.key}>{p.emoji} {t(`preset.${p.key}` as Key)}</Chip>)}</Group>
        </Chip.Group>
      </div>
      <Textarea label={t('form.niche')} description={t('form.nicheHint')} autosize minRows={3} maxRows={8}
        value={v.niche} onChange={(e) => set({ niche: e.currentTarget.value })} required />
      <div>
        <Text size="sm" fw={500}>{t('form.postLang')}</Text>
        <Text size="xs" c="dimmed" mb={6}>{t('form.postLangHint')}</Text>
        <SegmentedControl data={LANGUAGES} value={v.language} onChange={(l) => set({ language: l })} />
      </div>
    </Stack>
  );
}

/** `others`: other rubrics of the same Instagram account: their times must not collide with ours. */
export function ScheduleFields({ v, set, advanced, others = [], account }: { v: PageDraft; set: Set; advanced?: boolean; others?: Page[]; account?: string }) {
  const conflicts = slotConflicts(v.slots, v.timezone, others);
  return (
    <Stack>
      <TagsInput label={t('form.times')} description={t('form.timesHint')}
        data={TIME_OPTIONS} value={v.slots} onChange={(s) => set({ slots: s.map((x) => x.replace(/\s+/g, '')).filter((x) => SLOT_RE.test(x)) })} placeholder={t('form.timesPh')} clearable />
      {conflicts.map((c) => (
        <Alert key={c.slot} color="yellow" p="sm">
          <Text size="sm">{t('form.conflict', { account: account ? `@${account}` : t('form.thisAccount'), time: c.otherTime, rubric: c.page, gap: SLOT_GAP_MIN })}</Text>
          {c.suggestion && (
            <Button size="xs" mt="xs" variant="white" color="dark"
              onClick={() => set({ slots: [...new Set(v.slots.map((s) => (s === c.slot ? c.suggestion! : s)))].sort() })}>
              {t('form.useSuggestion', { to: c.suggestion, from: c.slot })}
            </Button>
          )}
        </Alert>
      ))}
      {!conflicts.length && others.length > 0 && (
        <Text size="xs" c="dimmed">
          {t('form.others', { account: account ? `@${account}` : t('form.thisAccount'), list: others.map((o) => t('form.otherItem', { title: o.title, times: o.slots.join(', ') })).join('; ') })}
        </Text>
      )}
      <Select label={t('form.timezone')} data={TIMEZONES} value={v.timezone} onChange={(t) => t && set({ timezone: t })} searchable allowDeselect={false} />
      <div>
        <Text size="sm" fw={500}>{t('form.reels', { n: Math.round(v.reelsRatio * 100) })}</Text>
        <Text size="xs" c="dimmed" mb={8}>{t('form.reelsHint')}</Text>
        <Slider value={v.reelsRatio * 100} onChange={(x) => set({ reelsRatio: x / 100 })} step={10} min={0} max={100}
          marks={[{ value: 0, label: '0' }, { value: 50, label: '50%' }, { value: 100, label: '100%' }]} mb="md" />
      </div>
      {advanced && (
        <>
          <NumberInput label={t('form.buffer')} description={t('form.bufferHint')} min={1} max={7} value={v.bufferDays} onChange={(x) => set({ bufferDays: Number(x) || 1 })} />
          <Switch label={t('form.ai')} checked={v.aiEnabled} onChange={(e) => set({ aiEnabled: e.currentTarget.checked })} />
          <Switch label={t('form.autoApprove')} description={t('form.autoApproveHint')} checked={v.autoApprove} onChange={(e) => set({ autoApprove: e.currentTarget.checked })} />
        </>
      )}
    </Stack>
  );
}

export function StyleFields({ v, set }: { v: PageDraft; set: Set }) {
  const themes = useLoad(() => api<Theme[]>('themes'));
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [style] = useDebouncedValue(v.style, 400);
  const setStyle = (patch: Partial<PageStyle>) => set({ style: { ...v.style, ...patch } });

  useEffect(() => {
    let url: string | null = null;
    setLoading(true);
    api<Blob>('style-preview', { body: { style, language: v.language } })
      .then((b) => { url = URL.createObjectURL(b); setPreview(url); })
      .catch(() => setPreview(null))
      .finally(() => setLoading(false));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [style, v.language]);

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl">
      <Stack>
        <div>
          <Text size="sm" fw={500} mb={6}>{t('form.colors')}</Text>
          <Group gap="xs">
            <UnstyledButton onClick={() => setStyle({ theme: undefined })}>
              <Box p={4} style={{ border: `2px solid ${!v.style.theme ? 'var(--mantine-primary-color-filled)' : 'transparent'}`, borderRadius: 8 }}>
                <Text size="xs" px={6} py={8}>{t('form.mixed')}</Text>
              </Box>
            </UnstyledButton>
            {themes.data?.map((t) => (
              <UnstyledButton key={t.key} onClick={() => setStyle({ theme: t.key })} title={t.key}>
                <Box p={4} style={{ border: `2px solid ${v.style.theme === t.key ? 'var(--mantine-primary-color-filled)' : 'transparent'}`, borderRadius: 8 }}>
                  <Box w={36} h={36} style={{ backgroundImage: t.bg, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Text c={t.accent} fw={800} fz={22} lh={1} mt={8}>“</Text>
                  </Box>
                </Box>
              </UnstyledButton>
            ))}
          </Group>
        </div>
        <div>
          <Text size="sm" fw={500} mb={6}>{t('form.font')}</Text>
          <SegmentedControl data={[{ value: 'serif', label: t('form.serif') }, { value: 'sans', label: t('form.sans') }]}
            value={v.style.font ?? 'serif'} onChange={(f) => setStyle({ font: f as 'serif' | 'sans' })} />
        </div>
        <TextInput label={t('form.signature')} placeholder={t('form.signaturePh')} maxLength={40} value={v.style.signature ?? ''} onChange={(e) => setStyle({ signature: e.currentTarget.value })} />
        <div>
          <Text size="sm" fw={500} mb={4}>{t('form.media')}</Text>
          <SegmentedControl fullWidth value={v.style.media ?? 'card'} onChange={(m) => setStyle({ media: m as 'card' | 'ai' })}
            data={[{ value: 'card', label: t('form.mediaCard') }, { value: 'ai', label: `✨ ${t('form.mediaAi')}` }]} />
          <Text size="xs" c="dimmed" mt={4}>{t(v.style.media === 'ai' ? 'form.mediaAiHint' : 'form.mediaCardHint')}</Text>
        </div>
        {v.style.media === 'ai' && (
          <Switch checked={v.style.text !== false} onChange={(e) => setStyle({ text: e.currentTarget.checked })}
            label={t('form.textOnMedia')} description={t('form.textOnMediaHint')} />
        )}
      </Stack>
      <Box pos="relative" maw={320} mx="auto" w="100%">
        <Box className="media-box" style={{ aspectRatio: '4 / 5' }}>{preview && <Image src={preview} alt={t('form.example')} />}</Box>
        {loading && <Loader size="sm" pos="absolute" top={10} right={10} />}
        <Text size="xs" c="dimmed" ta="center" mt={4}>{t(v.style.media === 'ai' ? 'form.exampleAi' : 'form.example')}</Text>
      </Box>
    </SimpleGrid>
  );
}
