// 특정 비디오 ID로 Pinecone 벡터 삭제 스크립트
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// 직접 비디오 ID 입력
const videoId = "6d9dbfed-5972-4584-b47a-5c232cfda1fa"; // nadine lee blind dates 비디오의 ID
const indexId = "6825a170e2c62de6cc1edbc1"; // CONTENT_INDEX_ID (환경 변수에서 가져온 값)

if (!videoId || !indexId) {
  console.error("❌ Error: videoId와 indexId가 필요합니다.");
  process.exit(1);
}

// API 및 서버 URL
const API_SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";

async function deleteVideoVector() {

  try {
    // API 서버를 통해 삭제 시도
    console.log(`💻 trying to delete video vector from API server...`);

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
        if (result.result) {
          console.log(`📊 Deletion result:`, JSON.stringify(result.result, null, 2));
        }
        return;
      } else {
        console.warn(
          `⚠️ API 서버 응답은 성공했지만 벡터 삭제 실패: ${
            result.error || "Unknown error"
          }`
        );
      }
    } else {
      console.warn(
        `⚠️ API 서버 응답 실패: ${response.status} ${response.statusText}`
      );
      const errorText = await response.text();
      console.warn(`응답 내용: ${errorText}`);
    }
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
