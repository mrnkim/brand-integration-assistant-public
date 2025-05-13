import { NextRequest, NextResponse } from 'next/server';
import { storeEmbedding } from '@/lib/snowflake';

// In a real application, we would have a proper Snowflake connection
// For now, we'll simulate saving to Snowflake with a mock response
export async function POST(request: NextRequest) {
  console.log('### DEBUG: /api/vectors/snowflake POST API called');
  try {
    const body = await request.json();
    const { index_id, video_id, embedding, video_title } = body;
    console.log(`### DEBUG: Storing embedding for video_id=${video_id}, index_id=${index_id}`);

    if (!index_id || !video_id || !embedding) {
      console.error('### DEBUG ERROR: Missing required parameters in request body');
      return NextResponse.json(
        { error: 'Index ID, Video ID, and embedding are required' },
        { status: 400 }
      );
    }

    try {
      // Store embedding in Snowflake using our utility function
      console.log(`### DEBUG: Calling Snowflake util to store embedding`);

      // Add video_title to embedding object
      const embeddingWithTitle = {
        ...embedding,
        video_title: video_title || ''
      };

      const success = await storeEmbedding(video_id, index_id, embeddingWithTitle);
      console.log(`### DEBUG: Snowflake store result: success=${success}`);

      return NextResponse.json({
        success,
        message: 'Embeddings successfully stored in Snowflake',
        data: {
          video_id,
          index_id,
          stored_at: new Date().toISOString()
        }
      });
    } catch (dbError) {
      console.error('### DEBUG ERROR: Snowflake connection error:', dbError);

      // Fallback for development
      if (process.env.NODE_ENV === 'development') {
        console.warn('### DEBUG WARN: Using fallback success response for development');

        return NextResponse.json({
          success: true,
          message: 'Embeddings mock-stored in Snowflake (fallback response)',
          data: {
            video_id,
            index_id,
            stored_at: new Date().toISOString(),
            _fallback: true
          }
        });
      }

      throw dbError;
    }
  } catch (error) {
    console.error('### DEBUG ERROR: Error storing embeddings in Snowflake:', error);
    return NextResponse.json(
      { error: 'Failed to store embeddings in Snowflake' },
      { status: 500 }
    );
  }
}