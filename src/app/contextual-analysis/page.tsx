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
  getAndStoreEmbeddings,
  fetchIndexingTasks
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

  // Track the last time we processed content embeddings
  const [lastContentEmbeddingsCheck, setLastContentEmbeddingsCheck] = useState<Date | null>(null);

  // New states to track indexing status
  const [stillIndexingCount, setStillIndexingCount] = useState(0);
  const [readyVideosCount, setReadyVideosCount] = useState(0);

  // States to control visibility of status messages
  const [showProcessingMessage, setShowProcessingMessage] = useState(true);
  const [showIndexingMessage, setShowIndexingMessage] = useState(true);
  const [showReadyMessage, setShowReadyMessage] = useState(true);

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

  // Use the lastContentEmbeddingsCheck in a useQuery to refetch content embedding status
  useQuery({
    queryKey: ['contentEmbeddingsCheckStatus', contentIndexId],
    queryFn: async () => {
      return { lastChecked: lastContentEmbeddingsCheck };
    },
    // Only run this query when lastContentEmbeddingsCheck changes
    enabled: !!lastContentEmbeddingsCheck,
    // Don't refetch automatically
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: Infinity,
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

  // Fetch content videos when component mounts and process their embeddings once
  useEffect(() => {
    // Define a local async function to fetch content videos
    async function fetchContentVideos() {
      if (!contentIndexId) return;

      try {
        let currentPage = 1;
        let hasMorePages = true;
        const allContentVideos: VideoData[] = [];

        while (hasMorePages) {
          const contentResponse = await fetchVideos(currentPage, contentIndexId);

          if (contentResponse && contentResponse.data && contentResponse.data.length > 0) {
            allContentVideos.push(...contentResponse.data);

            const totalPages = contentResponse.page_info.total_page;
            currentPage++;

            if (currentPage > totalPages) {
              hasMorePages = false;
            }
          } else {
            hasMorePages = false;
          }
        }

        if (allContentVideos.length > 0) {
          setContentVideos(allContentVideos);

          await processContentVideoEmbeddings(allContentVideos);
        }
      } catch (error) {
        console.error("Error fetching content videos:", error);
      }
    }

    // Initial fetch of content videos
    fetchContentVideos();

    // Set up polling to regularly check for new content videos
    const pollInterval = 60000; // Poll every 60 seconds
    const intervalId = setInterval(() => {
      fetchContentVideos();
    }, pollInterval);

    // Clean up interval when component unmounts
    return () => {
      clearInterval(intervalId);
    };
  }, [contentIndexId, queryClient]);

  // Process content video embeddings
  async function processContentVideoEmbeddings(videos: VideoData[]) {
    if (!videos || videos.length === 0 || !contentIndexId) return;

    setIsProcessingContentEmbeddings(true);
    setContentEmbeddingsProgress({ processed: 0, total: videos.length });

    try {
      // First, get the current indexing status of all videos in this index
      const indexingTasks = await fetchIndexingTasks(contentIndexId);

      // Create a map of videoId -> indexing status
      const indexingStatusMap = new Map<string, string>();
      indexingTasks.forEach(task => {
        if (task.video_id) {
          indexingStatusMap.set(task.video_id, task.status || 'unknown');
        }
      });

      // Filter out videos that are still indexing
      const readyVideos: VideoData[] = [];
      const stillIndexingVideos: VideoData[] = [];

      videos.forEach(video => {
        const videoId = video._id;
        const indexingStatus = indexingStatusMap.get(videoId);

        // If not in the status map or status is 'ready', consider it ready for embedding
        // Sometimes videos don't appear in indexing tasks if they were uploaded long ago
        if (!indexingStatus || indexingStatus === 'ready') {
          readyVideos.push(video);
        } else {
          stillIndexingVideos.push(video);
        }
      });

      // Update counts for UI display
      setReadyVideosCount(readyVideos.length);
      setStillIndexingCount(stillIndexingVideos.length);

      // Update total in progress to only count ready videos
      setContentEmbeddingsProgress({ processed: 0, total: readyVideos.length });

      if (readyVideos.length === 0) {
        setIsProcessingContentEmbeddings(false);
        return;
      }

      // Track content videos with missing embeddings
      const missingEmbeddings: string[] = [];
      const existingEmbeddings: string[] = [];
      const processedVideoIds = new Set<string>();

      // First check which content videos need embeddings (only for ready videos)
      for (const video of readyVideos) {
        const videoId = video._id;

        // Check if this video has already been processed by checking the cache
        const cacheKey = ['videoEmbedding', contentIndexId, videoId];
        const cachedStatus = queryClient.getQueryData(cacheKey) as { exists: boolean } | undefined;

        if (cachedStatus) {
          if (cachedStatus.exists) {
            existingEmbeddings.push(videoId);
            processedVideoIds.add(videoId);
          } else {
            missingEmbeddings.push(videoId);
          }
        } else {
          // Not in cache, check from API
          const hasEmbedding = await checkVectorExists(videoId, contentIndexId);

          // Cache the result
          queryClient.setQueryData(cacheKey, { exists: hasEmbedding });

          if (hasEmbedding) {
            existingEmbeddings.push(videoId);
            processedVideoIds.add(videoId);
          } else {
            missingEmbeddings.push(videoId);
          }
        }

        // Update progress
        setContentEmbeddingsProgress(prev => ({
          ...prev,
          processed: prev.processed + 1
        }));
      }

      // Generate embeddings for videos that need them
      if (missingEmbeddings.length > 0) {
        setContentEmbeddingsProgress({ processed: 0, total: missingEmbeddings.length });

        for (const videoId of missingEmbeddings) {
          const embedResult = await getAndStoreEmbeddings(contentIndexId, videoId);

          if (embedResult.success) {
            // Update cache to indicate embedding now exists
            queryClient.setQueryData(['videoEmbedding', contentIndexId, videoId], { exists: true });
            processedVideoIds.add(videoId);
          } else {
            console.error(`❌ Failed to generate embedding for content video ${videoId}: ${embedResult.message}`);
            // Mark as checked but failed
            queryClient.setQueryData(['videoEmbedding', contentIndexId, videoId], { exists: false, failed: true });
          }

          // Update progress
          setContentEmbeddingsProgress(prev => ({
            ...prev,
            processed: prev.processed + 1
          }));
        }
      }

      // Update the overall content embeddings status in cache, including info about videos still indexing
      queryClient.setQueryData(['contentEmbeddingsStatus', contentIndexId], {
        processed: true,
        total: videos.length,
        readyVideos: readyVideos.length,
        stillIndexingVideos: stillIndexingVideos.length,
        videoIds: videos.map(v => v._id),
        processedVideoIds: Array.from(processedVideoIds),
        needsProcessing: stillIndexingVideos.length > 0, // Still need processing if any videos are indexing
        lastProcessed: new Date().toISOString()
      });

      setLastContentEmbeddingsCheck(new Date());

    } catch (error) {
      console.error("Error processing content embeddings:", error);
    } finally {
      setIsProcessingContentEmbeddings(false);
    }
  }

  // Close modal when unmounting
  useEffect(() => {
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

  // Automatically check ONLY the ad video embedding when a video is selected
  useEffect(() => {
    if (selectedVideoId && !isLoadingEmbeddings) {
      // Check if this video has already been processed by checking the cache
      const cachedStatus = queryClient.getQueryData(['embeddingStatus', selectedVideoId]) as
        { checked: boolean, ready: boolean } | undefined;

      if (!cachedStatus?.checked) {
        // Set loading state
        setIsLoadingEmbeddings(true);

        // Start embedding check process - ONLY for the ad video (not content videos)
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
    setSimilarResults([]);
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
        contentVideos,
        false
      );

      return result.success;
    } catch (error) {
      console.error("Error ensuring embeddings:", error);
      return false;
    }
  };

  const handleContextualAnalysis = async () => {
    if (!selectedVideoId) return;

    try {
      setIsAnalyzing(true);

      if (!embeddingsReady && !isLoadingEmbeddings) {

        const embeddingsExist = await ensureEmbeddings();
        if (!embeddingsExist) {
          console.error("Failed to ensure embeddings exist, cannot run analysis");
          setIsAnalyzing(false);
          return;
        }
      } else if (isLoadingEmbeddings) {
        setIsAnalyzing(false);
        return;
      }

      setSimilarResults([]);

      let textResults: EmbeddingSearchResult[] = [];
      let videoResults: EmbeddingSearchResult[] = [];

      try {
        textResults = await textToVideoEmbeddingSearch(selectedVideoId, adsIndexId, contentIndexId);
        if (textResults.length > 0) {
        }
      } catch (error) {
        console.error("Error in text-based search:", error);
      }

      try {
        videoResults = await videoToVideoEmbeddingSearch(selectedVideoId, adsIndexId, contentIndexId);

        if (videoResults.length > 0) {
        } else {
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
              finalScore: result.score,
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
          {isProcessingContentEmbeddings && showProcessingMessage && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <LoadingSpinner size="sm" />
                  <span className="text-sm">
                  Do not close this page. Processing content video embeddings ({contentEmbeddingsProgress.processed} videos processed out of {contentEmbeddingsProgress.total} videos).
                  </span>
                </div>
                <button
                  onClick={() => setShowProcessingMessage(false)}
                  className="cursor-pointer text-blue-500 hover:text-blue-700 ml-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Show videos still indexing status */}
          {stillIndexingCount > 0 && showIndexingMessage && (
            <div className="mb-4 p-3 bg-yellow-50 rounded-md border border-yellow-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-generate" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm">
                    {stillIndexingCount} content videos are still being indexed. They will be processed for contextual analysis once indexing is complete.
                  </span>
                </div>
                <button
                  onClick={() => setShowIndexingMessage(false)}
                  className="cursor-pointer text-yellow-500 hover:text-yellow-700 ml-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Show embedding stats */}
          {readyVideosCount > 0 && !isProcessingContentEmbeddings && showReadyMessage && (
            <div className="mb-4 p-3 bg-green-50 rounded-md border border-green-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm">
                    {readyVideosCount} content videos are ready for contextual analysis.
                    {lastContentEmbeddingsCheck && (
                      <span className="ml-1">Last checked: {lastContentEmbeddingsCheck.toLocaleTimeString()}</span>
                    )}
                  </span>
                </div>
                <button
                  onClick={() => setShowReadyMessage(false)}
                  className="cursor-pointer text-green-500 hover:text-green-700 ml-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
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
                  <div className="border rounded-[45.06px] bg-gray-50 p-8 flex items-center justify-center h-38 w-[320px]">
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