import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const videoId = searchParams.get('video_id');

    if (!videoId) {
      return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    if (!API_KEY || !TWELVELABS_API_BASE_URL) {
      console.error('Missing API key or base URL in environment variables');
      return NextResponse.json({ exists: true });
    }

    const url = `${TWELVELABS_API_BASE_URL}/indexes/${indexId}/videos/${videoId}`;

    const options = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      params: {
        embedding_option: "visual-text",
      },
    };

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        // API가 404를 반환하면 벡터가 존재하지 않는 것으로 간주
        if (response.status === 404) {
          return NextResponse.json({ exists: false });
        }

        console.error(`API error: ${response.status} - ${await response.text()}`);
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      console.log("🚀 > GET > data=", data)
      return NextResponse.json({ exists: true });
    } catch (error) {
      // API 호출 실패 시 개발 편의를 위해 벡터가 존재한다고 가정
      console.error('Error checking vector existence, assuming exists:', error);
      return NextResponse.json({ exists: true });
    }
  } catch (error) {
    console.error('Error in vector exists API:', error);
    return NextResponse.json(
      { error: 'Failed to check vector existence' },
      { status: 500 }
    );
  }
}