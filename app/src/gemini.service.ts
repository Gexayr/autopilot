import { Injectable } from '@nestjs/common';
import { config } from './config';
import { Page } from './entities';

export interface GeneratedPost {
  quote: string;
  caption: string;
  hashtags: string[];
}

const LANGS: Record<string, string> = { ru: 'Russian', en: 'English', hy: 'Armenian' };

/** The owner doesn't want long dashes anywhere, so strip any the model still produces. */
export const noDashes = (s: string) => s.replace(/\s+[—–]\s+/g, ', ').replace(/[—–]/g, '-');

@Injectable()
export class GeminiService {
  async generate(page: Page, recentQuotes: string[], hint?: string, language = page.language): Promise<GeneratedPost> {
    const lang = LANGS[language] ?? language;
    const prompt = [
      `You write posts for an Instagram page. Page topic and voice: ${page.niche}`,
      `Write ONE new post in ${lang}.`,
      `- "quote": the text that goes ON the image: one strong, original thought, max 160 characters, no hashtags, no emoji, no quotation marks around it.`,
      `- "caption": the Instagram caption under the post: 2-4 short sentences that expand the thought and end with a question or call to action. Max 600 characters. Emoji allowed sparingly.`,
      `- "hashtags": 8-15 relevant hashtags without the # sign, mixing popular and niche ones, in ${lang} and English.`,
      `Never use em dashes (—) or en dashes (–) anywhere; use commas, colons or periods instead.`,
      hint ? `Extra instruction from the editor: ${hint}` : '',
      recentQuotes.length ? `Do NOT repeat or paraphrase any of these recent quotes:\n${recentQuotes.map((q) => `- ${q}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 1.1,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                quote: { type: 'STRING' },
                caption: { type: 'STRING' },
                hashtags: { type: 'ARRAY', items: { type: 'STRING' } },
              },
              required: ['quote', 'caption', 'hashtags'],
            },
          },
        }),
        signal: AbortSignal.timeout(90_000),
      },
    );
    const json: any = await res.json();
    if (!res.ok) throw new Error(`Gemini: ${json.error?.message ?? res.statusText}`);
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(`Gemini returned no text (${json.candidates?.[0]?.finishReason ?? 'unknown'})`);
    const out = JSON.parse(text) as GeneratedPost;
    out.quote = noDashes(out.quote.trim().replace(/^["«“]+|["»”]+$/g, ''));
    out.caption = noDashes(out.caption);
    out.hashtags = out.hashtags.map((h) => h.replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 25);
    return out;
  }
}
