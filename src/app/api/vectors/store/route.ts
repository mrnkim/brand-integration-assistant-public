import { NextResponse } from 'next/server';
import { Segment } from '@/types/index';
import { getPineconeIndex } from '@/utils/pinecone';

function sanitizeVectorId(str: string) {
  const sanitized = str
    .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII characters
    .replace(/[^a-zA-Z0-9-_]/g, '_') // Replace other special characters with underscore
    .replace(/_{2,}/g, '_'); // Replace multiple consecutive underscores with single underscore
  return sanitized;
}

export async function POST(request: Request) {
  try {
    const { videoId, videoName, embedding, indexId } = await request.json();

    console.log(`🚀 FILENAME DEBUG - Request received with:
- videoId: ${videoId}
- videoName: ${videoName || 'not provided'}
- indexId: ${indexId}
- embedding available: ${Boolean(embedding)}
- system_metadata available: ${Boolean(embedding?.system_metadata)}`);

    if (!videoId || !embedding) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // First check if embedding has valid segments
    if (!embedding.video_embedding || !embedding.video_embedding.segments || embedding.video_embedding.segments.length === 0) {
      return NextResponse.json(
        { error: 'Invalid embedding structure - missing segments' },
        { status: 400 }
      );
    }

    // Step 1: Extract video title from metadata
    let videoTitle = '';
    let actualFileName = '';

    // First priority: Use system_metadata from the embedding
    if (embedding.system_metadata) {
      if (embedding.system_metadata.video_title) {
        videoTitle = embedding.system_metadata.video_title;
        console.log(`🚀 FILENAME DEBUG - Using title from embedding's system_metadata: "${videoTitle}"`);
      }

      if (embedding.system_metadata.filename) {
        actualFileName = embedding.system_metadata.filename;
        console.log(`🚀 FILENAME DEBUG - Using filename from embedding's system_metadata: "${actualFileName}"`);
      }
    }

    // Second priority: Use provided videoName if first priority not available
    if ((!videoTitle || !videoTitle.trim()) && videoName && videoName.trim() !== '') {
      console.log(`🚀 FILENAME DEBUG - Using provided videoName: "${videoName}"`);
      // If videoName contains an extension, use it as filename and the name part as title
      if (videoName.includes('.')) {
        actualFileName = videoName;
        videoTitle = videoName.split('.')[0];
      } else {
        // If no extension, use as title and construct a filename
        videoTitle = videoName;
        if (!actualFileName) {
          actualFileName = `${videoName}.mp4`; // Default extension
        }
      }
    }

    // Check other locations if still not found
    if (!videoTitle || !videoTitle.trim()) {
      console.log(`🚀 FILENAME DEBUG - No title found in main sources, checking alternatives`);

      // Check in embedding.metadata
      if (embedding.metadata && embedding.metadata.filename) {
        actualFileName = embedding.metadata.filename;
        console.log(`🚀 FILENAME DEBUG - Found filename in metadata: "${actualFileName}"`);

        if (!videoTitle && actualFileName.includes('.')) {
          videoTitle = actualFileName.split('.')[0];
          console.log(`🚀 FILENAME DEBUG - Extracted title from metadata filename: "${videoTitle}"`);
        }
      }
      // Check in embedding.hls.metadata
      else if (embedding.hls && embedding.hls.metadata && embedding.hls.metadata.filename) {
        actualFileName = embedding.hls.metadata.filename;
        console.log(`🚀 FILENAME DEBUG - Found filename in hls.metadata: "${actualFileName}"`);

        if (!videoTitle && actualFileName.includes('.')) {
          videoTitle = actualFileName.split('.')[0];
          console.log(`🚀 FILENAME DEBUG - Extracted title from hls metadata filename: "${videoTitle}"`);
        }
      }
      // Check in embedding.source.filename
      else if (embedding.source && embedding.source.filename) {
        actualFileName = embedding.source.filename;
        console.log(`🚀 FILENAME DEBUG - Found filename in source: "${actualFileName}"`);

        if (!videoTitle && actualFileName.includes('.')) {
          videoTitle = actualFileName.split('.')[0];
          console.log(`🚀 FILENAME DEBUG - Extracted title from source filename: "${videoTitle}"`);
        }
      }
    }

    // Fall back to video ID if still nothing found
    if (!videoTitle || !videoTitle.trim()) {
      videoTitle = videoId;
      console.log(`🚀 FILENAME DEBUG - No title found in any source, using videoId: "${videoTitle}"`);
    }

    if (!actualFileName || !actualFileName.trim()) {
      actualFileName = `${videoTitle}.mp4`; // Default extension
      console.log(`🚀 FILENAME DEBUG - No filename found in any source, creating from title: "${actualFileName}"`);
    }

    // Determine vector ID base by sanitizing the title
    const vectorIdBase = sanitizeVectorId(videoTitle.replace(/\.[^/.]+$/, '')); // Remove file extension if present

    // Determine category based on the index ID
    const category = indexId === process.env.NEXT_PUBLIC_ADS_INDEX_ID ? 'ad' : 'content';

    console.log(`🚀 FILENAME DEBUG - FINAL DECISION:
- Video title: "${videoTitle}"
- Actual filename: "${actualFileName}"
- Vector ID base: "${vectorIdBase}"
- Category: "${category}"`);

    const vectorDimension = embedding.video_embedding.segments[0]?.float?.length || 0;
    console.log(`🚀 FILENAME DEBUG - First segment vector dimension: ${vectorDimension}`);

    // Check vector dimension
    if (vectorDimension !== 1024) {
      console.warn(`⚠️ WARNING: Vector dimension is ${vectorDimension}, expected 1024`);
    }

    // Create vectors from embedding segments
    const vectors = embedding.video_embedding.segments.map((segment: Segment, index: number) => {
      // Create a meaningful and unique vector ID
      const vectorId = `${vectorIdBase}_segment${index + 1}`;

      const vector = {
        id: vectorId,
        values: segment.float,
        metadata: {
          video_file: actualFileName,
          video_title: videoTitle,
          video_segment: index + 1,
          start_time: segment.start_offset_sec,
          end_time: segment.end_offset_sec,
          scope: segment.embedding_scope,
          tl_video_id: videoId,
          tl_index_id: indexId,
          category
        }
      };

      // Log first vector for debugging
      if (index === 0) {
        console.log(`🚀 FILENAME DEBUG - First vector: ${JSON.stringify(vector, null, 2)}`);
      }

      return vector;
    });

    console.log(`🚀 FILENAME DEBUG - Processing ${vectors.length} vectors for video ${videoId}`);

    try {
      console.log('Initializing Pinecone client...');
      const index = getPineconeIndex();

      // Upload vectors in batches
      const batchSize = 100;
      const totalBatches = Math.ceil(vectors.length / batchSize);

      console.log(`🚀 FILENAME DEBUG - Starting vector upload...`);

      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;

        console.log(`Upserting batch ${batchNumber}/${totalBatches} with ${batch.length} vectors`);

        try {
          await index.upsert(batch);
        } catch (error) {
          console.error(`Error in batch ${batchNumber}:`, error);
          throw error;
        }
      }

      console.log(`🚀 FILENAME DEBUG - Successfully uploaded all vectors`);

      return NextResponse.json({
        success: true,
        message: `Successfully stored ${vectors.length} vectors for video ${videoId}`
      });
    } catch (error) {
      console.error('Error in Pinecone operation:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error storing embeddings:', error);
    return NextResponse.json(
      {
        error: 'Failed to store embeddings',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

