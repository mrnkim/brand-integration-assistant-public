// Tag type for content metadata
export type Tag = {
  category: string;
  value: string;
};

// Content item type
export type ContentItem = {
  id: string;
  thumbnailUrl: string;
  title: string;
  videoUrl: string;
  tags: Tag[];
  metadata?: {
    source?: string;
    sector?: string;
    emotions?: string;
    brands?: string;
    locations?: string;
  };
};

// API 관련 타입
export type VideoData = {
  _id: string;
  index_id?: string;
  created_at?: string;
  user_metadata?: Record<string, unknown>;
  system_metadata?: {
    title?: string;
    filename?: string;
    url?: string;
    thumbnail_url?: string;
    duration?: number;
    created_at?: string;
    video_title?: string;
    fps?: number;
    height?: number;
    width?: number;
    size?: number;
    model_names?: string[];
  };
  hls?: {
    video_url?: string;
    thumbnail_urls?: string[];
    status?: string;
    updated_at?: string;
  };
  metadata?: {
    tags?: Tag[];
    title?: string;
    url?: string;
    thumbnailUrl?: string;
  };
};

export type PageInfo = {
  page: number;
  total_page: number;
  total_count: number;
};

export type PaginatedResponse = {
  data: VideoData[];
  page_info: PageInfo;
};

export type ApiError = {
  message: string;
  status?: number;
};

// Video 컴포넌트 타입
export type VideoProps = {
  videoId: string;
  indexId: string;
  showTitle?: boolean;
  videoDetails?: VideoDetails;
  playing?: boolean;
  onPlay?: () => void;
};

export type VideoDetails = {
  _id: string;
  hls?: {
    video_url?: string;
    thumbnail_urls?: string[];
  };
  system_metadata?: {
    filename?: string;
    duration?: number;
    video_title?: string;
    fps?: number;
    height?: number;
    width?: number;
  };
};

export interface Segment {
  embedding_scope: string;
  end_offset_sec: number;
  float: number[];
  start_offset_sec: number;
}

export interface Vector {
  id: string;
  values: number[];
  metadata: VectorMetadata;
}

export interface VectorMetadata {
  category: string;
  end_time: number;
  scope: string;
  start_time: number;
  tl_index_id: string;
  tl_video_id: string;
  video_file: string;
  video_segment: number;
}

// Define types for embeddings and transcription
export interface EmbeddingSegment {
  embedding_option: string;
  embedding_scope: string;
  end_offset_sec: number;
  float: number[];
  start_offset_sec: number;
}

export interface VideoEmbedding {
  segments: EmbeddingSegment[];
}

export interface Embedding {
  model_name: string;
  video_embedding: VideoEmbedding;
}

export interface EmbeddingResponse {
  videoId: string;
  exists: boolean;
  embedding: Embedding;
}