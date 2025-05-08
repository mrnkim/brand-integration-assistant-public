import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

// Define allowed option values
const ALLOWED_DEMOGRAPHICS = ['Male', 'Female', '18-25', '25-34', '35-44', '45-54', '55+'];
const ALLOWED_SECTORS = ['Beauty', 'Fashion', 'Tech', 'Travel', 'CPG', 'Food & Bev', 'Retail'];
const ALLOWED_EMOTIONS = ['happy/positive', 'exciting', 'relaxing', 'inspiring', 'serious', 'festive', 'calm'];

// Validate if a value is in the allowed list
function isValidOption(value: string, allowedOptions: string[]): boolean {
  return allowedOptions.includes(value);
}

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

    // Validate sector if provided
    if (metadata.sector && !isValidOption(metadata.sector, ALLOWED_SECTORS)) {
      return NextResponse.json({
        error: `Invalid sector. Allowed values: ${ALLOWED_SECTORS.join(', ')}`
      }, { status: 400 });
    }

    // Validate emotions if provided
    if (metadata.emotions && !isValidOption(metadata.emotions, ALLOWED_EMOTIONS)) {
      return NextResponse.json({
        error: `Invalid emotion. Allowed values: ${ALLOWED_EMOTIONS.join(', ')}`
      }, { status: 400 });
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

    const options = {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({
        user_metadata: {
          source: metadata.source,
          sector: metadata.sector,
          emotions: metadata.emotions,
          brands: metadata.brands,
          locations: metadata.locations
        }
      })
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