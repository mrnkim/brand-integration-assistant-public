import { IndexResponse, PaginatedResponse, ProcessingStatusResponse, VideoDetailWithEmbedding, SearchPageInfo, SearchResult, EmbeddingResponse, EmbeddingSearchResult, VideoData, ChaptersData, IndexingTask, EmbeddingCheckResult } from '@/types';

export const fetchIndex = async (indexId: string): Promise<IndexResponse> => {
  const response = await fetch(`/api/indexes/${indexId}`);
  return response.json();
};

// 비디오 목록 가져오기
export const fetchVideos = async (
  page: number = 1,
  indexId?: string,
  limit: number = 12 // Default page size
): Promise<PaginatedResponse> => {
  if (!indexId) {
    throw new Error('Index ID is required');
  }

  try {
    // Ensure limit doesn't exceed the maximum allowed by the API (50)
    const validatedLimit = Math.min(limit, 50);
    if (limit > 50) {
      console.warn(`Requested page limit ${limit} exceeds maximum allowed (50). Using limit=50 instead.`);
    }

    // Check if the index ID seems valid (basic check)
    if (indexId === '6836a0b9dad860d6bd2f61e7') {
      console.warn(`⚠️ Using potentially problematic index ID: ${indexId}`);
    }

    const response = await fetch(`/api/videos?page=${page}&index_id=${indexId}&limit=${validatedLimit}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HTTP error fetching videos! status: ${response.status}`, errorText);

      // If it's a 400 error, it might be due to an invalid index ID or limit
      if (response.status === 400) {
        console.error(`API error: ${errorText}. This could be due to invalid index ID (${indexId}) or limit parameter.`);

        // Return an empty response instead of throwing
        return {
          data: [],
          page_info: {
            page: page,
            total_page: 1,
            total_count: 0
          }
        };
      }

      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching videos:', error);

    // Return empty response instead of throwing to allow the app to continue
    return {
      data: [],
      page_info: {
        page: page,
        total_page: 1,
        total_count: 0
      }
    };
  }
};

// 비디오 상세 정보 타입 정의


// 비디오 상세 정보 타입 정의 - 임베딩 포함 버전


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


// 비디오 처리 상태 확인 함수
export const checkProcessingStatus = async (
  videoId: string,
  indexId: string
): Promise<ProcessingStatusResponse> => {
  try {
    const url = new URL('/api/vectors/check-status', window.location.origin);
    url.searchParams.append('videoId', videoId);
    url.searchParams.append('indexId', indexId);

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

    const response = await fetch(url.toString());

    if (!response.ok) {
      console.error(`Error checking vector: HTTP status ${response.status}`);
      return false;
    }

    const data = await response.json();
    return data.exists;
  } catch (error) {
    console.error('Error checking vector existence:', error);
    // In case of error, assume it doesn't exist and proceed with storing
    return false;
  }
};

