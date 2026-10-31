import { Button, Group, Image, Modal, Progress, Select, Stack, Text, Textarea } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { IconPhoto, IconReplace, IconUpload, IconVideo } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Page, Post, uploadFile } from '../api';
import { useAction } from '../hooks';
import { lang, NUMBER_LOCALE, t } from '../i18n';
import { freeSlots } from '../util';

const ACCEPT = { 'image/jpeg': [], 'image/png': [], 'image/webp': [], 'video/mp4': [], 'video/quicktime': [] };
const MAX_MB = 200;

export function UploadModal({ opened, pages, posts, initial, onClose, onDone }: {
  opened: boolean; pages: Page[]; posts: Post[]; initial?: { pageId?: number; at?: string };
  onClose: () => void; onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [at, setAt] = useState<string>('next');
  const [caption, setCaption] = useState('');
  const [pct, setPct] = useState<number | null>(null);
  const { busy, run } = useAction();

  useEffect(() => {
    if (!opened) return;
    setFile(null); setCaption(''); setPct(null);
    setPageId(initial?.pageId ? String(initial.pageId) : pages.length === 1 ? String(pages[0].id) : null);
    setAt(initial?.at ?? 'next');
  }, [opened, initial, pages]);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const page = pages.find((p) => String(p.id) === pageId);
  const slots = page ? freeSlots(page, posts, 14) : [];
  const slotOptions = [{ value: 'next', label: t('upload.nextFree') },
    ...(initial?.at && !slots.some((s) => s.toISOString() === initial.at) ? [{ value: initial.at, label: new Date(initial.at).toLocaleString(NUMBER_LOCALE[lang()]) }] : []),
    ...slots.map((d) => ({ value: d.toISOString(), label: d.format('dd, D MMM · HH:mm') }))];

  const submit = () => run('up', async () => {
    const form = new FormData();
    form.append('pageId', pageId!);
    form.append('caption', caption);
    if (at !== 'next') form.append('scheduledFor', at);
    form.append('file', file!);
    setPct(0);
    try {
      await uploadFile(form, setPct);
    } finally {
      setPct(null);
    }
    onDone();
    onClose();
  }, t('upload.done'));

  return (
    <Modal opened={opened} onClose={onClose} title={t('upload.title')} size="lg">
      <Stack>
        {!file ? (
          <Dropzone onDrop={(f) => setFile(f[0])} accept={ACCEPT} maxSize={MAX_MB * 1024 * 1024} multiple={false}
            onReject={(r) => alert(r[0]?.errors[0]?.code === 'file-too-large' ? t('upload.tooLarge', { n: MAX_MB }) : t('upload.badType'))}>
            <Group justify="center" gap="xl" mih={140} style={{ pointerEvents: 'none' }}>
              <Dropzone.Accept><IconUpload size={42} /></Dropzone.Accept>
              <Dropzone.Idle><Group gap={4}><IconPhoto size={36} /><IconVideo size={36} /></Group></Dropzone.Idle>
              <div>
                <Text size="lg">{t('upload.drop')}</Text>
                <Text size="sm" c="dimmed">{t('upload.dropHint', { n: MAX_MB })}</Text>
              </div>
            </Group>
          </Dropzone>
        ) : (
          <Group align="flex-start" wrap="nowrap">
            {file.type.startsWith('video/') ? <video src={preview ?? undefined} style={{ width: 120, borderRadius: 8 }} muted /> : <Image src={preview} w={120} radius="md" />}
            <Stack gap={4}>
              <Text size="sm" fw={500} lineClamp={2}>{file.name}</Text>
              <Text size="xs" c="dimmed">{(file.size / 1024 / 1024).toFixed(1)} {t('common.mb')} · {file.type.startsWith('video/') ? t('common.reels') : t('upload.photo')}</Text>
              <Button size="xs" variant="subtle" leftSection={<IconReplace size={14} />} onClick={() => setFile(null)} disabled={pct != null}>{t('upload.otherFile')}</Button>
            </Stack>
          </Group>
        )}
        <Select label={t('common.rubric')} data={pages.map((p) => ({ value: String(p.id), label: p.title }))} value={pageId} onChange={setPageId} required />
        <Select label={t('upload.when')} data={slotOptions} value={at} onChange={(x) => setAt(x ?? 'next')} allowDeselect={false} disabled={!page} />
        <Textarea label={t('upload.caption')} placeholder={t('upload.captionPh')} autosize minRows={3} maxRows={10} maxLength={2200} value={caption} onChange={(e) => setCaption(e.currentTarget.value)} />
        {pct != null && <Progress value={pct} animated />}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{t('common.cancel')}</Button>
          <Button leftSection={<IconUpload size={16} />} disabled={!file || !pageId} loading={busy === 'up'} onClick={submit}>{t('upload.submit')}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
