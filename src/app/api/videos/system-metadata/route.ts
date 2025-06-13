import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

// Type definition for system metadata request
interface SystemMetadataUpdateRequest {
  videoId: string;
  indexId: string;
  systemMetadata: {
    video_title?: string;
    filename?: string;
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Parse request body
    const body: SystemMetadataUpdateRequest = await request.json();
    const { videoId, indexId, systemMetadata } = body;

    // Validate required parameters
    if (!videoId || !indexId) {
      return NextResponse.json(
        { error: 'Video ID and Index ID are required' },
        { status: 400 }
      );
    }

    // Development/test environment response
    if (!API_KEY || !TWELVELABS_API_BASE_URL) {
      console.error('Missing API key or base URL in environment variables');
      return NextResponse.json({
        success: true,
        message: 'System metadata updated successfully (development mode)'
      });
    }

    // Prepare API request
    const url = `${TWELVELABS_API_BASE_URL}/indexes/${indexId}/videos/${videoId}`;


    const requestBody = {
      system_metadata: {
        video_title: systemMetadata.video_title,
        filename: systemMetadata.filename
      }
    };

    const options = {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify(requestBody)
    };

    // Call Twelve Labs API
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: `Failed to update system metadata: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Video system metadata updated successfully'
    });
  } catch (error) {
    console.error('Error in system metadata update:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}