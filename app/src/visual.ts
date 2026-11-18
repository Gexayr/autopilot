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

/**
 * Composition rules, one per picture, so the pictures of a page stop looking framed the same way
 * (the nine of "9 composition rules, one frame each": each is a single sentence in the prompt).
 */
export const COMPOSITIONS = {
  symmetry: 'Symmetrical composition: the subject dead center, the scene mirrored left and right around it.',
  leadingLines: 'Leading lines: roads, rails, rivers, corridors or beams of light run from the foreground and lead the eye to the subject.',
  depth: 'Strong depth: a distinct object close in the foreground, the subject in the middle ground and a far background, clearly layered planes.',
  silhouette: 'Silhouette: the subject is a dark, crisp shape against a bright sky, window or light source, strongly backlit.',
  negativeSpace: 'Negative space: a small subject surrounded by large empty areas of sky, water, fog or a plain surface.',
  thirds: 'Rule of thirds: the subject off center on a third line, the horizon on the upper or lower third.',
  frameInFrame: 'Frame within a frame: the subject seen through a doorway, window, arch, branches or another opening that frames it.',
  overShoulder: "Over the shoulder: the camera just behind the main character, their shoulder and head soft in the foreground, looking at what they look at.",
  spiral: 'Golden spiral: the curves of the scene spiral in toward the subject, which sits at the center of the spiral.',
} as const;
export type Composition = keyof typeof COMPOSITIONS;

/** A key of `table` the page didn't use in its last `skip` pictures (`recent`: newest first). */
function pickFresh<K extends string>(table: Record<K, string>, recent: (string | undefined)[], skip: number, random: () => number): K {
  const all = Object.keys(table) as K[];
  const used = new Set(recent.filter(Boolean).slice(0, skip));
  const fresh = all.filter((c) => !used.has(c));
  const from = fresh.length ? fresh : all;
  return from[Math.floor(random() * from.length)];
}

/** A composition the page didn't use in its last few pictures (`recent`: newest first). */
export const pickComposition = (recent: (string | undefined)[], random = Math.random): Composition =>
  pickFresh(COMPOSITIONS, recent, 5, random);

/**
 * What the recurring character is doing. Without it the model picks the same moment every time, whatever the
 * place: AstroBot "stands and gazes up in awe at a colossal X" in a kitchen, a bus, a library, a supermarket.
 */
export const ACTIONS = {
  moving: 'The character is in fast motion: running, jumping, sliding or racing, caught mid-movement, a little motion blur.',
  riding: 'The character rides or travels on something: a toy car, a skateboard, a leaf on water, a paper boat, a moving belt, an animal, a vehicle.',
  climbing: 'The character climbs, hangs from or balances on something, effort and risk in the pose.',
  carrying: 'The character carries, pushes or pulls something big for its size, working hard.',
  making: 'The character builds, fixes, cooks, paints or crafts something with its hands or tools, focused on the work.',
  together: 'The character does something together with someone: a person (only hands or part of them may be visible), an animal or another small creature; they interact, help or play.',
  playing: 'The character plays, dances or has fun: a game, a ball, bubbles, water, music, pure joy in the pose.',
  resting: 'The character rests: sits, lies, naps or relaxes somewhere cozy, a quiet calm moment.',
  hiding: 'The character hides, sneaks or peeks out from behind or inside something, playful or cautious.',
  trouble: 'The character is in a small comic or tense trouble: stuck, tangled, falling, soaked by rain, chased, something went wrong.',
  closeUp: 'A close-up of the character: the head and face fill much of the frame, its emotion shown by the pose and tilt, the place only a soft background.',
  discovering: 'The character holds, opens or examines a small found object up close in its hands, absorbed in it.',
  helping: 'The character helps or rescues someone or something: catches, lifts, waters, feeds, repairs or comforts.',
  everyday: 'The character does an ordinary human chore or habit at its own scale: reading, washing, shopping, waiting, writing, tidying.',
} as const;
export type Action = keyof typeof ACTIONS;

export const pickAction = (recent: (string | undefined)[], random = Math.random): Action => pickFresh(ACTIONS, recent, 8, random);

export const isAction = (x: unknown): x is Action => typeof x === 'string' && x in ACTIONS;

/** Does the page have a recurring character whose action is worth rotating? */
export const hasCharacter = (v?: PageCharacter | null) => !!(castOf(v).length || (v?.enabled && v.description));

export const isComposition = (x: unknown): x is Composition => typeof x === 'string' && x in COMPOSITIONS;

/** Prompt for the image model. */
export function imagePrompt(v: PageCharacter | null | undefined, scene: string, refs: { name: string }[], colors?: string[], composition?: string): string {
  const named = refs.some((r) => r.name);
  return [
    // first: models follow the style much better when it leads than when it trails the scene
    `${styleText(v)}.`,
    colors?.length ? `Color palette built on the brand colors ${colors.join(', ')}.` : '',
    !refs.length ? ''
      : v?.refsMode === 'style' ? 'Match the world, art style, colors and atmosphere of the reference images (they show the setting, do not copy them literally).'
      : named ? `${refs.map((r, i) => `Reference image ${i + 1} shows ${r.name}.`).join(' ')} Draw each of them exactly as in their reference image: face, hair, beard, clothes, proportions. They are different characters: never mix their features. Use the pictures only for the characters, not for the background or composition.`
      // the pictures often show the character in someone's hand: without the last sentence that hand lands in every scene
      : 'Use the character from the reference images as the main character and keep it exactly the same: shape, proportions, colors, materials, face. Take only the character from them: no hands, people, objects or background from the reference images.',
    // named characters: their description only when this picture has them, or the model draws them into empty scenes
    v?.enabled && v.description && (named || !castOf(v).length) ? `Character: ${v.description}.` : '',
    // the description covers the whole cast: without this the model adds the ones that aren't in the scene
    named && absent(v, refs).length ? `Only ${refs.map((r) => r.name).join(' and ')} in this image, not ${absent(v, refs).join(' or ')}.` : '',
    // no world text here: Gemini already put it into the scene, and repeating it drags every picture back to
    // the same place (a Venice scene came out half London)
    `Scene: ${scene}`,
    isComposition(composition) ? COMPOSITIONS[composition] : '',
    // image models pick faces on their own (Qwen leans Asian): the owner wants European / Caucasian people,
    // added only when the scene has people in it, so a landscape stays a landscape
    hasPeople(scene) ? `People in this image: ${config.peopleAppearance}.` : '',
    'No readable text, letters, captions, logos or watermarks anywhere in the image.',
  ].filter(Boolean).join('\n');
}

/** How the recurring character moves in clips (in every video prompt, so the video model doesn't slow it down). */
export const characterMotion = (v?: PageCharacter | null) =>
  hasCharacter(v) && v?.motion?.trim() ? `How the character moves: ${v.motion.trim()}` : '';
