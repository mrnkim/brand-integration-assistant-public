// 비디오 제목으로 Pinecone 벡터 삭제 스크립트
import { Pinecone } from "@pinecone-database/pinecone";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// 커맨드 라인 인수 파싱
const args = process.argv.slice(2);
let videoTitle = null;

// 인수 확인 - 나머지 모든 인수를 제목으로 간주
const titleArgs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--title" && i + 1 < args.length) {
    titleArgs.push(args[i + 1]);
    i++;
  } else {
    titleArgs.push(args[i]);
  }
}

// 모든 인수를 결합하여 비디오 제목 생성
videoTitle = titleArgs.join(" ");

// 사용법 안내
function printUsage() {
  console.log('Usage: node deleteVideoByTitle.js [--title] "비디오 제목"');
  console.log("");
  console.log("Options:");
  console.log("  --title   (선택사항) 이 플래그 뒤에 비디오 제목 지정");
  console.log("");
  console.log("Examples:");
  console.log(
    '  node src/scripts/deleteVideoByTitle.js "nadine lee blind dates 10 guys by type ｜ vs 1.mp4"'
  );
  console.log(
    '  node src/scripts/deleteVideoByTitle.js --title "nadine lee blind dates 10 guys by type ｜ vs 1.mp4"'
  );
}

