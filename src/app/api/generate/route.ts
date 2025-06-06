import { NextResponse } from 'next/server';

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

export const maxDuration = 60;

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get("videoId");
    const prompt =
    `You are a marketing assistant specialized in generating hashtags for video content.

Based on the input video metadata, generate a list of 5 to 10 relevant hashtags.

**Each of the following categories must be represented by at least one hashtag:**

- Demographics Gender
- Demographics Age
- Sector
- Emotion
- Location
- Mentioned Brands

**Instructions:**

1. Use only the values provided in each category.
2. Do not invent new hashtags. Only use values from the inputs.
3. Hashtags must be lowercase, contain no spaces, and be prefixed with \`#\`.
4. Do not output any explanations or category names—only return the final hashtag list.

---

**Input Example:**

Demographics Gender: female

Demographics Age: 25-34

Sector: beauty

Emotion: uplifting

Location: seoul

Mentioned Brands: fentybeauty

---

**Allowed Options:**

Demographics Gender: Male, Female

Demographics Age: 18-25, 25-34, 35-44, 45-54, 55+

Sector: Beauty, Fashion, Tech, Travel, CPG, Food & Bev, Retail

Emotion: happy/positive, exciting, relaxing, inspiring, serious, festive, calm

Location: any real-world location

Mentioned Brands: any mentioned brands in the input`

    if (!videoId) {
      return NextResponse.json(
        { error: "videoId is required" },
        { status: 400 }
      );
    }

    if (!API_KEY || !TWELVELABS_API_BASE_URL) {
      console.error('Missing API key or base URL in environment variables');
      return NextResponse.json(
        { error: "Missing API key or base URL in environment variables" },
        { status: 500 }
      );
    }

    const url = `${TWELVELABS_API_BASE_URL}/generate`;
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
        },
        body: JSON.stringify({
            prompt: prompt,
            video_id: videoId,
            stream: false
        })
    };

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`TwelveLabs API error (${response.status}): ${errorText}`);

        // Return the actual error from the API
        return NextResponse.json(
          { error: `TwelveLabs API error (${response.status}): ${errorText}` },
          { status: response.status }
        );
      }

      const responseText = await response.text();

      if (!responseText) {
        throw new Error("Empty response from API");
      }

      const data = JSON.parse(responseText);

      // Return the complete data object instead of just data.data
      return NextResponse.json(data, { status: 200 });
    } catch (error) {
      console.error("Error in GET function:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Internal Server Error" },
        { status: 500 }
      );
    }
}

