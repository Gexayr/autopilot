import { Button, Group, Modal, Stack, Textarea } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { api, Post } from '../api';
import { useAction } from '../hooks';
import { t } from '../i18n';

export function EditPostModal({ post, onClose, onSaved }: { post: Post | null; onClose: () => void; onSaved: () => void }) {
  const [quote, setQuote] = useState('');
  const [caption, setCaption] = useState('');
  const { busy, run } = useAction();
  useEffect(() => {
    setQuote(post?.quote ?? '');
    setCaption(post?.caption ?? '');
  }, [post]);

  const save = () => run('save', async () => {
    await api(`posts/${post!.id}`, { method: 'PATCH', body: { caption, ...(post!.source === 'ai' && { quote }) } });
    onSaved();
    onClose();
  }, post?.source === 'ai' && quote !== post?.quote ? t('post.redrawn') : t('common.saved'));

  return (
    <Modal opened={!!post} onClose={onClose} title={t('post.editTitle')} size="lg">
      <Stack>
        {post?.source === 'ai' && (
          <Textarea label={t('post.quote')} description={t('post.quoteHint')} autosize minRows={2} maxLength={200} value={quote} onChange={(e) => setQuote(e.currentTarget.value)} />
        )}
        <Textarea label={t('post.caption')} autosize minRows={5} maxRows={14} maxLength={2200} value={caption} onChange={(e) => setCaption(e.currentTarget.value)} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{t('common.cancel')}</Button>
          <Button leftSection={<IconCheck size={16} />} loading={busy === 'save'} onClick={save}>{t('common.save')}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
