import { Injectable, Logger } from '@nestjs/common';
import { config } from './config';
import { Page } from './entities';
import { brandColors, castOf, sceneRules } from './visual';

export interface GeneratedPost {
  quote: string;
  caption: string;
  hashtags: string[];
  scene: string; // English prompt for an AI image that illustrates the quote
  motion: string; // English: what moves and how the camera moves in a 5-second clip
}

const LANGS: Record<string, string> = { ru: 'Russian', en: 'English', hy: 'Armenian' };

const STR = { type: 'STRING' };
const POST_SCHEMA = {
  type: 'OBJECT',
  properties: { quote: STR, caption: STR, hashtags: { type: 'ARRAY', items: STR }, scene: STR, motion: STR },
  required: ['quote', 'caption', 'hashtags', 'scene', 'motion'],
};
const SCENE_SCHEMA = { type: 'OBJECT', properties: { scene: STR, motion: STR }, required: ['scene', 'motion'] };

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
      ...sceneRules(page.character, brandColors(page.style)),
      `Never use em dashes (—) or en dashes (–) anywhere; use commas, colons or periods instead.`,
      hint ? `Extra instruction from the editor: ${hint}` : '',
      recentQuotes.length ? `Do NOT repeat or paraphrase any of these recent quotes:\n${recentQuotes.map((q) => `- ${q}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    const text = await this.withRetries(prompt, POST_SCHEMA);
    const out = JSON.parse(text) as GeneratedPost;
    out.quote = noDashes(out.quote.trim().replace(/^["«“]+|["»”]+$/g, ''));
    out.caption = noDashes(out.caption);
    out.hashtags = out.hashtags.map((h) => h.replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 25);
    return out;
  }

  /** Another picture for the same quote (the user didn't like the previous still). */
  async scene(page: Page, quote: string, previous?: string): Promise<{ scene: string; motion: string }> {
    const prompt = [
      `An Instagram post (topic: ${page.niche}) carries this thought: "${quote}".`,
      `- "scene": in English, a vivid visual scene for an AI image generator that illustrates the thought: subject, action, setting, lighting, camera angle, style. 40-80 words. No text, letters, signs or logos in the scene.`,
      `- "motion": in English, one sentence for a short video made from that image: what moves and how the camera moves.`,
      ...sceneRules(page.character, brandColors(page.style)),
      previous ? `The previous scene was rejected, make a clearly different one (other place, action and mood):\n${previous}` : '',
    ].filter(Boolean).join('\n');
    return JSON.parse(await this.withRetries(prompt, SCENE_SCHEMA));
  }

  /** Caption and hashtags for a picture or video the owner uploaded without text (`image`: the JPEG or a frame of the video). */
  async describe(page: Page, image: Buffer, kind: 'IMAGE' | 'VIDEO'): Promise<{ caption: string; hashtags: string[] }> {
    const lang = LANGS[page.language] ?? page.language;
    const cast = castOf(page.character);
    const prompt = [
      `You write posts for an Instagram page. Page topic and voice: ${page.niche}`,
      `The owner uploaded this ${kind === 'VIDEO' ? 'video (you see one frame of it)' : 'picture'}. Write its post in ${lang}, about what is actually shown.`,
      cast.length ? `Recurring characters of the page: ${cast.join(', ')}. ${page.character!.description} If one of them is in the picture, call them by that name.` : '',
      `- "caption": the Instagram caption: 2-4 short sentences that fit the page voice and end with a question or call to action. Max 600 characters. Emoji allowed sparingly.`,
      `- "hashtags": 8-15 relevant hashtags without the # sign, mixing popular and niche ones, in ${lang} and English.`,
      `Never use em dashes (—) or en dashes (–) anywhere; use commas, colons or periods instead.`,
    ].filter(Boolean).join('\n');
    const schema = { type: 'OBJECT', properties: { caption: STR, hashtags: { type: 'ARRAY', items: STR } }, required: ['caption', 'hashtags'] };
    const out = JSON.parse(await this.withRetries(prompt, schema, image));
    return {
      caption: noDashes(String(out.caption).trim()),
      hashtags: (out.hashtags as string[]).map((h) => h.replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 25),
    };
  }

  /** A short "it's a game about …" turned into a vivid description of the world for the scene prompts. */
  async world(brief: string, language: string): Promise<string> {
    const prompt = [
      `Expand this short description into a vivid description of a visual world for an AI image and video generator: ${brief}`,
      `Describe places, architecture or nature, era, technology or magic, colors, light, mood and typical details. 80-150 words, one paragraph.`,
      `Write it in ${LANGS[language] ?? 'English'}. No lists, no headings. Never use em dashes or en dashes.`,
    ].join('\n');
    const out = JSON.parse(await this.withRetries(prompt, { type: 'OBJECT', properties: { world: STR }, required: ['world'] }));
    return noDashes(String(out.world).trim());
  }

  /**
   * Gemini's free tier often answers 503 "high demand" for a minute or two: retry, then fall back to lighter models
   * (config.gemini.fallbacks) instead of failing the post.
   */
  private async withRetries(prompt: string, schema: object, image?: Buffer): Promise<string> {
    const models = [...new Set([config.gemini.model, ...config.gemini.fallbacks])];
    let last: unknown;
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await this.request(model, prompt, schema, image);
        } catch (e) {
          last = e;
          if (!(e instanceof GeminiError && e.busy) && (e as Error).name !== 'TimeoutError') throw e;
          this.log.warn(`${model} attempt ${attempt + 1}: ${(e as Error).message}`);
          if (attempt === 0) await new Promise((r) => setTimeout(r, 4000));
        }
      }
    }
    // Gemini's free daily quota runs out too: Qwen on the Alibaba key (its own free quota) is the last resort
    if (config.dashscope.apiKey && !image) { // Qwen here is text-only: it can't see a picture
      try {
        return await this.requestQwen(prompt, schema);
      } catch (e) {
        this.log.warn(`qwen: ${(e as Error).message}`);
      }
    }
    throw new GeminiError('Gemini busy', true, last);
  }

  /** OpenAI-compatible chat on Alibaba Model Studio; the JSON shape is spelled out in the prompt. */
  private async requestQwen(prompt: string, schema: any): Promise<string> {
    const keys = Object.entries(schema.properties ?? {}).map(([k, v]: [string, any]) => `"${k}": ${v.type === 'ARRAY' ? 'array of strings' : 'string'}`);
    const res = await fetch(`${config.dashscope.baseUrl.replace(/\/api\/v1$/, '')}/compatible-mode/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.dashscope.apiKey}` },
      body: JSON.stringify({
        model: config.qwenTextModel,
        messages: [{ role: 'user', content: `${prompt}\n\nAnswer with one JSON object only, with exactly these keys: { ${keys.join(', ')} }.` }],
        response_format: { type: 'json_object' },
        temperature: 1,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const json: any = await res.json();
    const text = json.choices?.[0]?.message?.content;
    if (!res.ok || !text) throw new Error(json.error?.message ?? res.statusText);
    this.log.log(`answered by ${config.qwenTextModel}`);
    return text as string;
  }

  private async request(model: string, prompt: string, schema: object, image?: Buffer): Promise<string> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [...(image ? [{ inlineData: { mimeType: 'image/jpeg', data: image.toString('base64') } }] : []), { text: prompt }] }],
          generationConfig: {
            temperature: 1.1,
            responseMimeType: 'application/json',
            responseSchema: schema,
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
