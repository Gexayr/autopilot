import { config } from './config';
import type { PageCharacter, PageStyle } from './entities';

/** The brand switch: explicit, or on for pages that set a brand before the switch existed. */
export const brandOn = (s: PageStyle) => s.brand ?? !!(s.logo || s.footer || s.colors?.length);

/** Brand colors that steer AI scenes (none while the brand is off). */
export const brandColors = (s: PageStyle) => (brandOn(s) ? s.colors ?? [] : []);

/** Picture styles for AI scenes (keys are stored in pages.character.style; anything else is the user's own text). */
export const VISUAL_STYLES: Record<string, string> = {
  photo: 'Photorealistic photo, natural cinematic light',
  cinematic: 'Cinematic film still, dramatic lighting, shallow depth of field, color graded',
  game: 'AAA video game cinematic, Unreal Engine 5 render, volumetric lighting, highly detailed 3D environment',
  anime: 'Anime style, detailed background art, vibrant colors, expressive lighting',
  cartoon: '3D animated movie style, soft global illumination, playful and polished',
  fantasy: 'Epic digital fantasy painting, concept art, rich atmosphere',
  pixel: 'Pixel art, 16-bit video game style, crisp pixels, limited palette',
};

export const styleText = (v?: PageCharacter | null) => {
  const s = v?.style?.trim();
  return !s ? VISUAL_STYLES.photo : VISUAL_STYLES[s] ?? s;
};

/** Reference pictures that go to the image model, if any. */
export const refsInUse = (v?: PageCharacter | null) =>
  !v?.refs.length ? [] : v.refsMode === 'style' || v.enabled ? v.refs : [];

/** Named characters of the page (several pictures may share a name), or none when the pictures aren't named. */
export const castOf = (v?: PageCharacter | null): string[] =>
  !v?.enabled || v.refsMode === 'style' ? [] : [...new Set((v.names ?? []).filter((_, i) => i < v.refs.length).map((n) => n.trim()).filter(Boolean))];

const NAME_SKIP = new Set(['the', 'and', 'of', 'von', 'van', 'mr', 'mrs', 'sir', 'lady', 'lord', 'dr']);
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Is the character in the scene? Any distinctive word of its name counts ("Thorne" for "Professor Thorne"). */
const inScene = (scene: string, name: string) =>
  name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !NAME_SKIP.has(w))
    .some((w) => new RegExp(`(^|[^\\p{L}])${escape(w)}([^\\p{L}]|$)`, 'iu').test(scene));

/**
 * Pictures for this scene with the name of who is on each. With named pictures only the characters the scene
 * mentions go to the model, one picture each (the first one of that name), so the hero, his friend and the
 * villain don't all end up in every picture, merged.
 */
export function refsForScene(v: PageCharacter | null | undefined, scene: string): { file: string; name: string }[] {
  const all = refsInUse(v).map((file, i) => ({ file, name: v?.names?.[i]?.trim() ?? '' }));
  if (!castOf(v).length) return all.map((r) => ({ ...r, name: '' }));
  const seen = new Set<string>();
  return all.filter((r) => {
    const key = r.name.toLowerCase();
    if (!r.name || seen.has(key) || !inScene(scene, r.name)) return false;
    seen.add(key);
    return true;
  });
}

/** What Gemini has to respect when it invents a scene: the world, the style, the recurring character. */
export function sceneRules(v?: PageCharacter | null, colors?: string[]): string[] {
  return [
    colors?.length ? `Brand colors that must dominate the palette of every scene: ${colors.join(', ')}.` : '',
    v?.world?.trim() ? `Every scene takes place in this world (keep its look, places and mood): ${v.world.trim()}` : '',
    `Visual style of the scene: ${styleText(v)}.`,
    castOf(v).length
      ? `Recurring characters: ${castOf(v).join(', ')}. ${v!.description} Most scenes show one or two of them doing something that fits the post, some show only the world; whenever one appears, call them by the exact name above.`
      : v?.enabled && v.description ? `A recurring character must be the main subject, doing something that fits the post: ${v.description}` : '',
  ].filter(Boolean);
}

const PEOPLE = /\b(man|men|woman|women|person|persons|people|human|humans|guy|girl|girls|boy|boys|child|children|kid|kids|baby|teen|teenager|crowd|figure|silhouette|traveler|traveller|hiker|climber|runner|athlete|worker|student|family|couple|friends|someone|gentleman|lady|businessman|businesswoman|mother|father|parent|grandfather|grandmother|soldier|knight|warrior|king|queen|he|she|his|her|him)\b/i;

/** Does Gemini's scene description have people in it? */
export const hasPeople = (scene: string) => PEOPLE.test(scene);

const absent = (v: PageCharacter | null | undefined, refs: { name: string }[]) =>
  castOf(v).filter((n) => !refs.some((r) => r.name.toLowerCase() === n.toLowerCase()));

/** Prompt for the image model. */
export function imagePrompt(v: PageCharacter | null | undefined, scene: string, refs: { name: string }[], colors?: string[]): string {
  const named = refs.some((r) => r.name);
  return [
    // first: models follow the style much better when it leads than when it trails the scene
    `${styleText(v)}.`,
    colors?.length ? `Color palette built on the brand colors ${colors.join(', ')}.` : '',
    !refs.length ? ''
      : v?.refsMode === 'style' ? 'Match the world, art style, colors and atmosphere of the reference images (they show the setting, do not copy them literally).'
      : named ? `${refs.map((r, i) => `Reference image ${i + 1} shows ${r.name}.`).join(' ')} Draw each of them exactly as in their reference image: face, hair, beard, clothes, proportions. They are different characters: never mix their features. Use the pictures only for the characters, not for the background or composition.`
      : 'Use the character from the reference images as the main character and keep it exactly the same: shape, proportions, colors, materials, face.',
    // named characters: their description only when this picture has them, or the model draws them into empty scenes
    v?.enabled && v.description && (named || !castOf(v).length) ? `Character: ${v.description}.` : '',
    // the description covers the whole cast: without this the model adds the ones that aren't in the scene
    named && absent(v, refs).length ? `Only ${refs.map((r) => r.name).join(' and ')} in this image, not ${absent(v, refs).join(' or ')}.` : '',
    // no world text here: Gemini already put it into the scene, and repeating it drags every picture back to
    // the same place (a Venice scene came out half London)
    `Scene: ${scene}`,
    // image models pick faces on their own (Qwen leans Asian): the owner wants European / Caucasian people,
    // added only when the scene has people in it, so a landscape stays a landscape
    hasPeople(scene) ? `People in this image: ${config.peopleAppearance}.` : '',
    'No readable text, letters, captions, logos or watermarks anywhere in the image.',
  ].filter(Boolean).join('\n');
}
