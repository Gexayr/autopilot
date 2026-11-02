import { Alert, Badge, Button, Card, Center, Group, Loader, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { PageLoader } from '../components/PageLoader';
import { IconCheck, IconMovie, IconPencil, IconPhotoEdit, IconRefresh, IconSparkles, IconX, IconRocket } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, Page, Post } from '../api';
import { EditPostModal } from '../components/EditPostModal';
import { Media } from '../components/Media';
import { useAction, useLoad } from '../hooks';
import { lang, t } from '../i18n';
import { freeSlots, LANGUAGES, pageColor } from '../util';

export default function Approvals({ onChange }: { onChange: () => void }) {
  const [params, setParams] = useSearchParams();
  const pageFilter = params.get('page');
  const pages = useLoad(() => api<Page[]>('pages'));
  const posts = useLoad(() => api<Post[]>('posts?status=generating,frame_approval,awaiting_approval'), [], 8_000);
  // queued posts are needed to show which slot an approved post would take
  const queued = useLoad(() => api<Post[]>('posts?status=approved'), [posts.data?.length]);
  const [editing, setEditing] = useState<Post | null>(null);
  const [genUntil, setGenUntil] = useState(0); // "AI is working" note for ~90 s after a request
  const [genPage, setGenPage] = useState<string | null>(pageFilter);
  const [hint, setHint] = useState('');
  const [genLang, setGenLang] = useState<string | null>(null); // null = the rubric's own language
  const { busy, run } = useAction();

  // with a single rubric there is nothing to choose
  useEffect(() => { if (!genPage && pages.data?.length === 1) setGenPage(String(pages.data[0].id)); }, [pages.data, genPage]);

  const pageOf = (id: number) => pages.data?.find((p) => p.id === id);
  const list = (posts.data ?? []).filter((p) => !pageFilter || String(p.pageId) === pageFilter);
  const refresh = async () => { await posts.reload(); onChange(); };

  // 'now' = approve and publish within a minute instead of the next free slot
  const act = (p: Post, action: 'approve' | 'now' | 'reject' | 'regenerate') => run(`${action}${p.id}`, async () => {
    await api(`posts/${p.id}/${action === 'now' ? 'approve' : action}`, { body: action === 'now' ? { now: true } : {} });
    if (action === 'regenerate') setGenUntil(Date.now() + 90_000);
    posts.setData((xs) => xs?.filter((x) => x.id !== p.id) ?? null);
    await refresh();
  }, { approve: t('approvals.approved'), now: t('approvals.publishingNow'), reject: t('approvals.discarded'), regenerate: t('approvals.regenerating') }[action]);

  const frame = (p: Post, action: 'approve' | 'now' | 'new') => run(`frame${action}${p.id}`, async () => {
    await api(`posts/${p.id}/frame/${action === 'new' ? 'new' : 'approve'}`, { body: action === 'now' ? { now: true } : {} });
    await refresh();
  }, { approve: t('approvals.animating'), now: t('approvals.animatingNow'), new: t('approvals.newFrameToast') }[action]);

  const generate = () => run('gen', async () => {
    await api(`pages/${genPage}/generate`, { body: { hint, language: genLang ?? undefined } });
    setGenUntil(Date.now() + 90_000);
    setHint('');
  }, t('approvals.making'));

  const nextSlot = (p: Post) => {
    const page = pageOf(p.pageId);
    return page ? freeSlots(page, queued.data ?? [], 1)[0] : undefined;
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t('approvals.title')}</Title>
        <Select placeholder={t('common.allRubrics')} clearable w={220} value={pageFilter}
          data={(pages.data ?? []).map((p) => ({ value: String(p.id), label: p.title }))}
          onChange={(x) => setParams(x ? { page: x } : {})} />
      </Group>

      {params.get('new') && <Alert color="violet" icon={<IconSparkles />}>{t('approvals.newAlert')}</Alert>}
      {genUntil > Date.now() && <Alert color="gray" icon={<Loader size="xs" />}>{t('approvals.working')}</Alert>}
      {posts.loading && <PageLoader />}
      {!posts.loading && list.length === 0 && <Card withBorder p="xl"><Text ta="center" c="dimmed">{t('approvals.empty')}</Text></Card>}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {list.map((p) => {
          const page = pageOf(p.pageId);
          if (p.status === 'frame_approval') return (
            <Card key={p.id} withBorder padding="sm">
              <Card.Section pos="relative">
                {p.frameUrl && <img src={p.frameUrl} alt="" style={{ width: '100%', maxHeight: 520, objectFit: 'cover', display: 'block' }} />}
                <Badge pos="absolute" top={8} left={8} color="orange">{t('approvals.frameBadge')}</Badge>
              </Card.Section>
              <Stack gap={6} mt="sm">
                <Group justify="space-between" gap={4}>
                  <Badge color={pageColor(p.pageId)} variant="light">{page?.title}</Badge>
                  <Text size="xs" c="dimmed">🎬 {t('common.reels')} #{p.num ?? p.id}</Text>
                </Group>
                {p.quote && <Text fw={600} size="sm">«{p.quote}»</Text>}
                <Text size="xs" c="dimmed">{t('approvals.frameHint')}</Text>
                <Group gap={6} grow mt={4}>
                  <Button size="xs" color="green" leftSection={<IconMovie size={14} />} loading={busy === `frameapprove${p.id}`} onClick={() => frame(p, 'approve')}>{t('approvals.animate')}</Button>
                  <Button size="xs" color="violet" leftSection={<IconRocket size={14} />} loading={busy === `framenow${p.id}`} onClick={() => frame(p, 'now')}>{t('approvals.animateNow')}</Button>
                </Group>
                <Button size="xs" variant="default" leftSection={<IconPhotoEdit size={14} />} loading={busy === `framenew${p.id}`} onClick={() => frame(p, 'new')}>{t('approvals.newFrame')}</Button>
                <Button size="xs" variant="subtle" color="red" leftSection={<IconX size={14} />} loading={busy === `reject${p.id}`} onClick={() => act(p, 'reject')}>{t('approvals.discard')}</Button>
              </Stack>
            </Card>
          );
          if (p.status === 'generating') return (
            <Card key={p.id} withBorder padding="sm">
              <Card.Section>
                <Center h={260} bg="var(--mantine-color-default-hover)">
                  <Stack align="center" gap={6}><Loader type="dots" /><Text size="sm" c="dimmed">{t('approvals.generating')}</Text></Stack>
                </Center>
              </Card.Section>
              <Stack gap={6} mt="sm">
                <Group justify="space-between" gap={4}>
                  <Badge color={pageColor(p.pageId)} variant="light">{page?.title}</Badge>
                  <Text size="xs" c="dimmed">{p.kind === 'VIDEO' ? `🎬 ${t('common.reels')}` : `🖼 ${t('common.post')}`} #{p.num ?? p.id}</Text>
                </Group>
                {p.quote && <Text fw={600} size="sm">«{p.quote}»</Text>}
                <Button size="xs" variant="subtle" color="red" leftSection={<IconX size={14} />} loading={busy === `reject${p.id}`} onClick={() => act(p, 'reject')}>{t('approvals.discard')}</Button>
              </Stack>
            </Card>
          );
          const slot = nextSlot(p);
          return (
            <Card key={p.id} withBorder padding="sm">
              <Card.Section><Media post={p} maxH={520} /></Card.Section>
              <Stack gap={6} mt="sm">
                <Group justify="space-between" gap={4}>
                  <Badge color={pageColor(p.pageId)} variant="light">{page?.title}</Badge>
                  <Text size="xs" c="dimmed">{p.kind === 'VIDEO' ? `🎬 ${t('common.reels')}` : `🖼 ${t('common.post')}`} #{p.num ?? p.id}</Text>
                </Group>
                {p.quote && <Text fw={600} size="sm">«{p.quote}»</Text>}
                <Text size="sm" c="dimmed" className="clamp-3">{p.caption}</Text>
                {slot && <Text size="xs">{t('approvals.goesOut')} <b>{slot.format('dd, D MMM · HH:mm')}</b></Text>}
                <Group gap={6} grow mt={4}>
                  <Button size="xs" color="green" leftSection={<IconCheck size={14} />} loading={busy === `approve${p.id}`} onClick={() => act(p, 'approve')}>{t('approvals.approve')}</Button>
                  <Button size="xs" color="violet" leftSection={<IconRocket size={14} />} loading={busy === `now${p.id}`} onClick={() => act(p, 'now')}>{t('approvals.now')}</Button>
                </Group>
                <Group gap={6} grow>
                  <Button size="xs" variant="default" leftSection={<IconRefresh size={14} />} loading={busy === `regenerate${p.id}`} onClick={() => act(p, 'regenerate')}>{t('approvals.another')}</Button>
                  <Button size="xs" variant="subtle" leftSection={<IconPencil size={14} />} onClick={() => setEditing(p)}>{t('approvals.edit')}</Button>
                  <Button size="xs" variant="subtle" color="red" leftSection={<IconX size={14} />} loading={busy === `reject${p.id}`} onClick={() => act(p, 'reject')}>{t('approvals.discard')}</Button>
                </Group>
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>

      {(pages.data?.length ?? 0) > 0 && (
        <Card withBorder>
          <Text fw={600} mb="xs">✨ {t('approvals.genTitle')}</Text>
          <Group align="flex-end" gap="xs">
            <Select label={t('common.rubric')} w={200} value={genPage} onChange={(x) => { setGenPage(x); setGenLang(null); }}
              data={(pages.data ?? []).map((p) => ({ value: String(p.id), label: p.title }))} />
            <TextInput label={t('approvals.hint')} placeholder={t('approvals.hintPh')} style={{ flex: 1, minWidth: 200 }} value={hint} onChange={(e) => setHint(e.currentTarget.value)} />
          </Group>
          <Group align="flex-end" gap="xs" mt="xs" justify="space-between">
            <div>
              <Text size="sm" fw={500} mb={4}>{t('approvals.postLang')}</Text>
              <SegmentedControl size="xs" data={LANGUAGES} disabled={!genPage}
                value={genLang ?? (genPage ? pageOf(Number(genPage))?.language : undefined) ?? lang()} onChange={setGenLang} />
            </div>
            <Button leftSection={<IconSparkles size={16} />} disabled={!genPage} loading={busy === 'gen'} onClick={generate}>{t('approvals.make')}</Button>
          </Group>
        </Card>
      )}
      <Text size="xs" c="dimmed">{t('approvals.footnote')}</Text>

      <EditPostModal post={editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </Stack>
  );
}
