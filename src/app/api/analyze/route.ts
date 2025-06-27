import { NextResponse } from 'next/server';

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

export const maxDuration = 60;

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get("videoId");
    const prompt =
    `You are a marketing assistant specialized in generating hashtags for video content.

Based on the input video metadata, generate a list of hashtags labeled by category.

**Output Format:**
Each line must be in the format:
[Category]: [Hashtag]
(e.g., sector: #beauty)


**Allowed Values:**

Gender: Male, Female
Age: 18-25, 25-34, 35-44, 45-54, 55+
Topic: Beauty, Fashion, Tech, Travel, CPG, Food & Bev, Retail, Other
Emotions: sorrow, happiness, laughter, anger, empathy, fear, love, trust, sadness, belonging, guilt, compassion, pride

**Instructions:**

1. Use only the values provided in Allowed Values.
2. Do not invent new values except for Brands and Location. Only use values from the Allowed Values.
3. Output must contain at least one hashtag for each of the following categories:
  - Gender
  - Age
  - Topic
  - Emotions
  - Location
  - Brands

4. Do not output any explanations or category names—only return the final hashtag list.

**Output Example:**

Gender: female
Age: 25-34
Topic: beauty
Emotions: happiness
Location: Los Angeles
Brands: Fenty Beauty

---
`

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

    const url = `${TWELVELABS_API_BASE_URL}/analyze`;
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

