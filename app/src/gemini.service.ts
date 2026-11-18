import { Injectable, Logger } from '@nestjs/common';
import { config } from './config';
import { Page } from './entities';
import { isMood, Mood, MOODS } from './music';
import { Action, ACTIONS, brandColors, castOf, characterMotion, Composition, COMPOSITIONS, sceneRules } from './visual';

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

/**
 * Without this every motivation page gets the same stock picture (a climber on a peak at sunrise): the model
 * doesn't know what the page already showed, so it keeps picking the most obvious image.
 */
const compositionRule = (c?: Composition) =>
  c ? `Composition of the picture (build the scene and the camera around it, and say it in the scene): ${COMPOSITIONS[c]}` : '';

const actionRule = (a?: Action) =>
  a ? `What the character does in this scene (the heart of the picture, make it clear and specific): ${ACTIONS[a]}` : '';

/**
 * The scenes are shown whole: cut to 160 characters they were only the character's description ("a small
 * white-and-blue robot with ..."), so the model never saw that it had already drawn the same moment ten times.
 */
const varietyRule = (recent: string[]) =>
  recent.length
    ? [
      `Recent pictures of this page. The new scene must be clearly different from all of them: another place, another action and pose, another camera angle and distance, time of day and mood; do not reuse the same kind of setting or the same moment:`,
      ...recent.map((x) => `- ${x.slice(0, 400)}`),
      `Avoid the cliché of the main subject just standing still and gazing up in awe at a huge object: show it doing something.`,
    ].join('\n')
    : '';

@Injectable()
export class GeminiService {
  private readonly log = new Logger(GeminiService.name);

  async generate(page: Page, recentQuotes: string[], hint?: string, language = page.language, recentScenes: string[] = [], composition?: Composition, action?: Action): Promise<GeneratedPost> {
    const lang = LANGS[language] ?? language;
    const prompt = [
      `You write posts for an Instagram page. Page topic and voice: ${page.niche}`,
      `Write ONE new post in ${lang}.`,
      `- "quote": the text that goes ON the image: one strong, original thought, max 160 characters, no hashtags, no emoji, no quotation marks around it.`,
      `- "caption": the Instagram caption under the post: 2-4 short sentences that expand the thought and end with a question or call to action. Max 600 characters. Emoji allowed sparingly.`,
      `- "hashtags": 8-15 relevant hashtags without the # sign, mixing popular and niche ones, in ${lang} and English.`,
      `- "scene": in English, a vivid visual scene for an AI image generator that illustrates the thought: subject, action, setting, lighting, camera angle, style. 40-80 words. No text, letters, signs or logos in the scene.`,
      `- "motion": in English, one sentence for a 5-second video made from that image: what moves and how the camera moves (e.g. slow push-in, gentle pan).`,
      characterMotion(page.character) ? `In "motion", the character must move this way: ${page.character!.motion!.trim()}` : '',
      ...sceneRules(page.character, brandColors(page.style)),
      actionRule(action),
      compositionRule(composition),
      `Never use em dashes (—) or en dashes (–) anywhere; use commas, colons or periods instead.`,
      hint ? `Extra instruction from the editor: ${hint}` : '',
      recentQuotes.length ? `Do NOT repeat or paraphrase any of these recent quotes:\n${recentQuotes.map((q) => `- ${q}`).join('\n')}` : '',
      varietyRule(recentScenes),
    ].filter(Boolean).join('\n');

    const text = await this.withRetries(prompt, POST_SCHEMA);
    const out = JSON.parse(text) as GeneratedPost;
    out.quote = noDashes(out.quote.trim().replace(/^["«“]+|["»”]+$/g, ''));
    out.caption = noDashes(out.caption);
    out.hashtags = out.hashtags.map((h) => h.replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 25);
    return out;
  }

  /** Another picture for the same quote (the user didn't like the previous still). */
  async scene(page: Page, quote: string, previous?: string, recentScenes: string[] = [], composition?: Composition, action?: Action): Promise<{ scene: string; motion: string }> {
    const prompt = [
      `An Instagram post (topic: ${page.niche}) carries this thought: "${quote}".`,
      `- "scene": in English, a vivid visual scene for an AI image generator that illustrates the thought: subject, action, setting, lighting, camera angle, style. 40-80 words. No text, letters, signs or logos in the scene.`,
      `- "motion": in English, one sentence for a short video made from that image: what moves and how the camera moves.`,
      characterMotion(page.character) ? `In "motion", the character must move this way: ${page.character!.motion!.trim()}` : '',
      ...sceneRules(page.character, brandColors(page.style)),
      actionRule(action),
      compositionRule(composition),
      previous ? `The previous scene was rejected, make a clearly different one (other place, action and mood):\n${previous}` : '',
      varietyRule(recentScenes.filter((x) => x !== previous)),
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

  /** Mood of the background music for a Reels: one of MOODS (src/music.ts). */
  async musicMood(page: Page, quote: string, scene?: string): Promise<Mood> {
    const prompt = [
      `Pick background music for a short Instagram Reels video (page topic: ${page.niche}).`,
      `The thought on it: "${quote}".`,
      scene ? `What the video shows: ${scene}` : '',
      `- "mood": the music mood that fits the feeling of the thought and the picture best, one of: ${MOODS.join(', ')}.`,
    ].filter(Boolean).join('\n');
    const out = JSON.parse(await this.withRetries(prompt, { type: 'OBJECT', properties: { mood: { type: 'STRING', enum: MOODS } }, required: ['mood'] }));
    return isMood(out.mood) ? out.mood : 'calm';
  }

  /** What the AI clip's own sound is (`audio`: mp3): music, or sounds of the scene (wind, steps, machines, voices). */
  async soundKind(audio: Buffer): Promise<'music' | 'ambient'> {
    const prompt = [
      `This is the soundtrack of a 5-second AI video.`,
      `- "kind": "music" if it is mainly music (a melody, instruments, a song, a musical score), "ambient" if it is mainly sounds of the scene: nature, wind, water, footsteps, machines, crowd, voices, sound effects.`,
    ].join('\n');
    const out = JSON.parse(await this.withRetries(prompt, { type: 'OBJECT', properties: { kind: { type: 'STRING', enum: ['music', 'ambient'] } }, required: ['kind'] }, audio, 'audio/mp3'));
    return out.kind === 'music' ? 'music' : 'ambient';
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
  private async withRetries(prompt: string, schema: object, image?: Buffer, mime = 'image/jpeg'): Promise<string> {
    const models = [...new Set([config.gemini.model, ...config.gemini.fallbacks])];
    let last: unknown;
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await this.request(model, prompt, schema, image, mime);
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

  private async request(model: string, prompt: string, schema: object, image?: Buffer, mime = 'image/jpeg'): Promise<string> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [...(image ? [{ inlineData: { mimeType: mime, data: image.toString('base64') } }] : []), { text: prompt }] }],
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
