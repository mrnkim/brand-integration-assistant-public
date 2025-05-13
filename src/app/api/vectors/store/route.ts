import { NextResponse } from 'next/server';
import { Segment, Vector } from '@/types/index';
import { getPineconeIndex } from '@/utils/pinecone';

function sanitizeVectorId(str: string) {
  if (!str) return 'unknown';

  const sanitized = str
    .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII characters
    .replace(/[^a-zA-Z0-9-_]/g, '_') // Replace other special characters with underscore
    .replace(/_{2,}/g, '_'); // Replace multiple consecutive underscores with single underscore
  return sanitized;
}

export async function POST(request: Request) {
  try {
    const { videoId, videoName, embedding, indexId } = await request.json();

    console.log(`### STORE DEBUG - Received request with:`,
      JSON.stringify({
        videoId,
        videoName,
        indexId,
        embeddingKeys: embedding ? Object.keys(embedding) : 'undefined'
      }, null, 2)
    );

    if (!videoId || !embedding) {
      console.error('### STORE DEBUG - Missing required parameters');
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // 디버깅: embedding 구조 확인
    console.log(`### STORE DEBUG - Embedding structure:`, JSON.stringify({
      has_metadata: Boolean(embedding.metadata),
      has_system_metadata: Boolean(embedding.system_metadata),
      system_metadata: embedding.system_metadata,
      has_video_embedding: Boolean(embedding.video_embedding),
      segments_count: embedding.video_embedding?.segments?.length || 0
    }, null, 2));

    // Extract the actual video filename from the data structure
    // Try all potential locations where the filename might be stored
    let actualFileName = videoName || videoId;

    // Check in embedding.metadata
    if (embedding.metadata && embedding.metadata.filename) {
      actualFileName = embedding.metadata.filename;
    }
    // Check in embedding.system_metadata
    else if (embedding.system_metadata && embedding.system_metadata.filename) {
      actualFileName = embedding.system_metadata.filename;
    }
    // Check in embedding.hls.metadata
    else if (embedding.hls && embedding.hls.metadata && embedding.hls.metadata.filename) {
      actualFileName = embedding.hls.metadata.filename;
    }
    // Check in embedding.source.filename
    else if (embedding.source && embedding.source.filename) {
      actualFileName = embedding.source.filename;
    }

    // Get video title if available
    let videoTitle = '';
    if (embedding.system_metadata && embedding.system_metadata.video_title) {
      videoTitle = embedding.system_metadata.video_title;
    }

    // 디버깅: 모든 가능한 타이틀/파일명 소스 정보 출력
    console.log(`### STORE DEBUG - All possible name sources:`, JSON.stringify({
      videoId,
      providedVideoName: videoName,
      metadata_filename: embedding.metadata?.filename,
      system_metadata_filename: embedding.system_metadata?.filename,
      hls_metadata_filename: embedding.hls?.metadata?.filename,
      source_filename: embedding.source?.filename,
      system_metadata_video_title: embedding.system_metadata?.video_title
    }, null, 2));

    // Use video title if available, otherwise use filename without extension
    const baseVectorId = videoTitle || (actualFileName.split('.')[0] || videoId);

    console.log(`### STORE DEBUG - Final values used:`);
    console.log(`- Vector ID base: "${baseVectorId}"`);
    console.log(`- Metadata video_file: "${actualFileName}"`);

    // Determine category based on indexId
    // Check if the indexId contains a hint about whether it's an ad or content
    const isAdsIndex = indexId.toLowerCase().includes('ad');
    const category = isAdsIndex ? 'ad' : 'content';

    console.log(`- Category: "${category}" based on indexId: ${indexId}`);

    if (!embedding.video_embedding || !embedding.video_embedding.segments || embedding.video_embedding.segments.length === 0) {
      console.error('### STORE DEBUG - No segments found in embedding data');
      return NextResponse.json(
        { error: 'No segments found in embedding data' },
        { status: 400 }
      );
    }

    // 디버깅: 첫 번째 세그먼트 구조 출력
    console.log(`### STORE DEBUG - First segment structure:`,
      JSON.stringify(embedding.video_embedding.segments[0], null, 2)
    );

    const vectors = embedding.video_embedding.segments.map((segment: Segment, index: number) => {
      const vectorId = `${sanitizeVectorId(baseVectorId)}_segment${index + 1}`;
      console.log(`### STORE DEBUG - Creating vector ID: ${vectorId}`);

      return {
        id: vectorId,
        values: segment.float,
        metadata: {
          video_file: actualFileName,
          video_segment: index + 1,
          start_time: segment.start_offset_sec,
          end_time: segment.end_offset_sec,
          scope: segment.embedding_scope,
          tl_video_id: videoId,
          tl_index_id: indexId,
          category: category, // Add category field
        },
      };
    });

    // 디버깅: 생성된 첫 번째 벡터 정보 출력
    console.log(`### STORE DEBUG - First vector (excluding values):`, JSON.stringify({
      id: vectors[0].id,
      metadata: vectors[0].metadata,
      values_length: vectors[0].values?.length || 0
    }, null, 2));

    // Vectors 생성 시작 전 디버깅 로그 추가
    console.log(`### STORE DEBUG - Processing ${vectors.length} vectors for video ${videoId}`);

    try {
      // Initialize Pinecone client
      console.log('Initializing Pinecone client...');
      const index = getPineconeIndex();

      // Instead of just doing a test vector, actually upsert ALL vectors
      console.log(`### STORE DEBUG - Upserting ${vectors.length} real vectors to Pinecone`);

      // Split vectors into batches of 100 to avoid exceeding request size limits
      const BATCH_SIZE = 100;
      for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
        const batch = vectors.slice(i, i + BATCH_SIZE);
        console.log(`### STORE DEBUG - Upserting batch ${Math.floor(i/BATCH_SIZE) + 1} with ${batch.length} vectors`);
        await index.upsert(batch);
      }

      console.log(`### STORE DEBUG - Successfully upserted all ${vectors.length} vectors for video ${videoId}`);

      return NextResponse.json({
        success: true,
        vectorCount: vectors.length,
        message: `Successfully stored ${vectors.length} vector segments for video ${videoId}`
      });
    } catch (error) {
      console.error('### STORE DEBUG - Vector upsert failed:', error);
      return NextResponse.json({
        success: false,
        message: 'Vector creation failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error storing embeddings:', error);
    return NextResponse.json(
      { error: 'Failed to store embeddings' },
      { status: 500 }
    );
  }
}

