import { IndexResponse } from "@/types";
import { NextResponse } from "next/server";

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

export async function GET(
  req: Request,
  context: { params: Promise<{ indexId: string }> }
) {
  const params = await context.params;
  const indexId = params.indexId;


  if (!indexId) {
    return NextResponse.json(
      { error: "indexId is required" },
      { status: 400 }
    );
  }


  if (!API_KEY || !TWELVELABS_API_BASE_URL) {
    return NextResponse.json(
      { error: "API credentials not configured" },
      { status: 500 }
    );
  }

  // Base URL
  const url = `${TWELVELABS_API_BASE_URL}/indexes/${indexId}`;

  const options = {
    method: "GET",
    headers: {
      "x-api-key": `${API_KEY}`,
      "Accept": "application/json"
    },
  };

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      console.error(`API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch video data: ${response.statusText}` },
        { status: response.status }
      );
    }

    const indexData: IndexResponse = await response.json();
    return NextResponse.json(indexData);

  } catch (e) {
    console.error('Error fetching video details:', e);
    return NextResponse.json(
      { error: `Failed to fetch or process video data: ${e instanceof Error ? e.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}