import { Alert, Button, Group, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Component, ReactNode } from 'react';
import { t } from '../i18n';

/**
 * Catches a render crash of one screen, so the user sees a message instead of a blank page.
 * App gives it key={pathname}: going to another screen clears the error.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Alert color="red" icon={<IconAlertTriangle />} title={t('error.title')} mt="md">
        <Text size="sm">{t('error.text')}</Text>
        <Text size="xs" c="dimmed" mt={4} style={{ wordBreak: 'break-word' }}>{this.state.error.message}</Text>
        <Group mt="sm" gap="xs">
          <Button size="xs" onClick={() => location.reload()}>{t('error.reload')}</Button>
          <Button size="xs" variant="default" onClick={() => { location.href = '/'; }}>{t('error.home')}</Button>
        </Group>
      </Alert>
    );
  }
}
