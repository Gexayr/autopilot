import { Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { config } from './config';

/**
 * Background music for Reels that come without sound. Tracks are from Mixkit (Mixkit Stock Music Free License:
 * free in videos, social media included, no attribution; not to be redistributed on their own, so the files live
 * in MUSIC_DIR, outside the public media folder and outside git). Gemini picks a mood per post, see GeminiService.musicMood.
 */
export const MOOD_TRACKS = {
  calm: [443, 127, 710, 592, 292, 682, 659, 709], // Serene View, Valley Sunset, Classical 3, Miss You, Relax Beat, Classical vibes 2, Romantic, Classical 2
  inspiring: [32, 288, 587, 839, 684, 1183, 31, 148], // Driving Ambition, One More Dance, Discover, Tears of Joy, Classical vibes 4, Karma, Dreaming Big, Forest Mist Whispers
  epic: [322, 475, 54, 873, 614, 493, 1091], // Life's a Movie, Majestic, Welcome to The Games, I Believe, Silent Descent, Beautiful Dream, Carry On
  emotional: [22, 184, 580, 601, 599, 713, 543, 714], // Piano Reflections, Vastness, Sun and His Daughter, Skyline, Possible Dreams, Classical 6, A New Life, Classical 7
  sad: [649, 23, 168, 681, 688, 18, 92, 52], // Sad Jazz, Relaxing Country, Staring at the Night Sky, Classical vibes 1, Classical vibes 5, Singing Bowl Meditation, Time Out, The Long Road
  mysterious: [139, 588, 565, 138, 571, 538, 441, 615], // Spirit in the Woods, Feedback Dreams, Fallen (Asper), Forest Treasure, Voxscape, Nield Grohm Hanging 1, Meditation, Tapis
  dark: [188, 140, 676, 612, 605, 680, 76, 677], // Echoes, Cyberpunk City, Epical Drums 01, Selpan, Delirium, Epical Drums 05, Epic Games, Epical Drums 02
  dreamy: [613, 1037, 135, 114, 324, 38, 785], // Sicilian Coffee, My Little Star, Sleepy Cat, Kodama Night Town, Smooth Meditation, Forever Love, Baby
  upbeat: [644, 1076, 5, 801, 706, 1072, 1077, 621], // Upbeat Jazz, Smile, Feeling Happy, Happy Home, Games Music, Owies Ukulele, Sounds Good, BRIDGE N° 98
  playful: [595, 729, 953, 821, 15, 10, 9, 847], // Secret Garden, Pop Track 03, Feel Alive, At the Playhouse, Keep Smiling, Playful, Kidding Around, It's April
  futuristic: [132, 162, 1167, 201, 175, 744, 167, 196], // Hazy After Hours, Minimal Techno 01, Close Up, Swish Swed, Digital Clouds, House 02, Brainiac, Deep House
  romantic: [39, 1081, 585, 683, 546, 711, 534, 310], // Latin Lovers, We'll Be Okay, Sonor 07, Classical vibes 3, The Farewell, Classical 4, Hope and Kindness, Alignment
} as const;

export type Mood = keyof typeof MOOD_TRACKS;
export const MOODS = Object.keys(MOOD_TRACKS) as Mood[];
export const isMood = (x: unknown): x is Mood => typeof x === 'string' && x in MOOD_TRACKS;

const trackUrl = (id: number) => `https://assets.mixkit.co/music/${id}/${id}.mp3`;
export const trackFile = (id: number) => join(config.musicDir, `${id}.mp3`);

/** Downloads the tracks that are missing (on generator start; ~3 MB each, ~300 MB in all). */
export async function syncMusic(log = new Logger('Music')) {
  await mkdir(config.musicDir, { recursive: true });
  let added = 0;
  for (const id of Object.values(MOOD_TRACKS).flat()) {
    if (existsSync(trackFile(id))) continue;
    try {
      const res = await fetch(trackUrl(id), { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tmp = `${trackFile(id)}.part`;
      await writeFile(tmp, Buffer.from(await res.arrayBuffer()));
      await rename(tmp, trackFile(id));
      added++;
    } catch (e) {
      log.warn(`track ${id}: ${(e as Error).message}`);
    }
  }
  if (added) log.log(`music: ${added} tracks downloaded`);
}

/**
 * A downloaded track of the mood, not one of `recent` (the page's last tracks) when there is a choice;
 * any downloaded track if the mood has none; null without a library.
 */
export function pickTrack(mood: Mood, recent: number[], random = Math.random): number | null {
  const have = (ids: readonly number[]) => ids.filter((id) => existsSync(trackFile(id)));
  const own = have(MOOD_TRACKS[mood]);
  const pool = own.length ? own : have(Object.values(MOOD_TRACKS).flat());
  const fresh = pool.filter((id) => !recent.includes(id));
  const from = fresh.length ? fresh : pool;
  return from.length ? from[Math.floor(random() * from.length)] : null;
}

export async function mediaDuration(file: string): Promise<number> {
  const { stdout } = await promisify(execFile)('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim()) || 0;
}
