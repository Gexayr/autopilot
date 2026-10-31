import { Injectable } from '@nestjs/common';
import { Resvg } from '@resvg/resvg-js';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import satori from 'satori';
import sharp from 'sharp';
import { config } from './config';
import { randomName } from './crypto.util';
import { PageStyle } from './entities';

const run = promisify(execFile);

export const THEMES: Record<string, { bg: string; text: string; accent: string }> = {
  midnight: { bg: 'linear-gradient(160deg, #0f2027 0%, #203a43 55%, #2c5364 100%)', text: '#f5f7fa', accent: '#f6c453' },
  ember: { bg: 'linear-gradient(160deg, #1a0a0a 0%, #5b1a18 60%, #a83c1a 100%)', text: '#fff4ea', accent: '#ffb36b' },
  forest: { bg: 'linear-gradient(160deg, #0b1f17 0%, #1e4d3b 60%, #2f7a5c 100%)', text: '#f1f8f4', accent: '#c8e6a0' },
  royal: { bg: 'linear-gradient(160deg, #14102b 0%, #34206b 60%, #5b3cc4 100%)', text: '#f6f3ff', accent: '#ffd36e' },
  paper: { bg: 'linear-gradient(160deg, #fbf7f0 0%, #f1e7d6 100%)', text: '#2a2118', accent: '#b5651d' },
  ocean: { bg: 'linear-gradient(160deg, #021b2e 0%, #05445e 60%, #189ab4 100%)', text: '#f0fbff', accent: '#75e6da' },
};

const FONT_DIR = '/usr/share/fonts/truetype/noto';
const font = (file: string) => readFileSync(join(FONT_DIR, file));
let fonts: Parameters<typeof satori>[1]['fonts'] | undefined;
const loadFonts = () =>
  (fonts ??= [
    { name: 'Serif', data: font('NotoSerif-Bold.ttf'), weight: 700, style: 'normal' },
    { name: 'Sans', data: font('NotoSans-Bold.ttf'), weight: 700, style: 'normal' },
    { name: 'Sans', data: font('NotoSans-Regular.ttf'), weight: 400, style: 'normal' },
    // Armenian glyphs: satori falls back through the font list
    { name: 'ArmenianSerif', data: font('NotoSerifArmenian-Bold.ttf'), weight: 700, style: 'normal' },
    { name: 'Armenian', data: font('NotoSansArmenian-Bold.ttf'), weight: 700, style: 'normal' },
    { name: 'Armenian', data: font('NotoSansArmenian-Regular.ttf'), weight: 400, style: 'normal' },
  ]);

const h = (type: string, style: Record<string, unknown>, children?: unknown) => ({ type, props: { style, children } });

export const pickTheme = (style: PageStyle, seed: number) => {
  if (style.theme && THEMES[style.theme]) return style.theme;
  const keys = Object.keys(THEMES);
  return keys[seed % keys.length];
};

@Injectable()
export class RenderService {
  private async card(quote: string, style: PageStyle, theme: string, width: number, height: number): Promise<Buffer> {
    const t = THEMES[theme];
    const family = style.font === 'sans' ? 'Sans, Armenian' : 'Serif, ArmenianSerif';
    const scale = width / 1080;
    const size = (quote.length < 70 ? 74 : quote.length < 120 ? 62 : 52) * scale;
    const tree = h('div', {
      width, height, display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: `${110 * scale}px ${100 * scale}px`, backgroundImage: t.bg, color: t.text, fontFamily: family,
    }, [
      h('div', { fontSize: 230 * scale, lineHeight: 0.8, color: t.accent, height: 140 * scale, display: 'flex' }, '“'),
      h('div', { fontSize: size, lineHeight: 1.3, display: 'flex', flexWrap: 'wrap' }, quote),
      h('div', { display: 'flex', alignItems: 'center', marginTop: 70 * scale }, [
        h('div', { width: 90 * scale, height: 5 * scale, backgroundColor: t.accent, marginRight: 28 * scale, display: 'flex' }),
        h('div', { fontFamily: 'Sans, Armenian', fontWeight: 400, fontSize: 34 * scale, opacity: 0.8, display: 'flex' }, style.signature ?? ''),
      ]),
    ]);
    const svg = await satori(tree as any, { width, height, fonts: loadFonts() });
    return new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
  }

  /** 1080×1350 (4:5) JPEG: always within Instagram's allowed aspect ratios. */
  async quoteImage(quote: string, style: PageStyle, theme: string): Promise<string> {
    const file = randomName('jpg');
    const png = await this.card(quote, style, theme, 1080, 1350);
    await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toFile(join(config.mediaDir, file));
    return file;
  }

  /** 1080×1920 Reels: the same card with a slow zoom, silent AAC track, 8-15 s. */
  async quoteReel(quote: string, style: PageStyle, theme: string): Promise<string> {
    const file = randomName('mp4');
    const frame = join(config.mediaDir, `.${file}.png`);
    const seconds = Math.min(15, Math.max(8, Math.round(6 + quote.length / 20)));
    const frames = seconds * 30;
    await writeFile(frame, await this.card(quote, style, theme, 1080, 1920));
    try {
      await run('ffmpeg', [
        '-y', '-loglevel', 'error',
        '-loop', '1', '-i', frame,
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
        '-filter_complex',
        `[0:v]scale=1620:2880,zoompan=z='1+0.07*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,fade=t=in:st=0:d=0.6,format=yuv420p[v]`,
        '-map', '[v]', '-map', '1:a', '-t', String(seconds),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-profile:v', 'high',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
        join(config.mediaDir, file),
      ], { timeout: 300_000 });
    } finally {
      await rm(frame, { force: true });
    }
    return file;
  }
}
