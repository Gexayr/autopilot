import { Alert, Button, Card, Group, Loader, Select, Stack, Tabs, Title } from '@mantine/core';
import { IconArrowLeft, IconCalendarTime, IconCheck, IconWorld, IconPalette, IconTextCaption, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Account, api, Page } from '../api';
import { CharacterFields } from '../components/CharacterFields';
import { PageDraft, ScheduleFields, StyleFields, TopicFields } from '../components/PageForm';
import { useAction, useLoad } from '../hooks';
import { t } from '../i18n';

export default function PageEdit() {
  const id = Number(useParams().id);
  const page = useLoad(() => api<Page>(`pages/${id}`), [id]);
  const accounts = useLoad(() => api<Account[]>('accounts'));
  const pages = useLoad(() => api<Page[]>('pages'));
  const [v, setV] = useState<(PageDraft & { igAccountId: number }) | null>(null);
  const { busy, run } = useAction();
  const nav = useNavigate();

  useEffect(() => {
    const p = page.data;
    // only once: later reloads (character pictures, saves) must not wipe unsaved edits in the form
    if (p && !v) setV({ title: p.title, niche: p.niche, language: p.language, slots: p.slots, reelsRatio: p.reelsRatio, timezone: p.timezone,
      bufferDays: p.bufferDays, aiEnabled: p.aiEnabled, autoApprove: p.autoApprove, style: p.style, igAccountId: p.igAccountId });
  }, [page.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (page.error) return <Alert color="red">{page.error}</Alert>;
  if (!v || !page.data) return <Loader />;
  const set = (patch: Partial<PageDraft>) => setV((x) => x && { ...x, ...patch });

  const save = () => run('save', async () => {
    await api(`pages/${id}`, { method: 'PATCH', body: v });
    await page.reload();
  }, t('common.saved'));
  const remove = () => confirm(t('edit.deleteConfirm', { title: page.data!.title })) &&
    run('del', async () => { await api(`pages/${id}`, { method: 'DELETE' }); nav('/'); }, t('edit.deleted'));

  return (
    <Stack maw={760}>
      <Title order={2}>{page.data.title}</Title>
      <Tabs defaultValue="topic">
        <Tabs.List>
          <Tabs.Tab value="topic" leftSection={<IconTextCaption size={16} />}>{t('edit.tab.topic')}</Tabs.Tab>
          <Tabs.Tab value="schedule" leftSection={<IconCalendarTime size={16} />}>{t('edit.tab.schedule')}</Tabs.Tab>
          <Tabs.Tab value="style" leftSection={<IconPalette size={16} />}>{t('edit.tab.style')}</Tabs.Tab>
          <Tabs.Tab value="character" leftSection={<IconWorld size={16} />}>{t('edit.tab.character')}</Tabs.Tab>
          <Tabs.Tab value="danger" c="red" leftSection={<IconTrash size={16} />}>{t('edit.tab.danger')}</Tabs.Tab>
        </Tabs.List>
        <Card withBorder mt="md">
          <Tabs.Panel value="topic">
            <Stack>
              <TopicFields v={v} set={set} />
              <Select label={t('edit.account')} data={(accounts.data ?? []).map((a) => ({ value: String(a.id), label: `@${a.username}` }))}
                value={String(v.igAccountId)} onChange={(x) => x && setV({ ...v, igAccountId: Number(x) })} allowDeselect={false} />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="schedule"><ScheduleFields v={v} set={set} advanced account={accounts.data?.find((a) => a.id === v.igAccountId)?.username}
            others={(pages.data ?? []).filter((p) => p.igAccountId === v.igAccountId && p.id !== id)} /></Tabs.Panel>
          <Tabs.Panel value="style"><StyleFields v={v} set={set} logo={{
            url: page.data.logoUrl, busy: busy === 'logo',
            onPick: (file) => run('logo', async () => {
              const form = new FormData();
              form.append('file', file);
              const p = await api<Page>(`pages/${id}/brand/logo`, { form });
              page.setData(p);
              setV((x) => x && { ...x, style: { ...x.style, logo: p.style.logo } });
            }),
            onRemove: () => run('logo', async () => {
              const p = await api<Page>(`pages/${id}/brand/logo`, { method: 'DELETE' });
              page.setData(p);
              setV((x) => x && { ...x, style: { ...x.style, logo: undefined } });
            }),
          }} /></Tabs.Panel>
          <Tabs.Panel value="character"><CharacterFields page={{ ...page.data, style: v.style }} onChange={(p) => page.setData(p)} /></Tabs.Panel>
          <Tabs.Panel value="danger">
            <Button color="red" variant="light" leftSection={<IconTrash size={16} />} loading={busy === 'del'} onClick={remove}>{t('edit.delete')}</Button>
          </Tabs.Panel>
        </Card>
      </Tabs>
      <Group justify="flex-end" className="sticky-actions">
        <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => nav(-1)}>{t('common.back')}</Button>
        <Button leftSection={<IconCheck size={16} />} loading={busy === 'save'} onClick={save}>{t('common.save')}</Button>
      </Group>
    </Stack>
  );
}