// 값 확인
if (!videoTitle || videoTitle.trim() === "") {
  console.error("❌ Error: 비디오 제목이 필요합니다.");
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

async function deleteVideoVectorByTitle() {
  console.log(`🚀 비디오 제목으로 벡터 삭제 시작...`);
  console.log(`📋 대상 비디오 제목: "${videoTitle}"`);

  try {
    // Pinecone 클라이언트 초기화
    console.log(`🔌 Pinecone 클라이언트 초기화 중...`);
    const pinecone = new Pinecone({
      apiKey: PINECONE_API_KEY,
    });

    console.log(`🔍 인덱스 연결 중: ${PINECONE_INDEX}`);
    const index = pinecone.Index(PINECONE_INDEX);

    // 대안: Index의 describe 메서드를 사용하여 메타데이터를 살펴봄
    console.log(`🔍 인덱스 정보 가져오는 중...`);
    const indexStats = await index.describeIndexStats();
    console.log(`📊 인덱스 통계:`, JSON.stringify(indexStats, null, 2));

    // 차원 정보 확인
    let dimension = 1024; // 기본값 (오류 메시지에서 확인된 차원)
    if (indexStats.dimension) {
      dimension = indexStats.dimension;
      console.log(`✅ 인덱스 차원: ${dimension}`);
    }

    console.log(
      `\n🔍 Pinecone API를 통한 벡터 검색이 어렵습니다. Next.js API를 통해 벡터 리스트를 가져와 비디오 제목과 일치하는 항목을 찾겠습니다.`
    );

    try {
      console.log(`🔄 Next.js API 서버에 모든 벡터 조회 요청 중...`);

      // Next.js API 경로가 필요할 수 있습니다. 없으면 다음 단계로 진행
      console.log(
        `⚠️ 인덱스 내 모든 벡터를 조회할 수 있는 API 엔드포인트가 없습니다.`
      );
      console.log(`🔄 대안으로, 모든 비디오 ID로 직접 삭제를 시도합니다.`);

      console.log(
        `🔍 비디오 제목 "${videoTitle}"으로 Twelve Labs API에서 비디오 ID 찾는 중...`
      );

      // 사용자 입력 받기 - 이 방식이 가장 안전함
      console.log(
        `\n⌨️ 삭제하려는 비디오의 ID를 알고 있다면 직접 삭제할 수 있습니다.`
      );
      console.log(`🔄 deleteVideoVector.js 스크립트를 대신 사용하세요:`);
      console.log(
        `   node src/scripts/deleteVideoVector.js --videoId <비디오ID> --indexId <인덱스ID>`
      );

      // 1. API 서버를 통해 모든 비디오 검색 시도
      console.log(`\n🔍 API 서버를 통해 모든 비디오 조회 중...`);
      const adsIndexId = process.env.NEXT_PUBLIC_ADS_INDEX_ID;
      const contentIndexId = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID;

      console.log(`📋 광고 인덱스 ID: ${adsIndexId || "알 수 없음"}`);
      console.log(`📋 콘텐츠 인덱스 ID: ${contentIndexId || "알 수 없음"}`);

      // 두 개의 인덱스 모두 시도
      let foundMatchingVideo = false;

      for (const indexId of [adsIndexId, contentIndexId]) {
        if (!indexId) continue;

        console.log(`🔍 인덱스 ${indexId}에서 비디오 조회 중...`);

        try {
          // 페이지 크기를 크게 해서 모든 비디오를 가져오기
          const response = await fetch(
            `${API_SERVER_URL}/api/videos?page=1&page_limit=100&index_id=${indexId}`
          );

          if (!response.ok) {
            console.warn(
              `⚠️ 인덱스 ${indexId} 조회 실패: ${response.status} ${response.statusText}`
            );
            continue;
          }

          const data = await response.json();
          console.log(
            `✅ 인덱스 ${indexId}에서 ${
              data.data?.length || 0
            }개의 비디오를 가져왔습니다.`
          );

          if (!data.data || data.data.length === 0) {
            console.log(`⚠️ 인덱스 ${indexId}에서 비디오를 찾을 수 없습니다.`);
            continue;
          }

          // 비디오 제목과 일치하는 항목 찾기
          const searchTitle = videoTitle.toLowerCase();
          const matchingVideos = data.data.filter((video) => {
            const videoFile = video.system_metadata?.filename || "";
            const videoTitle = video.system_metadata?.video_title || "";

            return (
              videoFile.toLowerCase().includes(searchTitle) ||
              videoTitle.toLowerCase().includes(searchTitle)
            );
          });

          if (matchingVideos.length === 0) {
            console.log(
              `⚠️ 인덱스 ${indexId}에서 제목 "${videoTitle}"과 일치하는 비디오를 찾을 수 없습니다.`
            );
            continue;
          }

          console.log(
            `✅ 인덱스 ${indexId}에서 ${matchingVideos.length}개의 일치하는 비디오를 찾았습니다:`
          );

          matchingVideos.forEach((video, idx) => {
            console.log(`--- 결과 #${idx + 1} ---`);
            console.log(`ID: ${video._id}`);
            console.log(`파일명: ${video.system_metadata?.filename || "N/A"}`);
            console.log(`제목: ${video.system_metadata?.video_title || "N/A"}`);
          });

          // 벡터 삭제 확인
          console.log(
            `\n🔍 ${matchingVideos.length}개의 비디오에 대한 벡터를 삭제할 예정입니다.`
          );

          // 3초 대기 (취소할 수 있도록)
          console.log(
            `\n⚠️ 계속하려면 3초 안에 Ctrl+C를 누르세요. 그렇지 않으면 위 비디오들의 벡터가 삭제됩니다...`
          );
          await new Promise((resolve) => setTimeout(resolve, 3000));

          // 각 비디오 ID에 대해 API 호출 수행
          let totalSuccess = 0;
          for (const video of matchingVideos) {
            const videoId = video._id;
            console.log(`🗑️ 비디오 ID: ${videoId}에 대한 벡터 삭제 중...`);

            try {
              const response = await fetch(
                `${API_SERVER_URL}/api/vectors/reset`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    videoId,
                    indexId,
                    resetAll: false,
                  }),
                }
              );

              if (response.ok) {
                const result = await response.json();

                if (result.success) {
                  console.log(
                    `✅ 비디오 ID: ${videoId} 벡터 삭제 성공: ${result.message}`
                  );
                  totalSuccess++;
                } else {
                  console.warn(
                    `⚠️ 비디오 ID: ${videoId} 벡터 삭제 실패: ${
                      result.error || "Unknown error"
                    }`
                  );
                }
              } else {
                console.warn(
                  `⚠️ 비디오 ID: ${videoId} 벡터 삭제 실패: ${response.status} ${response.statusText}`
                );
              }
            } catch (err) {
              console.error(`❌ 비디오 ID: ${videoId} 벡터 삭제 중 오류:`, err);
            }
          }

          console.log(
            `\n🎉 인덱스 ${indexId} 작업 완료! 총 ${totalSuccess}/${matchingVideos.length}개의 벡터 삭제 성공!`
          );
          foundMatchingVideo = true;
        } catch (error) {
          console.error(`❌ 인덱스 ${indexId} 조회 중 오류:`, error);
        }
      }

      if (!foundMatchingVideo) {
        console.warn(
          `⚠️ 어떤 인덱스에서도 제목 "${videoTitle}"과 일치하는 비디오를 찾을 수 없습니다.`
        );
      }
    } catch (error) {
      console.error(`❌ API 조회 중 오류 발생:`, error);
    }
  } catch (error) {
    console.error(`❌ 벡터 삭제 중 오류 발생:`, error);
    process.exit(1);
  }
}

// 스크립트 실행
deleteVideoVectorByTitle().catch((error) => {
  console.error(`❌ 예기치 않은 오류 발생:`, error);
  process.exit(1);
});
