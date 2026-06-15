import fetch from 'node-fetch';

async function testAnime1v(query: string, ep: string) {
  try {
    const searchRes = await fetch(`https://anime1v-api.vercel.app/api/v1/anime/search?q=${encodeURIComponent(query)}`);
    const searchData: any = await searchRes.json();
    if (!searchData.success || !searchData.data.results.length) return console.log('not found');
    
    // exact match or first
    let result = searchData.data.results.find((r: any) => r.title.toLowerCase() === query.toLowerCase());
    if (!result) result = searchData.data.results[0];

    console.log('Found:', result.title, result.url);
    
    const infoRes = await fetch(`https://anime1v-api.vercel.app/api/v1/anime/info?url=${result.url}`);
    const infoData: any = await infoRes.json();
    if (!infoData.success) return console.log('no info');
    
    const episode = infoData.data.episodes.find((e: any) => e.number.toString() === ep);
    if (!episode) return console.log('no ep');
    
    console.log('Found Ep:', episode.url);
    
    const epRes = await fetch(`https://anime1v-api.vercel.app/api/v1/anime/episode?url=${episode.url}`);
    const epData: any = await epRes.json();
    
    console.log('Streams:', JSON.stringify(epData.data.streamLinks));
  } catch(e) {
    console.error(e);
  }
}

testAnime1v('Boruto: Naruto Next Generations', '292');
testAnime1v('One Piece', '1160');
