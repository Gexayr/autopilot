import { ActionIcon, Badge, Box, Button, Card, Group, Image, Paper, SegmentedControl, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconChevronLeft, IconChevronRight, IconPlus, IconUpload } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, Page, Post } from '../api';
import { PostModal } from '../components/PostModal';
import { UploadModal } from '../components/UploadModal';
import { useLoad } from '../hooks';
import { t } from '../i18n';
import { dayjs, freeSlots, pageColor, STATUS } from '../util';

type Mode = 'week' | 'month';
const SHOWN = 'approved,publishing,published,failed';

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const pageFilter = params.get('page');
  const [mode, setMode] = useState<Mode>('week');
  const [anchor, setAnchor] = useState(dayjs());
  const mobile = useMediaQuery('(max-width: 48em)');
  const [open, setOpen] = useState<Post | null>(null);
  const [upload, setUpload] = useState<{ pageId?: number; at?: string } | null>(null);

  const start = mode === 'week' ? anchor.startOf('week') : anchor.startOf('month').startOf('week');
  const end = mode === 'week' ? start.add(7, 'day') : anchor.endOf('month').endOf('week').add(1, 'ms');
  const pages = useLoad(() => api<Page[]>('pages'));
  const posts = useLoad(() => api<Post[]>(`posts?status=${SHOWN}&from=${start.toISOString()}&to=${end.toISOString()}`), [start.valueOf(), end.valueOf()], 60_000);
  // future queue (beyond the visible range too): needed to compute free slots
  const queue = useLoad(() => api<Post[]>('posts?status=approved,publishing'), [posts.data]);

  const shownPages = (pages.data ?? []).filter((p) => !pageFilter || String(p.id) === pageFilter);
  const pageOf = (id: number) => pages.data?.find((p) => p.id === id);
  const days = useMemo(() => Array.from({ length: end.diff(start, 'day') }, (_, i) => start.add(i, 'day')), [start.valueOf(), end.valueOf()]);
  const visiblePosts = (posts.data ?? []).filter((p) => !pageFilter || String(p.pageId) === pageFilter);
  const when = (p: Post) => dayjs(p.publishedAt ?? p.scheduledFor);

  // free slots (week view): next free times of each active page within the visible week
  const free = useMemo(() => mode !== 'week' ? [] : shownPages.filter((p) => p.active).flatMap((p) =>
    freeSlots(p, queue.data ?? [], 30, (dayjs().isAfter(start) ? dayjs() : start)).filter((d) => d.isBefore(end)).map((d) => ({ page: p, at: d }))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [mode, shownPages.map((p) => p.id).join(), queue.data, start.valueOf()]);

  const reload = () => { void posts.reload(); void queue.reload(); };
  const shift = (n: number) => setAnchor(anchor.add(n, mode));
  const title = mode === 'week' ? `${start.format('D MMM')} - ${end.subtract(1, 'day').format('D MMM YYYY')}` : anchor.format('MMMM YYYY');

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t('calendar.title')}</Title>
        <Button leftSection={<IconUpload size={16} />} onClick={() => setUpload({ pageId: pageFilter ? Number(pageFilter) : undefined })} disabled={!pages.data?.length}>{t('calendar.upload')}</Button>
      </Group>
      <Group justify="space-between">
        <Group gap={4}>
          <ActionIcon variant="default" size={30} onClick={() => shift(-1)} aria-label={t('calendar.prev')}><IconChevronLeft size={16} /></ActionIcon>
          <Button variant="default" size="xs" onClick={() => setAnchor(dayjs())}>{t('calendar.today')}</Button>
          <ActionIcon variant="default" size={30} onClick={() => shift(1)} aria-label={t('calendar.next')}><IconChevronRight size={16} /></ActionIcon>
          <Text fw={600} ml="xs" tt="capitalize">{title}</Text>
        </Group>
        <Group gap="xs">
          <Select placeholder={t('common.allRubrics')} clearable w={180} size="xs" value={pageFilter}
            data={(pages.data ?? []).map((p) => ({ value: String(p.id), label: p.title }))} onChange={(x) => setParams(x ? { page: x } : {})} />
          <SegmentedControl size="xs" value={mode} onChange={(m) => setMode(m as Mode)} data={[{ value: 'week', label: t('calendar.week') }, { value: 'month', label: t('calendar.month') }]} />
        </Group>
      </Group>

      {mode === 'week' ? (
        <SimpleGrid cols={mobile ? 1 : 7} spacing="xs">
          {days.map((d) => {
            type Item = { t: number; post?: Post; free?: { page: Page; at: dayjs.Dayjs } };
            const items: Item[] = [
              ...visiblePosts.filter((p) => when(p).isSame(d, 'day')).map((p) => ({ t: when(p).valueOf(), post: p })),
              ...free.filter((f) => f.at.isSame(d, 'day')).map((f) => ({ t: f.at.valueOf(), free: f })),
            ].sort((a, b) => a.t - b.t);
            const today = d.isSame(dayjs(), 'day');
            if (mobile && !items.length) return null;
            return (
              <Paper key={d.valueOf()} withBorder p={6} className="cal-day" bg={today ? 'var(--mantine-color-default-hover)' : undefined}>
                <Text size="xs" fw={700} c={today ? 'violet' : 'dimmed'} tt="capitalize" mb={4}>{d.format(mobile ? 'dddd, D MMMM' : 'dd D')}</Text>
                <Stack gap={6}>
                  {items.map((it) => it.post ? (
                    <PostChip key={`p${it.post.id}`} post={it.post} page={pageOf(it.post.pageId)} onClick={() => setOpen(it.post!)} />
                  ) : (
                    <Box key={`f${it.free!.page.id}-${it.t}`} className="slot-free" p={4} onClick={() => setUpload({ pageId: it.free!.page.id, at: it.free!.at.toISOString() })}>
                      <Group gap={4} wrap="nowrap">
                        <IconPlus size={12} />
                        <Text size="xs" c="dimmed" truncate>{dayjs(it.t).format('HH:mm')} · {t('calendar.free')}{!pageFilter && shownPages.length > 1 ? ` · ${it.free!.page.title}` : ''}</Text>
                      </Group>
                    </Box>
                  ))}
                </Stack>
              </Paper>
            );
          })}
        </SimpleGrid>
      ) : (
        <SimpleGrid cols={7} spacing={4}>
          {days.slice(0, 7).map((d) => <Text key={d.day()} size="xs" c="dimmed" ta="center" tt="capitalize">{d.format('dd')}</Text>)}
          {days.map((d) => {
            const items = visiblePosts.filter((p) => when(p).isSame(d, 'day'));
            return (
              <Paper key={d.valueOf()} withBorder p={4} mih={mobile ? 56 : 96} style={{ opacity: d.isSame(anchor, 'month') ? 1 : 0.45 }}>
                <Text size="xs" fw={d.isSame(dayjs(), 'day') ? 800 : 500} c={d.isSame(dayjs(), 'day') ? 'violet' : undefined}>{d.date()}</Text>
                {mobile ? (
                  <Group gap={2}>{items.map((p) => <Box key={p.id} w={8} h={8} bg={`${pageColor(p.pageId)}.6`} style={{ borderRadius: 8, cursor: 'pointer' }} onClick={() => setOpen(p)} />)}</Group>
                ) : (
                  <Group gap={3}>
                    {items.slice(0, 6).map((p) => (
                      <Box key={p.id} w={30} h={36} className="media-box" onClick={() => setOpen(p)} style={{ cursor: 'pointer', outline: `2px solid var(--mantine-color-${pageColor(p.pageId)}-6)` }}
                        title={`${when(p).format('HH:mm')} ${pageOf(p.pageId)?.title ?? ''}`}>
                        {p.mediaUrl && p.kind === 'IMAGE' ? <img src={p.mediaUrl} alt="" loading="lazy" /> : <Text size="xs" ta="center" pt={8}>{p.kind === 'VIDEO' ? '🎬' : '✅'}</Text>}
                      </Box>
                    ))}
                    {items.length > 6 && <Text size="xs">+{items.length - 6}</Text>}
                  </Group>
                )}
              </Paper>
            );
          })}
        </SimpleGrid>
      )}

      <PostModal post={open} page={open ? pageOf(open.pageId) : undefined} posts={queue.data ?? []} onClose={() => setOpen(null)} onChanged={reload} />
      <UploadModal opened={!!upload} pages={pages.data ?? []} posts={queue.data ?? []} initial={upload ?? undefined} onClose={() => setUpload(null)} onDone={reload} />
    </Stack>
  );
}

function PostChip({ post, page, onClick }: { post: Post; page?: Page; onClick: () => void }) {
  const at = dayjs(post.publishedAt ?? post.scheduledFor);
  return (
    <Card withBorder padding={4} onClick={onClick} style={{ cursor: 'pointer', borderLeft: `3px solid var(--mantine-color-${pageColor(post.pageId)}-6)` }}>
      <Group gap={6} wrap="nowrap" align="flex-start">
        <Box w={36} h={45} className="media-box" style={{ flexShrink: 0 }}>
          {post.mediaUrl && post.kind === 'IMAGE' ? <Image src={post.mediaUrl} /> : <Text ta="center" pt={10}>{post.kind === 'VIDEO' ? '🎬' : '🖼'}</Text>}
        </Box>
        <Box style={{ minWidth: 0 }}>
          <Text size="xs" fw={700}>{at.format('HH:mm')} {post.status !== 'approved' && <Badge size="xs" color={STATUS[post.status].color} variant="light">{STATUS[post.status].label}</Badge>}</Text>
          <Text size="xs" lineClamp={2}>{post.quote ?? (post.caption || page?.title)}</Text>
        </Box>
      </Group>
    </Card>
  );
}
