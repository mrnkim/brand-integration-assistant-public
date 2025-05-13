import { NextResponse } from 'next/server';
import { getPineconeIndex } from '@/utils/pinecone';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get('video_id');
    const indexId = searchParams.get('index_id');

    if (!videoId) {
      return NextResponse.json(
        { error: 'video_id parameter is required' },
        { status: 400 }
      );
    }

    console.log(`Checking if embeddings exist for video ${videoId} in Pinecone`);

    const pineconeIndex = getPineconeIndex();

    // Build the filter for the query
    const filter: Record<string, string> = { tl_video_id: videoId };
    if (indexId) filter.tl_index_id = indexId;

    try {
      // Query Pinecone using vector_id to search by metadata
      const queryResponse = await pineconeIndex.query({
        // For query by metadata, we need to provide a dummy vector
        vector: Array(1536).fill(0),  // Pinecone typically uses 1536-dimensional vectors
        filter,
        topK: 1,
        includeMetadata: true
      });

      console.log(`Found ${queryResponse.matches?.length || 0} matches for video ${videoId}`);

      // If there are any matches, the embedding exists
      const exists = queryResponse.matches && queryResponse.matches.length > 0;

      return NextResponse.json({ exists });
    } catch (error) {
      console.error('Error querying Pinecone:', error);
      return NextResponse.json({
        error: 'Failed to query Pinecone',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error checking if embedding exists:', error);
    return NextResponse.json(
      { error: 'Failed to check if embedding exists', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}