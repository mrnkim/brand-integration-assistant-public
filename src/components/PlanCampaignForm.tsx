import React, { useState, useEffect } from 'react';
import { fetchVideos, getAndStoreEmbeddings, checkProcessingStatus, resetPineconeVectors } from '@/hooks/apiHooks';
import LoadingSpinner from './LoadingSpinner';
import Video from './Video';

interface Category {
  name: string;
  label: string;
}

const categories: Category[] = [
  { name: 'sector', label: 'Sector' },
  { name: 'emotion', label: 'Emotion' },
  { name: 'brand', label: 'Brand' },
  { name: 'demographics', label: 'Demographics' },
  { name: 'location', label: 'Location' },
];

// Type for embedding process status
interface EmbeddingStatus {
  adsVideos: {
    total: number;
    processed: number;
    completed: boolean;
    category?: string;
  };
  contentVideos: {
    total: number;
    processed: number;
    completed: boolean;
    category?: string;
  };
}

// 검색 결과 타입 정의
interface SearchResult {
  metadata?: {
    tl_video_id?: string;
    video_title?: string;
    [key: string]: unknown;
  };
  score: number;
  searchTerm?: string;
  searchCategory?: string;
  method?: number;
  categories?: string[];
}

// 시각적 검색 결과 인터페이스
interface VisualSearchResult extends SearchResult {
  videoId: string;
  indexId: string;
  title: string;
}

