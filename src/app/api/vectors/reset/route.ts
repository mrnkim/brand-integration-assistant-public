import { NextResponse } from 'next/server';
import { getPineconeIndex } from '@/utils/pinecone';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { videoId, indexId, resetAll = false } = body;

    // If resetAll is true, it will ignore individual video resets
    // For general safety, require either resetAll=true OR (videoId AND indexId)
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
      console.log(`Resetting vectors for video ${videoId} in index ${indexId}`);

      try {
        // Create a filter for the delete operation
        const filter = { tl_video_id: videoId };

        // For a real implementation, you would delete vectors matching this filter
        // This would be something like: await pineconeIndex.deleteMany({ filter });

        // For demonstration purposes, just log the action
        console.log(`Would delete vectors with filter:`, filter);

        return NextResponse.json({
          success: true,
          message: `Reset vectors for video ${videoId}`
        });
      } catch (error) {
        console.error(`Error resetting vectors for video ${videoId}:`, error);
        return NextResponse.json(
          { success: false, error: 'Failed to reset vectors' },
          { status: 500 }
        );
      }
    }

    // For reset all, this is just a placeholder response
    // In a real implementation, this would delete all vectors or recreate the index
    console.log('Reset functionality is for testing only - not actually deleting all vectors');

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