import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120; // Set max duration to 120 seconds for large file uploads

export async function POST(request: NextRequest) {
  try {
    // Get API key from environment variable
    const apiKey = process.env.TWELVELABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    // Create a FormData instance from the request
    const formData = await request.formData();

    // Get the required parameters
    const indexId = formData.get('index_id');
    const videoFile = formData.get('video_file');
    const enableVideoStream = formData.get('enable_video_stream') || 'true';

    // Validate required fields
    if (!indexId) {
      return NextResponse.json({ error: 'index_id is required' }, { status: 400 });
    }

    if (!videoFile || !(videoFile instanceof File)) {
      return NextResponse.json({ error: 'video_file is required and must be a file' }, { status: 400 });
    }

    // Create a new FormData for the Twelve Labs API
    const apiFormData = new FormData();
    apiFormData.append('index_id', indexId.toString());
    apiFormData.append('video_file', videoFile);
    apiFormData.append('enable_video_stream', enableVideoStream.toString());

    // Make request to Twelve Labs API
    const response = await fetch('https://api.twelvelabs.io/v1.3/tasks', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        // Content-Type is automatically set by fetch with correct boundary when using FormData
      },
      body: apiFormData,
    });

    // Handle API response
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Twelve Labs API error:', errorText);
      return NextResponse.json(
        { error: `Twelve Labs API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    // Return the API response
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error uploading video:', error);
    return NextResponse.json(
      { error: 'Failed to upload video', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}