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

// 사용법 안내
function printUsage() {
  console.log(
    "Usage: node deleteVideoVector.js --videoId <videoId> --indexId <indexId>"
  );
  console.log("");
  console.log("Options:");
  console.log("  --videoId   Twelve Labs 비디오 ID");
  console.log(
    "  --indexId   Twelve Labs 인덱스 ID (광고: ADS_INDEX_ID, 콘텐츠: CONTENT_INDEX_ID)"
  );
  console.log("");
  console.log("Example:");
  console.log(
    "  node src/scripts/deleteVideoVector.js --videoId 1234abcd --indexId 5678efgh"
  );
}

// 값 확인
if (!videoId || !indexId) {
  console.error("❌ Error: videoId와 indexId가 필요합니다.");
  printUsage();
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
  console.log(`🚀 특정 비디오 벡터 삭제 시작...`);
  console.log(`📋 대상 비디오 ID: ${videoId}`);
  console.log(`📋 인덱스 ID: ${indexId}`);

  try {
    // 1. API 서버를 통해 삭제 시도 (더 안전한 방법)
    console.log(`💻 API 서버를 통해 삭제 시도...`);

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
            `✅ API 서버를 통해 비디오 벡터 삭제 요청 성공: ${result.message}`
          );
          return;
        } else {
          console.warn(
            `⚠️ API 서버 응답은 성공했지만 벡터 삭제 실패: ${
              result.error || "Unknown error"
            }`
          );
          console.log(`🔄 직접 Pinecone에 연결하여 삭제를 시도합니다...`);
        }
      } else {
        console.warn(
          `⚠️ API 서버 응답 실패: ${response.status} ${response.statusText}`
        );
        console.log(`🔄 직접 Pinecone에 연결하여 삭제를 시도합니다...`);
      }
    } catch (error) {
      console.warn(`⚠️ API 서버 연결 실패: ${error.message}`);
      console.log(`🔄 직접 Pinecone에 연결하여 삭제를 시도합니다...`);
    }

    // 2. 직접 Pinecone에 연결하여 삭제 (백업 방법)
    console.log(`🔌 Pinecone 클라이언트 초기화 중...`);

    // Pinecone 클라이언트 초기화
    const pinecone = new Pinecone({
      apiKey: PINECONE_API_KEY,
    });

    console.log(`🔍 인덱스 연결 중: ${PINECONE_INDEX}`);
    const index = pinecone.Index(PINECONE_INDEX);

    // 필터 생성
    const filter = {
      tl_video_id: videoId,
    };

    console.log(`🗑️ 필터를 사용하여 벡터 삭제 중:`, filter);

    // deleteMany는 필터와 일치하는 모든 벡터를 삭제
    const deleteResult = await index.deleteMany({ filter });

    console.log(`✅ 성공적으로 벡터 삭제 완료!`);
    console.log(`📊 삭제 결과:`, deleteResult);
  } catch (error) {
    console.error(`❌ 벡터 삭제 중 오류 발생:`, error);
    process.exit(1);
  }
}

// 스크립트 실행
deleteVideoVector().catch((error) => {
  console.error(`❌ 예기치 않은 오류 발생:`, error);
  process.exit(1);
});
