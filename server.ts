import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Proxy for AniPub API to bypass CORS
  app.get('/api/anipub', async (req, res) => {
    try {
      const { endpoint } = req.query;
      if (!endpoint || typeof endpoint !== 'string') {
        return res.status(400).json({ error: 'Missing endpoint parameter' });
      }

      const url = `https://anipub.xyz${endpoint}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      });
      
      const text = await response.text();
      try {
        res.json(JSON.parse(text));
      } catch (e) {
        res.send(text);
      }
    } catch (error) {
      console.error('Error proxying AniPub API:', error);
      res.status(500).json({ error: 'Failed to proxy request' });
    }
  });

  const jikanCache = new Map<string, string>();
  
  app.get('/api/fallback-image', async (req, res) => {
    try {
      const title = req.query.title as string;
      if (!title) return res.status(400).json({ error: 'Missing title' });
      
      if (jikanCache.has(title)) {
        return res.json({ image: jikanCache.get(title) });
      }

      // 1.5s delay to strictly avoid Jikan rate limits if called concurrently
      await new Promise(resolve => setTimeout(resolve, Math.random() * 500));
      
      const jikanRes = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`);
      
      if (!jikanRes.ok) {
        if (jikanRes.status === 429) {
          return res.status(429).json({ error: 'Rate limited' });
        }
        return res.status(jikanRes.status).json({ error: 'Jikan API error' });
      }

      const data = await jikanRes.json();
      const imageUrl = data.data?.[0]?.images?.jpg?.large_image_url || data.data?.[0]?.images?.jpg?.image_url;
      
      if (imageUrl) {
        jikanCache.set(title, imageUrl);
        res.json({ image: imageUrl });
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Scrape API to fetch streams and downloads locally
  app.get('/api/scrape', async (req, res) => {
    try {
      const targetUrl = req.query.url;
      if (!targetUrl || typeof targetUrl !== 'string') {
        return res.status(400).json({ error: 'Missing target url parameter' });
      }

      console.log(`Scraping locally for: ${targetUrl}`);
      
      const streams: any[] = [];
      const downloads: any[] = [];
      let pageFound = false;

      try {
        const response = await fetch(targetUrl, { 
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        if (response.ok) {
          const html = await response.text();
          const selectMatch = html.match(/<select class="mirror"[^>]*>(.*?)<\/select>/is);
          if (selectMatch) {
            pageFound = true;
            const optionsHtml = selectMatch[1];
            const optionRegex = /<option value="([^"]+)"[^>]*>\s*(.*?)\s*<\/option>/gis;
            
            let match;
            while ((match = optionRegex.exec(optionsHtml)) !== null) {
              if (!match[1] || !match[1].trim()) continue;
              
              let decoded = match[1];
              if (!decoded.includes('iframe') && !decoded.includes('http')) {
                try { decoded = Buffer.from(match[1], 'base64').toString('utf8'); } catch(e) {}
              }
              
              let src = '';
              const srcMatch = decoded.match(/src=["']([^"']+)["']/i);
              if (srcMatch) src = srcMatch[1];
              else src = decoded; 
              
              const name = match[2].trim();
              let finalUrl = src.startsWith('//') ? 'https:' + src : (src.startsWith('/') ? new URL(src, targetUrl).href : src);
              
              if (finalUrl.includes('mytsumi.com/multiplayer/options.php')) {
                 const valMatch = finalUrl.match(/value=([^&]+)/);
                 if (valMatch) {
                   const containerId = valMatch[1];
                   try {
                     const contRes = await fetch(`https://mytsumi.com/multiplayer/contenedor.php?id=${containerId}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                     const contHtml = await contRes.text();
                     
                     const tabsMatch = contHtml.match(/const videoTabs = (\[.*?\]);/);
                     if (tabsMatch) {
                       const tabs = JSON.parse(tabsMatch[1]);
                       for (const t of tabs) {
                         streams.push({
                           name: `Multi - ${t.tab_name}`,
                           url: t.url,
                         });
                       }
                     }
                     
                     const dlMatch = contHtml.match(/const downloadsByQuality = (\{.*?\});/);
                     if (dlMatch) {
                        const dls = JSON.parse(dlMatch[1]);
                        for (const quality in dls) {
                          for (const d of dls[quality]) {
                            downloads.push({
                              name: d.server_name || 'Download',
                              host: new URL(d.download_url).hostname || '',
                              url: d.download_url,
                              quality: quality
                            });
                          }
                        }
                     }
                   } catch(e) { console.error('Error fetching container', e); }
                 }
              } else {
                streams.push({ name: name, url: finalUrl });
              }
            }
          }
        }
      } catch (e) {
        console.error('AnimeYTX scrape failed initially:', e);
      }

      // Try Anime1v API (FxxMorgan) to add more options
      let queryName = '';
      try {
        const urlObj = new URL(targetUrl);
        const parts = urlObj.pathname.split('/').filter(Boolean);
        let param = parts[1] || '';
        
        let epNum = '1';
        let originalSlug = '';
        const inputTitle = req.query.title as string | undefined;
        queryName = inputTitle || param;
        
        const matchExtract = param.match(/(.+)-capitulo-(\d+)/);
        if (matchExtract) {
           originalSlug = matchExtract[1];
           if (!inputTitle) {
               queryName = originalSlug.replace(/-/g, ' ');
           }
           epNum = matchExtract[2];
        }

        const domains = ['animeav1', 'animeflv', 'monoschinos', 'jkanime'];
        
        await Promise.all(domains.map(async (domain) => {
          try {
            const searchRes = await fetch(`https://anime1v-api.vercel.app/api/v1/anime/search?q=${encodeURIComponent(queryName)}&domain=${domain}`);
            const searchData: any = await searchRes.json();
            
            if (searchData.success && searchData.data.results.length > 0) {
              let result = searchData.data.results.find((r: any) => 
                 r.title.toLowerCase() === queryName.toLowerCase() || 
                 (inputTitle && r.title.toLowerCase() === inputTitle.toLowerCase()) || 
                 (originalSlug && r.slug === originalSlug) ||
                 (originalSlug && r.slug === originalSlug.replace(/-tv$/, ''))
              );
              if (!result) result = searchData.data.results[0];
              
              if (result && result.url) {
                const infoRes = await fetch(`https://anime1v-api.vercel.app/api/v1/anime/info?url=${result.url}`);
                const infoData: any = await infoRes.json();
                if (infoData.success && infoData.data.episodes) {
                  const episode = infoData.data.episodes.find((e: any) => e.number.toString() === epNum);
                  if (episode && episode.url) {
                    const epRes = await fetch(`https://anime1v-api.vercel.app/api/v1/anime/episode?url=${episode.url}`);
                    const epData: any = await epRes.json();
                    if (epData.success && epData.data.streamLinks) {
                       pageFound = true;
                       for (const type of ['SUB', 'DUB']) {
                         if (!epData.data.streamLinks[type]) continue;
                         for (const s of epData.data.streamLinks[type]) {
                           const lang = type === 'DUB' ? 'ES-Lat' : 'Sub';
                           const providerName = domain === 'animeav1' ? 'AV1' :
                                                domain === 'animeflv' ? 'FLV' :
                                                domain === 'monoschinos' ? 'MC' :
                                                domain === 'jkanime' ? 'JK' : domain;
                           streams.push({
                             name: `${providerName} - ${s.server} (${lang})`,
                             url: s.url
                           });
                         }
                       }
                    }
                  }
                }
              }
            }
          } catch(e) {
             console.error(`Anime1v fetch failed for ${domain}:`, e);
          }
        }));
      } catch (e) {
        console.error('Anime1v fetch failed:', e);
      }

      if (!pageFound && streams.length === 0) {
        return res.status(200).json({ 
           id: queryName,
           title: queryName,
           streams: [],
           downloads: []
        });
      }
      
      // Cleanup dupes if any
      const uniqueStreams = [];
      const seenStreams = new Set();
      for (const s of streams) {
        if (!seenStreams.has(s.url)) {
          seenStreams.add(s.url);
          uniqueStreams.push(s);
        }
      }

      const uniqueDownloads = [];
      const seenDl = new Set();
      for (const d of downloads) {
        if (!seenDl.has(d.url)) {
          seenDl.add(d.url);
          uniqueDownloads.push(d);
        }
      }

      res.json({
        id: targetUrl.split('/').filter(Boolean).pop(),
        title: targetUrl.split('/').filter(Boolean).pop()?.replace(/-/g, ' ').toUpperCase(),
        streams: uniqueStreams,
        downloads: uniqueDownloads
      });
      
    } catch (error) {
      console.error('Error during scrape:', error);
      res.status(500).json({ error: 'Failed to scrape the URL', details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
