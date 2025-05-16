// Ads 비디오 임베딩 가져와서 Pinecone에 저장하는 스크립트
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// API 엔드포인트와 키 설정
const API_KEY = process.env.TWELVELABS_API_KEY;
const API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;
const ADS_INDEX_ID = process.env.NEXT_PUBLIC_ADS_INDEX_ID;

// API 키와 인덱스 ID 확인
if (!API_KEY || !API_BASE_URL) {
  console.error(
    "❌ API_KEY 또는 API_BASE_URL이 설정되지 않았습니다. .env 파일을 확인하세요."
  );
  process.exit(1);
}

if (!ADS_INDEX_ID) {
  console.error(
    "❌ ADS_INDEX_ID가 설정되지 않았습니다. .env 파일을 확인하세요."
  );
  process.exit(1);
}

console.log("🚀 Ads 비디오 임베딩 저장 스크립트 시작...");
console.log(`👉 ADS_INDEX_ID: ${ADS_INDEX_ID}`);
console.log(`👉 API_BASE_URL: ${API_BASE_URL}`);
console.log(
  `👉 API_KEY: ${API_KEY.substring(0, 5)}...${API_KEY.substring(
    API_KEY.length - 5
  )}`
);

// 비디오 목록 가져오기 (페이지네이션 처리)
async function fetchAllVideos() {
  const allVideos = [];
  let currentPage = 1;
  let totalPages = 1;

  console.log("📑 모든 ads 비디오를 가져오는 중...");

  do {
    try {
      console.log(`🔄 페이지 ${currentPage} 가져오는 중...`);

      const response = await fetch(
        `${API_BASE_URL}/indexes/${ADS_INDEX_ID}/videos?page=${currentPage}&page_limit=10`,
        {
          method: "GET",
          headers: {
            "x-api-key": API_KEY,
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`응답 텍스트: ${errorText}`);
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${errorText}`
        );
      }

      const data = await response.json();

      if (data && data.data && Array.isArray(data.data)) {
        allVideos.push(...data.data);
        console.log(
          `✅ 페이지 ${currentPage}에서 ${data.data.length}개의 비디오를 가져왔습니다.`
        );

        // 페이지 정보 업데이트
        if (data.page_info) {
          currentPage++;
          totalPages = data.page_info.total_page || 1;
          console.log(
            `📊 총 ${totalPages} 페이지 중 ${currentPage - 1} 페이지 완료`
          );
        } else {
          break;
        }
      } else {
        console.log("⚠️ 비디오 데이터가 없거나 형식이 올바르지 않습니다.");
        console.log("응답 데이터:", JSON.stringify(data, null, 2));
        break;
      }
    } catch (error) {
      console.error(`❌ 페이지 ${currentPage} 가져오기 오류:`, error);
      break;
    }
  } while (currentPage <= totalPages);

  console.log(`📋 총 ${allVideos.length}개의 ads 비디오를 가져왔습니다.`);
  return allVideos;
}

// 비디오 임베딩 가져오기
async function fetchVideoEmbedding(videoId, indexId) {
  try {
    console.log(`🔍 비디오 ${videoId}의 임베딩 가져오는 중...`);

    const response = await fetch(
      `${API_BASE_URL}/indexes/${indexId}/videos/${videoId}?embedding_option=visual-text&embedding_option=audio`,
      {
        method: "GET",
        headers: {
          "x-api-key": API_KEY,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (
      !data.embedding ||
      !data.embedding.video_embedding ||
      !data.embedding.video_embedding.segments
    ) {
      throw new Error(
        `비디오 ${videoId}의 임베딩 데이터가 없거나 형식이 올바르지 않습니다.`
      );
    }

    console.log(
      `✅ 비디오 ${videoId}의 임베딩 가져오기 완료. ${data.embedding.video_embedding.segments.length}개 세그먼트 발견.`
    );

    // 디버깅: 첫 번째 세그먼트 구조 확인
    if (data.embedding.video_embedding.segments.length > 0) {
      const firstSegment = data.embedding.video_embedding.segments[0];
      console.log(`🔍 첫 번째 세그먼트 구조:`, Object.keys(firstSegment));
      if (firstSegment.float) {
        console.log(`  - float 배열 길이: ${firstSegment.float.length}`);
      }
    }

    return data;
  } catch (error) {
    console.error(`❌ 비디오 ${videoId}의 임베딩 가져오기 오류:`, error);
    return null;
  }
}

// 임베딩을 Pinecone에 저장하기
async function storeEmbeddingInPinecone(
  videoId,
  videoName,
  videoData,
  indexId
) {
  try {
    console.log(`📝 비디오 ${videoId}의 임베딩을 Pinecone에 저장 중...`);

    // 데이터 구조를 벡터 저장 API에 맞게 조정
    const formattedEmbedding = {
      video_embedding: {
        segments: videoData.embedding.video_embedding.segments,
      },
      system_metadata: videoData.system_metadata || {},
    };

    // 첫 번째 세그먼트 데이터를 자세히 출력
    if (formattedEmbedding.video_embedding.segments.length > 0) {
      console.log(`📊 조정된 임베딩 데이터 구조:`, {
        segmentsCount: formattedEmbedding.video_embedding.segments.length,
        firstSegmentKeys: Object.keys(
          formattedEmbedding.video_embedding.segments[0]
        ),
      });
    }

    const response = await fetch(`http://localhost:3000/api/vectors/store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        videoId,
        videoName,
        embedding: formattedEmbedding,
        indexId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API 응답 오류 내용: ${errorText}`);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`✅ 비디오 ${videoId}의 임베딩 저장 완료: ${result.message}`);
    return true;
  } catch (error) {
    console.error(`❌ 비디오 ${videoId}의 임베딩 저장 오류:`, error);
    return false;
  }
}

// 임베딩 처리 상태 확인
async function checkProcessingStatus(videoId, indexId) {
  try {
    console.log(`🔍 비디오 ${videoId}의 처리 상태 확인 중...`);

    const response = await fetch(
      `http://localhost:3000/api/vectors/check-status?videoId=${videoId}&indexId=${indexId}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`상태 확인 API 오류: ${errorText}`);
      return { processed: false, error: errorText };
    }

    const status = await response.json();
    console.log(
      `✅ 비디오 ${videoId}의 처리 상태: ${
        status.processed ? "처리됨" : "처리되지 않음"
      }`
    );
    return status;
  } catch (error) {
    console.error(`❌ 비디오 ${videoId}의 처리 상태 확인 오류:`, error);
    return { processed: false, error: error.message };
  }
}

// 메인 실행 함수
async function main() {
  try {
    // 모든 비디오 가져오기
    const videos = await fetchAllVideos();

    console.log(
      `🎬 총 ${videos.length}개의 비디오에 대해 임베딩 저장을 시작합니다...`
    );

    let processedCount = 0;
    let successCount = 0;
    let skipCount = 0;

    // 각 비디오에 대해 임베딩 가져오기 및 저장
    for (const video of videos) {
      try {
        processedCount++;
        console.log(
          `\n🎥 [${processedCount}/${videos.length}] 비디오 ${video._id} 처리 중...`
        );

        // 이미 처리된 상태인지 확인
        const status = await checkProcessingStatus(video._id, ADS_INDEX_ID);

        if (status.processed) {
          console.log(
            `⏭️ 비디오 ${video._id}는 이미 처리되었습니다. 건너뜁니다.`
          );
          skipCount++;
          continue;
        }

        // 임베딩 가져오기
        const videoData = await fetchVideoEmbedding(video._id, ADS_INDEX_ID);

        if (!videoData) {
          console.log(
            `⚠️ 비디오 ${video._id}의 임베딩 데이터를 가져올 수 없습니다. 건너뜁니다.`
          );
          continue;
        }

        // 비디오 파일 이름 결정
        const videoName =
          videoData.system_metadata?.filename ||
          videoData.system_metadata?.video_title ||
          `video_${video._id}.mp4`;

        console.log(`🏷️ 비디오 이름: ${videoName}`);

        // 임베딩 저장 전에 비디오 데이터 구조 확인
        if (videoData.embedding) {
          console.log(
            `🔍 임베딩 데이터 최상위 키:`,
            Object.keys(videoData.embedding)
          );
          console.log(
            `🔍 video_embedding 키:`,
            videoData.embedding.video_embedding
              ? Object.keys(videoData.embedding.video_embedding)
              : "undefined"
          );
        }

        // 임베딩 저장
        const success = await storeEmbeddingInPinecone(
          video._id,
          videoName,
          videoData,
          ADS_INDEX_ID
        );

        if (success) {
          successCount++;
          console.log(`🎉 비디오 ${video._id}의 임베딩 저장 완료!`);
        }
      } catch (error) {
        console.error(`❌ 비디오 ${video._id} 처리 중 오류:`, error);
      }

      // 처리 상태 출력
      console.log(
        `\n📊 진행 상황: ${processedCount}/${videos.length} 처리 완료`
      );
      console.log(
        `✅ 성공: ${successCount} | ⏭️ 건너뜀: ${skipCount} | ❌ 실패: ${
          processedCount - successCount - skipCount
        }`
      );

      // API 요청 사이에 약간의 지연 추가
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`\n🎉 임베딩 저장 작업이 완료되었습니다!`);
    console.log(
      `📊 총 ${
        videos.length
      }개 비디오 중 ${successCount}개 성공, ${skipCount}개 건너뜀, ${
        videos.length - successCount - skipCount
      }개 실패`
    );
  } catch (error) {
    console.error("❌ 스크립트 실행 중 오류 발생:", error);
  }
}

// 스크립트 실행
main().catch((error) => {
  console.error("❌ 스크립트 실행 중 예기치 않은 오류:", error);
  process.exit(1);
});
