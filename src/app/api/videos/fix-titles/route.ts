import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

// Utility function to generate a more descriptive title
function generateBetterTitle(videoId: string): string {
  // Generate a title based on ID patterns or use a random descriptive title
  const categories = ['Product Launch', 'Company Overview', 'Brand Campaign', 'Event Highlights', 'Marketing Promo'];
  const brands = ['Nike', 'Apple', 'Google', 'Samsung', 'Microsoft', 'Tesla', 'Amazon'];
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];
  const randomBrand = brands[Math.floor(Math.random() * brands.length)];
  return `${randomBrand} ${randomCategory} ${videoId.substring(0, 5)}`;
}

// Check if a string looks like a MongoDB ObjectId (24 hex characters)
function isLikelyVideoId(str: string): boolean {
  return /^[0-9a-f]{24}$/.test(str);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { indexId, limit = 100 } = body;

    if (!indexId) {
      return NextResponse.json(
        { error: 'Index ID is required' },
        { status: 400 }
      );
    }

    if (!API_KEY || !TWELVELABS_API_BASE_URL) {
      console.error('Missing API key or base URL in environment variables');
      return NextResponse.json({
        success: false,
        message: 'API credentials not configured'
      }, { status: 500 });
    }

    // 1. Fetch videos from the index
    const videosUrl = `${TWELVELABS_API_BASE_URL}/indexes/${indexId}/videos?page=1&page_limit=${limit}`;
    const videosResponse = await fetch(videosUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
    });

    if (!videosResponse.ok) {
      return NextResponse.json(
        { error: `Failed to fetch videos: ${videosResponse.statusText}` },
        { status: videosResponse.status }
      );
    }

    const videosData = await videosResponse.json();
    const videos = videosData.data || [];
    console.log(`Found ${videos.length} videos to process`);

    // 2. Process each video and fix titles if needed
    const results = {
      total: videos.length,
      updated: 0,
      skipped: 0,
      errors: 0,
      details: [] as Array<{videoId: string, status: string, oldTitle?: string, newTitle?: string}>
    };

    for (const video of videos) {
      const videoId = video._id;
      const currentTitle = video.system_metadata?.video_title;

      // Skip videos that already have good titles
      if (currentTitle && !isLikelyVideoId(currentTitle) && currentTitle !== videoId) {
        results.skipped++;
        results.details.push({
          videoId,
          status: 'skipped',
          oldTitle: currentTitle
        });
        continue;
      }

      // Generate a better title
      const newTitle = generateBetterTitle(videoId);

      // Update the title in Twelve Labs
      try {
        const updateUrl = `${TWELVELABS_API_BASE_URL}/indexes/${indexId}/videos/${videoId}`;
        const updateBody = {
          system_metadata: {
            video_title: newTitle,
            filename: `${newTitle.replace(/\s+/g, '_')}.mp4`
          }
        };

        const updateResponse = await fetch(updateUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
          },
          body: JSON.stringify(updateBody)
        });

        if (updateResponse.ok) {
          results.updated++;
          results.details.push({
            videoId,
            status: 'updated',
            oldTitle: currentTitle,
            newTitle
          });
        } else {
          results.errors++;
          results.details.push({
            videoId,
            status: 'error',
            oldTitle: currentTitle
          });
        }
      } catch (error) {
        results.errors++;
        results.details.push({
          videoId,
          status: 'error',
          oldTitle: currentTitle
        });
      }
    }

    // Return results summary
    return NextResponse.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Error fixing video titles:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}