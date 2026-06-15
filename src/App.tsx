import React, { useState, useEffect } from 'react';
import { Search, Play, Download, LayoutTemplate, MonitorPlay, AlertCircle, Loader2, ArrowLeft, Grid, ExternalLink, SkipBack, SkipForward, Image as ImageIcon, Heart, History, Trash2, ChevronRight, Plus } from 'lucide-react';
import type { ScrapeResponse, AnimeStream, AnimeDownload, AnipubAnime, HistoryItem } from './types';

// Anime Cover Image component with fallback to Jikan API
function AnimeCover({ anime, className = '' }: { anime: AnipubAnime, className?: string }) {
  const initialSrc = anime.Cover || anime.ImagePath || anime.Image || null;
  const [src, setSrc] = useState<string | null>(initialSrc);
  const [hasError, setHasError] = useState(!initialSrc);
  const [loadingFallback, setLoadingFallback] = useState(false);
  const [attemptedFallback, setAttemptedFallback] = useState(false);

  useEffect(() => {
    const newSrc = anime.Cover || anime.ImagePath || anime.Image || null;
    setSrc(newSrc);
    setHasError(!newSrc);
    setAttemptedFallback(false);
  }, [anime]);

  useEffect(() => {
    // If there's no initial image, attempt fallback immediately
    if (hasError && !attemptedFallback && !loadingFallback) {
      loadFallback();
    }
  }, [hasError, attemptedFallback, loadingFallback]);

  const loadFallback = async () => {
    if (attemptedFallback || loadingFallback) return;
    setLoadingFallback(true);
    setAttemptedFallback(true);
    
    try {
      // Clean title for better Jikan search
      const cleanTitle = anime.Name.replace(/Temporada \d+/gi, '').replace(/capitulo \d+/gi, '').trim();
      const res = await fetch(`/api/fallback-image?title=${encodeURIComponent(cleanTitle)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.image) {
          setSrc(data.image);
          setHasError(false);
          return;
        }
      }
    } catch(e) {
      // ignore
    } finally {
      setLoadingFallback(false);
      setHasError(true);
    }
  };

  const handleError = () => {
    if (!attemptedFallback) {
      loadFallback();
    } else {
      setHasError(true);
    }
  };

  if (hasError && !loadingFallback && !src) {
    return (
      <div className={`bg-neutral-800 flex items-center justify-center flex-col text-neutral-500 ${className}`}>
        <ImageIcon className="w-8 h-8 opacity-50 mb-2" />
        <span className="text-xs text-center px-2">No Image</span>
      </div>
    );
  }

  return (
    <img 
      src={src || ''} 
      alt={anime.Name} 
      className={className}
      loading="lazy"
      onError={handleError}
    />
  );
}

export default function App() {
  const [view, setView] = useState<'home' | 'details' | 'player'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Home State
  const [animes, setAnimes] = useState<AnipubAnime[]>([]);
  const [loadingHome, setLoadingHome] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [favorites, setFavorites] = useState<AnipubAnime[]>([]);

  const categories = [
    'All', 'Trending', 'Movies', 'Action', 'Adventure', 'Comedy', 'Drama', 
    'Ecchi', 'Fantasy', 'Horror', 'Mystery', 'Psychological', 'Romance', 
    'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Super Power', 
    '2024', '2023', '2022'
  ];

  // Load history/favorites
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('nootHistory');
      if (savedHistory) setHistory(JSON.parse(savedHistory));
      
      const savedFavs = localStorage.getItem('nootFavs');
      if (savedFavs) setFavorites(JSON.parse(savedFavs));
    } catch(e) {}
  }, []);

  // Detail State
  const [selectedAnime, setSelectedAnime] = useState<AnipubAnime | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [epCount, setEpCount] = useState<number>(0);
  const [episodes, setEpisodes] = useState<number[]>([]);

  // Player State
  const [currentEp, setCurrentEp] = useState<number>(0);
  const [scrapedData, setScrapedData] = useState<ScrapeResponse | null>(null);
  const [activeStream, setActiveStream] = useState<AnimeStream | null>(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const [playerError, setPlayerError] = useState('');

  // Fetch initial grid
  useEffect(() => {
    fetchHome();
  }, []);

  const fetchHome = async (query = '', category = 'All', page = 1) => {
    setLoadingHome(true);
    setActiveCategory(category);
    setCurrentPage(page);
    try {
      let endpoint = '';
      if (query) {
        endpoint = `/api/search/${encodeURIComponent(query)}`;
      } else if (category === 'Trending') {
         endpoint = `/api/sort?page=${page}`; // Defaulting trending to latest for now
      } else if (category === 'Movies') {
         endpoint = `/api/search/Movie`;
      } else if (category !== 'All') {
        endpoint = `/api/search/${encodeURIComponent(category)}`;
      } else {
        endpoint = `/api/sort?page=${page}`;
      }
        
      const res = await fetch(`/api/anipub?endpoint=${encodeURIComponent(endpoint)}`);
      const data = await res.json();
      
      let newAnimes: AnipubAnime[] = [];
      if (query || (category !== 'All' && category !== 'Trending')) {
        newAnimes = Array.isArray(data) ? data : [];
        setTotalPages(1);
      } else {
        // Sort/grid returns [totalPages, [...animes]]
        setTotalPages(data[0] || 1);
        newAnimes = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
      }

      if (page === 1) {
        setAnimes(newAnimes);
      } else {
        setAnimes(prev => [...prev, ...newAnimes]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHome(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setView('home');
    fetchHome(searchQuery, 'All');
  };

  const handleCategoryClick = (cat: string) => {
    setSearchQuery('');
    fetchHome('', cat);
  };

  const openAnime = async (anime: AnipubAnime) => {
    setView('details');
    setSelectedAnime(anime);
    setLoadingDetails(true);
    setEpCount(0);
    setEpisodes([]);
    
    try {
      const res = await fetch(`/api/anipub?endpoint=${encodeURIComponent('/api/info/' + anime.finder)}`);
      const data = await res.json();
      setSelectedAnime({ ...data, finder: anime.finder });
      const count = data.epCount ? parseInt(data.epCount, 10) : 0;
      setEpCount(count);
      setEpisodes(Array.from({ length: count }, (_, i) => i + 1));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const playEpisode = (ep: number) => {
    setView('player');
    setCurrentEp(ep);
    
    if (!selectedAnime) return;

    // Save to history
    const newHistory = [
      { anime: selectedAnime, episode: ep, timestamp: Date.now() },
      ...history.filter(h => h.anime.finder !== selectedAnime.finder)
    ].slice(0, 20);
    setHistory(newHistory);
    localStorage.setItem('nootHistory', JSON.stringify(newHistory));
    
    // Attempt to automatically generate the animeytx link
    let slug = (selectedAnime.finder || '').replace(/-season-(\d+)/g, '-temporada-$1');
    const autoUrl = `https://wwv.animeytx.net/anime/${slug}-capitulo-${ep}/`;
    
    scrapeEpisode(autoUrl, selectedAnime.Name);
  };

  const scrapeEpisode = async (urlToScrape: string, animeTitle?: string) => {
    setLoadingPlayer(true);
    setPlayerError('');
    setScrapedData(null);
    setActiveStream(null);

    try {
      let endpoint = `/api/scrape?url=${encodeURIComponent(urlToScrape)}`;
      if (animeTitle) {
        endpoint += `&title=${encodeURIComponent(animeTitle)}`;
      }
      const res = await fetch(endpoint);
      if (!res.ok) {
        let errDetails = '';
        try {
          const errData = await res.json();
          errDetails = errData.details || errData.error || '';
          
          // Try to parse stringified JSON in details
          try {
            const parsedDetails = JSON.parse(errDetails);
            if (parsedDetails.error) {
               errDetails = parsedDetails.error;
            }
          } catch(e) {}
          
        } catch (e) {
          // ignore
        }
        throw new Error(errDetails || 'Failed to fetch/scrape data for this episode. Link might be invalid.');
      }

      const json = await res.json();
      if (!json || (!json.streams && !json.downloads)) {
          throw new Error('No links found. Make sure the URL format is correct.');
      }
      
      const parsedData: ScrapeResponse = {
        title: json.title || 'Unknown Title',
        id: json.id,
        streams: Array.isArray(json.streams) ? json.streams : [],
        downloads: Array.isArray(json.downloads) ? json.downloads : [],
        rawJson: json
      };

      setScrapedData(parsedData);
      if (parsedData.streams.length > 0) {
        setActiveStream(parsedData.streams[0]);
      }
    } catch (err: any) {
      console.error(err);
      setPlayerError(err.message || 'An unexpected error occurred');
    } finally {
      setLoadingPlayer(false);
    }
  };

  const toggleFavorite = (anime: AnipubAnime) => {
    let newFavs;
    if (favorites.some(f => f.finder === anime.finder)) {
      newFavs = favorites.filter(f => f.finder !== anime.finder);
    } else {
      newFavs = [anime, ...favorites];
    }
    setFavorites(newFavs);
    localStorage.setItem('nootFavs', JSON.stringify(newFavs));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('nootHistory');
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans selection:bg-indigo-500/30">
      <header className="border-b border-white/10 bg-neutral-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={() => setView('home')} className="flex items-center gap-2 group">
            <MonitorPlay className="w-6 h-6 text-indigo-400 group-hover:scale-110 transition-transform" />
            <h1 className="text-xl font-bold tracking-tight text-white">NootAnime</h1>
          </button>
          
          <form onSubmit={handleSearch} className="relative w-full max-w-sm ml-4">
             <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search anime..."
                className="w-full bg-neutral-800 border border-white/10 rounded-full py-2 pl-4 pr-10 text-sm focus:outline-none focus:border-indigo-500/50"
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2">
                <Search className="w-4 h-4 text-neutral-400" />
              </button>
          </form>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* HOMEPAGE VIEW */}
        {view === 'home' && (
          <div className="space-y-8">
            <div className="space-y-6">
              {/* Continue Watching Section */}
              {history.length > 0 && !searchQuery && activeCategory === 'All' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xl font-bold">
                      <History className="w-5 h-5 text-indigo-400" />
                      Continue Watching
                    </div>
                    <button 
                      onClick={clearHistory}
                      className="text-xs text-neutral-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Clear History
                    </button>
                  </div>
                  <div className="flex items-center gap-4 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
                    {history.map((h, i) => (
                      <button 
                        key={i} 
                        onClick={() => openAnime(h.anime)}
                        className="flex-shrink-0 w-40 text-left group"
                      >
                        <div className="aspect-video bg-neutral-800 rounded-xl overflow-hidden relative mb-2">
                          <AnimeCover 
                            anime={h.anime}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-8 h-8 text-white" />
                          </div>
                          <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                            <span className="bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-lg">
                              EP {h.episode}
                            </span>
                          </div>
                        </div>
                        <h4 className="text-xs font-medium line-clamp-1 group-hover:text-indigo-400 transition-colors">
                          {h.anime.Name}
                        </h4>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Favorites Section */}
              {favorites.length > 0 && !searchQuery && activeCategory === 'All' && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-2 text-xl font-bold">
                    <Heart className="w-5 h-5 text-red-500" />
                    Your Favorites
                  </div>
                  <div className="flex items-center gap-4 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
                    {favorites.map((f, i) => (
                      <button 
                        key={i} 
                        onClick={() => openAnime(f)}
                        className="flex-shrink-0 w-32 text-left group"
                      >
                        <div className="aspect-[3/4] bg-neutral-800 rounded-xl overflow-hidden relative mb-2">
                          <AnimeCover 
                            anime={f}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-8 h-8 text-white" />
                          </div>
                        </div>
                        <h4 className="text-[11px] font-medium line-clamp-1 group-hover:text-indigo-400 transition-colors">
                          {f.Name}
                        </h4>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                  <Grid className="w-6 h-6 text-indigo-400" />
                  {searchQuery ? `Search Results: ${searchQuery}` : activeCategory === 'All' ? "Latest Anime" : `${activeCategory} Anime`}
                </div>
                
                {/* Categories Scroll */}
                {!searchQuery && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => handleCategoryClick(cat)}
                        className={`flex-shrink-0 px-5 py-2 rounded-full text-sm font-medium transition-all ${
                          activeCategory === cat
                            ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 ring-2 ring-indigo-500/20'
                            : 'bg-neutral-900 border border-white/5 text-neutral-400 hover:text-white hover:bg-neutral-800'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {loadingHome ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {Array.isArray(animes) && animes.map((a, i) => (
                  <div key={i} className="group relative">
                    <button 
                      onClick={() => openAnime(a)}
                      className="text-left w-full outline-none"
                    >
                      <div className="aspect-[3/4] bg-neutral-800 rounded-xl overflow-hidden relative mb-3">
                        <AnimeCover 
                          anime={a}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Play className="w-10 h-10 text-white drop-shadow-lg" />
                        </div>
                      </div>
                      <h3 className="text-sm font-medium pt-1 line-clamp-2 leading-tight group-hover:text-indigo-300 transition-colors">
                        {a.Name}
                      </h3>
                      {a.MALScore && (
                        <span className="text-xs text-yellow-500 mt-1 block">★ {a.MALScore}</span>
                      )}
                    </button>
                    <button 
                      onClick={() => toggleFavorite(a)}
                      className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-md border border-white/10 transition-all opacity-0 group-hover:opacity-100 ${
                        favorites.some(f => f.finder === a.finder) 
                        ? 'bg-red-500 text-white' 
                        : 'bg-black/50 text-white hover:bg-neutral-800'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${favorites.some(f => f.finder === a.finder) ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Load More Button */}
            {!loadingHome && animes.length > 0 && currentPage < totalPages && (activeCategory === 'All' || activeCategory === 'Trending') && (
              <div className="flex justify-center pt-8">
                <button
                  onClick={() => fetchHome('', activeCategory, currentPage + 1)}
                  className="px-8 py-3 bg-neutral-900 border border-white/10 rounded-full text-sm font-semibold hover:bg-neutral-800 hover:border-indigo-500/50 transition-all flex items-center gap-2 group"
                >
                  Load More
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* DETAILS VIEW */}
        {view === 'details' && selectedAnime && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button onClick={() => setView('home')} className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4"/> Back
            </button>
            
            <div className="flex flex-col md:flex-row gap-8">
              <div className="w-full md:w-64 flex-shrink-0">
                <AnimeCover 
                   anime={selectedAnime}
                   className="w-full rounded-2xl shadow-xl aspect-[3/4] object-cover"
                />
              </div>
              <div className="space-y-4 flex-grow">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-3xl md:text-4xl font-bold">{selectedAnime.Name}</h2>
                  <button 
                    onClick={() => toggleFavorite(selectedAnime)}
                    className={`p-3 rounded-full border transition-all ${
                      favorites.some(f => f.finder === selectedAnime.finder)
                      ? 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/20'
                      : 'bg-neutral-900 border-white/10 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Heart className={`w-6 h-6 ${favorites.some(f => f.finder === selectedAnime.finder) ? 'fill-current' : ''}`} />
                  </button>
                </div>
                <div className="flex items-center gap-4 text-sm font-medium">
                  {selectedAnime.MALScore && (
                    <div className="flex items-center gap-1 text-yellow-500 bg-yellow-500/10 px-2.5 py-1 rounded-md">
                      <span>★</span> {selectedAnime.MALScore}
                    </div>
                  )}
                  {selectedAnime.Status && (
                    <div className="text-green-400 bg-green-400/10 px-2.5 py-1 rounded-md uppercase text-xs tracking-wider">
                      {selectedAnime.Status}
                    </div>
                  )}
                </div>
                {selectedAnime.Genres && (
                  <div className="flex flex-wrap gap-2">
                    {selectedAnime.Genres.map((g, i) => (
                      <span key={i} className="px-2 py-1 bg-indigo-500/10 text-indigo-300 text-xs rounded-md uppercase font-medium">
                        {g}
                      </span>
                    ))}
                  </div>
                )}
                {selectedAnime.DescripTion && (
                  <p className="text-neutral-400 leading-relaxed text-sm">
                    {selectedAnime.DescripTion}
                  </p>
                )}
                <div className="text-sm text-neutral-500 border-t border-white/10 pt-4 mt-6">
                  <span className="mr-8">Episodes: <strong className="text-neutral-200 text-lg">{epCount || 'Unknown'}</strong></span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold">Episodes</h3>
              {loadingDetails ? (
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              ) : episodes.length > 0 ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                  {episodes.map(ep => (
                     <button
                       key={ep}
                       onClick={() => playEpisode(ep)}
                       className="aspect-square bg-neutral-900 border border-white/5 hover:border-indigo-500/50 hover:bg-neutral-800 rounded-xl flex items-center justify-center font-mono text-lg transition-all"
                     >
                       {ep}
                     </button>
                  ))}
                </div>
              ) : (
                 <p className="text-neutral-500">No episodes found or tracking is not supported.</p>
              )}
            </div>
          </div>
        )}

        {/* PLAYER VIEW */}
        {view === 'player' && selectedAnime && (
          <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex items-center justify-between mx-1 md:mx-0">
              <button onClick={() => setView('details')} className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4"/> <span className="hidden sm:inline">Back to Episodes</span><span className="sm:hidden">Back</span>
              </button>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">{selectedAnime.Name}</h2>
              <p className="text-sm text-neutral-500">Scraping links for this episode...</p>
            </div>

            {playerError && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  <span className="font-semibold text-red-200">Extraction Failed</span>
                </div>
                <p className="text-sm text-red-300 ml-8">
                  The episode isn't out yet or the URL format has changed.
                </p>
                <div className="text-xs font-mono bg-black/30 p-2 rounded ml-8 text-neutral-400 break-all">{playerError}</div>
              </div>
            )}

            {loadingPlayer && !playerError && (
              <div className="w-full aspect-video bg-neutral-900 animate-pulse rounded-2xl flex flex-col items-center justify-center border border-white/5">
                 <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
                 <span className="text-neutral-400">Loading servers...</span>
              </div>
            )}

            {!loadingPlayer && scrapedData && (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Player Area */}
                <div className="lg:col-span-3 space-y-4">
                  <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 relative shadow-2xl group">
                    {activeStream ? (
                      <>
                        <iframe
                          key={activeStream.embed_url || activeStream.url}
                          src={activeStream.embed_url || activeStream.url}
                          className="w-full h-full border-0"
                          allowFullScreen
                          referrerPolicy="no-referrer"
                          allow="autoplay; fullscreen"
                          title="Video Player"
                        ></iframe>
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <a 
                            href={activeStream.embed_url || activeStream.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 bg-neutral-900/80 hover:bg-neutral-800 text-white px-4 py-2 rounded-xl text-sm font-medium backdrop-blur-md border border-white/10 transition-colors shadow-lg"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Open Externally
                          </a>
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 gap-3">
                        <LayoutTemplate className="w-12 h-12 opacity-50" />
                        <p>No streams available to play.</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Prev / Next controls below player */}
                  <div className="flex items-center justify-between bg-neutral-900/40 p-4 rounded-2xl border border-white/5">
                    <button 
                      onClick={() => playEpisode(currentEp - 1)}
                      disabled={currentEp <= 1}
                      className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors text-sm font-medium"
                    >
                      <SkipBack className="w-4 h-4 text-white" />
                      <span className="hidden sm:inline">Previous Ep</span>
                    </button>
                    
                    <div className="text-sm font-medium text-neutral-300">
                      Episode {currentEp} of {epCount || '?'}
                    </div>

                    <button 
                      onClick={() => playEpisode(currentEp + 1)}
                      disabled={currentEp >= epCount}
                      className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors text-sm font-medium"
                    >
                      <span className="hidden sm:inline">Next Ep</span>
                      <SkipForward className="w-4 h-4 text-white" />
                    </button>
                  </div>

                  {/* Server Selection */}
                  {scrapedData.streams.length > 0 && (
                    <div className="bg-neutral-900/50 border border-white/5 p-4 rounded-2xl">
                      <h3 className="text-sm font-medium text-neutral-400 mb-3 uppercase tracking-wider flex items-center gap-2">
                        <Play className="w-4 h-4" /> 
                        Servers ({scrapedData.streams.length})
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {scrapedData.streams.map((stream, idx) => {
                          const streamUrl = stream.embed_url || stream.url;
                          const isActive = (activeStream?.embed_url || activeStream?.url) === streamUrl;
                          return (
                            <button
                              key={idx}
                              onClick={() => setActiveStream(stream)}
                              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex flex-col items-start gap-0.5 ${
                                isActive 
                                  ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                              }`}
                            >
                              <span className="block">{stream.name || `Server ${idx + 1}`}</span>
                              {stream.host && (
                                <span className={`text-[10px] ${isActive ? 'text-indigo-200' : 'text-neutral-500'}`}>
                                  {stream.host}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Downloads Sidebar */}
                <div className="space-y-4">
                  <div className="bg-neutral-900/50 border border-white/5 p-5 rounded-2xl h-full">
                    <h3 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider flex items-center gap-2">
                      <Download className="w-4 h-4" /> 
                      Downloads ({scrapedData.downloads.length})
                    </h3>
                    
                    {scrapedData.downloads.length > 0 ? (
                      <div className="flex flex-col gap-3">
                        {scrapedData.downloads.map((dl, idx) => (
                          <a
                            key={idx}
                            href={dl.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 hover:scale-[1.02] transition-all group border border-transparent hover:border-white/10"
                          >
                            <div className="flex flex-col gap-0.5 overflow-hidden">
                              <span className="text-sm font-medium text-neutral-200 flex items-center gap-2 truncate">
                                {dl.name || 'Download'}
                                {dl.quality && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-neutral-950 text-neutral-400 rounded">
                                    {dl.quality}
                                  </span>
                                )}
                              </span>
                              {dl.host && (
                                <span className="text-xs text-neutral-500 truncate">
                                  {dl.host}
                                </span>
                              )}
                            </div>
                            <Download className="w-4 h-4 text-neutral-500 group-hover:text-indigo-400 transition-colors" />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-sm text-neutral-500 py-8">
                        No downloads found.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}


