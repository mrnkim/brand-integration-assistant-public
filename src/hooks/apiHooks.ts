import { PaginatedResponse, VideoDetails } from '@/types';

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

// 비디오 상세 정보 가져오기
export const fetchVideoDetails = async (
  videoId: string,
  indexId: string
): Promise<VideoDetails> => {
  try {
    const response = await fetch(`/api/videos/${videoId}?index_id=${indexId}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // API 응답을 VideoDetails 형식으로 변환
    return {
      _id: data._id,
      hls: {
        video_url: data.hls?.video_url,
        thumbnail_urls: data.hls?.thumbnail_urls || ['/videoFallback.jpg']
      },
      system_metadata: {
        filename: data.system_metadata?.filename,
        video_title: data.system_metadata?.video_title,
        duration: data.system_metadata?.duration || 0,
        fps: data.system_metadata?.fps,
        height: data.system_metadata?.height,
        width: data.system_metadata?.width
      }
    };
  } catch (error) {
    console.error('Error fetching video details:', error);
    throw error;
  }
};

// 벡터 인덱스 존재 여부 확인
export const checkVectorExists = async (videoId: string): Promise<boolean> => {
  try {
    const response = await fetch(`/api/vectors/exists?video_id=${videoId}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.exists;
  } catch (error) {
    console.error('Error checking vector existence:', error);
    throw error;
  }
};

// 임베딩 가져오기 및 저장
export const getAndStoreEmbeddings = async (
  indexId: string,
  videoId: string
): Promise<void> => {
  try {
    const response = await fetch('/api/vectors/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ index_id: indexId, video_id: videoId }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error generating and storing embeddings:', error);
    throw error;
  }
};