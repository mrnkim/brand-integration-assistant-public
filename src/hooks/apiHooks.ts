import { EmbeddingResponse, IndexResponse, PaginatedResponse } from '@/types/index';
import { VideoData } from '@/types';

export const fetchIndex = async (indexId: string): Promise<IndexResponse> => {
  const response = await fetch(`/api/indexes/${indexId}`);
  return response.json();
};

// 비디오 목록 가져오기
export const fetchVideos = async (
  page: number = 1,
  indexId?: string
): Promise<PaginatedResponse> => {
  if (!indexId) {
    throw new Error('Index ID is required');
  }

  try {
    const response = await fetch(`/api/videos?page=${page}&index_id=${indexId}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching videos:', error);
    throw error;
  }
};

// 비디오 상세 정보 타입 정의
export interface VideoDetailResponse {
  _id: string;
  index_id?: string;
  hls?: {
    video_url?: string;
    thumbnail_urls?: string[];
    status?: string;
    updated_at?: string;
  };
  system_metadata?: {
    filename?: string;
    video_title?: string;
    duration?: number;
    fps?: number;
    height?: number;
    width?: number;
    size?: number;
  };
  user_metadata?: Record<string, string>;
}

// 비디오 상세 정보 타입 정의 - 임베딩 포함 버전
interface VideoDetailWithEmbedding {
  _id: string;
  index_id?: string;
  hls?: {
    video_url?: string;
    thumbnail_urls?: string[];
    status?: string;
    updated_at?: string;
  };
  system_metadata?: {
    filename?: string;
    video_title?: string;
    duration?: number;
    fps?: number;
    height?: number;
    width?: number;
    size?: number;
  };
  user_metadata?: Record<string, string>;
  embedding: {
    video_embedding: {
      segments: Array<{
        start_offset_sec: number;
        end_offset_sec: number;
        embedding_scope: string;
        float: number[];
      }>;
    };
  };
}

// 비디오 상세 정보 가져오기
export const fetchVideoDetails = async (videoId: string, indexId: string, embed: boolean = false) => {
  try {
    const response = await fetch(`/api/videos/${videoId}?indexId=${indexId}&embed=${embed}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Network response was not ok: ${errorText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching video details:', error);
    // Rethrow the error for the caller to handle
    throw error;
  }
};

// 비디오 처리 상태 확인 - 카테고리 정보 포함
export interface ProcessingStatusResponse {
  processed: boolean;
  source?: string;
  category?: string;
  videoId?: string;
  indexId?: string;
  error?: string;
}

// 비디오 처리 상태 확인 함수
export const checkProcessingStatus = async (
  videoId: string,
  indexId: string
): Promise<ProcessingStatusResponse> => {
  try {
    const url = new URL('/api/vectors/check-status', window.location.origin);
    url.searchParams.append('videoId', videoId);
    url.searchParams.append('indexId', indexId);

    console.log(`Checking processing status for video ${videoId} in index ${indexId}`);
    const response = await fetch(url.toString());

    if (!response.ok) {
      console.error(`Error checking processing status: HTTP status ${response.status}`);
      return {
        processed: false,
        error: `HTTP error ${response.status}`,
        // Determine category based on indexId even when API fails
        category: indexId.toLowerCase().includes('ad') ? 'ad' : 'content'
      };
    }

    const data = await response.json();
    console.log(`Processing status for video ${videoId}:`, JSON.stringify(data));

    // 중요: 정확히 processed 값이 무엇인지 명확하게 로깅
    console.log(`Video ${videoId} processed status is explicitly: ${Boolean(data.processed)}`);

    // 벡터가 없을 때 임베딩 생성 명시적 로깅
    if (!data.processed) {
      console.log(`### IMPORTANT: Video ${videoId} is NOT processed. Will attempt to create embedding.`);
    } else {
      console.log(`### CONFIRMED: Video ${videoId} is already processed. No need to create embedding.`);
    }

    return data;
  } catch (error) {
    console.error('Error checking processing status:', error);
    // In case of error, return processed=false with category determination
    return {
      processed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      // Still determine category based on indexId
      category: indexId.toLowerCase().includes('ad') ? 'ad' : 'content'
    };
  }
};

// 벡터 인덱스 존재 여부 확인
export const checkVectorExists = async (videoId: string, indexId?: string): Promise<boolean> => {
  try {
    const url = new URL('/api/vectors/exists', window.location.origin);
    url.searchParams.append('video_id', videoId);
    if (indexId) {
      url.searchParams.append('index_id', indexId);
    }

    console.log(`Checking if vector exists for video ${videoId}${indexId ? ` in index ${indexId}` : ''}`);
    const response = await fetch(url.toString());

    if (!response.ok) {
      console.error(`Error checking vector: HTTP status ${response.status}`);
      return false;
    }

    const data = await response.json();
    console.log(`Vector exists for video ${videoId}: ${data.exists}`);
    return data.exists;
  } catch (error) {
    console.error('Error checking vector existence:', error);
    // In case of error, assume it doesn't exist and proceed with storing
    return false;
  }
};

export const getAndStoreEmbeddings = async (indexId: string, videoId: string) => {
  try {
    console.log(`🔄 Getting embeddings for video ${videoId} in index ${indexId}`);
    console.log(`🧪 Environment check: Pinecone API key exists: ${!!process.env.PINECONE_API_KEY}, Pinecone index: ${process.env.PINECONE_INDEX}`);

    // First check if we already have embeddings stored for this video
    try {
      const existsResponse = await fetch(`/api/vectors/exists?video_id=${videoId}&index_id=${indexId}`);
      if (existsResponse.ok) {
        const existsData = await existsResponse.json();
        if (existsData.exists) {
          console.log(`✅ Embeddings already exist for video ${videoId}, skipping generation`);
          return { success: true, message: 'Embeddings already exist' };
        }
      }
    } catch (checkError) {
      console.warn(`⚠️ Error checking if embeddings exist, will proceed with generation:`, checkError);
    }

    // Add delay to ensure video data is ready at Twelve Labs
    console.log(`⏱️ Waiting for video data to be ready...`);
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Fetch video details with embedding
    console.log(`🔍 Fetching video details with embedding for ${videoId}`);
    const response = await fetch(`/api/videos/${videoId}?indexId=${indexId}&embed=true`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to fetch video details with embedding: ${errorText}`);

      // If we get a 404 or 400, the video might not be fully processed yet, wait longer
      if (response.status === 404 || response.status === 400) {
        console.log(`⚠️ Video ${videoId} may not be fully processed yet, will retry after delay`);
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Try again after waiting
        console.log(`🔄 Retrying fetch after delay...`);
        const retryResponse = await fetch(`/api/videos/${videoId}?indexId=${indexId}&embed=true`);
        if (!retryResponse.ok) {
          const retryErrorText = await retryResponse.text();
          console.error(`❌ Retry failed to fetch video details: ${retryErrorText}`);
          return { success: false, message: `API error on retry: ${retryResponse.status} - ${retryErrorText}` };
        }

        const videoDetails = await retryResponse.json();
        if (!videoDetails || !videoDetails.embedding) {
          console.error(`❌ No embedding data found for video ${videoId} after retry`);
          return { success: false, message: 'No embedding data found after retry' };
        }

        // Continue with the retry response data
        return await processAndStoreEmbedding(videoDetails, videoId, indexId);
      }

      return { success: false, message: `API error: ${response.status} - ${errorText}` };
    }

    const videoDetails = await response.json();

    // Debugging: Check what we got back from the API
    console.log(`ℹ️ Video details structure:`, {
      hasEmbedding: !!videoDetails.embedding,
      embeddingKeys: videoDetails.embedding ? Object.keys(videoDetails.embedding) : [],
      hasVideoEmbedding: !!(videoDetails.embedding && videoDetails.embedding.video_embedding),
      hasSegments: !!(videoDetails.embedding && videoDetails.embedding.video_embedding && videoDetails.embedding.video_embedding.segments),
      segmentsLength: videoDetails.embedding && videoDetails.embedding.video_embedding && videoDetails.embedding.video_embedding.segments
        ? videoDetails.embedding.video_embedding.segments.length : 0
    });

    // Check specifically if the embedding property exists and is not null/undefined
    if (!videoDetails || !videoDetails.embedding) {
      console.error(`❌ No embedding data found for video ${videoId}`);
      return { success: false, message: 'No embedding data found' };
    }

    return await processAndStoreEmbedding(videoDetails, videoId, indexId);
  } catch (error) {
    console.error(`❌ Error in getAndStoreEmbeddings for video ${videoId}:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Helper function to process and store embedding data
const processAndStoreEmbedding = async (videoDetails: VideoDetailWithEmbedding, videoId: string, indexId: string) => {
  try {
    const embedding = videoDetails.embedding;

    // Check if the embedding has segments
    if (!embedding.video_embedding || !embedding.video_embedding.segments || embedding.video_embedding.segments.length === 0) {
      console.error(`Invalid embedding structure for video ${videoId} - missing segments`);
      return { success: false, message: 'Invalid embedding structure - missing segments' };
    }

    console.log(`Embedding found for video ${videoId} with ${embedding.video_embedding.segments.length} segments`);

    // Get proper filename and title from system_metadata
    let filename = '';
    let videoTitle = '';

    if (videoDetails.system_metadata) {
      if (videoDetails.system_metadata.filename) {
        filename = videoDetails.system_metadata.filename;
        console.log(`Using filename from system_metadata: ${filename}`);
      }
      if (videoDetails.system_metadata.video_title) {
        videoTitle = videoDetails.system_metadata.video_title;
        console.log(`Using video title from system_metadata: ${videoTitle}`);
      }
    }

    // If filename is not found, use videoId as fallback
    if (!filename) {
      filename = `${videoId}.mp4`;
      console.log(`No filename found, using fallback: ${filename}`);
    }

    // If no video title, extract from filename (remove extension)
    if (!videoTitle && filename) {
      videoTitle = filename.split('.')[0];
      console.log(`No video title found, using name from filename: ${videoTitle}`);
    }

    console.log(`Storing embedding for video ${videoId}`);
    console.log(`- Title: ${videoTitle}`);
    console.log(`- Filename: ${filename}`);
    console.log(`- Segments: ${embedding.video_embedding.segments.length}`);

    // Test Pinecone connection before attempting to store
    try {
      const pineconeTestResponse = await fetch('/api/vectors/test-connection', {
        method: 'GET'
      });

      if (!pineconeTestResponse.ok) {
        console.error(`❌ Pinecone connection test failed. Status: ${pineconeTestResponse.status}`);
        return { success: false, message: 'Pinecone connection test failed' };
      }

      console.log(`✅ Pinecone connection test passed`);
    } catch (connectionError) {
      console.error(`❌ Error testing Pinecone connection:`, connectionError);
    }

    // Store the embeddings in Pinecone
    const storeResponse = await fetch('/api/vectors/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoId,
        videoName: filename, // Use the filename for vector ID generation
        embedding: {
          ...embedding,
          // Ensure system_metadata has the correct title and filename
          system_metadata: {
            ...(videoDetails.system_metadata || {}),
            filename: filename,
            video_title: videoTitle
          }
        },
        indexId,
      }),
    });

    if (!storeResponse.ok) {
      const errorText = await storeResponse.text();
      console.error(`Failed to store embedding. Status: ${storeResponse.status}. Error: ${errorText}`);
      return { success: false, message: `Failed to store embedding: ${storeResponse.statusText}` };
    }

    const result = await storeResponse.json();
    console.log(`Successfully stored embeddings for video ${videoId} in Pinecone`);
    return { success: true, ...result };
  } catch (error) {
    console.error(`Error in processAndStoreEmbedding for video ${videoId}:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// 사용자 지정 메타데이터 생성
export const generateMetadata = async (videoId: string): Promise<string> => {
  try {
    const response = await fetch(`/api/generate?videoId=${videoId}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    // Now data has the structure { id, data, usage } where data.data contains the hashtags
    return data.data || '';
  } catch (error) {
    console.error('Error generating metadata:', error);
    throw error;
  }
};

// 파싱된 해시태그에서 메타데이터 객체 생성
export const parseHashtags = (hashtagText: string): Record<string, string> => {

  // 해시태그 문자열에서 메타데이터 추출
  const metadata: Record<string, string> = {
    source: '',
    sector: '',
    emotions: '',
    brands: '',
    locations: '',
    demographics: ''
  };

  // 각 해시태그에서 카테고리 추출 시도
  // 개행문자(\n)를 공백으로 대체하여 일관된 분할 처리
  const cleanText = hashtagText.replace(/\n/g, ' ');
  const hashtags = cleanText.split(/\s+/).filter(tag => tag.startsWith('#'));

  // 각 카테고리별 태그를 수집하기 위한 객체
  const categoryTags: Record<string, string[]> = {
    demographics: [],
    sector: [],
    emotions: [],
    locations: [],
    brands: []
  };

  // 카테고리별 키워드 (모두 소문자로 정의)
  const demographicsKeywords = ['male', 'female', '18-25', '25-34', '35-44', '45-54', '55+'];
  const sectorKeywords = ['beauty', 'fashion', 'tech', 'travel', 'cpg', 'food', 'bev', 'retail'];
  const emotionKeywords = ['happy', 'positive', 'happypositive', 'happy/positive', 'exciting', 'relaxing', 'inspiring', 'serious', 'festive', 'calm', 'determined'];

  // 특정 위치 키워드 - 이것들이 나오면 확실하게 위치로 분류
  const locationKeywords = [
    'seoul', 'dubai', 'doha', 'newyork', 'new york', 'paris', 'tokyo', 'london', 'berlin',
    'lasvegas', 'las vegas', 'france', 'korea', 'qatar', 'uae', 'usa', 'bocachica', 'bocachicabeach', 'marathon'
  ];

  // 특정 브랜드 키워드 - 이것들이 나오면 확실하게 브랜드로 분류
  const brandKeywords = [
    'fentybeauty', 'adidas', 'nike', 'spacex', 'apple', 'microsoft', 'google', 'amazon',
    'ferrari', 'heineken', 'redbullracing', 'redbull', 'sailgp', 'fifaworldcup', 'fifa',
    'tourdefrance', 'nttdata', 'oracle'
  ];

  for (const tag of hashtags) {
    const cleanTag = tag.slice(1).toLowerCase(); // # 제거 및 소문자 변환

    // 인구통계 확인 - 인구통계는 demographics 필드에 저장
    if (demographicsKeywords.includes(cleanTag)) {
      categoryTags.demographics.push(cleanTag);
      continue;
    }

    // 섹터 확인
    if (sectorKeywords.includes(cleanTag)) {
      categoryTags.sector.push(cleanTag);
      continue;
    }

    // 감정 확인
    if (emotionKeywords.includes(cleanTag)) {
      categoryTags.emotions.push(cleanTag);
      continue;
    }

    // 위치 키워드 확인
    if (locationKeywords.includes(cleanTag)) {
      categoryTags.locations.push(cleanTag);
      continue;
    }

    // 브랜드 키워드 확인
    if (brandKeywords.includes(cleanTag)) {
      categoryTags.brands.push(cleanTag);
      continue;
    }
  }

  // 아직 분류되지 않은 태그들 처리
  const unclassifiedTags = hashtags.filter(tag => {
    const cleanTag = tag.slice(1).toLowerCase();
    return !demographicsKeywords.includes(cleanTag) &&
           !sectorKeywords.includes(cleanTag) &&
           !emotionKeywords.includes(cleanTag) &&
           !locationKeywords.includes(cleanTag) &&
           !brandKeywords.includes(cleanTag);
  });

  // 아직 분류되지 않은 태그가 있고, locations가 비어있으면 첫 번째 태그를 locations로 간주
  if (unclassifiedTags.length > 0 && categoryTags.locations.length === 0) {
    categoryTags.locations.push(unclassifiedTags[0].slice(1).toLowerCase());
    unclassifiedTags.shift();
  }

  // 아직 분류되지 않은 태그가 있고, brands가 비어있으면 다음 태그를 brands로 간주
  if (unclassifiedTags.length > 0 && categoryTags.brands.length === 0) {
    categoryTags.brands.push(unclassifiedTags[0].slice(1).toLowerCase());
  }

  // 각 카테고리 태그를 쉼표로 구분된 문자열로 변환
  for (const category in categoryTags) {
    if (categoryTags[category as keyof typeof categoryTags].length > 0) {
      metadata[category] = categoryTags[category as keyof typeof categoryTags].join(', ');
    }
  }

  return metadata;
};

// 메타데이터 업데이트
export const updateVideoMetadata = async (
  videoId: string,
  indexId: string,
  metadata: Record<string, string>
): Promise<boolean> => {
  try {
    console.log('Called updateVideoMetadata with metadata:', metadata);

    // UI에서 사용하는 필드명을 API에서 사용하는 필드명으로 매핑
    const apiMetadata: Record<string, string> = {};

    // 직접 매핑되는 필드
    if ('source' in metadata) apiMetadata.source = metadata.source;
    if ('emotions' in metadata) apiMetadata.emotions = metadata.emotions;
    if ('brands' in metadata) apiMetadata.brands = metadata.brands;
    if ('locations' in metadata) apiMetadata.locations = metadata.locations;

    // 특별히 매핑이 필요한 필드
    // topic_category는 실제로는 sector 필드로 저장
    if ('topic_category' in metadata) apiMetadata.sector = metadata.topic_category;
    if ('sector' in metadata) apiMetadata.sector = metadata.sector;

    // demographics 관련 필드
    if ('demo_age' in metadata || 'demo_gender' in metadata) {
      const demographics = [];
      if (metadata.demo_age) demographics.push(metadata.demo_age);
      if (metadata.demo_gender) demographics.push(metadata.demo_gender);
      apiMetadata.demographics = demographics.join(', ');
    }

    // 로깅
    console.log('Transformed API metadata:', apiMetadata);

    const payload = {
      videoId,
      indexId,
      metadata: apiMetadata
    };

    const response = await fetch('/api/videos/metadata', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    if (!response.ok) {
      // 오류가 발생한 경우, 응답 텍스트를 그대로 사용
      console.error('Error updating metadata:', responseText);
      throw new Error(`HTTP error! status: ${response.status}, message: ${responseText}`);
    }

    // 성공 응답이면 JSON으로 파싱 시도, 실패하면 true만 반환
    let success = true;
    if (responseText && responseText.trim() !== '') {
      try {
        const result = JSON.parse(responseText);
        success = result.success !== false; // 명시적으로 false가 아니면 true로 간주
      } catch {
        // 파싱 실패 시 기본값 사용
      }
    }

    return success;
  } catch (error) {
    console.error('Error updating video metadata:', error);
    throw error;
  }
};

// 비디오 메타데이터를 태그로 변환
export const convertMetadataToTags = (metadata: Record<string, unknown>): { category: string; value: string }[] => {
  if (!metadata) return [];


  const tags: { category: string; value: string }[] = [];

  // Helper function to normalize tag values
  const normalizeTagValue = (value: string): string => {
    return value.trim()
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Source
  if (metadata.source && typeof metadata.source === 'string') {
    tags.push({ category: 'Source', value: normalizeTagValue(metadata.source) });
  }

  // Demographics - 새로운 필드로 처리
  if (metadata.demographics && typeof metadata.demographics === 'string') {
    // 쉼표로 구분된 값을 개별 태그로 추가
    metadata.demographics.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag !== '')
      .forEach(tag => {
        tags.push({ category: 'Demographics', value: normalizeTagValue(tag) });
      });
  }

  // Sector
  if (metadata.sector && typeof metadata.sector === 'string') {
    // 쉼표로 구분된 값을 개별 태그로 추가
    metadata.sector.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag !== '')
      .forEach(tag => {
        tags.push({ category: 'Sector', value: normalizeTagValue(tag) });
      });
  }

  // Emotions
  if (metadata.emotions && typeof metadata.emotions === 'string') {
    // 쉼표로 구분된 값을 개별 태그로 추가
    metadata.emotions.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag !== '')
      .forEach(tag => {
        tags.push({ category: 'Emotions', value: normalizeTagValue(tag) });
      });
  }

  // Brands
  if (metadata.brands && typeof metadata.brands === 'string') {
    // 쉼표로 구분된 값을 개별 태그로 추가
    metadata.brands.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag !== '')
      .forEach(tag => {
        tags.push({ category: 'Brands', value: normalizeTagValue(tag) });
      });
  }

  // Locations
  if (metadata.locations && typeof metadata.locations === 'string') {
    // 쉼표로 구분된 값을 개별 태그로 추가
    metadata.locations.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag !== '')
      .forEach(tag => {
        tags.push({ category: 'Location', value: normalizeTagValue(tag) });
      });
  }

  return tags;
};

