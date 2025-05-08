import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ videoId: string }> | { videoId: string } }
) {
  try {
    // Await params to resolve the promise (for NextJS 14+)
    const params = await context.params;
    const videoId = params.videoId;
    const searchParams = request.nextUrl.searchParams;
    const indexId = searchParams.get('index_id');

    if (!indexId) {
      return NextResponse.json({ error: 'Index ID is required' }, { status: 400 });
    }

    if (!API_KEY || !TWELVELABS_API_BASE_URL) {
      console.error('Missing API key or base URL in environment variables');
      // 환경 변수가 설정되지 않은 경우 더미 데이터 반환
      return NextResponse.json(getDummyVideoData(videoId, indexId));
    }

    const url = `${TWELVELABS_API_BASE_URL}/indexes/${indexId}/videos/${videoId}`;

    const options = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
    };

    const response = await fetch(url, options);

    if (!response.ok) {
      console.error(`API error: ${response.status} - ${await response.text()}`);
      throw new Error('Network response was not ok');
    }

    const data = await response.json();
    console.log("🚀 > data=", data)

    // API 응답을 그대로 반환 (이미 VideoData 타입에 맞게 수정함)
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in video details API:', error);

    // 에러가 발생한 경우 더미 데이터로 대체
    try {
      const params = await context.params;
      const videoId = params.videoId;
      const indexId = request.nextUrl.searchParams.get('index_id') || '';

      if (videoId && indexId) {
        return NextResponse.json(getDummyVideoData(videoId, indexId));
      }
    } catch (e) {
      console.error('Error accessing params in error handler:', e);
    }

    return NextResponse.json(
      { error: 'Failed to fetch video details' },
      { status: 500 }
    );
  }
}

// 더미 비디오 상세 정보 생성 함수
function getDummyVideoData(videoId: string, indexId: string) {
  return {
    _id: videoId,
    index_id: indexId,
    system_metadata: {
      video_title: videoId === 'video1'
        ? 'Skanska NYC Building Construction'
        : videoId === 'video2'
        ? 'Skanska Urban Planning Initiative'
        : 'Skanska Real Estate Showcase',
      filename: `${videoId}.mp4`,
      duration: videoId === 'video1' ? 120 : videoId === 'video2' ? 180 : 240,
      fps: 30,
      height: 720,
      width: 1280,
      size: 1024000,
    },
    hls: {
      video_url: `https://example.com/hls/${videoId}.m3u8`,
      thumbnail_urls: [`https://placehold.co/600x400?text=${videoId}`],
      status: 'COMPLETE',
      updated_at: new Date().toISOString()
    }
  };
}