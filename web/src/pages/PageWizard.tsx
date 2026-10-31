import { Avatar, Button, Card, Group, Loader, Radio, Stack, Stepper, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { IconArrowLeft, IconArrowRight, IconSparkles, IconDeviceFloppy } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { Account, api, Page } from '../api';
import { emptyDraft, PageDraft, ScheduleFields, StyleFields, TopicFields } from '../components/PageForm';
import { emptyWorld, WorldDraft, WorldEditor } from '../components/WorldEditor';
import { useAction, useLoad } from '../hooks';
import InstagramConnect from '../components/InstagramConnect';
import { lang, t } from '../i18n';

export default function PageWizard() {
  const accounts = useLoad(() => api<Account[]>('accounts'));
  const pages = useLoad(() => api<Page[]>('pages'));
  const [step, setStep] = useState(0);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [v, setV] = useState<PageDraft>(emptyDraft);
  const set = (patch: Partial<PageDraft>) => setV((x) => ({ ...x, ...patch }));
  const [world, setWorld] = useState<WorldDraft>(emptyWorld);
  // pictures picked before the page exists: uploaded right after it is created
  const [refs, setRefs] = useState<{ key: string; url: string; file: File }[]>([]);
  const [logo, setLogo] = useState<{ url: string; file: File } | null>(null);
  const { busy, run } = useAction();
  const nav = useNavigate();
  const LAST = 4;

  // preselect the newest account (e.g. right after connecting one)
  useEffect(() => {
    const list = accounts.data;
    if (list?.length && accountId == null) setAccountId(list[list.length - 1].id);
  }, [accounts.data, accountId]);
  const account = accounts.data?.find((a) => a.id === accountId);
  useEffect(() => {
    // the signature follows the chosen account unless the user wrote their own
    const own = v.style.signature && !(accounts.data ?? []).some((a) => v.style.signature === `@${a.username}`);
    if (account && !own) set({ style: { ...v.style, signature: `@${account.username}` } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  const canNext = [!!accountId, !!v.title.trim() && !!v.niche.trim(), v.slots.length > 0, true, true][step];
  const worldSet = !!world.world.trim() || world.enabled || refs.length > 0 || world.style !== 'photo';

  /** Creates the page (+ its world), uploads the picked pictures, then asks for the first posts if wanted. */
  const save = async (start: boolean) => {
    const page = await api<Page>('pages', { body: {
      ...v, igAccountId: accountId, ...(worldSet && { character: world }),
      ...(start ? { generateNow: refs.length === 0 && !logo } : { active: false, generateNow: false }),
    } });
    if (logo) {
      const form = new FormData();
      form.append('file', logo.file);
      await api(`pages/${page.id}/brand/logo`, { form });
    }
    for (const r of refs) {
      const form = new FormData();
      form.append('file', r.file);
      await api(`pages/${page.id}/character/refs`, { form });
    }
    // with pictures the first posts start only now, so they already use them
    if (start && (refs.length || logo)) for (let i = 0; i < 3; i++) await api(`pages/${page.id}/generate`, { body: {} });
    return page;
  };
  const expandWorld = () => run('world', async () => {
    const r = await api<{ world: string }>('world', { body: { brief: world.world, language: lang() } });
    setWorld((x) => ({ ...x, world: r.world }));
  });

  const create = () => run('create', async () => {
    const page = await save(true);
    nav(`/approvals?page=${page.id}&new=1`);
  }, t('wizard.created'));
  // paused and without posts: the rest is filled in its settings, then it is switched on
  const saveLater = () => run('later', async () => {
    const page = await save(false);
    nav(`/pages/${page.id}`);
  }, t('wizard.savedLater'));

  return (
    <Stack maw={760}>
      <Title order={2}>{t('wizard.title')}</Title>
      <Stepper active={step} onStepClick={(s) => s < step && setStep(s)} size="sm">
        <Stepper.Step label={t('wizard.step.instagram')}>
          <Stack mt="md">
            {accounts.loading && <Loader />}
            {accounts.data && accounts.data.length > 0 && (
              <Radio.Group value={accountId ? String(accountId) : null} onChange={(x) => setAccountId(Number(x))} label={t('wizard.where')}>
                <Stack mt="xs" gap="xs">
                  {accounts.data.map((a) => (
                    <Card key={a.id} withBorder padding="sm" onClick={() => setAccountId(a.id)} style={{ cursor: 'pointer' }}>
                      <Group>
                        <Radio value={String(a.id)} />
                        <Avatar src={a.avatarUrl} radius="xl" size="sm" />
                        <Text fw={500}>@{a.username}</Text>
                        {a.pages.length > 0 && <Text size="xs" c="dimmed">{t('wizard.hasRubrics', { list: a.pages.map((p) => p.title).join(', ') })}</Text>}
                      </Group>
                    </Card>
                  ))}
                </Stack>
              </Radio.Group>
            )}
            <Card withBorder>
              <Stack gap="sm">
                <Text fw={500}>{accounts.data?.length ? t('wizard.orConnect') : t('wizard.connect')}</Text>
                <InstagramConnect returnTo="/pages/new" hasAccounts={!!accounts.data?.length} />
              </Stack>
            </Card>
          </Stack>
        </Stepper.Step>
        <Stepper.Step label={t('wizard.step.topic')}><Card withBorder mt="md"><TopicFields v={v} set={set} /></Card></Stepper.Step>
        <Stepper.Step label={t('wizard.step.schedule')}><Card withBorder mt="md"><ScheduleFields v={v} set={set} account={account?.username} others={(pages.data ?? []).filter((p) => p.igAccountId === accountId)} /></Card></Stepper.Step>
        <Stepper.Step label={t('wizard.step.style')}><Card withBorder mt="md"><StyleFields v={v} set={set} logo={{
          url: logo?.url ?? null, onPick: (file) => setLogo({ url: URL.createObjectURL(file), file }), onRemove: () => setLogo(null),
        }} /></Card></Stepper.Step>
        <Stepper.Step label={t('wizard.step.world')}>
          <Card withBorder mt="md">
            {v.style.media !== 'ai' && <Text size="sm" c="dimmed" mb="sm">{t('wizard.worldCardMode')}</Text>}
            <WorldEditor v={world} set={(patch) => setWorld((x) => ({ ...x, ...patch }))} busy={busy} onExpand={expandWorld}
              refs={refs} onRemoveRef={(key) => setRefs((xs) => xs.filter((r) => r.key !== key))}
              onAddRef={(file) => setRefs((xs) => [...xs, { key: `${file.name}-${Date.now()}`, url: URL.createObjectURL(file), file }])} />
          </Card>
        </Stepper.Step>
      </Stepper>
      <Stack gap="xs" className="sticky-actions">
        <Group justify="space-between" wrap="nowrap">
          <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => (step ? setStep(step - 1) : nav(-1))}>{t('common.back')}</Button>
          {step < LAST
            ? <Button rightSection={<IconArrowRight size={16} />} disabled={!canNext} onClick={() => setStep(step + 1)}>{t('common.next')}</Button>
            : <Button leftSection={<IconSparkles size={16} />} loading={busy === 'create'} onClick={create}>{t('wizard.create')}</Button>}
        </Group>
        {step >= 1 && (
          <Button variant="subtle" size="xs" leftSection={<IconDeviceFloppy size={14} />} disabled={!accountId || !v.title.trim() || !v.niche.trim()}
            loading={busy === 'later'} onClick={saveLater}>{t('wizard.saveLater')}</Button>
        )}
      </Stack>
    </Stack>
  );
}
