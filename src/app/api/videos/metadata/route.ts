import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

// Type definition for metadata request
interface MetadataUpdateRequest {
  videoId: string;
  indexId: string;
  metadata: {
    source?: string;
    sector?: string;
    emotions?: string;
    brands?: string;
    locations?: string;
    demographics?: string;
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Parse request body
    const body: MetadataUpdateRequest = await request.json();
    const { videoId, indexId, metadata } = body;


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
        message: 'Metadata updated successfully (development mode)'
      });
    }

    // Prepare API request
    const url = `${TWELVELABS_API_BASE_URL}/indexes/${indexId}/videos/${videoId}`;

    const requestBody = {
      user_metadata: {
        source: metadata.source || '',
        sector: metadata.sector || '',
        emotions: metadata.emotions || '',
        brands: metadata.brands || '',
        locations: metadata.locations || '',
        demographics: metadata.demographics || ''
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
        { error: `Failed to update metadata: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Video metadata updated successfully'
    });
  } catch (error) {
    console.error('Error updating video metadata:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}