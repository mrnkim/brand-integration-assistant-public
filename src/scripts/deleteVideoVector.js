// 특정 비디오의 Pinecone 벡터 삭제 스크립트
import { Pinecone } from "@pinecone-database/pinecone";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// 커맨드 라인 인수 파싱
const args = process.argv.slice(2);
let videoId = null;
let indexId = null;

// 인수 확인
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--videoId" && i + 1 < args.length) {
    videoId = args[i + 1];
    i++;
  } else if (args[i] === "--indexId" && i + 1 < args.length) {
    indexId = args[i + 1];
    i++;
  }
}


// 값 확인
if (!videoId || !indexId) {
  console.error("❌ Error: videoId와 indexId가 필요합니다.");
  process.exit(1);
}

// API 및 서버 URL
const API_SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";

// Pinecone API 키와 인덱스 가져오기
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX || "footages";

if (!PINECONE_API_KEY) {
  console.error("❌ Error: PINECONE_API_KEY가 정의되지 않았습니다.");
  process.exit(1);
}

async function deleteVideoVector() {
  try {
    // 1. API 서버를 통해 삭제 시도 (더 안전한 방법)
    console.log(`💻 trying to delete video vector from API server...`);

    try {
      const response = await fetch(`${API_SERVER_URL}/api/vectors/reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoId,
          indexId,
          resetAll: false,
        }),
      });

      if (response.ok) {
        const result = await response.json();

        if (result.success) {
          console.log(
            `✅ Successfully deleted video vector from API server: ${result.message}`
          );
          return;
        } else {
          console.warn(
            `⚠️ API server response is successful but video vector deletion failed: ${
              result.error || "Unknown error"
            }`
          );
          console.log(`🔄 trying to delete video vector from Pinecone directly...`);
        }
      } else {
        console.warn(
          `⚠️ API 서버 응답 실패: ${response.status} ${response.statusText}`
        );
        console.log(`🔄 trying to delete video vector from Pinecone directly...`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to connect to API server: ${error.message}`);
      console.log(`🔄 trying to delete video vector from Pinecone directly...`);
    }

    // 2. 직접 Pinecone에 연결하여 삭제 (백업 방법)
    console.log(`🔌 initializing Pinecone client...`);

    // Pinecone 클라이언트 초기화
    const pinecone = new Pinecone({
      apiKey: PINECONE_API_KEY,
    });

    const index = pinecone.Index(PINECONE_INDEX);

    // 필터 생성
    const filter = {
      tl_video_id: videoId,
    };

    console.log(`🗑️ deleting video vector from Pinecone using filter:`, filter);

    // deleteMany는 필터와 일치하는 모든 벡터를 삭제
    const deleteResult = await index.deleteMany({ filter });

    console.log(`✅ Successfully deleted video vector from Pinecone`);
    console.log(`📊 Deletion result:`, deleteResult);
  } catch (error) {
    console.error(`❌ Error occurred while deleting video vector:`, error);
    process.exit(1);
  }
}

// 스크립트 실행
deleteVideoVector().catch((error) => {
  console.error(`❌ Unexpected error occurred:`, error);
  process.exit(1);
});
