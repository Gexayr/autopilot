import { LineChart } from '@mantine/charts';
import { Alert, Anchor, Badge, Card, Group, Loader, SegmentedControl, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { api, Stats } from '../api';
import { useLoad } from '../hooks';
import { t } from '../i18n';
import { dayjs, fmtNum, pageColor } from '../util';

const METRICS = ['reach', 'likes', 'saved', 'comments', 'shares'] as const;

export default function StatsPage() {
  const [days, setDays] = useState('30');
  const stats = useLoad(() => api<Stats>(`stats?days=${days}`), [days]);
  const s = stats.data;

  // one row per day, one column per page (followers)
  const chart = (() => {
    if (!s) return [];
    const byDay = new Map<string, Record<string, string | number>>();
    for (const p of s.pages) for (const pt of p.series) {
      const row = byDay.get(pt.day) ?? { day: dayjs(pt.day).format('D MMM') };
      row[p.title] = pt.followers;
      byDay.set(pt.day, row);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, r]) => r);
  })();
  const pageTitle = (id: number) => s?.pages.find((p) => p.id === id)?.title;

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t('stats.title')}</Title>
        <SegmentedControl value={days} onChange={setDays} data={['7', '30', '90'].map((n) => ({ value: n, label: t('stats.days', { n }) }))} />
      </Group>
      {stats.loading && <Loader />}
      {stats.error && <Alert color="red">{stats.error}</Alert>}
      {s && (
        <>
          <Card withBorder>
            <Text fw={600} mb="sm">{t('stats.followers')}</Text>
            {chart.length < 2 ? (
              <Text c="dimmed" size="sm">{t('stats.collecting')}</Text>
            ) : (
              <LineChart h={260} data={chart} dataKey="day" withLegend curveType="monotone" connectNulls
                series={s.pages.map((p) => ({ name: p.title, color: `${pageColor(p.id)}.6` }))} />
            )}
          </Card>

          <Text fw={600}>{t('stats.compare')}</Text>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {s.pages.map((p) => (
              <Card key={p.id} withBorder>
                <Group justify="space-between" mb="xs">
                  <Badge color={pageColor(p.id)} variant="light" size="lg">{p.title}</Badge>
                  <Text size="sm" c="dimmed">{t('stats.published', { n: p.published })}</Text>
                </Group>
                <Table withRowBorders={false} verticalSpacing={4}>
                  <Table.Thead><Table.Tr><Table.Th /><Table.Th ta="right">🖼 {t('stats.images', { n: p.byKind.IMAGE.count })}</Table.Th><Table.Th ta="right">🎬 {t('stats.reels', { n: p.byKind.VIDEO.count })}</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {METRICS.map((k) => {
                      const a = p.byKind.IMAGE[k], b = p.byKind.VIDEO[k];
                      const win = a != null && b != null && a !== b ? (a > b ? 'a' : 'b') : null;
                      return (
                        <Table.Tr key={k}>
                          <Table.Td c="dimmed">{t(`stats.${k}`)}</Table.Td>
                          <Table.Td ta="right" fw={win === 'a' ? 700 : 400}>{fmtNum(a)}</Table.Td>
                          <Table.Td ta="right" fw={win === 'b' ? 700 : 400}>{fmtNum(b)}</Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Card>
            ))}
          </SimpleGrid>

          <Card withBorder>
            <Text fw={600} mb="sm">{t('stats.top')}</Text>
            {s.top.length === 0 ? <Text c="dimmed" size="sm">{t('stats.noData')}</Text> : (
              <Table.ScrollContainer minWidth={560}>
                <Table verticalSpacing="xs">
                  <Table.Thead><Table.Tr><Table.Th>{t('common.post')}</Table.Th><Table.Th>{t('common.rubric')}</Table.Th><Table.Th ta="right">{t('stats.reach')}</Table.Th><Table.Th ta="right">❤️</Table.Th><Table.Th ta="right">🔖</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {s.top.map((t) => (
                      <Table.Tr key={t.id}>
                        <Table.Td maw={320}>
                          <Anchor href={t.permalink ?? undefined} target="_blank" size="sm" lineClamp={2}>{t.kind === 'VIDEO' ? '🎬 ' : '🖼 '}{t.quote ?? t.caption}</Anchor>
                          <Text size="xs" c="dimmed">{dayjs(t.publishedAt).format('D MMM')}</Text>
                        </Table.Td>
                        <Table.Td><Text size="sm">{pageTitle(t.pageId)}</Text></Table.Td>
                        <Table.Td ta="right">{fmtNum(t.stats.reach)}</Table.Td>
                        <Table.Td ta="right">{fmtNum(t.stats.likes)}</Table.Td>
                        <Table.Td ta="right">{fmtNum(t.stats.saved)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Card>
        </>
      )}
    </Stack>
  );
}
