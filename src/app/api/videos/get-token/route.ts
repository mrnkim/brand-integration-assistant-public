import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Get API key from environment variable
    const apiKey = process.env.TWELVELABS_API_KEY;
    if (!apiKey) {
      console.error('API key not found in environment variables');
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    // Return the API key for client-side usage
    // Note: In a production environment, you might want to implement a more secure approach
    // like generating a short-lived token with limited permissions
    return NextResponse.json({ token: apiKey });
  } catch (error) {
    console.error('Error generating token:', error);
    return NextResponse.json(
      { error: 'Failed to generate token', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}