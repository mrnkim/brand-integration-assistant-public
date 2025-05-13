import { NextResponse } from 'next/server';
import { getPineconeIndex } from '@/utils/pinecone';

// Define a type for the embedding segment structure
interface EmbeddingSegment {
  embedding_option: string;
  embedding_scope: string;
  start_offset_sec: number;
  end_offset_sec: number;
  float: number[];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { videoId, videoName, embedding, indexId } = body;

    if (!videoId || !embedding || !indexId) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log(`Storing embedding for video ${videoId} in Pinecone`);
    console.log(`Embedding structure: model_name=${embedding.model_name}, segments count=${embedding.video_embedding.segments.length}`);

    // Log a sample of the first segment's data
    if (embedding.video_embedding.segments.length > 0) {
      const firstSegment = embedding.video_embedding.segments[0];
      console.log(`First segment: start=${firstSegment.start_offset_sec}, end=${firstSegment.end_offset_sec}, embedding_option=${firstSegment.embedding_option}, embedding_scope=${firstSegment.embedding_scope}, float length=${firstSegment.float.length}`);
      console.log(`First few float values: ${firstSegment.float.slice(0, 5).join(', ')}`);
    }

    // Get Pinecone instance
    console.log('Getting Pinecone index...');
    const pineconeIndex = getPineconeIndex();
    console.log('Successfully got Pinecone index');

    // Determine category based on indexId
    const adsIndexId = process.env.NEXT_PUBLIC_ADS_INDEX_ID;
    const contentIndexId = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID;

    let category = 'unknown';
    if (indexId === adsIndexId) {
      category = 'ad';
    } else if (indexId === contentIndexId) {
      category = 'content';
    }

    console.log(`Video category determined as: ${category}`);
    console.log(`Processing ${embedding.video_embedding.segments.length} segments...`);

    // Process each segment and store in Pinecone
    const upsertPromises = embedding.video_embedding.segments.map(async (segment: EmbeddingSegment, segmentIndex: number) => {
      // Create a unique ID for each segment
      const recordId = `${videoName.replace(/\s+/g, '_')}_${segmentIndex}`;

      // Prepare the vector for upsert
      const upsertRequest = {
        id: recordId,
        values: segment.float,
        metadata: {
          tl_video_id: videoId,
          tl_index_id: indexId,
          video_file: videoName,
          video_segment: segmentIndex,
          start_time: segment.start_offset_sec,
          end_time: segment.end_offset_sec,
          scope: segment.embedding_scope,
          category: category // Add category to metadata
        }
      };

      try {
        console.log(`Upserting segment ${segmentIndex} to Pinecone...`);
        await pineconeIndex.upsert([upsertRequest]);
        console.log(`Successfully stored segment ${segmentIndex} for video ${videoId} as category ${category}`);
        return { success: true, segment: segmentIndex };
      } catch (error) {
        console.error(`Error storing segment ${segmentIndex} for video ${videoId}:`, error);
        return { success: false, segment: segmentIndex, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    console.log(`Waiting for all upsert operations to complete...`);
    const results = await Promise.all(upsertPromises);
    const successCount = results.filter(result => result.success).length;
    console.log(`Completed ${successCount} of ${results.length} upsert operations`);

    const allSuccessful = results.every(result => result.success);

    if (allSuccessful) {
      console.log(`All segments successfully stored in Pinecone!`);
      return NextResponse.json({
        success: true,
        message: `Successfully stored ${results.length} embedding segments for ${category} video`
      });
    } else {
      console.error(`Some segments failed to store: ${results.filter(r => !r.success).length} failures`);
      return NextResponse.json({
        success: false,
        message: 'Some segments failed to store',
        details: results
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error storing embeddings:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}