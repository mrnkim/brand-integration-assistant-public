// 모든 Pinecone 벡터 삭제 스크립트
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
dotenv.config();

async function resetPineconeIndex() {
  // 환경 변수에서 Pinecone API 키와 인덱스 가져오기
  const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
  const PINECONE_INDEX = process.env.PINECONE_INDEX || "footages";

  if (!PINECONE_API_KEY) {
    console.error("PINECONE_API_KEY is not defined");
    process.exit(1);
  }

  try {
    // Pinecone 클라이언트 초기화
    const pinecone = new Pinecone({
      apiKey: PINECONE_API_KEY,
    });

    console.log(`Connecting to index: ${PINECONE_INDEX}`);
    const index = pinecone.Index(PINECONE_INDEX);

    // 모든 벡터 삭제
    console.log("Deleting all vectors from the index...");
    await index.deleteAll();

    console.log("✅ Successfully deleted all vectors!");
  } catch (error) {
    console.error("Error resetting Pinecone index:", error);
    process.exit(1);
  }
}

// 스크립트 실행
resetPineconeIndex().catch(console.error);

//cd /Users/Miranda/twelveLabs/brand-integration-assistant && node src/scripts/resetPinecone.js