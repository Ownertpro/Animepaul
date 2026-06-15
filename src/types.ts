export interface AnimeStream {
  name: string;
  host: string;
  url?: string;
  embed_url?: string;
}

export interface AnimeDownload {
  name: string;
  host: string;
  url: string;
  quality?: string;
}

export interface ScrapeResponse {
  title: string;
  id?: string;
  streams: AnimeStream[];
  downloads: AnimeDownload[];
  rawJson?: any;
}

export interface AnipubAnime {
  _id?: number | string;
  Id?: number | string;
  Name: string;
  ImagePath?: string;
  Image?: string;
  Cover?: string;
  Genres?: string[];
  MALScore?: string;
  finder: string;
  epCount?: number;
  DescripTion?: string;
  Status?: string;
}

