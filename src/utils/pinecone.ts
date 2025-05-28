import { Pinecone } from '@pinecone-database/pinecone';

// API 키와 인덱스 이름 확인
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX;

// Pinecone 클라이언트 생성
let pineconeClient: Pinecone | null = null;

const initPinecone = () => {
  if (pineconeClient) return pineconeClient;

  if (!PINECONE_API_KEY) {
    console.error('❌ PINECONE_API_KEY is not defined in environment variables');
    throw new Error('PINECONE_API_KEY is not defined');
  }

  // Log initialization attempt with masked API key for debugging
  const maskedKey = PINECONE_API_KEY.substring(0, 5) + '...' + PINECONE_API_KEY.substring(PINECONE_API_KEY.length - 5);
  console.log(`🔄 Initializing Pinecone client with API key: ${maskedKey}`);

  try {
    pineconeClient = new Pinecone({
      apiKey: PINECONE_API_KEY,
    });
    console.log('✅ Pinecone client initialized successfully');
    return pineconeClient;
  } catch (error) {
    console.error('❌ Error initializing Pinecone client:', error);
    throw error;
  }
};

// Pinecone 클라이언트 반환
export const getPineconeClient = () => {
  return initPinecone();
};

// Pinecone 인덱스 반환
export const getPineconeIndex = () => {
  try {
    const client = initPinecone();

    if (!PINECONE_INDEX) {
      console.error('❌ PINECONE_INDEX is not defined in environment variables');
      throw new Error('PINECONE_INDEX is not defined');
    }

    console.log(`🔍 Getting Pinecone index: ${PINECONE_INDEX}`);
    const index = client.Index(PINECONE_INDEX);
    console.log(`✅ Successfully got Pinecone index: ${PINECONE_INDEX}`);

    // Return the index for immediate use
    return index;
  } catch (error) {
    console.error('❌ Error getting Pinecone index:', error);
    throw error;
  }
};

// Check Pinecone environment and connectivity
export const checkPineconeEnvironment = () => {
  try {
    // Check environment variables
    if (!PINECONE_API_KEY) {
      return {
        success: false,
        message: 'PINECONE_API_KEY is not defined in environment variables'
      };
    }

    if (!PINECONE_INDEX) {
      return {
        success: false,
        message: 'PINECONE_INDEX is not defined in environment variables'
      };
    }

    // Environment variables are good
    return {
      success: true,
      message: 'Pinecone environment variables are properly configured',
      apiKey: PINECONE_API_KEY.substring(0, 5) + '...' + PINECONE_API_KEY.substring(PINECONE_API_KEY.length - 5),
      indexName: PINECONE_INDEX
    };
  } catch (error) {
    console.error('❌ Error checking Pinecone environment:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};