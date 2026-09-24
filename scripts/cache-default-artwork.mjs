// Bundle cover artwork once, so the default rotation needs no catalog/art API calls.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
const catalogPath = new URL('../app/default-albums.json', import.meta.url);
const albums = JSON.parse(await readFile(catalogPath));
const matches = JSON.parse(await readFile(new URL('./default-album-matches.json', import.meta.url)));
await mkdir(new URL('../public/album-covers/', import.meta.url), {recursive:true});
for (const album of albums) {
  const releaseId = album.id.slice(3);
  const path = `/album-covers/${releaseId}.jpg`;
  const output = new URL(`../public${path}`, import.meta.url);
  if (album.images[0]?.url === path && await stat(output).catch(()=>null)) continue;
  const groupUrl = album.images.find(image=>image.url.includes('/release-group/'))?.url;
  const groupId = groupUrl?.split('/')[4];
  const match = matches.find(item=>item.title===album.name)?.candidates.find(c=>c.id===groupId);
  if (match?.date && album.name !== 'SOS Deluxe: LANA') album.release_date = match.date;
  if (album.name === 'Breakaway') album.release_date = '2004-11-30';
  const urls = album.name === 'SOS Deluxe: LANA'
    ? [album.images[0].url]
    : [groupUrl?.replace('front-250','front-1200'), album.images[0].url].filter(Boolean);
  if (album.name === 'Breakaway') urls.unshift('https://coverartarchive.org/release/c1d1649a-a8e0-450e-b54a-039487562850/front-1200');
  let saved = false;
  for (const url of urls) {
    try {
      const response = await fetch(url,{signal:AbortSignal.timeout(15000)});
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) continue;
      await writeFile(output,Buffer.from(await response.arrayBuffer()));
      album.images = [{url:path,width:1200,height:1200},{url:path,width:250,height:250}];
      saved = true;
      break;
    } catch { /* Try the specific release if group artwork is unavailable. */ }
  }
  console.log(saved ? 'COVER' : 'MISSING COVER', album.name);
  await writeFile(catalogPath,JSON.stringify(albums,null,2)+'\n');
  await new Promise(resolve=>setTimeout(resolve,1100));
}
