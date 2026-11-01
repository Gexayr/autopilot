import type { PageCharacter } from './entities';
import { castOf, imagePrompt, refsForScene } from './visual';

const page: PageCharacter = {
  enabled: true, description: '', refsMode: 'character',
  refs: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], names: ['Edgar Thorne', 'Finn', 'The Chronophage', 'Edgar Thorne'],
};

describe('refsForScene', () => {
  it('sends only the characters the scene mentions, one picture each', () => {
    expect(refsForScene(page, 'Thorne repairs a clock while Finn keeps watch').map((r) => r.file)).toEqual(['a.jpg', 'b.jpg']);
    expect(refsForScene(page, 'Edgar Thorne alone in his workshop').map((r) => r.file)).toEqual(['a.jpg']);
    expect(refsForScene(page, 'The chronophage rises over the Thames').map((r) => r.name)).toEqual(['The Chronophage']);
    expect(refsForScene(page, 'An empty foggy street at dawn')).toEqual([]);
  });

  it('keeps the old behaviour for unnamed pictures and style pictures', () => {
    expect(refsForScene({ ...page, names: [] }, 'anything')).toHaveLength(4);
    expect(refsForScene({ ...page, refsMode: 'style' }, 'anything').every((r) => !r.name)).toBe(true);
    expect(castOf({ ...page, refsMode: 'style' })).toEqual([]);
  });

  it('labels each picture in the prompt', () => {
    const p = imagePrompt(page, 'Finn and Thorne', [{ name: 'Edgar Thorne' }, { name: 'Finn' }]);
    expect(p).toContain('Reference image 1 shows Edgar Thorne. Reference image 2 shows Finn.');
    expect(p).toContain('Only Edgar Thorne and Finn in this image, not The Chronophage.');
  });
});
