import { NextResponse } from 'next/server';
import { getPineconeIndex } from '@/utils/pinecone';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get('videoId');
    const indexId = searchParams.get('indexId');

    if (!videoId || !indexId) {
      console.error('API: check-status - Missing required parameters');
      return NextResponse.json(
        { processed: false, error: 'videoId and indexId are required parameters' },
        { status: 400 }
      );
    }

    console.log(`API: Checking if video ${videoId} is processed in index ${indexId}`);

    // Determine category based on indexId
    const isAdsIndex = indexId.toLowerCase().includes('ad');
    const category = isAdsIndex ? 'ad' : 'content';
    console.log(`API: check-status - Using category "${category}" for index ${indexId}`);

    // Get Pinecone index
    const pineconeIndex = getPineconeIndex();

    if (!pineconeIndex) {
      console.error('API: check-status - Failed to get Pinecone index');
      return NextResponse.json(
        { processed: false, error: 'Failed to get Pinecone index', category },
        { status: 500 }
      );
    }

    try {
      // Query for vectors with this video ID
      console.log(`API: check-status - Querying Pinecone for video ${videoId}`);

      // Use a zero vector with correct dimensions (1024) - only using filter to find vectors
      const queryResponse = await pineconeIndex.query({
        vector: Array(1024).fill(0), // Zero vector with 1024 dimensions to match embedding size
        filter: { tl_video_id: videoId },
        topK: 1,
        includeMetadata: true
      });

      console.log(`API: check-status - Query response for ${videoId}:`,
        JSON.stringify({
          matches_count: queryResponse.matches?.length || 0,
          has_matches: Boolean(queryResponse.matches?.length),
          first_match_id: queryResponse.matches?.[0]?.id,
          first_match_metadata: queryResponse.matches?.[0]?.metadata
        }, null, 2)
      );

      // 명확하게 처리 상태 로깅
      const processed = Boolean(queryResponse.matches?.length);
      console.log(`API: check-status - Video ${videoId} processed status: ${processed}`);

      return NextResponse.json({
        processed,
        source: 'pinecone',
        category,
        videoId,
        indexId,
        matches_count: queryResponse.matches?.length || 0,
        debug_info: {
          query_time: new Date().toISOString(),
          has_matches: Boolean(queryResponse.matches?.length),
          first_match_id: queryResponse.matches?.[0]?.id
        }
      });
    } catch (error) {
      console.error(`API: check-status - Error checking if video ${videoId} is processed:`, error);
      return NextResponse.json(
        {
          processed: false,
          error: 'Failed to check processing status',
          category,
          error_details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('API: check-status - Error checking video processing status:', error);
    return NextResponse.json(
      { processed: false, error: 'Server error checking processing status' },
      { status: 500 }
    );
  }
}