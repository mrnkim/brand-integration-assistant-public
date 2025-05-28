import { NextResponse } from "next/server";

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

// Define a basic interface for the expected response data structure
interface VideoApiResponse {
  _id: string;
  index_id?: string;
  hls?: Record<string, unknown>; // Or a more specific HLS type if available
  system_metadata?: Record<string, unknown>; // Renamed from metadata to system_metadata
  user_metadata?: Record<string, unknown>; // Added for user metadata
  source?: Record<string, unknown>; // Or a more specific Source type
  embedding?: Record<string, unknown>; // Or a more specific Embedding type
}

// Type guard to check if the video object is valid and has expected properties
function isValidVideoData(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ videoId: string }> }
) {
  const params = await context.params;
  const videoId = params.videoId;

  // Get other params from search params
  const { searchParams } = new URL(req.url);
  const indexId = searchParams.get("indexId");
  const requestEmbeddings = searchParams.get("embed") === 'true';

  if (!indexId) {
    return NextResponse.json(
      { error: "indexId is required" },
      { status: 400 }
    );
  }

  if (!videoId) {
    return NextResponse.json(
      { error: "videoId is required" },
      { status: 400 }
    );
  }

  if (!API_KEY || !TWELVELABS_API_BASE_URL) {
    return NextResponse.json(
      { error: "API credentials not configured" },
      { status: 500 }
    );
  }

  console.log(`🔍 Fetching video details for videoId: ${videoId}, indexId: ${indexId}, embed: ${requestEmbeddings}`);

  // Base URL
  let url = `${TWELVELABS_API_BASE_URL}/indexes/${indexId}/videos/${videoId}`;

  // Always include embedding query parameters if requested
  if (requestEmbeddings) {
    // Include only supported embedding options
    url += `?embedding_option=visual-text&embedding_option=audio`;
    console.log(`📢 Requesting supported embedding options: visual-text, audio`);
  }

  const options = {
    method: "GET",
    headers: {
      "x-api-key": `${API_KEY}`,
      "Accept": "application/json"
    },
  };

  try {
    console.log(`🌐 Making API request to: ${url}`);
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API error: ${response.status} ${response.statusText}`);
      console.error(`❌ Error details: ${errorText}`);

      // If video is not found, provide a more helpful error message
      if (response.status === 404) {
        console.error(`❌ Video ${videoId} not found in index ${indexId}. It might still be processing.`);
      }

      return NextResponse.json(
        { error: `Failed to fetch video data: ${response.statusText}`, details: errorText },
        { status: response.status }
      );
    }

    // Use unknown type and a type guard for safer handling
    const videoData: unknown = await response.json();

    // Debug the raw response structure
    console.log(`✅ Received video data with keys:`, videoData ? Object.keys(videoData as object) : 'null');

    if (requestEmbeddings) {
      console.log(`📊 Embedding data present:`, 'embedding' in (videoData as any));
      if ('embedding' in (videoData as any)) {
        const embedding = (videoData as any).embedding;
        console.log(`📊 Embedding structure:`, {
          hasVideoEmbedding: !!embedding?.video_embedding,
          hasSegments: !!embedding?.video_embedding?.segments,
          segmentsCount: embedding?.video_embedding?.segments?.length || 0
        });
      } else {
        console.warn(`⚠️ No embedding data found in response for video ${videoId}`);
      }
    }

    // Validate the received data structure
    if (!isValidVideoData(videoData)) {
      throw new Error("Invalid video data structure received.");
    }

    // Deep clone videoData to avoid mutating the original
    const responseData: VideoApiResponse = {
      _id: videoId,
      index_id: indexId,
    };

    // Copy over original fields directly to preserve the structure
    if ('hls' in videoData && videoData.hls) {
      responseData.hls = videoData.hls as Record<string, unknown>;
    }

    if ('system_metadata' in videoData && videoData.system_metadata) {
      // Preserve the original system_metadata structure
      responseData.system_metadata = videoData.system_metadata as Record<string, unknown>;
    }

    if ('user_metadata' in videoData && videoData.user_metadata) {
      responseData.user_metadata = videoData.user_metadata as Record<string, unknown>;
    }

    if ('source' in videoData && videoData.source) {
      responseData.source = videoData.source as Record<string, unknown>;
    }

    // Check if the 'embedding' field exists in the response from TwelveLabs
    if ('embedding' in videoData && videoData.embedding) {
      responseData.embedding = videoData.embedding as Record<string, unknown>;
      console.log(`✅ Successfully included embedding data in response with ${
        (videoData.embedding as any)?.video_embedding?.segments?.length || 0
      } segments`);
    } else if (requestEmbeddings) {
      console.warn(`⚠️ Embedding was requested but not found in API response!`);
    }

    return NextResponse.json(responseData);

  } catch (e) {
    console.error('❌ Error fetching video details:', e);
    return NextResponse.json(
      { error: `Failed to fetch or process video data: ${e instanceof Error ? e.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}