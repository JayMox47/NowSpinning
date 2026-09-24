// Maintainer-only catalog lookup. Never run as part of a browser session/build.
import { readFile, writeFile } from 'node:fs/promises';
const list = JSON.parse(await readFile(new URL('./default-albums.json', import.meta.url)));
const output = new URL('./default-album-matches.json', import.meta.url);
const matches = JSON.parse(await readFile(output).catch(() => '[]'));
for (const [title, artist] of list) {
  if (matches.some(item => item.title === title && item.artist === artist)) continue;
  const query = `releasegroup:${JSON.stringify(title.replace(/[’]/g, "'"))} AND artist:${JSON.stringify(artist === 'khai dreams, Atwood' ? 'khai dreams' : artist)}`;
  try {
    const response = await fetch(`https://musicbrainz.org/ws/2/release-group/?fmt=json&limit=5&query=${encodeURIComponent(query)}`, {headers:{'User-Agent':'NowSpinning/1.0 (https://music.jonathanmox.com)'}, signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    const candidates = (data['release-groups'] || []).map(g => ({id:g.id,title:g.title,artist:g['artist-credit']?.map(a=>a.name).join(', '), date:g['first-release-date'],releases:g.releases,score:g.score}));
    matches.push({title,artist,candidates});
    await writeFile(output, JSON.stringify(matches,null,2)+'\n');
    console.log(title, JSON.stringify(candidates.map(({id,title,artist,score})=>({id,title,artist,score}))));
  } catch(error) { console.log('FAILED', title, error.message); }
  await new Promise(resolve=>setTimeout(resolve,1200));
}
