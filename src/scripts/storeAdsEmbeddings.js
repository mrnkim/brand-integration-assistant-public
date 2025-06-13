import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.TWELVELABS_API_KEY;
const API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;
const ADS_INDEX_ID = process.env.NEXT_PUBLIC_ADS_INDEX_ID;

if (!API_KEY || !API_BASE_URL) {
  console.error(
    "❌ API_KEY or API_BASE_URL is not set. please check .env file"
  );
  process.exit(1);
}

if (!ADS_INDEX_ID) {
  console.error(
    "❌ ADS_INDEX_ID is not set. please check .env file"
  );
  process.exit(1);
}

// get all ads videos
async function fetchAllVideos() {
  const allVideos = [];
  let currentPage = 1;
  let totalPages = 1;


  do {
    try {
      console.log(`🔄 getting page ${currentPage}...`);

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
          `✅ got ${data.data.length} videos from page ${currentPage}`
        );

        // 페이지 정보 업데이트
        if (data.page_info) {
          currentPage++;
          totalPages = data.page_info.total_page || 1;
          console.log(
            `📊 got ${currentPage - 1} pages out of ${totalPages} total pages`
          );
        } else {
          break;
        }
      } else {
        console.log("⚠️ video data is empty or invalid");
        console.log("response data:", JSON.stringify(data, null, 2));
        break;
      }
    } catch (error) {
      console.error(`❌ error getting page ${currentPage}:`, error);
      break;
    }
  } while (currentPage <= totalPages);

  console.log(`📋 got ${allVideos.length} ads videos`);
  return allVideos;
}

// 비디오 임베딩 가져오기
async function fetchVideoEmbedding(videoId, indexId) {
  try {
    console.log(`🔍 getting embedding for video ${videoId}...`);

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
      `✅ completed getting embedding for video ${videoId}. found ${data.embedding.video_embedding.segments.length} segments`
    );

    // 디버깅: 첫 번째 세그먼트 구조 확인
    if (data.embedding.video_embedding.segments.length > 0) {
      const firstSegment = data.embedding.video_embedding.segments[0];
      console.log(`🔍 first segment structure:`, Object.keys(firstSegment));
      if (firstSegment.float) {
        console.log(`  - float array length: ${firstSegment.float.length}`);
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
    console.log(`📝 storing embedding for video ${videoId} in Pinecone...`);

    // 데이터 구조를 벡터 저장 API에 맞게 조정
    const formattedEmbedding = {
      video_embedding: {
        segments: videoData.embedding.video_embedding.segments,
      },
      system_metadata: videoData.system_metadata || {},
    };

    // 첫 번째 세그먼트 데이터를 자세히 출력
    if (formattedEmbedding.video_embedding.segments.length > 0) {
      console.log(`📊 adjusted embedding data structure:`, {
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
    console.log(`✅ completed storing embedding for video ${videoId}: ${result.message}`);
    return true;
  } catch (error) {
    console.error(`❌ error storing embedding for video ${videoId}:`, error);
    return false;
  }
}

// 임베딩 처리 상태 확인
async function checkProcessingStatus(videoId, indexId) {
  try {
    console.log(`🔍 checking processing status for video ${videoId}...`);

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
      console.error(`error checking processing status for video ${videoId}: ${errorText}`);
      return { processed: false, error: errorText };
    }

    const status = await response.json();
    console.log(
      `✅ processing status for video ${videoId}: ${
        status.processed ? "processed" : "not processed"
      }`
    );
    return status;
  } catch (error) {
    console.error(`❌ error checking processing status for video ${videoId}:`, error);
    return { processed: false, error: error.message };
  }
}

// 메인 실행 함수
async function main() {
  try {
    // 모든 비디오 가져오기
    const videos = await fetchAllVideos();

    console.log(
      `🎬 starting to store embeddings for ${videos.length} videos`
    );

    let processedCount = 0;
    let successCount = 0;
    let skipCount = 0;

    // 각 비디오에 대해 임베딩 가져오기 및 저장
    for (const video of videos) {
      try {
        processedCount++;
        console.log(
          `\n🎥 [${processedCount}/${videos.length}] processing video ${video._id}...`
        );

        // 이미 처리된 상태인지 확인
        const status = await checkProcessingStatus(video._id, ADS_INDEX_ID);

        if (status.processed) {
          console.log(
            `⏭️ video ${video._id} is already processed. skipping...`
          );
          skipCount++;
          continue;
        }

        // 임베딩 가져오기
        const videoData = await fetchVideoEmbedding(video._id, ADS_INDEX_ID);

        if (!videoData) {
          console.log(
            `⚠️ failed to get embedding data for video ${video._id}. skipping...`
          );
          continue;
        }

        // 비디오 파일 이름 결정
        const videoName =
          videoData.system_metadata?.filename ||
          videoData.system_metadata?.video_title ||
          `video_${video._id}.mp4`;

        console.log(`🏷️ video name: ${videoName}`);

        // 임베딩 저장
        const success = await storeEmbeddingInPinecone(
          video._id,
          videoName,
          videoData,
          ADS_INDEX_ID
        );

        if (success) {
          successCount++;
          console.log(`🎉 completed storing embedding for video ${video._id}`);
        }
      } catch (error) {
        console.error(`❌ error processing video ${video._id}:`, error);
      }

      // 처리 상태 출력
      console.log(
        `\n📊 progress: ${processedCount}/${videos.length} completed`
      );
      console.log(
        `✅ success: ${successCount} | ⏭️ skipped: ${skipCount} | ❌ failed: ${
          processedCount - successCount - skipCount
        }`
      );

      // API 요청 사이에 약간의 지연 추가
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`\n🎉 completed storing embeddings for ${videos.length} videos`);
    console.log(
      `📊 total: ${videos.length} | success: ${successCount} | skipped: ${skipCount} | failed: ${
        videos.length - successCount - skipCount
      }`
    );
  } catch (error) {
    console.error("❌ error running script:", error);
  }
}

// 스크립트 실행
main().catch((error) => {
  console.error("❌ error running script:", error);
  process.exit(1);
});
