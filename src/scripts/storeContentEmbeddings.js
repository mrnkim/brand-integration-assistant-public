import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.TWELVELABS_API_KEY;
const API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;
const CONTENT_INDEX_ID = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID;

if (!API_KEY || !API_BASE_URL) {
  console.error(
    "❌ API_KEY or API_BASE_URL is not set. please check .env file"
  );
  process.exit(1);
}

if (!CONTENT_INDEX_ID) {
  console.error(
    "❌ CONTENT_INDEX_ID is not set. please check .env file"
  );
  process.exit(1);
}

// get all content videos
async function fetchAllVideos() {
  const allVideos = [];
  let currentPage = 1;
  let totalPages = 1;

  do {
    try {
      console.log(`🔄 getting page ${currentPage}...`);

      const response = await fetch(
        `${API_BASE_URL}/indexes/${CONTENT_INDEX_ID}/videos?page=${currentPage}&page_limit=10`,
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
        console.error(`response text: ${errorText}`);
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
      console.error(`❌ 페이지 ${currentPage} 가져오기 오류:`, error);
      break;
    }
  } while (currentPage <= totalPages);

  console.log(`📋 got ${allVideos.length} content videos`);
  return allVideos;
}

// get video embedding
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
        `embedding data for video ${videoId} is empty or invalid`
      );
    }

    console.log(
      `✅ completed getting embedding for video ${videoId}. found ${data.embedding.video_embedding.segments.length} segments`
    );

    return data;
  } catch (error) {
    console.error(`❌ error getting embedding for video ${videoId}:`, error);
    return null;
  }
}

// store embedding in Pinecone
async function storeEmbeddingInPinecone(
  videoId,
  videoName,
  videoData,
  indexId
) {
  try {
    console.log(`📝 storing embedding for video ${videoId} in Pinecone...`);

    const formattedEmbedding = {
      video_embedding: {
        segments: videoData.embedding.video_embedding.segments,
      },
      system_metadata: videoData.system_metadata || {},
    };

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
      console.error(`API response error: ${errorText}`);
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

// check embedding processing status
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

// main function
async function main() {
  try {
    const videos = await fetchAllVideos();

    console.log(
      `🎬 starting to store embeddings for ${videos.length} videos`
    );

    let processedCount = 0;
    let successCount = 0;
    let skipCount = 0;

    for (const video of videos) {
      try {
        processedCount++;
        console.log(
          `\n🎥 [${processedCount}/${videos.length}] processing video ${video._id}...`
        );

        const status = await checkProcessingStatus(video._id, CONTENT_INDEX_ID);

        if (status.processed) {
          console.log(
            `⏭️ video ${video._id} is already processed. skipping...`
          );
          skipCount++;
          continue;
        }

        const videoData = await fetchVideoEmbedding(
          video._id,
          CONTENT_INDEX_ID
        );

        if (!videoData) {
          console.log(
            `⚠️ failed to get embedding data for video ${video._id}. skipping...`
          );
          continue;
        }

        const videoName =
          videoData.system_metadata?.filename ||
          videoData.system_metadata?.video_title ||
          `video_${video._id}.mp4`;

        console.log(`🏷️ video name: ${videoName}`);

        // store embedding
        const success = await storeEmbeddingInPinecone(
          video._id,
          videoName,
          videoData,
          CONTENT_INDEX_ID
        );

        if (success) {
          successCount++;
          console.log(`🎉 completed storing embedding for video ${video._id}`);
        }
      } catch (error) {
        console.error(`❌ error processing video ${video._id}:`, error);
      }

      console.log(
        `\n📊 progress: ${processedCount}/${videos.length} completed`
      );
      console.log(
        `✅ success: ${successCount} | ⏭️ skipped: ${skipCount} | ❌ failed: ${
          processedCount - successCount - skipCount
        }`
      );

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

main().catch((error) => {
  console.error("❌ error running script:", error);
  process.exit(1);
});
