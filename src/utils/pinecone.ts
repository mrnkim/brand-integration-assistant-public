import { Pinecone } from '@pinecone-database/pinecone';

// API 키와 인덱스 이름 확인
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX;

// Pinecone 클라이언트 생성
let pineconeClient: Pinecone | null = null;

const initPinecone = () => {
  if (pineconeClient) return pineconeClient;

  if (!PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY is not defined');
  }

  console.log('Initializing Pinecone client with API key');
  pineconeClient = new Pinecone({
    apiKey: PINECONE_API_KEY,
  });

  return pineconeClient;
};

// Pinecone 클라이언트 반환
export const getPineconeClient = () => {
  return initPinecone();
};

// Pinecone 인덱스 반환
export const getPineconeIndex = () => {
  const client = initPinecone();

  if (!PINECONE_INDEX) {
    throw new Error('PINECONE_INDEX is not defined');
  }

  console.log(`Getting Pinecone index: ${PINECONE_INDEX}`);
  return client.Index(PINECONE_INDEX);
};