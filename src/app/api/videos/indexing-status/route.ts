import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get API key from environment variable
    const apiKey = process.env.TWELVELABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    // Get task ID from query parameters
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'taskId parameter is required' }, { status: 400 });
    }

    // Make request to Twelve Labs API to check task status
    const response = await fetch(`https://api.twelvelabs.io/v1.3/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
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
    console.error('Error checking indexing status:', error);
    return NextResponse.json(
      { error: 'Failed to check indexing status', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}