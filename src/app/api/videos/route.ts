import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

// Twelve Labs API 응답 타입 정의
type TwelveLabsVideoItem = {
  _id: string;
  created_at: string;
  system_metadata?: {
    filename?: string;
    duration?: number;
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
};

type TwelveLabsApiResponse = {
  data: TwelveLabsVideoItem[];
  page_info: {
    page: number;
    limit_per_page: number;
    total_page: number;
    total_results: number;
    total_duration: number;
  };
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = searchParams.get('page') || '1';
    const indexId = searchParams.get('index_id');
    const pageLimit = searchParams.get('page_limit') || '10';

    if (!indexId) {
      return NextResponse.json({ error: 'Index ID is required' }, { status: 400 });
    }

    if (!API_KEY || !TWELVELABS_API_BASE_URL) {
      console.error('Missing API key or base URL in environment variables');
      // 환경 변수가 설정되지 않은 경우 더미 데이터 반환
      return NextResponse.json(getDummyData(indexId, page));
    }

    const url = `${TWELVELABS_API_BASE_URL}/indexes/${indexId}/videos?page=${page}&page_limit=${pageLimit}`;

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

    const data = await response.json() as TwelveLabsApiResponse;

    // API 응답 그대로 반환 (이미 TwelveLabsApiResponse 타입에 맞게 수정함)
    const formattedData = {
      data: data.data,
      page_info: {
        page: parseInt(page),
        total_page: data.page_info.total_page,
        total_count: data.page_info.total_results
      }
    };

    return NextResponse.json(formattedData);
  } catch (error) {
    console.error('Error in videos API:', error);

    // 에러가 발생한 경우 더미 데이터로 대체하여 프론트엔드 개발 진행 가능하도록 함
    if (request.nextUrl.searchParams.get('index_id')) {
      return NextResponse.json(
        getDummyData(
          request.nextUrl.searchParams.get('index_id') || '',
          request.nextUrl.searchParams.get('page') || '1'
        )
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch videos' },
      { status: 500 }
    );
  }
}

// 더미 데이터 생성 함수
function getDummyData(indexId: string, page: string) {
  return {
    data: [
      {
        _id: 'video1',
        index_id: indexId,
        created_at: new Date().toISOString(),
        system_metadata: {
          video_title: 'Skanska NYC Building Construction',
          filename: 'skanska_nyc.mp4',
          duration: 120,
          fps: 30,
          height: 720,
          width: 1280,
          size: 1024000,
        },
        hls: {
          video_url: 'https://www.youtube.com/watch?v=example1',
          thumbnail_urls: ['https://placehold.co/600x400'],
          status: 'COMPLETE',
          updated_at: new Date().toISOString()
        }
      },
      {
        _id: 'video2',
        index_id: indexId,
        created_at: new Date().toISOString(),
        system_metadata: {
          video_title: 'Skanska Urban Planning Initiative',
          filename: 'skanska_urban.mp4',
          duration: 180,
          fps: 30,
          height: 720,
          width: 1280,
          size: 1024000,
        },
        hls: {
          video_url: 'https://www.youtube.com/watch?v=example2',
          thumbnail_urls: ['https://placehold.co/600x400'],
          status: 'COMPLETE',
          updated_at: new Date().toISOString()
        }
      },
      {
        _id: 'video3',
        index_id: indexId,
        created_at: new Date().toISOString(),
        system_metadata: {
          video_title: 'Skanska Real Estate Showcase',
          filename: 'skanska_realestate.mp4',
          duration: 240,
          fps: 30,
          height: 720,
          width: 1280,
          size: 1024000,
        },
        hls: {
          video_url: 'https://www.youtube.com/watch?v=example3',
          thumbnail_urls: ['https://placehold.co/600x400'],
          status: 'COMPLETE',
          updated_at: new Date().toISOString()
        }
      }
    ],
    page_info: {
      page: parseInt(page),
      total_page: 1,
      total_count: 3
    }
  };
}