// 텍스트 검색 결과 타입 정의
interface SearchPageInfo {
  page: number;
  total_page: number;
  total_videos: number;
  total_results?: number;
  limit_per_page?: number;
  next_page_token?: string;
  prev_page_token?: string;
  page_expires_at?: string;
}

interface SearchResult {
  _id: string;
  index_id: string;
  video_id: string;
  score: number;
  duration: number;
  thumbnail_url?: string;
  video_url?: string;
  video_title?: string;
  segments?: Array<{
    start: number;
    end: number;
    score: number;
    matched_words?: string[];
  }>;
}

// 텍스트 검색 수행
export const searchVideos = async (
  searchQuery: string,
  indexId?: string
): Promise<{ pageInfo: SearchPageInfo; textSearchResults: SearchResult[] }> => {
  try {
    console.log('🔍 > searchVideos > Searching for:', searchQuery);

    if (!searchQuery || searchQuery.trim() === '') {
      return {
        pageInfo: { page: 1, total_page: 1, total_videos: 0, total_results: 0 },
        textSearchResults: []
      };
    }

    // Use provided indexId or get from environment - renamed variable to avoid confusion
    const searchIndexId = indexId || process.env.NEXT_PUBLIC_CONTENT_INDEX_ID;
    console.log('🔍 > searchVideos > Using index ID:', searchIndexId,
                'Is ads index?', searchIndexId === process.env.NEXT_PUBLIC_ADS_INDEX_ID,
                'Is content index?', searchIndexId === process.env.NEXT_PUBLIC_CONTENT_INDEX_ID);

    // Make an initial search request to get the correct total count
    // Use a larger page_size to increase chance of getting full count in first request
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textSearchQuery: searchQuery,
        indexId: searchIndexId,
        page_size: 100  // Request larger page size to get complete results if possible
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('🔍 > searchVideos > Raw API response:', JSON.stringify(data));
    console.log('🔍 > searchVideos > API response pageInfo:', data.pageInfo);
    console.log('🔍 > searchVideos > ResultCount from API:', data.textSearchResults?.length || 0);
    console.log('🔍 > searchVideos > total_results from API:', data.pageInfo?.total_results);

    // If we need to limit the results to display, only pass back first 10
    const limitedResults = data.textSearchResults?.slice(0, 10) || [];

    // Return results with correct total_results count but limited initial results
    return {
      pageInfo: {
        ...data.pageInfo,
        // Ensure total_results is preserved from the original response
        total_results: data.pageInfo?.total_results || limitedResults.length,
      },
      textSearchResults: limitedResults
    };
  } catch (error) {
    console.error('Error searching videos:', error);
    throw error;
  }
};

