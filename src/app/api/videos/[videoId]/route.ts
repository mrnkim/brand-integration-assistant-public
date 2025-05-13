import { NextResponse } from "next/server";

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

// Define a basic interface for the expected response data structure
interface VideoApiResponse {
  hls?: Record<string, unknown>; // Or a more specific HLS type if available
  metadata?: Record<string, unknown>; // Or a more specific Metadata type
  source?: Record<string, unknown>; // Or a more specific Source type
  embedding?: Record<string, unknown>; // Or a more specific Embedding type
}

// Type guard to check if the video object is valid and has expected properties
function isValidVideoData(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null;
}

export async function GET(
  req: Request,
  { params }: { params: { videoId: string } }
) {
  // Get videoId from URL path parameter
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

  console.log(`Fetching video details for videoId: ${videoId}, indexId: ${indexId}, embed: ${requestEmbeddings}`);

  // Base URL
  let url = `${TWELVELABS_API_BASE_URL}/indexes/${indexId}/videos/${videoId}`;

  // Append correct query parameters if embeddings are requested
  if (requestEmbeddings) {
    // Append each embedding option as a separate parameter
    url += `?embedding_option=visual-text&embedding_option=audio`;
  }

  const options = {
    method: "GET",
    headers: {
      "x-api-key": `${API_KEY}`,
      "Accept": "application/json"
    },
  };

  try {
    console.log(`Making API request to: ${url}`);
    const response = await fetch(url, options);

    if (!response.ok) {
      console.error(`API error: ${response.status} ${response.statusText}`);
      // Return dummy data when API request fails
      const dummyData = getDummyVideoData(videoId, indexId);
      return NextResponse.json(dummyData);
    }

    // Use unknown type and a type guard for safer handling
    const videoData: unknown = await response.json();

    // Validate the received data structure
    if (!isValidVideoData(videoData)) {
      throw new Error("Invalid video data structure received.");
    }

    // Prepare response data using the defined interface
    const responseData: VideoApiResponse = {
      hls: videoData.hls as Record<string, unknown> | undefined,
      // Use system_metadata as per documentation, handle if missing
      metadata: (videoData.system_metadata || videoData.metadata) as Record<string, unknown> | undefined,
      source: videoData.source as Record<string, unknown> | undefined,
    };

    // Check if the 'embedding' field exists in the response from TwelveLabs
    if ('embedding' in videoData && videoData.embedding) {
      responseData.embedding = videoData.embedding as Record<string, unknown>;
    }

    return NextResponse.json(responseData);

  } catch (e) {
    console.error('Error fetching video details:', e);
    // Return dummy data for any error
    const dummyData = getDummyVideoData(videoId, indexId);
    return NextResponse.json(dummyData);
  }
}

// Dummy video data generator function
function getDummyVideoData(videoId: string, indexId: string) {
  // Create dummy embedding data with realistic structure
  const dummyEmbedding = {
    model_name: "Marengo-retrieval-2.7",
    video_embedding: {
      segments: Array.from({ length: 10 }, (_, i) => ({
        embedding_scope: "clip",
        start_offset_sec: i * 5,
        end_offset_sec: (i + 1) * 5,
        embedding_option: "visual-text",
        float: Array.from({ length: 512 }, () => Math.random() * 2 - 1) // Generate random floating points between -1 and 1
      }))
    }
  };

  return {
    _id: videoId,
    index_id: indexId,
    system_metadata: {
      video_title: videoId === 'video1'
        ? 'Skanska NYC Building Construction'
        : videoId === 'video2'
        ? 'Skanska Urban Planning Initiative'
        : 'Skanska Real Estate Showcase',
      filename: `${videoId}.mp4`,
      duration: videoId === 'video1' ? 120 : videoId === 'video2' ? 180 : 240,
      fps: 30,
      height: 720,
      width: 1280,
      size: 1024000,
    },
    hls: {
      video_url: `https://example.com/hls/${videoId}.m3u8`,
      thumbnail_urls: [`https://placehold.co/600x400?text=${videoId}`],
      status: 'COMPLETE',
      updated_at: new Date().toISOString()
    },
    embedding: dummyEmbedding
  };
}