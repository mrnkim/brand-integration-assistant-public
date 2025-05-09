import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export const runtime = "nodejs";

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

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const pageToken = params.token;
    console.log('🔍 > Search Retrieve API > Received request for token:', pageToken);

    const apiKey = process.env.TWELVELABS_API_KEY;

    if (!apiKey) {
      console.log('🔍 > Search Retrieve API > Missing API key');
      return NextResponse.json(
        { error: "API key is not set" },
        { status: 500 }
      );
    }

    if (!pageToken) {
      console.log('🔍 > Search Retrieve API > Missing page token');
      return NextResponse.json(
        { error: "Page token is required" },
        { status: 400 }
      );
    }

    const url = `https://api.twelvelabs.io/v1.3/search/${pageToken}`;

    console.log('🔍 > GET > Retrieving page with token:', pageToken);

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

      // Add index_id to each result if not already present (using the one from search_pool)
      const indexId = responseData.search_pool?.index_id;
      const resultsWithIndexId = (responseData.data as SearchResult[]).map((result: SearchResult) => ({
        ...result,
        index_id: result.index_id || indexId
      }));

      // Return the search results as a JSON response
      return NextResponse.json({
        pageInfo: responseData.page_info || {},
        textSearchResults: resultsWithIndexId,
      });
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