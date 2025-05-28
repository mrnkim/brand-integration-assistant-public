import { NextRequest, NextResponse } from 'next/server';

// Define a proper interface for task objects
interface Task {
  _id: string;
  status: string;
  index_id?: string;
  video_id?: string;
}

export async function GET(request: NextRequest) {
  try {
    // Get API key from environment variable
    const apiKey = process.env.TWELVELABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    // Get index ID from query parameters
    const { searchParams } = new URL(request.url);
    const indexId = searchParams.get('indexId');

    if (!indexId) {
      return NextResponse.json({ error: 'indexId parameter is required' }, { status: 400 });
    }

    // Make request to Twelve Labs API to get tasks for the index
    // Increase page_size to get more results and include both ready and processing tasks
    const response = await fetch(`https://api.twelvelabs.io/v1.3/tasks?index_id=${indexId}&page_size=20&page=1`, {
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

    // Return the API response with detailed data
    const data = await response.json();

    // Log tasks information for debugging
    if (data.data && data.data.length > 0) {
      console.log(`Retrieved ${data.data.length} tasks for index ${indexId}`);
      console.log(`Task statuses: ${data.data.map((task: Task) => task.status).join(', ')}`);
    }

    // Make sure we include all status types (ready, indexing, validating, etc.)
    return NextResponse.json({
      tasks: data.data || [],
      count: data.data?.length || 0,
      page_info: data.page_info || {}
    });
  } catch (error) {
    console.error('Error fetching indexing tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch indexing tasks', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}