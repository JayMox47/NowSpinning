import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveAlbumLoader } from '../app/live-albums.ts';

const summary = id => ({id, name:id, artists:[{name:'Artist'}], images:[], release_date:'2026', total_tracks:1, tracks:{items:[]}});
const full = id => ({...summary(id), tracks:{items:[{id:'track', name:'Song', track_number:1, disc_number:1, duration_ms:1000}]}});
const deferred = () => {
  let resolve;
  const promise = new Promise(r=>{resolve=r;});
  return {promise,resolve};
};

test('resume and A → B → A reuse actual tracklists without another request', async () => {
  let calls = 0;
  const loader = createLiveAlbumLoader(async a=>{calls++; return full(a.id);},async()=>null);
  const a = await loader.load(summary('a'));
  assert.equal(loader.get('a'),a);
  await loader.load(summary('b'));
  assert.equal(await loader.load(summary('a')),a);
  assert.equal(calls,2);
});

test('overlapping polls share a lookup and cache remains available after its original consumer leaves', async () => {
  const request = deferred();
  let calls = 0;
  const loader = createLiveAlbumLoader(()=>{calls++; return request.promise;},async()=>null);
  const first = loader.load(summary('a'));
  const next = loader.load(summary('a'));
  assert.equal(first,next);
  request.resolve(full('a'));
  await first;
  assert.equal((await loader.load(summary('a'))).tracks.items.length,1);
  assert.equal(calls,1);
});

test('out-of-order album lookups keep data under the correct playback IDs', async () => {
  const a = deferred(), b = deferred();
  const loader = createLiveAlbumLoader(album=>album.id==='a'?a.promise:b.promise,async()=>null);
  const first = loader.load(summary('a')), second = loader.load(summary('b'));
  b.resolve(full('b')); await second;
  a.resolve(full('a')); await first;
  assert.equal(loader.get('a').id,'a');
  assert.equal(loader.get('b').id,'b');
});

test('stalled primary request times out and fallback keeps Spotify identity', async () => {
  const loader = createLiveAlbumLoader(()=>new Promise(()=>{}),async()=>full('musicbrainz-id'),{timeoutMs:10});
  const result = await loader.load(summary('spotify-id'));
  assert.equal(result.id,'spotify-id');
  assert.equal(result.tracks.items.length,1);
});

test('empty/failed results never count as resolved and retry automatically after cooldown', async () => {
  let calls = 0;
  const loader = createLiveAlbumLoader(async()=>++calls===1?summary('a'):full('a'),async()=>null,{retryMs:20});
  assert.equal(await loader.load(summary('a')),null);
  assert.equal(loader.get('a'),undefined);
  assert.equal(await loader.load(summary('a')),null);
  assert.equal(calls,1);
  await new Promise(r=>setTimeout(r,25));
  assert.ok((await loader.load(summary('a'))).tracks.items.length);
  assert.equal(calls,2);
});

test('both sources stalling release the lookup so later polls can recover', async () => {
  let recovered = false;
  const loader = createLiveAlbumLoader(()=>recovered?Promise.resolve(full('a')):new Promise(()=>{}),()=>new Promise(()=>{}),{timeoutMs:10,retryMs:0});
  assert.equal(await loader.load(summary('a')),null);
  recovered = true;
  assert.ok((await loader.load(summary('a'))).tracks.items.length);
});