export const getAndStoreEmbeddings = async (indexId: string, videoId: string) => {
  try {
    // First check if we already have embeddings stored for this video
    try {
      const existsResponse = await fetch(`/api/vectors/exists?video_id=${videoId}&index_id=${indexId}`);
      if (existsResponse.ok) {
        const existsData = await existsResponse.json();
        if (existsData.exists) {
          return { success: true, message: 'Embeddings already exist' };
        }
      }
    } catch (checkError) {
      console.warn(`⚠️ Error checking if embeddings exist, will proceed with generation:`, checkError);
    }

    // Add delay to ensure video data is ready at Twelve Labs
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Fetch video details with embedding
    const response = await fetch(`/api/videos/${videoId}?indexId=${indexId}&embed=true`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to fetch video details with embedding: ${errorText}`);

      // If we get a 404 or 400, the video might not be fully processed yet, wait longer
      if (response.status === 404 || response.status === 400) {
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Try again after waiting
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

    // Get proper filename and title from system_metadata
    let filename = '';
    let videoTitle = '';

    if (videoDetails.system_metadata) {
      if (videoDetails.system_metadata.filename) {
        filename = videoDetails.system_metadata.filename;
      }
      if (videoDetails.system_metadata.video_title) {
        videoTitle = videoDetails.system_metadata.video_title;
      }
    }

    // If filename is not found, use videoId as fallback
    if (!filename) {
      filename = `${videoId}.mp4`;
    }

    // If no video title, extract from filename (remove extension)
    if (!videoTitle && filename) {
      videoTitle = filename.split('.')[0];
    }

    // Test Pinecone connection before attempting to store
    try {
      const pineconeTestResponse = await fetch('/api/vectors/test-connection', {
        method: 'GET'
      });

      if (!pineconeTestResponse.ok) {
        console.error(`❌ Pinecone connection test failed. Status: ${pineconeTestResponse.status}`);
        return { success: false, message: 'Pinecone connection test failed' };
      }

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
    return { success: true, ...result };
  } catch (error) {
    console.error(`Error in processAndStoreEmbedding for video ${videoId}:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// custom metadata generation
export const generateMetadata = async (videoId: string): Promise<string> => {
  try {
    const response = await fetch(`/api/analyze?videoId=${videoId}`);

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

// parse hashtags and create metadata object
export const parseHashtags = (hashtagText: string): Record<string, string> => {

  // extract metadata from hashtag string
  const metadata: Record<string, string> = {
    source: '',
    sector: '',
    emotions: '',
    brands: '',
    locations: '',
    demographics_gender: '',
    demographics_age: ''
  };

  // handle new format (labeled format)
  // check the label and extract the metadata directly
  if (hashtagText.includes('Demographics Gender:') ||
      hashtagText.includes('Demographics Age:') ||
      hashtagText.includes('Topic Category:') ||
      hashtagText.includes('Emotions:') ||
      hashtagText.includes('Location:') ||
      hashtagText.includes('Brands:') ||
      hashtagText.includes('Gender:') ||
      hashtagText.includes('Age:') ||
      hashtagText.includes('Topic:')) {

    // split each line
    const lines = hashtagText.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // extract data according to each label (support both new and old labels)
      if (trimmedLine.startsWith('Demographics Gender:')) {
        metadata.demographics_gender = trimmedLine.substring('Demographics Gender:'.length).trim();
      }
      else if (trimmedLine.startsWith('Gender:')) {
        metadata.demographics_gender = trimmedLine.substring('Gender:'.length).trim();
      }
      else if (trimmedLine.startsWith('Demographics Age:')) {
        metadata.demographics_age = trimmedLine.substring('Demographics Age:'.length).trim();
      }
      else if (trimmedLine.startsWith('Age:')) {
        metadata.demographics_age = trimmedLine.substring('Age:'.length).trim();
      }
      else if (trimmedLine.startsWith('Topic Category:')) {
        metadata.sector = trimmedLine.substring('Topic Category:'.length).trim();
      }
      else if (trimmedLine.startsWith('Topic:')) {
        metadata.sector = trimmedLine.substring('Topic:'.length).trim();
      }
      else if (trimmedLine.startsWith('Emotions:')) {
        metadata.emotions = trimmedLine.substring('Emotions:'.length).trim();
      }
      else if (trimmedLine.startsWith('Location:')) {
        metadata.locations = trimmedLine.substring('Location:'.length).trim();
      }
      else if (trimmedLine.startsWith('Brands:')) {
        metadata.brands = trimmedLine.substring('Brands:'.length).trim();
      }
    }

    // for backward compatibility, set demographics field
    if (metadata.demographics_gender || metadata.demographics_age) {
      const demographics = [];
      if (metadata.demographics_gender) demographics.push(metadata.demographics_gender);
      if (metadata.demographics_age) demographics.push(metadata.demographics_age);
      metadata.demographics = demographics.join(', ');
    }

    return metadata;
  }

  // handle old hashtag format (backward compatibility)
  // try to extract category from each hashtag
  // replace newline characters with spaces for consistent splitting
  const cleanText = hashtagText.replace(/\n/g, ' ');
  const hashtags = cleanText.split(/\s+/).filter(tag => tag.startsWith('#'));

  // object to collect tags for each category
  const categoryTags: Record<string, string[]> = {
    demographics_gender: [],
    demographics_age: [],
    sector: [],
    emotions: [],
    locations: [],
    brands: []
  };

  // keywords for each category - match the values defined in route.ts
  // Demographics Gender: Male, Female
  const demographicsGenderKeywords = ['male', 'female', 'men', 'women'];

  // Demographics Age: 18-25, 25-34, 35-44, 45-54, 55+
  const demographicsAgeKeywords = ['18-25', '25-34', '35-44', '45-54', '55+'];

  // Sector: Beauty, Fashion, Tech, Travel, CPG, Food & Bev, Retail
  const sectorKeywords = ['beauty', 'fashion', 'tech', 'travel', 'cpg', 'food', 'bev', 'retail', 'food&bev'];

  // Emotion: happy/positive, exciting, relaxing, inspiring, serious, festive, calm
  const emotionKeywords = [
    'happy', 'positive', 'happypositive', 'happy/positive',
    'exciting', 'relaxing', 'inspiring', 'serious', 'festive', 'calm', 'determined'
  ];

  // specific location keywords - defined in route.ts as "any real-world location"
  const locationKeywords = [
    'seoul', 'dubai', 'doha', 'newyork', 'new york', 'paris', 'tokyo', 'london', 'berlin',
    'lasvegas', 'las vegas', 'france', 'korea', 'qatar', 'uae', 'usa', 'bocachica',
    'bocachicabeach', 'marathon'
  ];

  // specific brand keywords - defined in route.ts as "any mentioned brands in the input"
  const brandKeywords = [
    'fentybeauty', 'adidas', 'nike', 'spacex', 'apple', 'microsoft', 'google', 'amazon',
    'ferrari', 'heineken', 'redbullracing', 'redbull', 'sailgp', 'fifaworldcup', 'fifa',
    'tourdefrance', 'nttdata', 'oracle', 'maybelline'
  ];

  // analyze which category the generated hashtags belong to

  for (const tag of hashtags) {
    const cleanTag = tag.slice(1).toLowerCase(); // remove # and convert to lowercase

    // check demographics gender
    if (demographicsGenderKeywords.includes(cleanTag)) {
      categoryTags.demographics_gender.push(cleanTag);
      continue;
    }

    // check demographics age
    if (demographicsAgeKeywords.includes(cleanTag)) {
      categoryTags.demographics_age.push(cleanTag);
      continue;
    }

    // check sector
    if (sectorKeywords.includes(cleanTag)) {
      categoryTags.sector.push(cleanTag);
      continue;
    }

    // check emotion
    if (emotionKeywords.includes(cleanTag)) {
      categoryTags.emotions.push(cleanTag);
      continue;
    }

    // check location
    if (locationKeywords.includes(cleanTag)) {
      categoryTags.locations.push(cleanTag);
      continue;
    }

    // check brand
    if (brandKeywords.includes(cleanTag)) {
      categoryTags.brands.push(cleanTag);
      continue;
    }
  }

  // handle unclassified tags
  const unclassifiedTags = hashtags.filter(tag => {
    const cleanTag = tag.slice(1).toLowerCase();
    return !demographicsGenderKeywords.includes(cleanTag) &&
           !demographicsAgeKeywords.includes(cleanTag) &&
           !sectorKeywords.includes(cleanTag) &&
           !emotionKeywords.includes(cleanTag) &&
           !locationKeywords.includes(cleanTag) &&
           !brandKeywords.includes(cleanTag);
  });

  // if there are unclassified tags and locations is empty, consider the first tag as locations
  if (unclassifiedTags.length > 0 && categoryTags.locations.length === 0) {
    const locationTag = unclassifiedTags[0].slice(1).toLowerCase();
    categoryTags.locations.push(locationTag);
    unclassifiedTags.shift();
  }

  // if there are unclassified tags and brands is empty, consider the first tag as brands
  if (unclassifiedTags.length > 0 && categoryTags.brands.length === 0) {
    const brandTag = unclassifiedTags[0].slice(1).toLowerCase();
    categoryTags.brands.push(brandTag);
  }

  // convert each category tag to a comma-separated string
  for (const category in categoryTags) {
    if (categoryTags[category as keyof typeof categoryTags].length > 0) {
      metadata[category] = categoryTags[category as keyof typeof categoryTags].join(', ');
    }
  }

  // for backward compatibility, set demographics field
  if (metadata.demographics_gender || metadata.demographics_age) {
    const demographics = [];
    if (metadata.demographics_gender) demographics.push(metadata.demographics_gender);
    if (metadata.demographics_age) demographics.push(metadata.demographics_age);
    metadata.demographics = demographics.join(', ');
  }
  return metadata;
};

// update video metadata
export const updateVideoMetadata = async (
  videoId: string,
  indexId: string,
  metadata: Record<string, string>
): Promise<boolean> => {
  try {
    // map the field names used in the UI to the field names used in the API
    const apiMetadata: Record<string, string> = {};

    // fields that are directly mapped
    if ('source' in metadata) apiMetadata.source = metadata.source;
    if ('emotions' in metadata) apiMetadata.emotions = metadata.emotions;
    if ('brands' in metadata) apiMetadata.brands = metadata.brands;
    if ('locations' in metadata) apiMetadata.locations = metadata.locations;

    // fields that need special mapping
    // topic_category is actually stored in the sector field
    if ('topic_category' in metadata) apiMetadata.sector = metadata.topic_category;
    if ('sector' in metadata) apiMetadata.sector = metadata.sector;

    // demographics related fields
    const demoValues = [];
    if ('demographics_gender' in metadata && metadata.demographics_gender) {
      demoValues.push(metadata.demographics_gender);
    }
    if ('demographics_age' in metadata && metadata.demographics_age) {
      demoValues.push(metadata.demographics_age);
    }

    // for backward compatibility, set demographics field
    if (demoValues.length === 0) {
      if ('demographics' in metadata && metadata.demographics) {
        apiMetadata.demographics = metadata.demographics;
      } else if ('demo_age' in metadata || 'demo_gender' in metadata) {
        const demographics = [];
        if (metadata.demo_age) demographics.push(metadata.demo_age);
        if (metadata.demo_gender) demographics.push(metadata.demo_gender);
        apiMetadata.demographics = demographics.join(', ');
      }
    } else {
      apiMetadata.demographics = demoValues.join(', ');
    }

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
      // if an error occurs, use the response text as is
      console.error('Error updating metadata:', responseText);
      throw new Error(`HTTP error! status: ${response.status}, message: ${responseText}`);
    }

    // if the response is successful, try to parse it as JSON, otherwise return true
    let success = true;
    if (responseText && responseText.trim() !== '') {
      try {
        const result = JSON.parse(responseText);
        success = result.success !== false; // if the result is not explicitly false, consider it as true
      } catch {
        // if parsing fails, use the default value
      }
    }

    return success;
  } catch (error) {
    console.error('Error updating video metadata:', error);
    throw error;
  }
};

// convert video metadata to tags
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

  // Demographics Gender -> Target Demo: Gender
  if (metadata.demographics_gender && typeof metadata.demographics_gender === 'string') {
    metadata.demographics_gender.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag !== '')
      .forEach(tag => {
        tags.push({ category: 'Target Demo: Gender', value: normalizeTagValue(tag) });
      });
  }

  // Demographics Age -> Target Demo: Age
  if (metadata.demographics_age && typeof metadata.demographics_age === 'string') {
    metadata.demographics_age.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag !== '')
      .forEach(tag => {
        tags.push({ category: 'Target Demo: Age', value: normalizeTagValue(tag) });
      });
  }

  // old demographics field - backward compatibility
  if (!metadata.demographics_gender && !metadata.demographics_age &&
      metadata.demographics && typeof metadata.demographics === 'string') {
    // add each value as a separate tag
    metadata.demographics.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag !== '')
      .forEach(tag => {
        // check if the tag is related to gender
        if (tag.toLowerCase().includes('male') ||
            tag.toLowerCase().includes('women') ||
            tag.toLowerCase().includes('men')) {
          tags.push({ category: 'Target Demo: Gender', value: normalizeTagValue(tag) });
        }
        // check if the tag is related to age
        else if (tag.toLowerCase().includes('age') ||
                tag.toLowerCase().includes('old') ||
                /\d+-\d+/.test(tag)) {
          tags.push({ category: 'Target Demo: Age', value: normalizeTagValue(tag) });
        }
        // otherwise, consider it as general demographics
        else {
          tags.push({ category: 'Demographics', value: normalizeTagValue(tag) });
        }
      });
  }

  // Sector -> Topic Category
  if (metadata.sector && typeof metadata.sector === 'string') {
    // add each value as a separate tag
    metadata.sector.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag !== '')
      .forEach(tag => {
        tags.push({ category: 'Topic Category', value: normalizeTagValue(tag) });
      });
  }

  // Emotions
  if (metadata.emotions && typeof metadata.emotions === 'string') {
    // add each value as a separate tag
    metadata.emotions.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag !== '')
      .forEach(tag => {
        tags.push({ category: 'Emotions', value: normalizeTagValue(tag) });
      });
  }

  // Brands
  if (metadata.brands && typeof metadata.brands === 'string') {
    // add each value as a separate tag
    metadata.brands.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag !== '')
      .forEach(tag => {
        tags.push({ category: 'Brands', value: normalizeTagValue(tag) });
      });
  }

  // Locations
  if (metadata.locations && typeof metadata.locations === 'string') {
    // add each value as a separate tag
    metadata.locations.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag !== '')
      .forEach(tag => {
        tags.push({ category: 'Location', value: normalizeTagValue(tag) });
      });
  }

  return tags;
};

