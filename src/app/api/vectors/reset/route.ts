import { NextResponse } from 'next/server';
import { getPineconeIndex } from '@/utils/pinecone';

// API endpoint to reset/clear vectors for a specific video or all vectors
// This is for testing purposes only
export async function POST(req: Request) {
  // Only allow in development mode
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'This endpoint is only available in development mode' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { videoId, indexId, resetAll = false } = body;

    console.log(`Resetting vectors: videoId=${videoId}, indexId=${indexId}, resetAll=${resetAll}`);

    // Get Pinecone index
    const pineconeIndex = getPineconeIndex();

    // Ensure we have required parameters for targeted delete
    if (!videoId && !indexId && !resetAll) {
      return NextResponse.json(
        { error: 'videoId or indexId is required for targeted reset, or use resetAll=true' },
        { status: 400 }
      );
    }

    // Create a filter for the delete operation if not deleting all
    let filter = {};
    if (!resetAll) {
      filter = {};
      if (videoId) filter = { ...filter, tl_video_id: videoId };
      if (indexId) filter = { ...filter, tl_index_id: indexId };
    }

    // Delete vectors based on filter or delete all
    try {
      if (resetAll) {
        // In real Pinecone, there's no direct "delete all" method
        // We'll use a filter that matches everything (empty filter)
        await pineconeIndex.deleteAll();
        return NextResponse.json({
          success: true,
          message: 'All vectors have been deleted'
        });
      } else {
        // Delete vectors matching the filter
        await pineconeIndex.deleteMany({ filter });
        return NextResponse.json({
          success: true,
          message: `Vectors deleted for ${videoId ? `video ${videoId}` : ''} ${indexId ? `in index ${indexId}` : ''}`
        });
      }
    } catch (error) {
      console.error('Error when calling Pinecone delete API:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to delete vectors',
        error: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error resetting vectors:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}