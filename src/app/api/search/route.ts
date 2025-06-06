import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import FormData from "form-data";
import { SearchResult } from "@/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {

    const apiKey = process.env.TWELVELABS_API_KEY;

    const body = await request.json();

    const { textSearchQuery, indexId: requestIndexId, page = 1, page_size = 10, offset = 0 } = body;

    // Use indexId from request if provided, otherwise use from env
    const indexId = requestIndexId || process.env.NEXT_PUBLIC_CONTENT_INDEX_ID;

    if (!apiKey || !indexId) {
      return NextResponse.json(
        { error: "API key or Index ID is not set" },
        { status: 500 }
      );
    }

    if (!textSearchQuery || textSearchQuery.trim() === '') {
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
    searchDataForm.append("adjust_confidence_level", 0.6);

    // Add pagination parameters if provided
    searchDataForm.append("page", page.toString());
    searchDataForm.append("page_size", page_size.toString());
    if (offset > 0) {
      searchDataForm.append("offset", offset.toString());
    }

    const url = "https://api.twelvelabs.io/v1.3/search";

    try {
      const response = await axios.post(url, searchDataForm, {
        headers: {
          "Content-Type": "multipart/form-data",
          "x-api-key": `${apiKey}`,
        },
      });

      const responseData = response.data;

      if (!responseData) {
        return NextResponse.json(
          { error: "Error getting response from the API" },
          { status: 500 }
        );
      }

      // Add index_id to each result if not already present
      const resultsWithIndexId = (responseData.data as SearchResult[]).map((result: SearchResult) => ({
        ...result,
        index_id: requestIndexId || indexId  // IMPORTANT: Use the requested indexId, not result.index_id
      }));

      // Return the search results as a JSON response
      const responsePayload = {
        pageInfo: {
          ...responseData.page_info,
          total_results: responseData.page_info?.total_results || 0,
        },
        textSearchResults: resultsWithIndexId,
      };

      return NextResponse.json(responsePayload);
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