// perform text search
export const searchVideos = async (
  searchQuery: string,
  indexId?: string
): Promise<{ pageInfo: SearchPageInfo; textSearchResults: SearchResult[] }> => {
  try {
    if (!searchQuery || searchQuery.trim() === '') {
      return {
        pageInfo: { page: 1, total_page: 1, total_videos: 0, total_results: 0 },
        textSearchResults: []
      };
    }

    // Use provided indexId or get from environment - renamed variable to avoid confusion
    const searchIndexId = indexId || process.env.NEXT_PUBLIC_CONTENT_INDEX_ID;

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
    return data.success === true;
  } catch (error) {
    console.error('Error resetting vectors:', error);
    return false;
  }
};

// embedding search - search for similar videos using text (tags)
export const textToVideoEmbeddingSearch = async (
  videoId: string,
  adsIndexId: string,
  contentIndexId: string
): Promise<EmbeddingSearchResult[]> => {
  try {

    // use the tag information (sector, emotions) of the selected ad video as the search term
    const videoDetails = await fetchVideoDetails(videoId, adsIndexId);
    const sector = videoDetails.user_metadata?.sector || '';
    const emotions = videoDetails.user_metadata?.emotions || '';
    const videoTitle = videoDetails.system_metadata?.video_title ||
                     videoDetails.system_metadata?.filename ||
                     `Video ${videoId}`;

    // map to store the results (use videoId as the key)
    const resultMap = new Map();

    // 1. tag-based search (sector + emotions)
    const tagSearchTerm = `${sector} ${emotions}`.trim();
    if (tagSearchTerm) {

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

          // store the tag-based results in the Map
          tagResults.forEach(result => {
            const resultVideoId = result.metadata?.tl_video_id;
            if (resultVideoId) {
              // add searchMethod property to each result
              result.searchMethod = 'tag';
              resultMap.set(resultVideoId, result);
            }
          });
        }
      } catch (error) {
        console.error("Error in tag-based search:", error);
      }
    }

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

        // add title-based results to the Map (compare scores if already exists)
        titleResults.forEach(result => {
          const resultVideoId = result.metadata?.tl_video_id;
          if (resultVideoId) {
            result.searchMethod = 'title';

            // if the result is already found in the tag-based search, compare scores
            if (resultMap.has(resultVideoId)) {
              const existingResult = resultMap.get(resultVideoId);
              // keep the result with the higher score
              if (result.score > existingResult.score) {
                resultMap.set(resultVideoId, result);
              }
            } else {
              // add new result
              resultMap.set(resultVideoId, result);
            }
          }
        });
      }
    } catch (error) {
      console.error("Error in title-based search:", error);
    }

    // convert all values in the Map to an array
    const finalResults = Array.from(resultMap.values());

    // sort by score
    finalResults.sort((a, b) => b.score - a.score);


    return finalResults;
  } catch (error) {
    console.error('Error in text to video embedding search:', error);
    throw error;
  }
};

