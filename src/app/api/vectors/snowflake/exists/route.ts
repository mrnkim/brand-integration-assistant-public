import { NextRequest, NextResponse } from 'next/server';
import { checkEmbeddingExists } from '@/lib/snowflake';

export async function GET(request: NextRequest) {
  console.log('### DEBUG: /api/vectors/snowflake/exists API called');
  try {
    const searchParams = request.nextUrl.searchParams;
    const videoId = searchParams.get('video_id');
    const indexId = searchParams.get('index_id');
    console.log(`### DEBUG: Checking embedding existence for video_id=${videoId}, index_id=${indexId}`);

    if (!videoId || !indexId) {
      console.error('### DEBUG ERROR: Missing required parameters');
      return NextResponse.json(
        { error: 'Video ID and Index ID are required' },
        { status: 400 }
      );
    }

    try {
      // Check if embedding exists in Snowflake using our utility function
      console.log(`### DEBUG: Calling Snowflake util to check if embedding exists`);
      const exists = await checkEmbeddingExists(videoId, indexId);
      console.log(`### DEBUG: Snowflake check result: embedding exists=${exists}`);

      return NextResponse.json({
        exists,
        video_id: videoId,
        index_id: indexId
      });
    } catch (dbError) {
      console.error('### DEBUG ERROR: Snowflake connection error:', dbError);

      // Fallback to random response if there's a database error
      // This helps development continue if Snowflake isn't configured
      if (process.env.NODE_ENV === 'development') {
        console.warn('### DEBUG WARN: Using fallback random response for development');
        const exists = Math.random() > 0.5;

        return NextResponse.json({
          exists,
          video_id: videoId,
          index_id: indexId,
          _fallback: true
        });
      }

      throw dbError;
    }
  } catch (error) {
    console.error('### DEBUG ERROR: Error checking embedding existence in Snowflake:', error);
    return NextResponse.json(
      { error: 'Failed to check embedding existence in Snowflake' },
      { status: 500 }
    );
  }
}