// Get embedding from TwelveLabs API
export const getVideoEmbedding = async (
  videoId: string,
  indexId: string
): Promise<EmbeddingResponse> => {
  try {
    const response = await fetch('/api/vectors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ video_id: videoId, index_id: indexId }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting video embedding:', error);
    throw error;
  }
};

// Reset Pinecone vectors
export const resetPineconeVectors = async (
  videoId?: string,
  indexId?: string,
  resetAll: boolean = false
): Promise<boolean> => {
  try {
    console.log(`Resetting vectors: videoId=${videoId || 'none'}, indexId=${indexId || 'none'}, resetAll=${resetAll}`);

    const response = await fetch('/api/vectors/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoId,
        indexId,
        resetAll
      }),
    });

    if (!response.ok) {
      console.error(`Failed to reset vectors. Status: ${response.status}`);
      return false;
    }

    const data = await response.json();
    console.log('Reset response:', data);
    return data.success === true;
  } catch (error) {
    console.error('Error resetting vectors:', error);
    return false;
  }
};

// Embedding 검색 결과 타입 정의
export interface EmbeddingSearchResult {
  score: number;
  metadata?: {
    tl_video_id: string;
    tl_index_id: string;
    video_file: string;
    [key: string]: string | number | boolean | string[];
  };
  searchMethod?: string;
  originalSource?: 'TEXT' | 'VIDEO' | 'BOTH';
  textScore?: number;
  videoScore?: number;
}

