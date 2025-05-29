"use client";

import { useState, useEffect } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchVideos,
  textToVideoEmbeddingSearch,
  videoToVideoEmbeddingSearch,
  EmbeddingSearchResult,
  checkAndEnsureEmbeddings,
  checkVectorExists,
  getAndStoreEmbeddings
} from '@/hooks/apiHooks';
import VideosDropDown from '@/components/VideosDropdown';
import Video from '@/components/Video';
import SimilarVideoResults from '@/components/SimilarVideoResults';
import { VideoData, PaginatedResponse, VideoPage } from '@/types';
import Sidebar from '@/components/Sidebar';
import { useGlobalState } from '@/providers/ReactQueryProvider';
import LoadingSpinner from '@/components/LoadingSpinner';
import VideoModalSimple from '@/components/VideoModalSimple';


// VideoPage adapter for the API response
const adaptToPaginatedResponse = (response: PaginatedResponse): VideoPage => ({
  data: response.data,
  page_info: {
    limit_per_page: 10,
    page: response.page_info.page,
    total_duration: 0,
    total_page: response.page_info.total_page,
    total_results: response.page_info.total_count
  }
});

export default function ContextualAnalysis() {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoData | null>(null);
  console.log("🚀 > ContextualAnalysis > selectedVideo=", selectedVideo)
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [similarResults, setSimilarResults] = useState<EmbeddingSearchResult[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New states for tracking embedding loading
  const [isLoadingEmbeddings, setIsLoadingEmbeddings] = useState(false);
  const [contentVideos, setContentVideos] = useState<VideoData[]>([]);
  const [embeddingsReady, setEmbeddingsReady] = useState(false);

  // New state to track content embedding processing
  const [isProcessingContentEmbeddings, setIsProcessingContentEmbeddings] = useState(false);
  const [contentEmbeddingsProgress, setContentEmbeddingsProgress] = useState({ processed: 0, total: 0 });

  const { setSelectedAdId } = useGlobalState();
  const adsIndexId = process.env.NEXT_PUBLIC_ADS_INDEX_ID || '';
  const contentIndexId = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID || '';

  // Add Query Client for cache operations
  const queryClient = useQueryClient();

  // Query to cache embedding check results
  useQuery({
    queryKey: ['embeddingStatus', selectedVideoId],
    queryFn: async () => {
      // This query doesn't actually fetch data, it just stores the status
      return { checked: false, ready: false };
    },
    // Don't refetch this query automatically - we'll manage it manually
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: Infinity,
    enabled: !!selectedVideoId,
    // Initialize with a default value to prevent undefined issues
    initialData: { checked: false, ready: false },
  });

  const {
    data: videosData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<PaginatedResponse, Error>({
    queryKey: ['videos', adsIndexId],
    queryFn: ({ pageParam = 1 }) => fetchVideos(pageParam as number, adsIndexId),
    initialPageParam: 1,
    getNextPageParam: (lastPage: PaginatedResponse) => {
      return lastPage.page_info.page < lastPage.page_info.total_page
        ? lastPage.page_info.page + 1
        : undefined;
    },
    enabled: !!adsIndexId,
  });

  // Fetch content videos when component mounts
  useEffect(() => {
    async function fetchContentVideos() {
      if (!contentIndexId) return;

      try {
        // We'll just fetch the first page to get some content videos
        const contentResponse = await fetchVideos(1, contentIndexId);
        if (contentResponse && contentResponse.data) {
          setContentVideos(contentResponse.data);
          console.log(`📚 Loaded ${contentResponse.data.length} content videos`);

          // Automatically check/ensure embeddings for all content videos
          processAllContentEmbeddings(contentResponse.data);
        }
      } catch (error) {
        console.error("Error fetching content videos:", error);
      }
    }

    fetchContentVideos();
  }, [contentIndexId]);

  // Close modal when unmounting
  useEffect(() => {
    console.log("🚀 > ContextualAnalysis > adaptedVideosData=", adaptedVideosData)
    return () => {
      setIsModalOpen(false);
      setIsPlaying(false); // Keep the background video paused
    };
  }, []);

  const handlePlay = () => {
    setIsModalOpen(true);
    setIsPlaying(false); // Keep the background video paused
  };

  // Auto-select the first video when data is loaded
  useEffect(() => {
    if (videosData?.pages[0]?.data && videosData.pages[0].data.length > 0 && !selectedVideoId) {
      const firstVideo = videosData.pages[0].data[0];
      handleVideoChange(firstVideo._id);
    }
  }, [videosData]);

  // Automatically check embeddings whenever a video is selected (including auto-selection)
  useEffect(() => {
    if (selectedVideoId && !isLoadingEmbeddings) {
      // Check if this video has already been processed by checking the cache
      const cachedStatus = queryClient.getQueryData(['embeddingStatus', selectedVideoId]) as
        { checked: boolean, ready: boolean } | undefined;

      if (!cachedStatus?.checked) {
        console.log(`Auto-triggering embedding check for video ${selectedVideoId} (not previously checked)`);

        // Set loading state
        setIsLoadingEmbeddings(true);

        // Start embedding check process
        ensureEmbeddings().then(success => {
          // Cache the result so we don't check this video again
          queryClient.setQueryData(['embeddingStatus', selectedVideoId], {
            checked: true,
            ready: success
          });

          // Update UI state
          setEmbeddingsReady(success);
          setIsLoadingEmbeddings(false);
        });
      } else {
        console.log(`Video ${selectedVideoId} already checked for embeddings, status: ${cachedStatus.ready ? 'ready' : 'not ready'}`);
        // Update UI to match cached state
        setEmbeddingsReady(cachedStatus.ready);
      }
    }
  }, [selectedVideoId, isLoadingEmbeddings, queryClient]);

  const handleVideoChange = async (videoId: string) => {
    setSelectedVideoId(videoId);
    const allVideos = videosData?.pages.flatMap((page: PaginatedResponse) => page.data) || [];
    const video = allVideos.find((v: VideoData) => v._id === videoId);
    setSelectedVideo(video || null);
    // Reset analysis results when video changes
    setSimilarResults([]);
    // Update global state with selected ad ID
    setSelectedAdId(videoId);
  };

  // Function to check and ensure embeddings exist
  const ensureEmbeddings = async () => {
    if (!selectedVideoId) return false;

    try {
      const result = await checkAndEnsureEmbeddings(
        selectedVideoId,
        adsIndexId,
        contentIndexId,
        contentVideos
      );

      return result.success;
    } catch (error) {
      console.error("Error ensuring embeddings:", error);
      return false;
    }
  };

  // Function to check and process all content video embeddings
  const processAllContentEmbeddings = async (videos: VideoData[]) => {
    if (!videos || videos.length === 0 || !contentIndexId) return;

    setIsProcessingContentEmbeddings(true);
    setContentEmbeddingsProgress({ processed: 0, total: videos.length });

    console.log(`🔄 Starting to check embeddings for ${videos.length} content videos`);

    try {
      // Track content videos with missing embeddings
      const missingEmbeddings: string[] = [];
      const existingEmbeddings: string[] = [];

      // First check which content videos need embeddings
      for (const video of videos) {
        const videoId = video._id;
        const hasEmbedding = await checkVectorExists(videoId, contentIndexId);

        if (hasEmbedding) {
          existingEmbeddings.push(videoId);
        } else {
          missingEmbeddings.push(videoId);
        }

        // Update progress
        setContentEmbeddingsProgress(prev => ({
          ...prev,
          processed: prev.processed + 1
        }));
      }

      console.log(`✅ Found ${existingEmbeddings.length} content videos with existing embeddings`);
      console.log(`⚠️ Found ${missingEmbeddings.length} content videos missing embeddings`);

      // Generate embeddings for videos that need them
      if (missingEmbeddings.length > 0) {
        setContentEmbeddingsProgress({ processed: 0, total: missingEmbeddings.length });

        for (const videoId of missingEmbeddings) {
          console.log(`🔄 Generating embedding for content video ${videoId}...`);
          const embedResult = await getAndStoreEmbeddings(contentIndexId, videoId);

          if (embedResult.success) {
            console.log(`✅ Successfully generated embedding for content video ${videoId}`);
          } else {
            console.error(`❌ Failed to generate embedding for content video ${videoId}: ${embedResult.message}`);
          }

          // Update progress
          setContentEmbeddingsProgress(prev => ({
            ...prev,
            processed: prev.processed + 1
          }));
        }
      }
    } catch (error) {
      console.error("Error processing content embeddings:", error);
    } finally {
      setIsProcessingContentEmbeddings(false);
    }
  };

  const handleContextualAnalysis = async () => {
    if (!selectedVideoId) return;

    try {
      setIsAnalyzing(true);

      // 임베딩이 아직 준비되지 않았거나 확인 중이라면 준비
      if (!embeddingsReady && !isLoadingEmbeddings) {
        console.log(`Checking embeddings before running contextual alignment analysis`);

        const embeddingsExist = await ensureEmbeddings();
        if (!embeddingsExist) {
          console.error("Failed to ensure embeddings exist, cannot run analysis");
          setIsAnalyzing(false);
          return;
        }
      } else if (isLoadingEmbeddings) {
        // 이미 로딩 중이라면 완료될 때까지 대기
        console.log("Embeddings are already being loaded, waiting...");
        setIsAnalyzing(false);
        return;
      }

      console.log(`Running contextual alignment analysis for video ${selectedVideoId}`);

      // Clear previous results
      setSimilarResults([]);

      // 두 가지 검색 방식을 병렬로 실행
      let textResults: EmbeddingSearchResult[] = [];
      let videoResults: EmbeddingSearchResult[] = [];

      try {
        textResults = await textToVideoEmbeddingSearch(selectedVideoId, adsIndexId, contentIndexId);
        console.log("=== TEXT-BASED SEARCH RESULTS ===");
        console.log("🚀 > handleContextualAnalysis > textResults=", textResults);

        if (textResults.length > 0) {
          textResults.forEach((result, index) => {
            // 검색 방법 정보 표시 (태그 또는 제목)
            const searchMethodInfo = result.searchMethod ?
              `(by ${result.searchMethod})` : '';

            console.log(`${index + 1}. ${result.metadata?.video_file || 'Unknown'} - Score: ${(result.score * 100).toFixed(1)}% ${searchMethodInfo} (ID: ${result.metadata?.tl_video_id})`);
          });
        } else {
          console.log("No text-based matches found");
        }
      } catch (error) {
        console.error("Error in text-based search:", error);
      }

      try {
        videoResults = await videoToVideoEmbeddingSearch(selectedVideoId, adsIndexId, contentIndexId);

        if (videoResults.length > 0) {
          videoResults.forEach((result, index) => {
            console.log(`${index + 1}. ${result.metadata?.video_file || 'Unknown'} - Score: ${(result.score * 100).toFixed(1)}% (ID: ${result.metadata?.tl_video_id})`);
          });
        } else {
          console.log("No video-based matches found");
        }
      } catch (error) {
        console.error("Error in video-based search:", error);
      }

      // Create a map to track all results by videoId
      const combinedResultsMap = new Map();

      // Add text-based results to the map
      textResults.forEach(result => {
        const videoId = result.metadata?.tl_video_id;
        if (videoId) {
          combinedResultsMap.set(videoId, {
            videoId,
            metadata: result.metadata,
            textScore: result.score,
            videoScore: 0,
            finalScore: result.score,  // Initial score is just the text score
            source: "TEXT"
          });
        }
      });

      // Add/update video-based results in the map
      videoResults.forEach(result => {
        const videoId = result.metadata?.tl_video_id;
        if (videoId) {
          if (combinedResultsMap.has(videoId)) {
            // This is a match found in both searches - update it
            const existingResult = combinedResultsMap.get(videoId);

            // Apply a significant boost for results found in both searches (50% boost)
            const boostMultiplier = 2;

            // Combine the scores: use the max of both scores and apply the boost
            const maxScore = Math.max(existingResult.textScore, result.score);
            const boostedScore = maxScore * boostMultiplier;

            combinedResultsMap.set(videoId, {
              ...existingResult,
              videoScore: result.score,
              finalScore: boostedScore,  // Boosted score for appearing in both searches
              source: "BOTH"
            });
          } else {
            // This is a result only found in video search
            combinedResultsMap.set(videoId, {
              videoId,
              metadata: result.metadata,
              textScore: 0,
              videoScore: result.score,
              finalScore: result.score,  // Initial score is just the video score
              source: "VIDEO"
            });
          }
        }
      });

      // Convert the map to an array and sort by finalScore
      const mergedResults = Array.from(combinedResultsMap.values())
        .sort((a, b) => b.finalScore - a.finalScore);

      // Convert to format expected by the UI
      const formattedResults = mergedResults.map(item => ({
        score: item.finalScore,
        metadata: item.metadata,
        originalSource: item.source,
        textScore: item.textScore,
        videoScore: item.videoScore
      }));

      // Set the results for display
      setSimilarResults(formattedResults);

      // Log the results with source information
      console.log("\n=== COMBINED RESULTS WITH PRIORITIZED SCORING ===");
      console.log(`Combined ${textResults.length} text-based and ${videoResults.length} video-based results into ${formattedResults.length} unique videos`);

    } catch (error) {
      console.error("Error during contextual analysis:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Create adapted data structure for VideosDropDown
  const adaptedVideosData = videosData ? {
    pages: videosData.pages.map(adaptToPaginatedResponse),
    pageParams: videosData.pageParams.map(param => typeof param === 'number' ? param : 1)
  } : { pages: [], pageParams: [] as number[] };

  return (
    <div className="flex mt-5 min-h-screen bg-zinc-100">
      {/* Sidebar */}
      <Sidebar activeMenu="contextual-analysis" />

      <div className="flex-1 overflow-auto ml-54">
        <div className="p-8 max-w-6xl mx-auto">
          {/* Show content embedding processing status if active */}
          {isProcessingContentEmbeddings && (
            <div className="mb-4 p-3 bg-blue-50 rounded-md">
              <div className="flex items-center space-x-2">
                <LoadingSpinner size="sm" />
                <span className="text-sm">
                Do not close this page. Processing content video embeddings ({contentEmbeddingsProgress.processed} videos processed).
                </span>
              </div>
            </div>
          )}

          {/* Dropdown menu */}
          <div className="mb-10">
            <VideosDropDown
              onVideoChange={handleVideoChange}
              videosData={adaptedVideosData}
              fetchNextPage={fetchNextPage}
              hasNextPage={!!hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              isLoading={isLoading}
              selectedFile={null}
              taskId={null}
              footageVideoId={selectedVideoId}
              indexId={adsIndexId}
            />
          </div>

          {/* Main content area */}
          <div className="flex flex-col">
            {/* Video and tags section with adjusted layout - no gap between elements */}
            <div className="flex justify-center items-start">
              {/* Video component */}
              <div className="flex flex-col items-center space-y-4">
                {selectedVideoId ? (
                  <Video
                    videoId={selectedVideoId}
                    indexId={adsIndexId}
                    showTitle={true}
                    videoDetails={undefined}
                    playing={isPlaying}
                    onPlay={handlePlay}
                    />
                ) : (
                  <div className="border rounded-md bg-gray-50 p-8 flex items-center justify-center h-64 w-[320px]">
                    <p>Select an ad from the dropdown</p>
                  </div>
                )}
              </div>

              {/* Tags/metadata - placed directly next to the video */}
              <div className="ml-4 mt-2 w-48">
                {selectedVideo && selectedVideo.user_metadata ? (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(selectedVideo.user_metadata)
                      .filter(([key, value]) => key !== 'source' && value != null && value.toString().length > 0)
                      .flatMap(([key, value]) => {
                        // 쉼표로 구분된 문자열을 배열로 변환
                        const tagValues = (value as unknown as string).toString().split(',');

                        // 각 태그를 개별적으로 렌더링
                        return tagValues.map((tag: string, idx: number) => {
                          // First trim the tag to remove any leading/trailing spaces
                          const trimmedTag = tag.trim();
                          if (trimmedTag.length === 0) return null;

                          // Properly capitalize the tag - first lowercase everything, then capitalize first letter of each word
                          const properlyCapitalized = trimmedTag
                            .toLowerCase()
                            .split(' ')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                            .join(' ');

                          return (
                            <div
                              key={`${key}-${idx}`}
                              className="inline-block border border-black rounded-full px-3 py-1 text-sm"
                            >
                              {properlyCapitalized}
                            </div>
                          );
                        }).filter(Boolean); // null 값 제거
                      })}
                  </div>
                ) : (
                  <p className="text-sm">No tags available</p>
                )}
              </div>
            </div>

            {/* Button for contextual alignment analysis */}
            <div className="mt-6 flex justify-center">
              <button
                className={`self-stretch p-3 cursor-pointer ${
                  isLoadingEmbeddings
                    ? 'bg-gray-500'
                    : embeddingsReady
                      ? isAnalyzing
                        ? 'bg-gray-500'
                        : 'bg-black'
                      : isAnalyzing
                        ? 'bg-gray-500'
                        : 'bg-stone-900 hover:bg-stone-800'
                } rounded-xl inline-flex justify-center items-center overflow-hidden w-full max-w-xs`}
                disabled={!selectedVideoId || isLoadingEmbeddings || isAnalyzing}
                onClick={handleContextualAnalysis}
              >
                {(isLoadingEmbeddings || isAnalyzing) && (
                  <div className="mr-3">
                    <LoadingSpinner size="sm" />
                  </div>
                )}
                <div className={`justify-start ${
                  isLoadingEmbeddings
                    ? ''
                    : isAnalyzing
                      ? 'text-black'
                      : 'text-white'
                } text-base font-normal leading-normal tracking-tight`}>
                  {isLoadingEmbeddings
                    ? `Checking/Preparing Embeddings`
                    : embeddingsReady
                      ? isAnalyzing
                        ? 'Running Contextual Analysis'
                        : 'Run Contextual Analysis'
                      : isAnalyzing
                        ? 'Running Contextual Analysis'
                        : 'Contextual Alignment Analysis'}
                </div>
                {!isLoadingEmbeddings && !isAnalyzing && (
                  <div className="w-2 h-2 p-[3px] flex justify-center items-center flex-wrap content-center">
                    <div className="flex-1 self-stretch bg-stone-900" />
                  </div>
                )}
              </button>
            </div>

            {/* Remove the separate loading spinner section since it's now in the button */}
            {isAnalyzing && !isLoadingEmbeddings && similarResults.length === 0 && (
              <div className="flex flex-col justify-center items-center mt-10">
                <p className="text-gray-600">
                  Searching for contextually relevant content...
                </p>
              </div>
            )}

            {/* Display analysis results as videos */}
            {similarResults.length > 0 && !isAnalyzing && !isLoadingEmbeddings && (
              <SimilarVideoResults
                results={similarResults}
                indexId={contentIndexId}
              />
            )}

            <VideoModalSimple
              videoUrl={selectedVideo?.hls?.video_url || ''}
              videoId={selectedVideoId || ''}
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              title={selectedVideo?.system_metadata?.filename}
            />
          </div>
        </div>
      </div>
    </div>
  );
}