import { Anchor } from '@mantine/core';
import { Fragment, ReactNode } from 'react';
import { Key, t } from '../i18n';

/** Translated text with <b>…</b> and <a>…</a> (the link goes to `href`). */
export function Rich({ k, href, vars }: { k: Key; href?: string; vars?: Record<string, string | number> }) {
  const parts: ReactNode[] = [];
  const re = /<(b|a)>(.*?)<\/\1>/g;
  const s = t(k, vars);
  let last = 0;
  for (let m: RegExpExecArray | null; (m = re.exec(s)); last = re.lastIndex) {
    parts.push(s.slice(last, m.index));
    parts.push(m[1] === 'b' ? <b key={m.index}>{m[2]}</b> : <Anchor key={m.index} href={href} target="_blank" inherit>{m[2]}</Anchor>);
  }
  parts.push(s.slice(last));
  return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}