// 임베딩 검색 - 텍스트(태그)로 유사한 비디오 검색
export const textToVideoEmbeddingSearch = async (
  videoId: string,
  adsIndexId: string,
  contentIndexId: string
): Promise<EmbeddingSearchResult[]> => {
  try {
    console.log(`Searching similar content for video ${videoId}`);

    // 선택된 광고 비디오의 태그 정보(sector, emotions)를 검색어로 사용
    const videoDetails = await fetchVideoDetails(videoId, adsIndexId);
    const sector = videoDetails.user_metadata?.sector || '';
    const emotions = videoDetails.user_metadata?.emotions || '';
    const videoTitle = videoDetails.system_metadata?.video_title ||
                     videoDetails.system_metadata?.filename ||
                     `Video ${videoId}`;

    // 결과를 저장할 Map (videoId를 키로 사용)
    const resultMap = new Map();

    // 1. 태그 기반 검색 (sector + emotions)
    const tagSearchTerm = `${sector} ${emotions}`.trim();
    if (tagSearchTerm) {
      console.log(`Using tag search term: "${tagSearchTerm}" for contextual analysis`);

      try {
        const tagResponse = await fetch('/api/embeddingSearch/textToVideo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            searchTerm: tagSearchTerm,
            indexId: contentIndexId
          }),
        });

        if (tagResponse.ok) {
          const tagResults: EmbeddingSearchResult[] = await tagResponse.json();
          console.log(`Found ${tagResults.length} tag-based search results`);

          // 태그 기반 결과를 Map에 저장
          tagResults.forEach(result => {
            const resultVideoId = result.metadata?.tl_video_id;
            if (resultVideoId) {
              // 각 결과에 searchMethod 속성 추가
              result.searchMethod = 'tag';
              resultMap.set(resultVideoId, result);
            }
          });
        }
      } catch (error) {
        console.error("Error in tag-based search:", error);
      }
    }

    // 2. 제목 기반 검색
    console.log(`Using title search term: "${videoTitle}" for contextual analysis`);

    try {
      const titleResponse = await fetch('/api/embeddingSearch/textToVideo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchTerm: videoTitle,
          indexId: contentIndexId
        }),
      });

      if (titleResponse.ok) {
        const titleResults: EmbeddingSearchResult[] = await titleResponse.json();
        console.log(`Found ${titleResults.length} title-based search results`);

        // 제목 기반 결과를 Map에 추가 (이미 존재하는 경우 점수 비교)
        titleResults.forEach(result => {
          const resultVideoId = result.metadata?.tl_video_id;
          if (resultVideoId) {
            result.searchMethod = 'title';

            // 이미 태그 검색에서 발견된 결과인 경우 점수 비교
            if (resultMap.has(resultVideoId)) {
              const existingResult = resultMap.get(resultVideoId);
              // 점수가 더 높은 결과만 유지
              if (result.score > existingResult.score) {
                resultMap.set(resultVideoId, result);
              }
            } else {
              // 새로운 결과 추가
              resultMap.set(resultVideoId, result);
            }
          }
        });
      }
    } catch (error) {
      console.error("Error in title-based search:", error);
    }

    // Map의 모든 값을 배열로 변환
    const finalResults = Array.from(resultMap.values());

    // 점수 기준으로 정렬
    finalResults.sort((a, b) => b.score - a.score);

    console.log(`Final text-based search results: ${finalResults.length} unique videos`);

    return finalResults;
  } catch (error) {
    console.error('Error in text to video embedding search:', error);
    throw error;
  }
};

