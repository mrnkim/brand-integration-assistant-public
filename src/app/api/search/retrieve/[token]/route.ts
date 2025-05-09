import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * API endpoint for retrieving paginated search results
 *
 * Expected URL format: /api/search/retrieve/[token]?indexId=<indexId>
 *
 * The indexId parameter in the URL query string is crucial to ensure that
 * search results come from the correct video library (content or ads).
 */

// Define interface for search result
interface SearchResult {
  _id: string;
  index_id?: string;
  video_id: string;
  score: number;
  duration: number;
  thumbnail_url?: string;
  video_url?: string;
  video_title?: string;
  segments?: Array<{
    start: number;
    end: number;
    score: number;
    matched_words?: string[];
  }>;
  [key: string]: string | number | boolean | object | undefined;
}

// Use the updated approach for Next.js 15+ dynamic routes
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    // Use object destructuring with await following Next.js 15 guidance
    const { token } = await params;
    console.log('🔍 > Search Retrieve API > Received request for token:', token);

    // Get the indexId from URL search params to ensure we preserve the correct index
    const searchParams = request.nextUrl.searchParams;
    const requestIndexId = searchParams.get('indexId');
    console.log('🔍 > Search Retrieve API > Index ID from request:', requestIndexId);

    const apiKey = process.env.TWELVELABS_API_KEY;

    if (!apiKey) {
      console.log('🔍 > Search Retrieve API > Missing API key');
      return NextResponse.json(
        { error: "API key is not set" },
        { status: 500 }
      );
    }

    if (!token) {
      console.log('🔍 > Search Retrieve API > Missing page token');
      return NextResponse.json(
        { error: "Page token is required" },
        { status: 400 }
      );
    }

    const url = `https://api.twelvelabs.io/v1.3/search/${token}`;

    console.log('🔍 > GET > Retrieving page with token:', token);

    try {
      const response = await axios.get(url, {
        headers: {
          "x-api-key": `${apiKey}`,
        },
      });

      const responseData = response.data;
      console.log("🚀 > GET > Response status:", response.status);

      if (!responseData) {
        console.log('🔍 > Search Retrieve API > Empty response data');
        return NextResponse.json(
          { error: "Error getting response from the API" },
          { status: 500 }
        );
      }

      console.log('🔍 > GET > Search results count:', responseData.data?.length || 0);
      console.log('🔍 > GET > Pagination info:', responseData.page_info || 'No pagination info');

      // Log first few video IDs to check for duplicates
      if (responseData.data && responseData.data.length > 0) {
        const videoIds = responseData.data.slice(0, 3).map((item: SearchResult) => item.video_id);
        console.log('🔍 > GET > Sample video IDs in results:', videoIds);
      }

      // Determine which index ID to use - prioritize the one from request params
      const indexId = requestIndexId || responseData.search_pool?.index_id || process.env.NEXT_PUBLIC_CONTENT_INDEX_ID;
      console.log('🔍 > GET > Using index ID for results:', indexId);

      // Add index_id to each result
      const resultsWithIndexId = (responseData.data as SearchResult[]).map((result: SearchResult) => ({
        ...result,
        index_id: requestIndexId || indexId
      }));

      // Return the search results as a JSON response
      const responsePayload = {
        pageInfo: {
          ...responseData.page_info,
          total_results: responseData.page_info?.total_results || 0,
        },
        textSearchResults: resultsWithIndexId,
      };

      console.log('🔍 > GET > Final response payload:', {
        pageInfo: responsePayload.pageInfo,
        resultCount: responsePayload.textSearchResults.length
      });

      return NextResponse.json(responsePayload);
    } catch (axiosError: unknown) {
      console.error("🔍 > Search Retrieve API > Axios error:",
        axios.isAxiosError(axiosError) ? axiosError.response?.status : 'unknown status',
        axios.isAxiosError(axiosError) ? axiosError.response?.data : 'unknown data'
      );
      throw axiosError;
    }
  } catch (error: unknown) {
    console.error("Error in GET handler:",
      axios.isAxiosError(error) ? error.response?.data : error
    );
    const status = axios.isAxiosError(error) ? error.response?.status || 500 : 500;
    const message = axios.isAxiosError(error)
      ? error.response?.data?.message || error.message
      : error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json({ error: message }, { status });
  }
}