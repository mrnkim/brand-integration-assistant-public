import { NextResponse } from 'next/server';
import { getPineconeIndex } from '@/utils/pinecone';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { videoId, indexId, resetAll = false } = body;

    // If resetAll is true, it will ignore individual video resets
    if (!resetAll && (!videoId || !indexId)) {
      return NextResponse.json(
        { success: false, error: 'Either resetAll=true OR both videoId and indexId are required' },
        { status: 400 }
      );
    }

    // Get Pinecone index
    const pineconeIndex = getPineconeIndex();
    if (!pineconeIndex) {
      return NextResponse.json(
        { success: false, error: 'Failed to initialize Pinecone index' },
        { status: 500 }
      );
    }

    // If reset specific video
    if (!resetAll && videoId && indexId) {

      try {
        // Create a filter for the delete operation
        const filter = { tl_video_id: videoId };

        // Actually delete vectors matching this filter
        const deleteResult = await pineconeIndex.deleteMany({ filter });

        return NextResponse.json({
          success: true,
          message: `Reset vectors for video ${videoId}`,
          result: deleteResult
        });
      } catch (error) {
        console.error(`Error resetting vectors for video ${videoId}:`, error);
        return NextResponse.json(
          { success: false, error: 'Failed to reset vectors' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Reset functionality acknowledged. Check server logs for details.',
      warning: 'This is a test environment - vectors not physically deleted from Pinecone'
    });

  } catch (error) {
    console.error('Error processing reset request:', error);
    return NextResponse.json(
      { success: false, error: 'Server error processing reset request' },
      { status: 500 }
    );
  }
}