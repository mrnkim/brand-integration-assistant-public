// Content 비디오 태그 생성 스크립트
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// API 엔드포인트와 키 설정
const API_KEY = process.env.TWELVELABS_API_KEY;
const API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;
const CONTENT_INDEX_ID = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID;

// API 키와 인덱스 ID 확인
if (!API_KEY || !API_BASE_URL) {
  console.error(
    "❌ API_KEY 또는 API_BASE_URL이 설정되지 않았습니다. .env 파일을 확인하세요."
  );
  process.exit(1);
}

if (!CONTENT_INDEX_ID) {
  console.error(
    "❌ CONTENT_INDEX_ID가 설정되지 않았습니다. .env 파일을 확인하세요."
  );
  process.exit(1);
}

console.log("🚀 Content 비디오 태그 생성 스크립트 시작...");
console.log(`👉 CONTENT_INDEX_ID: ${CONTENT_INDEX_ID}`);
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

  console.log("📑 모든 content 비디오를 가져오는 중...");

  do {
    try {
      console.log(`🔄 페이지 ${currentPage} 가져오는 중...`);

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

  console.log(`📋 총 ${allVideos.length}개의 content 비디오를 가져왔습니다.`);
  return allVideos;
}

// 해시태그 생성
async function generateMetadata(videoId) {
  try {
    console.log(`🔍 비디오 ${videoId}의 메타데이터 생성 중...`);

    const url = `${API_BASE_URL}/generate`;
    const prompt = `You are a marketing assistant specialized in generating hashtags for video content.

Based on the input video metadata, generate a list of 5 to 10 relevant hashtags.

**Each of the following categories must be represented by at least one hashtag:**

- Demographics
- Sector
- Emotion
- Location
- Mentioned Brands

**Instructions:**

1. Use only the values provided in each category.
2. Do not invent new hashtags. Only use values from the inputs.
3. Hashtags must be lowercase, contain no spaces, and be prefixed with \`#\`.
4. Do not output any explanations or category names—only return the final hashtag list.

---

**Input Example:**

Demographics: woman

Sector: beauty

Emotion: uplifting

Location: seoul

Mentioned Brands: fentybeauty

---

**Allowed Options:**

Demographics: Male, Female, 18-25, 25-34, 35-44, 45-54, 55+

Sector: Beauty, Fashion, Tech, Travel, CPG, Food & Bev, Retail

Emotion: happy/positive, exciting, relaxing, inspiring, serious, festive, calm

Location: any real-world location

Mentioned Brands: any mentioned brands in the input`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify({
        prompt: prompt,
        video_id: videoId,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Network response was not ok: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = await response.json();
    console.log(`✅ 비디오 ${videoId}의 메타데이터 생성 완료`);
    return data.data || "";
  } catch (error) {
    console.error(`❌ 비디오 ${videoId}의 메타데이터 생성 오류:`, error);
    return "";
  }
}

// 해시태그 파싱
function parseHashtags(hashtagText) {
  // 해시태그 문자열에서 메타데이터 추출
  const metadata = {
    source: "",
    sector: "",
    emotions: "",
    brands: "",
    locations: "",
    demographics: "",
  };

  // 개행문자(\n)를 공백으로 대체하여 일관된 분할 처리
  const cleanText = hashtagText.replace(/\n/g, " ");
  const hashtags = cleanText.split(/\s+/).filter((tag) => tag.startsWith("#"));

  // 각 카테고리별 태그를 수집하기 위한 객체
  const categoryTags = {
    demographics: [],
    sector: [],
    emotions: [],
    locations: [],
    brands: [],
  };

  // 카테고리별 키워드 (모두 소문자로 정의)
  const demographicsKeywords = [
    "male",
    "female",
    "18-25",
    "25-34",
    "35-44",
    "45-54",
    "55+",
  ];
  const sectorKeywords = [
    "beauty",
    "fashion",
    "tech",
    "travel",
    "cpg",
    "food",
    "bev",
    "retail",
  ];
  const emotionKeywords = [
    "happy",
    "positive",
    "happypositive",
    "happy/positive",
    "exciting",
    "relaxing",
    "inspiring",
    "serious",
    "festive",
    "calm",
    "determined",
  ];

  // 특정 위치 키워드 - 이것들이 나오면 확실하게 위치로 분류
  const locationKeywords = [
    "seoul",
    "dubai",
    "doha",
    "newyork",
    "new york",
    "paris",
    "tokyo",
    "london",
    "berlin",
    "lasvegas",
    "las vegas",
    "france",
    "korea",
    "qatar",
    "uae",
    "usa",
    "bocachica",
    "bocachicabeach",
    "marathon",
  ];

  // 특정 브랜드 키워드 - 이것들이 나오면 확실하게 브랜드로 분류
  const brandKeywords = [
    "fentybeauty",
    "adidas",
    "nike",
    "spacex",
    "apple",
    "microsoft",
    "google",
    "amazon",
    "ferrari",
    "heineken",
    "redbullracing",
    "redbull",
    "sailgp",
    "fifaworldcup",
    "fifa",
    "tourdefrance",
    "nttdata",
    "oracle",
  ];

  for (const tag of hashtags) {
    const cleanTag = tag.slice(1).toLowerCase(); // # 제거 및 소문자 변환

    // 인구통계 확인 - 인구통계는 demographics 필드에 저장
    if (demographicsKeywords.includes(cleanTag)) {
      categoryTags.demographics.push(cleanTag);
      continue;
    }

    // 섹터 확인
    if (sectorKeywords.includes(cleanTag)) {
      categoryTags.sector.push(cleanTag);
      continue;
    }

    // 감정 확인
    if (emotionKeywords.includes(cleanTag)) {
      categoryTags.emotions.push(cleanTag);
      continue;
    }

    // 위치 키워드 확인
    if (locationKeywords.includes(cleanTag)) {
      categoryTags.locations.push(cleanTag);
      continue;
    }

    // 브랜드 키워드 확인
    if (brandKeywords.includes(cleanTag)) {
      categoryTags.brands.push(cleanTag);
      continue;
    }
  }

  // 아직 분류되지 않은 태그들 처리
  const unclassifiedTags = hashtags.filter((tag) => {
    const cleanTag = tag.slice(1).toLowerCase();
    return (
      !demographicsKeywords.includes(cleanTag) &&
      !sectorKeywords.includes(cleanTag) &&
      !emotionKeywords.includes(cleanTag) &&
      !locationKeywords.includes(cleanTag) &&
      !brandKeywords.includes(cleanTag)
    );
  });

  // 아직 분류되지 않은 태그가 있고, locations가 비어있으면 첫 번째 태그를 locations로 간주
  if (unclassifiedTags.length > 0 && categoryTags.locations.length === 0) {
    categoryTags.locations.push(unclassifiedTags[0].slice(1).toLowerCase());
    unclassifiedTags.shift();
  }

  // 아직 분류되지 않은 태그가 있고, brands가 비어있으면 다음 태그를 brands로 간주
  if (unclassifiedTags.length > 0 && categoryTags.brands.length === 0) {
    categoryTags.brands.push(unclassifiedTags[0].slice(1).toLowerCase());
  }

  // 각 카테고리 태그를 쉼표로 구분된 문자열로 변환
  for (const category in categoryTags) {
    if (categoryTags[category].length > 0) {
      metadata[category] = categoryTags[category].join(", ");
    }
  }

  return metadata;
}

// 메타데이터 업데이트
async function updateVideoMetadata(videoId, indexId, metadata) {
  try {
    console.log(`📝 비디오 ${videoId}의 메타데이터 업데이트 중...`);

    const url = `${API_BASE_URL}/indexes/${indexId}/videos/${videoId}`;

    const requestBody = {
      user_metadata: {
        source: metadata.source || "",
        sector: metadata.sector || "",
        emotions: metadata.emotions || "",
        brands: metadata.brands || "",
        locations: metadata.locations || "",
        demographics: metadata.demographics || "",
      },
    };

    console.log("업데이트할 메타데이터:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    console.log(`✅ 비디오 ${videoId}의 메타데이터 업데이트 완료`);
    return true;
  } catch (error) {
    console.error(`❌ 비디오 ${videoId}의 메타데이터 업데이트 오류:`, error);
    return false;
  }
}

// 비디오 상세 정보 가져오기
async function fetchVideoDetails(videoId, indexId) {
  try {
    console.log(`🔍 비디오 ${videoId}의 상세 정보 가져오는 중...`);

    const response = await fetch(
      `${API_BASE_URL}/indexes/${indexId}/videos/${videoId}`,
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
    console.log(`✅ 비디오 ${videoId}의 상세 정보 가져오기 완료`);
    return data;
  } catch (error) {
    console.error(`❌ 비디오 ${videoId}의 상세 정보 가져오기 오류:`, error);
    throw error;
  }
}

// 메인 실행 함수
async function main() {
  try {
    // 모든 비디오 가져오기
    const videos = await fetchAllVideos();

    console.log(
      `🎬 총 ${videos.length}개의 비디오에 대해 태그 생성을 시작합니다...`
    );

    let processedCount = 0;
    let successCount = 0;
    let skipCount = 0;

    // 각 비디오에 대해 태그 생성 및 저장
    for (const video of videos) {
      try {
        processedCount++;
        console.log(
          `\n🎥 [${processedCount}/${videos.length}] 비디오 ${video._id} 처리 중...`
        );

        // 이미 태그가 있는지 확인
        const videoDetails = await fetchVideoDetails(
          video._id,
          CONTENT_INDEX_ID
        );

        if (
          videoDetails.user_metadata &&
          Object.keys(videoDetails.user_metadata).length > 0 &&
          (videoDetails.user_metadata.sector ||
            videoDetails.user_metadata.emotions)
        ) {
          console.log(
            `⏭️ 비디오 ${video._id}는 이미 태그가 있습니다. 건너뜁니다.`
          );
          console.log(
            `   기존 태그:`,
            JSON.stringify(videoDetails.user_metadata, null, 2)
          );
          skipCount++;
          continue;
        }

        // 태그 생성
        const hashtagText = await generateMetadata(video._id);

        if (!hashtagText) {
          console.log(
            `⚠️ 비디오 ${video._id}에 대한 태그 생성에 실패했습니다. 건너뜁니다.`
          );
          continue;
        }

        // 태그 파싱
        const metadata = parseHashtags(hashtagText);
        console.log(`📋 생성된 메타데이터:`, metadata);

        // 태그 저장
        const success = await updateVideoMetadata(
          video._id,
          CONTENT_INDEX_ID,
          metadata
        );

        if (success) {
          successCount++;
          console.log(`🎉 비디오 ${video._id}의 태그 생성 및 저장 완료!`);
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

    console.log(`\n🎉 태그 생성 작업이 완료되었습니다!`);
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
