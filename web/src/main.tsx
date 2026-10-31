import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/dropzone/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/charts/styles.css';
import './styles.css';
import { createTheme, MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { tgApp } from './telegram';
import { DAYJS_LOCALE, lang, onLangChange } from './i18n';
import { watchForUpdates } from './update';
import './util';

const theme = createTheme({
  primaryColor: 'violet',
  defaultRadius: 'md',
  // "Armenian UI" (styles.css) only covers Armenian letters, so Latin and Cyrillic keep the system font
  fontFamily: '"Armenian UI", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  headings: { fontFamily: '"Armenian UI", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
});

// Inside Telegram follow its light/dark choice; in a browser follow the system.
const tgScheme = tgApp()?.colorScheme as 'light' | 'dark' | undefined;

/** Re-mounts the app when the language changes, so every `t()` call is evaluated again. */
function Root() {
  const [l, setL] = useState(lang());
  useEffect(() => { onLangChange(setL); }, []);
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto" forceColorScheme={tgScheme}>
      <DatesProvider settings={{ locale: DAYJS_LOCALE[l], firstDayOfWeek: 1 }}>
        <Notifications position="top-center" />
        <BrowserRouter key={l}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </DatesProvider>
    </MantineProvider>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);

watchForUpdates();
