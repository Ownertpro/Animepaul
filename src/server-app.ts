import express from 'express';
import path from 'path';

const app = express();
app.use(express.json());

// Proxy for AniPub API
app.get('/api/anipub', async (req, res) => {
  try {
    const { endpoint } = req.query;
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ error: 'Missing endpoint parameter' });
    }

    const url = `https://anipub.xyz${endpoint}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    
    const text = await response.text();
    try {
      res.json(JSON.parse(text));
    } catch (e) {
      res.send(text);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to proxy request' });
  }
});

const jikanCache = new Map<string, string>();
app.get('/api/fallback-image', async (req, res) => {
  try {
    const title = req.query.title as string;
    if (!title) return res.status(400).json({ error: 'Missing title' });
    if (jikanCache.has(title)) return res.json({ image: jikanCache.get(title) });
    await new Promise(resolve => setTimeout(resolve, 500));
    const jikanRes = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`);
    if (!jikanRes.ok) return res.status(jikanRes.status).json({ error: 'Jikan error' });
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

app.get('/api/scrape', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    const inputTitle = req.query.title as string | undefined;
    if (!targetUrl || typeof targetUrl !== 'string') return res.status(400).json({ error: 'Missing url' });

    const streams: any[] = [];
    const downloads: any[] = [];
    let pageFound = false;

    // LOCAL SCRAPE
    try {
      const response = await fetch(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (response.ok) {
        const html = await response.text();
        const selectMatch = html.match(/<select class="mirror"[^>]*>(.*?)<\/select>/is);
        if (selectMatch) {
          pageFound = true;
          const optionsHtml = selectMatch[1];
          const optionRegex = /<option value="([^"]+)"[^>]*>\s*(.*?)\s*<\/option>/gis;
          let match;
          while ((match = optionRegex.exec(optionsHtml)) !== null) {
            let decoded = match[1];
            if (!decoded.includes('iframe') && !decoded.includes('http')) {
               try { decoded = Buffer.from(match[1], 'base64').toString('utf8'); } catch(e) {}
            }
            let src = '';
            const srcMatch = decoded.match(/src=["']([^"']+)["']/i);
            if (srcMatch) src = srcMatch[1];
            else src = decoded;
            let finalUrl = src.startsWith('//') ? 'https:' + src : (src.startsWith('/') ? new URL(src, targetUrl).href : src);
            
            if (finalUrl.includes('mytsumi.com/multiplayer/options.php')) {
               const valMatch = finalUrl.match(/value=([^&]+)/);
               if (valMatch) {
                 const containerId = valMatch[1];
                 try {
                   const contRes = await fetch(`https://mytsumi.com/multiplayer/contenedor.php?id=${containerId}`);
                   const contHtml = await contRes.text();
                   const tabsMatch = contHtml.match(/const videoTabs = (\[.*?\]);/);
                   if (tabsMatch) {
                     const tabs = JSON.parse(tabsMatch[1]);
                     for (const t of tabs) streams.push({ name: `Multi - ${t.tab_name}`, url: t.url });
                   }
                   const dlMatch = contHtml.match(/const downloadsByQuality = (\{.*?\});/);
                   if (dlMatch) {
                      const dls = JSON.parse(dlMatch[1]);
                      for (const q in dls) {
                        for (const d of dls[q]) {
                          downloads.push({ name: d.server_name, host: new URL(d.download_url).hostname, url: d.download_url, quality: q });
                        }
                      }
                   }
                 } catch(e) {}
               }
            } else {
              streams.push({ name: match[2].trim(), url: finalUrl });
            }
          }
        }
      }
    } catch (e) {}

    // EXTERNAL API (ANIME1V)
    try {
      const parts = new URL(targetUrl).pathname.split('/').filter(Boolean);
      const param = parts[1] || '';
      let epNum = '1';
      let originalSlug = '';
      let queryName = inputTitle || param;
      const matchExtract = param.match(/(.+)-capitulo-(\d+)/);
      if (matchExtract) {
         originalSlug = matchExtract[1];
         if (!inputTitle) queryName = originalSlug.replace(/-/g, ' ');
         epNum = matchExtract[2];
      }
      const domains = ['animeav1', 'animeflv', 'monoschinos', 'jkanime'];
      await Promise.all(domains.map(async (domain) => {
        try {
          const sRes = await fetch(`https://anime1v-api.vercel.app/api/v1/anime/search?q=${encodeURIComponent(queryName)}&domain=${domain}`);
          const sData: any = await sRes.json();
          if (sData.success && sData.data.results.length > 0) {
            let resObj = sData.data.results[0];
            const infoRes = await fetch(`https://anime1v-api.vercel.app/api/v1/anime/info?url=${resObj.url}`);
            const iData: any = await infoRes.json();
            if (iData.success && iData.data.episodes) {
              const ep = iData.data.episodes.find((e: any) => e.number.toString() === epNum);
              if (ep) {
                const epRes = await fetch(`https://anime1v-api.vercel.app/api/v1/anime/episode?url=${ep.url}`);
                const epData: any = await epRes.json();
                if (epData.success && epData.data.streamLinks) {
                   pageFound = true;
                   ['SUB', 'DUB'].forEach(type => {
                     if (epData.data.streamLinks[type]) {
                       epData.data.streamLinks[type].forEach((s: any) => {
                         streams.push({ name: `${domain.toUpperCase()} - ${s.server} (${type})`, url: s.url });
                       });
                     }
                   });
                }
              }
            }
          }
        } catch(e) {}
      }));
    } catch (e) {}

    const uS = Array.from(new Map(streams.map(s => [s.url, s])).values());
    const uD = Array.from(new Map(downloads.map(d => [d.url, d])).values());

    res.json({ streams: uS, downloads: uD });
  } catch (error) {
    res.status(500).json({ error: 'Scrape failed' });
  }
});

export default app;