const PlanCampaignForm: React.FC = () => {
  const [keywords, setKeywords] = useState<Record<string, string[]>>({
    sector: [],
    emotion: [],
    brand: [],
    demographics: [],
    location: [],
  });
  const [inputs, setInputs] = useState<Record<string, string>>({
    sector: '',
    emotion: '',
    brand: '',
    demographics: '',
    location: '',
  });

  // New states for embeddings processing
  const [isProcessing, setIsProcessing] = useState(false);

  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus>({
    adsVideos: { total: 0, processed: 0, completed: false },
    contentVideos: { total: 0, processed: 0, completed: false },
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Environment variables for index IDs (with fallback values)
  const adsIndexId = process.env.NEXT_PUBLIC_ADS_INDEX_ID || 'default-ads-index';
  const contentIndexId = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID || 'default-content-index';

  // Log index IDs for debugging
  console.log(`Using ads index ID: ${adsIndexId}`);
  console.log(`Using content index ID: ${contentIndexId}`);

  // Function to check embeddings when component loads
  useEffect(() => {
    checkAndProcessEmbeddings();
  }, []);

  // Function to check and process embeddings
  const checkAndProcessEmbeddings = async () => {
    console.log('### DEBUG: Starting embedding check and processing');
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // 모든 비디오 처리하도록 수정
      const allAdsVideos = [];
      const allContentVideos = [];

      // Step 1: 페이지네이션을 통해 모든 광고 비디오 가져오기
      console.log('### DEBUG: Fetching all ads videos from index:', adsIndexId);
      let currentPage = 1;
      let totalPages = 1;

      do {
        console.log(`### DEBUG: Fetching ads videos page ${currentPage}`);
        const adsVideosResponse = await fetchVideos(currentPage, adsIndexId);

        if (adsVideosResponse?.data && adsVideosResponse.data.length > 0) {
          allAdsVideos.push(...adsVideosResponse.data);
          console.log(`### DEBUG: Added ${adsVideosResponse.data.length} ads videos from page ${currentPage}`);
        }

        // 총 페이지 수 업데이트
        if (adsVideosResponse?.page_info) {
          totalPages = adsVideosResponse.page_info.total_page;
          console.log(`### DEBUG: Total ${totalPages} pages of ads videos`);
        }

        currentPage++;
      } while (currentPage <= totalPages && currentPage <= 5); // 최대 5페이지까지만 가져오기 (API 부하 제한)

      console.log(`### DEBUG: Fetched a total of ${allAdsVideos.length} ads videos`);

      // Step 2: 페이지네이션을 통해 모든 콘텐츠 비디오 가져오기
      console.log('### DEBUG: Fetching all content videos from index:', contentIndexId);
      currentPage = 1;
      totalPages = 1;

      do {
        console.log(`### DEBUG: Fetching content videos page ${currentPage}`);
        const contentVideosResponse = await fetchVideos(currentPage, contentIndexId);

        if (contentVideosResponse?.data && contentVideosResponse.data.length > 0) {
          allContentVideos.push(...contentVideosResponse.data);
          console.log(`### DEBUG: Added ${contentVideosResponse.data.length} content videos from page ${currentPage}`);
        }

        // 총 페이지 수 업데이트
        if (contentVideosResponse?.page_info) {
          totalPages = contentVideosResponse.page_info.total_page;
          console.log(`### DEBUG: Total ${totalPages} pages of content videos`);
        }

        currentPage++;
      } while (currentPage <= totalPages && currentPage <= 5); // 최대 5페이지까지만 가져오기 (API 부하 제한)

      console.log(`### DEBUG: Fetched a total of ${allContentVideos.length} content videos`);

      // 최대 50개로 제한 (과도한 처리 방지)
      const adsVideos = allAdsVideos.slice(0, 50);
      const contentVideos = allContentVideos.slice(0, 50);

      console.log(`### DEBUG: Processing ${adsVideos.length} ads videos and ${contentVideos.length} content videos`);

      // Update status with total counts
      console.log('### DEBUG: Updating UI status with video counts');
      setEmbeddingStatus({
        adsVideos: {
          total: adsVideos.length,
          processed: 0,
          completed: false,
          category: 'ad'
        },
        contentVideos: {
          total: contentVideos.length,
          processed: 0,
          completed: false,
          category: 'content'
        }
      });

      // Step 3: Process ads videos
      console.log('### DEBUG: Starting to process all ads videos');
      if (adsVideos.length > 0) {
        let processedCount = 0;

        for (const adsVideo of adsVideos) {
          console.log(`### DEBUG: Processing ads video ${adsVideo._id} (${processedCount + 1}/${adsVideos.length})`);

          try {
            // Check if embedding exists in Pinecone
            const adsProcessingStatus = await checkProcessingStatus(adsVideo._id, adsIndexId);

            if (adsProcessingStatus.processed) {
              console.log(`### DEBUG: Embedding already exists for ads video ${adsVideo._id}`);
              processedCount++;

              // Update progress
              setEmbeddingStatus(prev => ({
                ...prev,
                adsVideos: {
                  ...prev.adsVideos,
                  processed: processedCount,
                  completed: processedCount === adsVideos.length
                }
              }));

            } else {
              console.log(`### DEBUG: Embedding does not exist for ads video ${adsVideo._id}, storing it now`);

              // Store embedding
              const result = await getAndStoreEmbeddings(adsIndexId, adsVideo._id);
              console.log(`### DEBUG: Store embedding result for ads video:`, result);

              if (result.success) {
                processedCount++;
              }

              // Update progress (even if failed, we consider it "processed")
              setEmbeddingStatus(prev => ({
                ...prev,
                adsVideos: {
                  ...prev.adsVideos,
                  processed: processedCount,
                  completed: processedCount === adsVideos.length
                }
              }));
            }
          } catch (error) {
            console.error(`### DEBUG ERROR: Failed to process ads video ${adsVideo._id}:`, error);
            // Continue with next video even if this one fails
          }
        }

        // Mark ads videos as completed
        setEmbeddingStatus(prev => ({
          ...prev,
          adsVideos: {
            ...prev.adsVideos,
            completed: true
          }
        }));

      } else {
        console.log('### DEBUG: No ads videos to process');
        setEmbeddingStatus(prev => ({
          ...prev,
          adsVideos: {
            ...prev.adsVideos,
            completed: true
          }
        }));
      }

      // Step 4: Process content videos
      console.log('### DEBUG: Starting to process all content videos');
      if (contentVideos.length > 0) {
        let processedCount = 0;

        for (const contentVideo of contentVideos) {
          console.log(`### DEBUG: Processing content video ${contentVideo._id} (${processedCount + 1}/${contentVideos.length})`);

          try {
            // Check if embedding exists in Pinecone
            const contentProcessingStatus = await checkProcessingStatus(contentVideo._id, contentIndexId);

            if (contentProcessingStatus.processed) {
              console.log(`### DEBUG: Embedding already exists for content video ${contentVideo._id}`);
              processedCount++;

              // Update progress
              setEmbeddingStatus(prev => ({
                ...prev,
                contentVideos: {
                  ...prev.contentVideos,
                  processed: processedCount,
                  completed: processedCount === contentVideos.length
                }
              }));

            } else {
              console.log(`### DEBUG: Embedding does not exist for content video ${contentVideo._id}, storing it now`);

              // Store embedding
              const result = await getAndStoreEmbeddings(contentIndexId, contentVideo._id);
              console.log(`### DEBUG: Store embedding result for content video:`, result);

              if (result.success) {
                processedCount++;
              }

              // Update progress (even if failed, we consider it "processed")
              setEmbeddingStatus(prev => ({
                ...prev,
                contentVideos: {
                  ...prev.contentVideos,
                  processed: processedCount,
                  completed: processedCount === contentVideos.length
                }
              }));
            }
          } catch (error) {
            console.error(`### DEBUG ERROR: Failed to process content video ${contentVideo._id}:`, error);
            // Continue with next video even if this one fails
          }
        }

        // Mark content videos as completed
        setEmbeddingStatus(prev => ({
          ...prev,
          contentVideos: {
            ...prev.contentVideos,
            completed: true
          }
        }));

      } else {
        console.log('### DEBUG: No content videos to process');
        setEmbeddingStatus(prev => ({
          ...prev,
          contentVideos: {
            ...prev.contentVideos,
            completed: true
          }
        }));
      }

      console.log('### DEBUG: Finished all embedding processing successfully');
    } catch (error) {
      console.error('### DEBUG ERROR: Error in check and process embeddings:', error);
      setErrorMessage('Failed to process embeddings. Please try again.');
    } finally {
      console.log('### DEBUG: Setting isProcessing to false');
      setIsProcessing(false);
    }
  };

  // Add a new function to reset and reload embeddings
  const handleResetAndReload = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // 1. Reset Pinecone vectors
      console.log('Resetting all vectors in Pinecone');
      const resetResult = await resetPineconeVectors(undefined, undefined, true);

      if (!resetResult) {
        setErrorMessage('Failed to reset vectors');
        setIsProcessing(false);
        return;
      }

      console.log('Reset successful. Reloading embeddings...');

      // 2. Reload embeddings
      await checkAndProcessEmbeddings();

    } catch (error) {
      console.error('Error in reset and reload:', error);
      setErrorMessage('Failed to reset and reload embeddings');
      setIsProcessing(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, category: string) => {
    setInputs({ ...inputs, [category]: e.target.value });
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, category: string) => {
    if (e.key === 'Enter' && inputs[category].trim()) {
      e.preventDefault();
      if (!keywords[category].includes(inputs[category].trim())) {
        setKeywords({
          ...keywords,
          [category]: [...keywords[category], inputs[category].trim()],
        });
      }
      setInputs({ ...inputs, [category]: '' });
    }
  };

  const handleRemoveKeyword = (category: string, idx: number) => {
    setKeywords({
      ...keywords,
      [category]: keywords[category].filter((_, i) => i !== idx),
    });
  };

  // 검색 결과를 위한 state 업데이트
  const [searchResults, setSearchResults] = useState<{
    adsResults: VisualSearchResult[];
    contentResults: VisualSearchResult[];
    isSearchCompleted: boolean;
  }>({
    adsResults: [],
    contentResults: [],
    isSearchCompleted: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 검색 시작 시 결과 초기화
    setSearchResults({
      adsResults: [],
      contentResults: [],
      isSearchCompleted: false,
    });

    // Check if there are any keywords
    if (!Object.values(keywords).some(arr => arr.length > 0)) {
      console.log('No keywords provided for search');
      return;
    }

    // Set isProcessing true during search
    setIsProcessing(true);
    setErrorMessage(null);

    console.log('Submitted keywords:', keywords);

    try {
      // 방법 1: 모든 키워드를 하나의 쿼리 문장으로 결합
      const allKeywords = Object.entries(keywords)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .filter(([_, values]) => values.length > 0)
        .map(([category, values]) => {
          return `${category}: ${values.join(', ')}`;
        })
        .join('; ');

      console.log('Unified search query:', allKeywords);

      // 방법 1: 통합 쿼리 검색 수행
      console.log('Performing unified search with all keywords combined...');

      // Ads 인덱스 검색
      console.log(`Searching in ads index: ${adsIndexId}`);
      const adsResponse = await fetch('/api/embeddingSearch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchTerm: allKeywords,
          indexId: adsIndexId
        })
      });

      let unifiedAdsResults: SearchResult[] = [];
      if (adsResponse.ok) {
        unifiedAdsResults = await adsResponse.json();
        console.log(`Found ${unifiedAdsResults.length} ads results for unified query`);
      } else {
        console.error(`Unified ads search failed with status: ${adsResponse.status}`);
      }

      // Content 인덱스 검색
      console.log(`Searching in content index: ${contentIndexId}`);
      const contentResponse = await fetch('/api/embeddingSearch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchTerm: allKeywords,
          indexId: contentIndexId
        })
      });

      let unifiedContentResults: SearchResult[] = [];
      if (contentResponse.ok) {
        unifiedContentResults = await contentResponse.json();
        console.log(`Found ${unifiedContentResults.length} content results for unified query`);
      } else {
        console.error(`Unified content search failed with status: ${contentResponse.status}`);
      }

      // 이 부분 제거하고 통합 쿼리 결과만 사용
      console.log('\n--- ONLY USING UNIFIED QUERY RESULTS ---');
      console.log('\n--- ADS RESULTS (UNIFIED QUERY) ---');
      unifiedAdsResults.forEach((result, index) => {
        console.log(`${index + 1}. ID: ${result.metadata?.tl_video_id}, Title: ${result.metadata?.video_title}, Score: ${result.score.toFixed(4)}`);
      });

      console.log('\n--- CONTENT RESULTS (UNIFIED QUERY) ---');
      unifiedContentResults.forEach((result, index) => {
        console.log(`${index + 1}. ID: ${result.metadata?.tl_video_id}, Title: ${result.metadata?.video_title}, Score: ${result.score.toFixed(4)}`);
      });

      // 검색 결과를 시각적으로 표시할 수 있는 형태로 변환 (통합 쿼리 결과만 사용)
      const visualAdsResults: VisualSearchResult[] = unifiedAdsResults.map(result => ({
        ...result,
        videoId: result.metadata?.tl_video_id || '',
        indexId: adsIndexId,
        title: result.metadata?.video_title as string || 'Unknown Title'
      }));

      const visualContentResults: VisualSearchResult[] = unifiedContentResults.map(result => ({
        ...result,
        videoId: result.metadata?.tl_video_id || '',
        indexId: contentIndexId,
        title: result.metadata?.video_title as string || 'Unknown Title'
      }));

      // 검색 결과 업데이트 (통합 쿼리 결과만 사용)
      setSearchResults({
        adsResults: visualAdsResults,
        contentResults: visualContentResults,
        isSearchCompleted: true,
      });

    } catch (error) {
      console.error('Error performing search:', error);
      setErrorMessage('Search failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculate overall progress
  const totalVideos = embeddingStatus.adsVideos.total + embeddingStatus.contentVideos.total;
  const processedVideos = embeddingStatus.adsVideos.processed + embeddingStatus.contentVideos.processed;
  const progress = totalVideos > 0 ? Math.round((processedVideos / totalVideos) * 100) : 0;

  // Check if all processing is complete
  const isComplete = embeddingStatus.adsVideos.completed && embeddingStatus.contentVideos.completed;

  // Check if submit should be enabled
  const hasKeywords = Object.values(keywords).some(category => category.length > 0);
  console.log("🚀 > hasKeywords=", hasKeywords)
  const isSubmitEnabled = !isProcessing && isComplete && hasKeywords;

  const isProcessingText = (
    isProcessing ? (
      <div className="flex items-center gap-2">
        <LoadingSpinner size="sm" /> <span>Checking and processing embeddings...</span>
      </div>
    ) : (
      `Processed ${processedVideos} of ${totalVideos} videos (${progress}%)`
    )
  );
  console.log("🚀 > isComplete=", isComplete)

  return (
    <div style={styles.container}>
      {/* Embedding processing status - 로딩 중일 때만 보여주기 */}
      {(isProcessing || !isComplete) && (
        <div style={styles.processingBox}>
          <h3 style={styles.processingTitle}>Processing Video Embeddings</h3>

          <div style={styles.progressContainer}>
            <div style={{...styles.progressBar, width: `${progress}%`}} />
          </div>

          <div style={styles.processingText}>
            {isProcessingText}
          </div>

          <div style={styles.processingDetails}>
            <div style={styles.statusItem}>
              <strong>Ads Videos ({embeddingStatus.adsVideos.category || 'ad'}):</strong> {embeddingStatus.adsVideos.processed} of {embeddingStatus.adsVideos.total} processed
              {embeddingStatus.adsVideos.completed && ' ✓'}
            </div>
            <div style={styles.statusItem}>
              <strong>Content Videos ({embeddingStatus.contentVideos.category || 'content'}):</strong> {embeddingStatus.contentVideos.processed} of {embeddingStatus.contentVideos.total} processed
              {embeddingStatus.contentVideos.completed && ' ✓'}
            </div>
          </div>

          {errorMessage && (
            <div style={styles.errorMessage}>{errorMessage}</div>
          )}

          {/* Add reset button for testing */}
          {!isProcessing && (
            <button
              onClick={handleResetAndReload}
              style={styles.resetBtn}
              type="button"
            >
              Reset & Reload Embeddings
            </button>
          )}
        </div>
      )}

      {/* 메인 콘텐츠 영역 - 가로로 배치 */}
      <div style={styles.mainContentLayout}>
        {/* 왼쪽: 캠페인 폼 */}
        <div style={styles.formSection}>
          <form onSubmit={handleSubmit} style={styles.form}>
            <h2 style={styles.title}>Plan Campaign</h2>
            {categories.map((cat) => (
              <div key={cat.name} style={styles.categoryBox}>
                <label style={styles.label}>{cat.label}</label>
                <div style={styles.tagsContainer}>
                  {keywords[cat.name].map((kw, idx) => (
                    <span key={kw + idx} style={styles.tag}>
                      {kw}
                      <button
                        type="button"
                        style={styles.removeBtn}
                        onClick={() => handleRemoveKeyword(cat.name, idx)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={inputs[cat.name]}
                    onChange={(e) => handleInputChange(e, cat.name)}
                    onKeyDown={(e) => handleInputKeyDown(e, cat.name)}
                    placeholder={`Add ${cat.label}`}
                    style={styles.input}
                    disabled={isProcessing}
                  />
                </div>
              </div>
            ))}
            <button
              type="submit"
              style={{
                ...styles.submitBtn,
                ...(isSubmitEnabled ? {} : styles.disabledBtn)
              }}
              disabled={!isSubmitEnabled}
            >
              Submit
            </button>
          </form>
        </div>

        {/* 가운데: 추천 콘텐츠 */}
        <div style={styles.resultsColumn}>
          <h2 style={styles.columnTitle}>Recommended Content</h2>
          {searchResults.isSearchCompleted ? (
            <div style={styles.videoList}>
              {searchResults.contentResults.map((result, index) => (
                <div key={`content-${index}`} style={styles.videoCard}>
                  <Video
                    videoId={result.videoId}
                    indexId={result.indexId}
                    showTitle={true}
                  />
                  <div style={styles.scoreTag}>
                    {Math.round(result.score * 100)}% Match
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={styles.emptyState}>
              Submit keywords to see content recommendations
            </div>
          )}
        </div>

        {/* 오른쪽: 추천 광고 */}
        <div style={styles.resultsColumn}>
          <h2 style={styles.columnTitle}>Recommended Ads</h2>
          {searchResults.isSearchCompleted ? (
            <div style={styles.videoList}>
              {searchResults.adsResults.map((result, index) => (
                <div key={`ads-${index}`} style={styles.videoCard}>
                  <Video
                    videoId={result.videoId}
                    indexId={result.indexId}
                    showTitle={true}
                  />
                  <div style={styles.scoreTag}>
                    {Math.round(result.score * 100)}% Match
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={styles.emptyState}>
              Submit keywords to see ad recommendations
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 16px',
  },
  mainContentLayout: {
    display: 'flex',
    flexDirection: 'row',
    gap: 24,
    width: '100%',
    height: 'calc(100vh - 150px)', // 화면 높이 기준으로 설정
  },
  formSection: {
    width: '300px',
    flexShrink: 0,
  },
  form: {
    background: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  resultsColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: '#fff',
    borderRadius: 16,
    padding: 24,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    maxWidth: 'calc(50% - 150px - 36px)', // (50% - 폼 너비/2 - 갭/2)
    height: '700px', // 컬럼 높이 고정
    overflow: 'hidden', // 컬럼 자체는 오버플로우 숨김
  },
  columnTitle: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 16,
    padding: 0,
  },
  videoList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16, // 적당한 간격
    overflowY: 'auto', // 세로 스크롤 가능하게 설정
    paddingRight: 8, // 스크롤바 공간 확보
    maxHeight: '600px', // 약 4개의 비디오만 보이도록 제한
  },
  emptyState: {
    height: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9ca3af',
    fontSize: 14,
    fontStyle: 'italic',
    border: '1px dashed #e5e7eb',
    borderRadius: 8,
    padding: 16,
  },
  processingBox: {
    background: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  processingTitle: {
    margin: 0,
    marginBottom: 16,
    fontSize: 18,
    fontWeight: 600,
  },
  processingText: {
    margin: '8px 0',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  processingDetails: {
    fontSize: 14,
    margin: '16px 0 0 0',
  },
  statusItem: {
    marginBottom: 8,
    fontSize: 14,
  },
  progressContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#6366f1',
    transition: 'width 0.3s ease-in-out',
  },
  errorMessage: {
    color: '#ef4444',
    margin: '16px 0 0 0',
    fontSize: 14,
  },
  resetBtn: {
    marginTop: 16,
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    background: '#ef4444',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  },
  title: {
    margin: 0,
    marginBottom: 8,
    fontSize: 18,
    fontWeight: 600,
    textAlign: 'center',
  },
  categoryBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontWeight: 600,
    marginBottom: 4,
    fontSize: 14,
  },
  tagsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    minHeight: 36,
    background: '#f5f5f5',
    borderRadius: 8,
    padding: '4px 6px',
  },
  tag: {
    background: '#e0e7ff',
    color: '#3730a3',
    borderRadius: 12,
    padding: '2px 8px',
    display: 'flex',
    alignItems: 'center',
    fontSize: 12,
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#a1a1aa',
    marginLeft: 4,
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
  },
  input: {
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: 14,
    minWidth: 60,
    flex: 1,
  },
  submitBtn: {
    marginTop: 8,
    padding: '8px 0',
    borderRadius: 8,
    border: 'none',
    background: '#6366f1',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  },
  disabledBtn: {
    background: '#c7d2fe',
    cursor: 'not-allowed',
  },
  videoCard: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    flexShrink: 0, // 카드가 줄어들지 않도록 설정
    height: '140px', // 고정 높이
    marginBottom: 0, // 간격은 gap으로 조절
    display: 'block', // 블록 요소로 설정
  },
  scoreTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    background: 'rgba(0,0,0,0.7)',
    color: '#fff',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
  },
};

export default PlanCampaignForm;