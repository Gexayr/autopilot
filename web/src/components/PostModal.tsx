import { Alert, Badge, Button, Grid, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { IconBrandInstagram, IconCheck, IconPencil, IconRefresh, IconSend, IconTrash } from '@tabler/icons-react';
import { DateTimePicker } from '@mantine/dates';
import { useState } from 'react';
import { api, Page, Post } from '../api';
import { useAction } from '../hooks';
import { t } from '../i18n';
import { dayjs, fmtTime, freeSlots, STATUS } from '../util';
import { EditPostModal } from './EditPostModal';
import { Media } from './Media';

/** Details of one post from the calendar: move, publish now, edit, delete. */
export function PostModal({ post, page, posts, onClose, onChanged }: { post: Post | null; page?: Page; posts: Post[]; onClose: () => void; onChanged: () => void }) {
  const { busy, run } = useAction();
  const [editing, setEditing] = useState<Post | null>(null);
  const [custom, setCustom] = useState<Date | null>(null);
  if (!post || !page) return null;
  const queued = post.status === 'approved';
  const done = () => { onChanged(); onClose(); };
  const move = (at: string | Date) => run('move', async () => {
    await api(`posts/${post.id}`, { method: 'PATCH', body: { scheduledFor: new Date(at).toISOString() } });
    done();
  }, t('post.moved'));

  return (
    <>
      <Modal opened onClose={onClose} title={`${page.title} · ${post.kind === 'VIDEO' ? t('common.reels') : t('common.post')}`} size="xl">
        <Grid>
          <Grid.Col span={{ base: 12, sm: 5 }}><Media post={post} maxH={480} /></Grid.Col>
          <Grid.Col span={{ base: 12, sm: 7 }}>
            <Stack gap="sm">
              <Group gap="xs">
                <Badge color={STATUS[post.status].color}>{STATUS[post.status].label}</Badge>
                <Text size="sm">{fmtTime(post.publishedAt ?? post.scheduledFor, page.timezone)}</Text>
              </Group>
              {post.quote && <Text fw={600}>«{post.quote}»</Text>}
              <Text size="sm" className="pre-line" mah={200} style={{ overflow: 'auto' }}>{post.caption || <i>{t('post.noCaption')}</i>}</Text>
              {post.error && <Alert color="red" p="xs">{post.error}</Alert>}
              {post.permalink && <Button component="a" href={post.permalink} target="_blank" variant="light" size="xs" w="fit-content" leftSection={<IconBrandInstagram size={14} />}>{t('common.openInstagram')}</Button>}
              {post.stats && (
                <Text size="sm" c="dimmed">{t('stats.reach')} {post.stats.reach ?? 0} · ❤️ {post.stats.likes ?? 0} · 💬 {post.stats.comments ?? 0} · 🔖 {post.stats.saved ?? 0}</Text>
              )}
              {queued && (
                <Stack gap={6}>
                  <Select label={t('post.moveFree')} placeholder={t('post.pickSlot')} searchable
                    data={freeSlots(page, posts).map((d) => ({ value: d.toISOString(), label: d.format('dd, D MMM · HH:mm') }))}
                    onChange={(x) => x && move(x)} disabled={busy === 'move'} />
                  <Group gap="xs" align="flex-end">
                    <DateTimePicker label={t('post.orAny')} placeholder={t('post.dateTime')} value={custom} onChange={setCustom} minDate={new Date()} valueFormat="D MMM YYYY, HH:mm" style={{ flex: 1 }} />
                    <Button variant="default" disabled={!custom} loading={busy === 'move'} onClick={() => custom && move(custom)} aria-label="OK"><IconCheck size={16} /></Button>
                  </Group>
                </Stack>
              )}
              <Group gap="xs" mt="sm">
                {queued && <Button size="xs" leftSection={<IconSend size={14} />} loading={busy === 'now'} onClick={() => run('now', async () => { await api(`posts/${post.id}/publish-now`, { body: {} }); done(); }, t('post.publishing'))}>{t('post.publishNow')}</Button>}
                {(queued || post.status === 'awaiting_approval') && <Button size="xs" variant="default" leftSection={<IconPencil size={14} />} onClick={() => setEditing(post)}>{t('post.editText')}</Button>}
                {post.status === 'failed' && <Button size="xs" leftSection={<IconRefresh size={14} />} loading={busy === 'retry'} onClick={() => run('retry', async () => { await api(`posts/${post.id}/approve`, { body: {} }); done(); }, t('post.requeued'))}>{t('post.retry')}</Button>}
                {!['published', 'publishing', 'rejected'].includes(post.status) && (
                  <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={14} />} loading={busy === 'del'}
                    onClick={() => confirm(t('post.removeConfirm')) && run('del', async () => { await api(`posts/${post.id}`, { method: 'DELETE' }); done(); }, t('post.removed'))}>{t('post.remove')}</Button>
                )}
              </Group>
              {queued && dayjs(post.scheduledFor).diff(dayjs(), 'minute') < 2 && <Text size="xs" c="dimmed">{t('post.soon')}</Text>}
            </Stack>
          </Grid.Col>
        </Grid>
      </Modal>
      <EditPostModal post={editing} onClose={() => setEditing(null)} onSaved={done} />
    </>
  );
}
