import { Alert, Button, Group, Stack } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { api, Page } from '../api';
import { useAction } from '../hooks';
import { lang, t } from '../i18n';
import { emptyWorld, WorldDraft, WorldEditor } from './WorldEditor';

const fromPage = (p: Page): WorldDraft => {
  const c = p.character;
  return c ? { style: c.style || 'photo', world: c.world ?? '', enabled: c.enabled, description: c.description, refsMode: c.refsMode ?? 'character' } : emptyWorld();
};

/** "World & style" tab of the page settings: pictures upload at once, the rest is saved with its own button. */
export function CharacterFields({ page, onChange }: { page: Page; onChange: (p: Page) => void }) {
  const [v, setV] = useState<WorldDraft>(() => fromPage(page));
  const { busy, run } = useAction();
  useEffect(() => setV(fromPage(page)), [page.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = (file: File) => run('upload', async () => {
    const form = new FormData();
    form.append('file', file);
    onChange(await api<Page>(`pages/${page.id}/character/refs`, { form }));
  });
  const remove = (file: string) => run(`rm${file}`, async () => {
    onChange(await api<Page>(`pages/${page.id}/character/refs/${file}`, { method: 'DELETE' }));
  });
  const expand = () => run('world', async () => {
    const r = await api<{ world: string }>(`pages/${page.id}/world`, { body: { brief: v.world, language: lang() } });
    setV((x) => ({ ...x, world: r.world }));
  });
  const save = () => run('save', async () => {
    onChange(await api<Page>(`pages/${page.id}`, { method: 'PATCH', body: { character: v } }));
  }, t('common.saved'));

  return (
    <Stack>
      {page.style.media !== 'ai' && <Alert color="yellow">{t('char.needAi')}</Alert>}
      <WorldEditor v={v} set={(patch) => setV((x) => ({ ...x, ...patch }))} busy={busy}
        refs={(page.character?.refs ?? []).map((r) => ({ key: r.file, url: r.url }))}
        onAddRef={upload} onRemoveRef={remove} onExpand={expand} />
      <Group justify="flex-end">
        <Button leftSection={<IconCheck size={16} />} loading={busy === 'save'} onClick={save}>{t('common.save')}</Button>
      </Group>
    </Stack>
  );
}
