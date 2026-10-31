import { Button, Menu, SegmentedControl } from '@mantine/core';
import { IconCheck, IconLanguage } from '@tabler/icons-react';
import { Lang, lang, LANGS, setLang, t } from '../i18n';

/** Compact language menu for headers. */
export function LangMenu() {
  const cur = LANGS.find((l) => l.value === lang())!;
  return (
    <Menu position="bottom-end" width={160}>
      <Menu.Target>
        <Button variant="subtle" color="gray" size="compact-sm" leftSection={<IconLanguage size={16} />} aria-label={t('common.language')}>{cur.short}</Button>
      </Menu.Target>
      <Menu.Dropdown>
        {LANGS.map((l) => (
          <Menu.Item key={l.value} onClick={() => setLang(l.value)} rightSection={l.value === cur.value ? <IconCheck size={14} /> : null}>{l.label}</Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/** Full-width switch for the settings page. */
export function LangSegmented() {
  return <SegmentedControl fullWidth value={lang()} onChange={(v) => setLang(v as Lang)} data={LANGS.map((l) => ({ value: l.value, label: l.label }))} />;
}
