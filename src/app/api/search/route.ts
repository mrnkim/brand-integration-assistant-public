import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import FormData from "form-data";

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
  // For any other properties that might be present
  [key: string]: string | number | boolean | object | undefined;
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 > Search API > Received request');

    const apiKey = process.env.TWELVELABS_API_KEY;

    const body = await request.json();
    console.log('🔍 > Search API > Request body:', body);

    const { textSearchQuery, indexId: requestIndexId, page = 1, page_size = 10, offset = 0 } = body;
    console.log('🔍 > Search API > Pagination parameters:', { page, page_size, offset });

    // Use indexId from request if provided, otherwise use from env
    const indexId = requestIndexId || process.env.NEXT_PUBLIC_CONTENT_INDEX_ID;

    if (!apiKey || !indexId) {
      console.log('🔍 > Search API > Missing API key or index ID');
      return NextResponse.json(
        { error: "API key or Index ID is not set" },
        { status: 500 }
      );
    }

    if (!textSearchQuery || textSearchQuery.trim() === '') {
      console.log('🔍 > Search API > Empty search query');
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 }
      );
    }

    const searchDataForm = new FormData();
    searchDataForm.append("search_options", "visual");
    searchDataForm.append("search_options", "audio");
    searchDataForm.append("index_id", indexId);
    searchDataForm.append("query_text", textSearchQuery);

    // Add pagination parameters if provided
    searchDataForm.append("page", page.toString());
    searchDataForm.append("page_size", page_size.toString());
    if (offset > 0) {
      searchDataForm.append("offset", offset.toString());
    }

    const url = "https://api.twelvelabs.io/v1.3/search"; // API 버전 업데이트

    console.log('🔍 > POST > Searching for:', textSearchQuery);
    console.log('🔍 > POST > Index ID:', indexId);
    console.log('🔍 > POST > Pagination params being sent:', { page, page_size, offset });

    try {
      const response = await axios.post(url, searchDataForm, {
        headers: {
          "Content-Type": "multipart/form-data",
          "x-api-key": `${apiKey}`,
        },
      });

      const responseData = response.data;
      console.log("🚀 > POST > responseData=", responseData)
      console.log("🚀 > POST > Response status:", response.status);

      if (!responseData) {
        console.log('🔍 > Search API > Empty response data');
        return NextResponse.json(
          { error: "Error getting response from the API" },
          { status: 500 }
        );
      }

      console.log('🔍 > POST > Search results count:', responseData.data?.length || 0);
      console.log('🔍 > POST > Pagination info:', responseData.page_info || 'No pagination info');

      // Log first few video IDs to check for duplicates
      if (responseData.data && responseData.data.length > 0) {
        const videoIds = responseData.data.slice(0, 3).map((item: SearchResult) => item.video_id);
        console.log('🔍 > POST > Sample video IDs in results:', videoIds);
      }

      // Add index_id to each result if not already present
      const resultsWithIndexId = (responseData.data as SearchResult[]).map((result: SearchResult) => ({
        ...result,
        index_id: result.index_id || indexId  // Use the result's index_id or fall back to the one from env
      }));

      // Return the search results as a JSON response
      return NextResponse.json({
        pageInfo: responseData.page_info || {},
        textSearchResults: resultsWithIndexId,
      });
    } catch (axiosError: unknown) {
      console.error("🔍 > Search API > Axios error:",
        axios.isAxiosError(axiosError) ? axiosError.response?.status : 'unknown status',
        axios.isAxiosError(axiosError) ? axiosError.response?.data : 'unknown data'
      );
      throw axiosError;
    }
  } catch (error: unknown) {
    console.error("Error in POST handler:",
      axios.isAxiosError(error) ? error.response?.data : error
    );
    const status = axios.isAxiosError(error) ? error.response?.status || 500 : 500;
    const message = axios.isAxiosError(error)
      ? error.response?.data?.message || error.message
      : error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json({ error: message }, { status });
  }
}