// 비디오 기반 임베딩 검색 - 선택한 광고와 유사한 콘텐츠 찾기
export const videoToVideoEmbeddingSearch = async (
  videoId: string,
  adsIndexId: string,
  contentIndexId: string
): Promise<EmbeddingSearchResult[]> => {
  try {
    console.log(`Searching video-to-video similar content for ad ${videoId}`);

    const response = await fetch('/api/embeddingSearch/videoToVideo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoId: videoId,
        indexId: contentIndexId
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const results: EmbeddingSearchResult[] = await response.json();
    console.log(`Found ${results.length} similar videos by video embedding`);

    return results;
  } catch (error) {
    console.error('Error in video to video embedding search:', error);
    throw error;
  }
};

// Chapter 타입 정의
export interface Chapter {
  start: number;
  end: number;
  text: string;
}

export interface ChaptersData {
  chapters: Chapter[];
}

// 비디오의 챕터를 가져오는 함수
export const generateChapters = async (videoId: string): Promise<ChaptersData> => {
  try {
    const response = await fetch(`/api/generateChapters?videoId=${videoId}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // 챕터 데이터의 유효성 검사
    if (!data || !data.chapters || !Array.isArray(data.chapters)) {
      throw new Error('Invalid chapters data received');
    }

    return data;
  } catch (error) {
    console.error('Error generating chapters:', error);
    throw error;
  }
};

// Fetch recent indexing tasks
export interface IndexingTask {
  _id: string;
  created_at?: string;
  updated_at?: string;
  index_id?: string;
  status?: string;
  video_id?: string;
  hls?: {
    thumbnail_urls?: string[];
    video_url?: string;
    status?: string;
  };
  system_metadata?: {
    filename?: string;
    video_title?: string;
    duration?: number;
    width?: number;
    height?: number;
  };
}

export const fetchIndexingTasks = async (indexId: string): Promise<IndexingTask[]> => {
  try {
    // Fetch tasks from our API proxy to Twelve Labs
    const response = await fetch(`/api/videos/indexing-tasks?indexId=${indexId}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch indexing tasks: ${errorText}`);
    }

    const data = await response.json();

    // Pre-load thumbnails for completed videos to speed up display
    const completedTasks = (data.tasks || []).filter((task: IndexingTask) => task.status === 'ready');
    if (completedTasks.length > 0) {
      console.log(`Preloading thumbnails for ${completedTasks.length} completed videos`);
      preloadThumbnails(completedTasks);
    }

    return data.tasks || [];
  } catch (error) {
    console.error('Error fetching indexing tasks:', error);
    return [];
  }
};

// Helper function to preload thumbnails for faster display
const preloadThumbnails = (tasks: IndexingTask[]) => {
  tasks.forEach(task => {
    if (task.hls?.thumbnail_urls && task.hls.thumbnail_urls.length > 0) {
      // Create a new image element to preload the thumbnail
      const img = new Image();
      img.src = task.hls.thumbnail_urls[0];
      // No need to append to DOM, just setting the src will trigger the preload
    }
  });
};

// Function to check and ensure embeddings exist for videos
export interface EmbeddingCheckResult {
  success: boolean;
  message: string;
  adEmbeddingExists: boolean;
  contentEmbeddingsExist: boolean;
  processedCount: number;
  totalCount: number;
}

// Check and ensure embeddings for both ad and content videos
export const checkAndEnsureEmbeddings = async (
  adVideoId: string,
  adIndexId: string,
  contentIndexId: string,
  contentVideos?: VideoData[]
): Promise<EmbeddingCheckResult> => {
  try {
    console.log(`🔄 Checking embeddings for ad video ${adVideoId} and content videos`);

    // Start with initial result state
    const result: EmbeddingCheckResult = {
      success: false,
      message: "Processing embeddings...",
      adEmbeddingExists: false,
      contentEmbeddingsExist: false,
      processedCount: 0,
      totalCount: contentVideos ? contentVideos.length + 1 : 1 // +1 for the ad video
    };

    // Step 1: Check if ad video embedding exists
    console.log(`🔍 Checking if ad video ${adVideoId} embedding exists...`);
    const adEmbeddingExists = await checkVectorExists(adVideoId, adIndexId);
    result.adEmbeddingExists = adEmbeddingExists;

    // Step 2: If ad embedding doesn't exist, generate and store it
    if (!adEmbeddingExists) {
      console.log(`⚠️ Ad video ${adVideoId} embedding does not exist, generating...`);
      const adEmbeddingResult = await getAndStoreEmbeddings(adIndexId, adVideoId);

      if (!adEmbeddingResult.success) {
        console.error(`❌ Failed to generate ad video embedding: ${adEmbeddingResult.message}`);
        return {
          ...result,
          success: false,
          message: `Failed to generate ad video embedding: ${adEmbeddingResult.message}`
        };
      }

      console.log(`✅ Successfully generated ad video embedding`);
      result.adEmbeddingExists = true;
    } else {
      console.log(`✅ Ad video ${adVideoId} embedding already exists`);
    }

    result.processedCount += 1;

    // Step 3: If content videos are provided, check and generate their embeddings if needed
    if (contentVideos && contentVideos.length > 0) {
      console.log(`🔍 Checking ${contentVideos.length} content videos for embeddings...`);

      // Track content videos with missing embeddings
      const missingEmbeddings: string[] = [];
      const existingEmbeddings: string[] = [];

      // First check which content videos need embeddings
      for (const video of contentVideos) {
        const videoId = video._id;
        const hasEmbedding = await checkVectorExists(videoId, contentIndexId);

        if (hasEmbedding) {
          existingEmbeddings.push(videoId);
        } else {
          missingEmbeddings.push(videoId);
        }
      }

      console.log(`✅ Found ${existingEmbeddings.length} content videos with existing embeddings`);
      console.log(`⚠️ Found ${missingEmbeddings.length} content videos missing embeddings`);

      // Generate embeddings for videos that need them
      if (missingEmbeddings.length > 0) {
        for (const videoId of missingEmbeddings) {
          console.log(`🔄 Generating embedding for content video ${videoId}...`);
          const embedResult = await getAndStoreEmbeddings(contentIndexId, videoId);

          if (embedResult.success) {
            console.log(`✅ Successfully generated embedding for content video ${videoId}`);
          } else {
            console.error(`❌ Failed to generate embedding for content video ${videoId}: ${embedResult.message}`);
          }

          result.processedCount += 1;
        }
      }

      // Update result with content embedding status
      result.contentEmbeddingsExist = missingEmbeddings.length === 0 || result.processedCount >= result.totalCount;
    } else {
      // If no content videos provided, mark as complete
      result.contentEmbeddingsExist = true;
    }

    // Final success determination
    result.success = result.adEmbeddingExists && result.contentEmbeddingsExist;
    result.message = result.success
      ? "All embeddings successfully processed"
      : `Processed ${result.processedCount}/${result.totalCount} videos`;

    return result;
  } catch (error) {
    console.error(`❌ Error in checkAndEnsureEmbeddings:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error occurred",
      adEmbeddingExists: false,
      contentEmbeddingsExist: false,
      processedCount: 0,
      totalCount: contentVideos ? contentVideos.length + 1 : 1
    };
  }
};