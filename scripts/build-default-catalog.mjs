import { readFile, writeFile } from 'node:fs/promises';
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url)));
const list = await read('./default-albums.json');
const matches = await read('./default-album-matches.json');
const output = new URL('../app/default-albums.json', import.meta.url);
const albums = JSON.parse(await readFile(output).catch(() => '[]'));
const selectedTitles = process.argv.slice(2);
let lastRequest = 0;
async function mb(path) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, lastRequest + 1200 - Date.now())));
    lastRequest = Date.now();
    try {
      const response = await fetch(`https://musicbrainz.org/ws/2${path}${path.includes('?') ? '&' : '?'}fmt=json`, { headers: {'User-Agent':'NowSpinning/1.0 (https://music.jonathanmox.com)'}, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(String(response.status));
      return await response.json();
    } catch (error) { if (attempt === 2) throw error; await new Promise(resolve=>setTimeout(resolve,3000)); }
  }
}
for (const [title, artist] of list) {
  if (selectedTitles.length && !selectedTitles.includes(title)) continue;
  if (!selectedTitles.length && albums.some(a=>a.name === title)) continue;
  try {
    let candidates = matches.find(m=>m.title===title)?.candidates || [];
    let release;
    let alternatives = [];
    if (title === 'Cracked Rear View') {
      // Standard album, without the duplicate surround mixes on the DVD edition.
      release = {id:'9d1e3056-e220-4310-819c-e24822f4a477'};
    } else if (title === 'SOS Deluxe: LANA') {
      const data = await mb(`/release/?query=${encodeURIComponent('release:"SOS Deluxe: LANA" AND artist:SZA')}&limit=5`);
      release = data.releases?.[0];
      if (!release) throw new Error('No LANA release');
    } else {
      if (!candidates.length || candidates.filter(c=>c.score===100).length > 1) {
        const query = `releasegroup:${JSON.stringify(title.replace(/’/g,"'"))} AND artist:${JSON.stringify(artist)} AND primarytype:album`;
        const data = await mb(`/release-group/?query=${encodeURIComponent(query)}&limit=5`);
        candidates = data['release-groups'] || [];
      }
      const group = candidates[0];
      if (!group) throw new Error('No group');
      const releases = group.releases || (await mb(`/release/?release-group=${group.id}&status=official&limit=100`)).releases;
      const normalized = s=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
      release = releases?.find(r=>r.status==='Official' && normalized(r.title)===normalized(group.title)) || releases?.find(r=>r.status==='Official') || releases?.[0];
      alternatives = releases?.filter(r=>r.id !== release?.id && r.status === 'Official') || [];
      if (!release) throw new Error('No release');
    }
    let full = await mb(`/release/${release.id}?inc=recordings+artists+labels+release-groups`);
    for (const alternative of alternatives) {
      if (full.media?.some(m=>m.tracks?.length)) break;
      full = await mb(`/release/${alternative.id}?inc=recordings+artists+labels+release-groups`);
    }
    const tracks = (full.media || []).flatMap((disc,di)=>(disc.tracks || []).map((t,i)=>({id:t.recording?.id || t.id,name:t.title || t.recording?.title,track_number:t.position || i+1,disc_number:disc.position || di+1,duration_ms:t.length || 0})));
    if (!tracks.length) throw new Error('Empty tracklist');
    const groupId = full['release-group']?.id;
    const existing = albums.findIndex(a=>a.name===title);
    if (existing !== -1) albums.splice(existing,1);
    albums.push({id:`mb:${full.id}`,name:title,artists:(full['artist-credit']||[]).map(a=>({name:a.name})),images:[{url:`https://coverartarchive.org/release/${full.id}/front-1200`,width:1200,height:1200},{url:`https://coverartarchive.org/release-group/${groupId}/front-250`,width:250,height:250}],release_date:full.date || '',album_type:full['release-group']?.['primary-type'] || 'Album',total_tracks:tracks.length,tracks:{items:tracks}});
    albums.sort((a,b)=>list.findIndex(([t])=>t===a.name)-list.findIndex(([t])=>t===b.name));
    await writeFile(output,JSON.stringify(albums,null,2)+'\n');
    console.log('OK', title, full.title, full.date, tracks.length, full.id);
  } catch(error) { console.log('FAILED',title,error.message); }
}
