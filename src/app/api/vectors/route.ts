import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

export async function POST(request: NextRequest) {
  console.log('### DEBUG: /api/vectors POST API called');
  try {
    const body = await request.json();
    const { index_id, video_id } = body;
    console.log(`### DEBUG: Fetching embeddings for video_id=${video_id}, index_id=${index_id}`);

    if (!index_id || !video_id) {
      console.error('### DEBUG ERROR: Missing required parameters in request body');
      return NextResponse.json(
        { error: 'Index ID and Video ID are required' },
        { status: 400 }
      );
    }

    if (!API_KEY || !TWELVELABS_API_BASE_URL) {
      console.error('### DEBUG ERROR: Missing API key or base URL in environment variables');
      return NextResponse.json(
        { error: 'Missing API credentials' },
        { status: 500 }
      );
    }

    // First, try to get the video without embedding options to check if it already has embeddings
    const videoUrl = `${TWELVELABS_API_BASE_URL}/indexes/${index_id}/videos/${video_id}`;
    console.log(`### DEBUG: Checking if video already has embeddings - GET ${videoUrl}`);

    const options = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
    };

    const videoResponse = await fetch(videoUrl, options);

    if (!videoResponse.ok) {
      console.error(`### DEBUG ERROR: Video API error: ${videoResponse.status}`);
      return NextResponse.json(
        { error: 'Failed to fetch video data' },
        { status: videoResponse.status }
      );
    }

    const videoData = await videoResponse.json();
    console.log(`### DEBUG: Video data retrieved. Has embeddings: ${Boolean(videoData.embedding?.video_embedding?.segments)}`);

    // Check if embeddings already exist
    if (videoData.embedding?.video_embedding?.segments) {
      console.log(`### DEBUG: Embedding already exists for video ${video_id}`);

      return NextResponse.json({
        videoId: video_id,
        exists: true,
        embedding: videoData.embedding,
        video_title: videoData.system_metadata?.video_title || videoData.system_metadata?.filename || ''
      });
    }

    // Embeddings don't exist, request them with the embedding_option parameter
    const embeddingUrl = `${TWELVELABS_API_BASE_URL}/indexes/${index_id}/videos/${video_id}?embedding_option=visual-text`;
    console.log(`### DEBUG: Requesting embeddings with embedding_option=visual-text - GET ${embeddingUrl}`);

    const embeddingResponse = await fetch(embeddingUrl, options);

    if (!embeddingResponse.ok) {
      console.error(`### DEBUG ERROR: Embedding API error: ${embeddingResponse.status}`);
      return NextResponse.json(
        { error: 'Failed to fetch embeddings' },
        { status: embeddingResponse.status }
      );
    }

    const embeddingData = await embeddingResponse.json();
    console.log(`### DEBUG: Successfully retrieved embeddings for video ${video_id}`);

    // Return the embedding data
    return NextResponse.json({
      videoId: video_id,
      exists: false,
      embedding: embeddingData.embedding,
      video_title: embeddingData.system_metadata?.video_title || embeddingData.system_metadata?.filename || ''
    });

  } catch (error) {
    console.error('### DEBUG ERROR: Error in vectors API:', error);
    return NextResponse.json(
      { error: 'Failed to process vector request' },
      { status: 500 }
    );
  }
}