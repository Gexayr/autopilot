import { Injectable, Logger } from '@nestjs/common';
import { config } from './config';
import { Page } from './entities';

export interface GeneratedPost {
  quote: string;
  caption: string;
  hashtags: string[];
  scene: string; // English prompt for an AI image that illustrates the quote
  motion: string; // English: what moves and how the camera moves in a 5-second clip
}

const LANGS: Record<string, string> = { ru: 'Russian', en: 'English', hy: 'Armenian' };

const BUSY = new Set([429, 500, 502, 503, 504]);

/** `busy` = overloaded or rate-limited: worth retrying later. */
export class GeminiError extends Error {
  constructor(message: string, readonly busy: boolean, readonly cause?: unknown) { super(message); }
}

/** The owner doesn't want long dashes anywhere, so strip any the model still produces. */
export const noDashes = (s: string) => s.replace(/\s+[—–]\s+/g, ', ').replace(/[—–]/g, '-');

@Injectable()
export class GeminiService {
  private readonly log = new Logger(GeminiService.name);

  async generate(page: Page, recentQuotes: string[], hint?: string, language = page.language): Promise<GeneratedPost> {
    const lang = LANGS[language] ?? language;
    const prompt = [
      `You write posts for an Instagram page. Page topic and voice: ${page.niche}`,
      `Write ONE new post in ${lang}.`,
      `- "quote": the text that goes ON the image: one strong, original thought, max 160 characters, no hashtags, no emoji, no quotation marks around it.`,
      `- "caption": the Instagram caption under the post: 2-4 short sentences that expand the thought and end with a question or call to action. Max 600 characters. Emoji allowed sparingly.`,
      `- "hashtags": 8-15 relevant hashtags without the # sign, mixing popular and niche ones, in ${lang} and English.`,
      `- "scene": in English, a vivid visual scene for an AI image generator that illustrates the thought: subject, action, setting, lighting, camera angle, style. 40-80 words. No text, letters, signs or logos in the scene.`,
      `- "motion": in English, one sentence for a 5-second video made from that image: what moves and how the camera moves (e.g. slow push-in, gentle pan).`,
      page.character?.enabled && page.character.description
        ? `The page has a recurring character that must be the main subject of the scene, doing something that fits the thought: ${page.character.description}`
        : '',
      `Never use em dashes (—) or en dashes (–) anywhere; use commas, colons or periods instead.`,
      hint ? `Extra instruction from the editor: ${hint}` : '',
      recentQuotes.length ? `Do NOT repeat or paraphrase any of these recent quotes:\n${recentQuotes.map((q) => `- ${q}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    const text = await this.withRetries(prompt);
    const out = JSON.parse(text) as GeneratedPost;
    out.quote = noDashes(out.quote.trim().replace(/^["«“]+|["»”]+$/g, ''));
    out.caption = noDashes(out.caption);
    out.hashtags = out.hashtags.map((h) => h.replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 25);
    return out;
  }

  /**
   * Gemini's free tier often answers 503 "high demand" for a minute or two: retry, then fall back to lighter models
   * (config.gemini.fallbacks) instead of failing the post.
   */
  private async withRetries(prompt: string): Promise<string> {
    const models = [...new Set([config.gemini.model, ...config.gemini.fallbacks])];
    let last: unknown;
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await this.request(model, prompt);
        } catch (e) {
          last = e;
          if (!(e instanceof GeminiError && e.busy) && (e as Error).name !== 'TimeoutError') throw e;
          this.log.warn(`${model} attempt ${attempt + 1}: ${(e as Error).message}`);
          if (attempt === 0) await new Promise((r) => setTimeout(r, 4000));
        }
      }
    }
    throw new GeminiError('Gemini busy', true, last);
  }

  private async request(model: string, prompt: string): Promise<string> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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
                scene: { type: 'STRING' },
                motion: { type: 'STRING' },
              },
              required: ['quote', 'caption', 'hashtags', 'scene', 'motion'],
            },
          },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    const json: any = await res.json();
    if (!res.ok) throw new GeminiError(`Gemini: ${json.error?.message ?? res.statusText}`, BUSY.has(res.status));
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new GeminiError(`Gemini returned no text (${json.candidates?.[0]?.finishReason ?? 'unknown'})`, true);
    return text as string;
  }

}
