import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const albums = JSON.parse(await readFile(new URL('../app/default-albums.json', import.meta.url)));
const requested = JSON.parse(await readFile(new URL('../scripts/default-albums.json', import.meta.url)));

test('every requested album is bundled once with a complete tracklist', () => {
  assert.equal(albums.length, 53);
  assert.deepEqual(albums.map(a=>a.name), requested.map(([name])=>name));
  assert.equal(new Set(albums.map(a=>a.id)).size, albums.length);
  for (const album of albums) {
    assert.ok(album.artists.every(a=>a.name), album.name);
    assert.ok(album.tracks.items.length > 0, album.name);
    assert.equal(album.total_tracks, album.tracks.items.length, album.name);
    assert.ok(album.tracks.items.every(t=>t.id && t.name && t.track_number > 0 && t.disc_number > 0), album.name);
  }
});

test('all built-in cover images exist locally', async () => {
  for (const album of albums) {
    assert.ok(album.images[0].url.startsWith('/album-covers/'), album.name);
    await access(new URL(`../public${album.images[0].url}`, import.meta.url));
  }
});