// video-based embedding search - find similar content to the selected ad
export const videoToVideoEmbeddingSearch = async (
  videoId: string,
  adsIndexId: string,
  contentIndexId: string
): Promise<EmbeddingSearchResult[]> => {
  try {
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

    return results;
  } catch (error) {
    console.error('Error in video to video embedding search:', error);
    throw error;
  }
};

// get chapters of a video
export const generateChapters = async (videoId: string): Promise<ChaptersData> => {
  try {
    const response = await fetch(`/api/generateChapters?videoId=${videoId}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // validate the chapters data
    if (!data || !data.chapters || !Array.isArray(data.chapters)) {
      throw new Error('Invalid chapters data received');
    }

    return data;
  } catch (error) {
    console.error('Error generating chapters:', error);
    throw error;
  }
};


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

// Check and ensure embeddings for both ad and content videos
export const checkAndEnsureEmbeddings = async (
  adVideoId: string,
  adIndexId: string,
  contentIndexId: string,
  contentVideos?: VideoData[],
  processContentVideos: boolean = true
): Promise<EmbeddingCheckResult> => {
  try {
    // Start with initial result state
    const result: EmbeddingCheckResult = {
      success: false,
      message: "Processing embeddings...",
      adEmbeddingExists: false,
      contentEmbeddingsExist: false,
      processedCount: 0,
      totalCount: (processContentVideos && contentVideos) ? contentVideos.length + 1 : 1 // +1 for the ad video
    };

    // Step 1: Check if ad video embedding exists
    const adEmbeddingExists = await checkVectorExists(adVideoId, adIndexId);
    result.adEmbeddingExists = adEmbeddingExists;

    // Step 2: If ad embedding doesn't exist, generate and store it
    if (!adEmbeddingExists) {
      const adEmbeddingResult = await getAndStoreEmbeddings(adIndexId, adVideoId);

      if (!adEmbeddingResult.success) {
        console.error(`❌ Failed to generate ad video embedding: ${adEmbeddingResult.message}`);
        return {
          ...result,
          success: false,
          message: `Failed to generate ad video embedding: ${adEmbeddingResult.message}`
        };
      }

      result.adEmbeddingExists = true;
    }

    result.processedCount += 1;

    // Step 3: If content videos are provided AND we should process them, check and generate their embeddings if needed
    if (processContentVideos && contentVideos && contentVideos.length > 0) {

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

      // Generate embeddings for videos that need them
      if (missingEmbeddings.length > 0) {
        for (const videoId of missingEmbeddings) {
          const embedResult = await getAndStoreEmbeddings(contentIndexId, videoId);

          if (embedResult.success) {
          } else {
            console.error(`❌ Failed to generate embedding for content video ${videoId}: ${embedResult.message}`);
          }

          result.processedCount += 1;
        }
      }

      // Update result with content embedding status
      result.contentEmbeddingsExist = missingEmbeddings.length === 0 || result.processedCount >= result.totalCount;
    } else {
      // If we're not processing content videos, mark as complete
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