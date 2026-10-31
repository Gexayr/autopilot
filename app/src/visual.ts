import type { PageCharacter } from './entities';

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

/** What Gemini has to respect when it invents a scene: the world, the style, the recurring character. */
export function sceneRules(v?: PageCharacter | null): string[] {
  return [
    v?.world?.trim() ? `Every scene takes place in this world (keep its look, places and mood): ${v.world.trim()}` : '',
    `Visual style of the scene: ${styleText(v)}.`,
    v?.enabled && v.description ? `A recurring character must be the main subject, doing something that fits the post: ${v.description}` : '',
  ].filter(Boolean);
}

/** Prompt for the image model. */
export function imagePrompt(v: PageCharacter | null | undefined, scene: string, withRefs: boolean): string {
  return [
    withRefs && v?.refsMode === 'style'
      ? 'Match the world, art style, colors and atmosphere of the reference images (they show the setting, do not copy them literally).'
      : withRefs ? 'Use the character from the reference images as the main character and keep it exactly the same: shape, proportions, colors, materials, face.' : '',
    v?.enabled && v.description ? `Character: ${v.description}.` : '',
    v?.world?.trim() ? `World: ${v.world.trim()}` : '',
    `Scene: ${scene}`,
    `Style: ${styleText(v)}. No readable text, letters, captions, logos or watermarks anywhere in the image.`,
  ].filter(Boolean).join('\n');
}
