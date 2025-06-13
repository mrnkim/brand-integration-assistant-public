import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { SearchResult } from "@/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const searchParams = request.nextUrl.searchParams;
    const requestIndexId = searchParams.get('indexId');

    const apiKey = process.env.TWELVELABS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is not set" },
        { status: 500 }
      );
    }

    if (!token) {
      return NextResponse.json(
        { error: "Page token is required" },
        { status: 400 }
      );
    }

    const url = `https://api.twelvelabs.io/v1.3/search/${token}`;

    try {
      const response = await axios.get(url, {
        headers: {
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

      // Determine which index ID to use - prioritize the one from request params
      const indexId = requestIndexId || responseData.search_pool?.index_id || process.env.NEXT_PUBLIC_CONTENT_INDEX_ID;

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