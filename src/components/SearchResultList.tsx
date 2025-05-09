import { useState, useEffect, useRef, useCallback } from "react";
import { useInView } from "react-intersection-observer";
import LoadingSpinner from "./LoadingSpinner";
import { fetchVideoDetails, VideoDetailResponse } from "@/hooks/apiHooks";
import { convertMetadataToTags } from "@/hooks/apiHooks";
import ReactPlayer from "react-player";

// Default content index ID from environment variables - rename to generic name
const defaultIndexId = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID || '';

interface SearchResultListProps {
  searchResultData: {
    pageInfo: {
      page: number;
      total_page: number;
      total_videos: number;
      total_results?: number;
      next_page_token?: string;
    };
    textSearchResults: Array<{
      _id: string;
      index_id: string;
      video_id: string;
      score: number;
      confidence?: string;
      duration: number;
      thumbnail_url?: string;
      video_url?: string;
      video_title?: string;
      start?: number;
      end?: number;
      segments?: Array<{
        start: number;
        end: number;
        score: number;
        matched_words?: string[];
      }>;
    }>;
  };
  onUpdateTotalResults?: (count: number) => void;
  textSearchQuery: string;
}

interface EnhancedSearchResult {
  _id: string;
  index_id: string;
  video_id: string;
  score: number;
  confidence?: string;
  duration: number;
  thumbnail_url?: string;
  video_url?: string;
  video_title?: string;
  start?: number;
  end?: number;
  segments?: Array<{
    start: number;
    end: number;
    score: number;
    matched_words?: string[];
  }>;
  videoDetail?: VideoDetailResponse;
}

/**
 * Component to display a list of search results
 */
const SearchResultList = ({ searchResultData, onUpdateTotalResults, textSearchQuery }: SearchResultListProps) => {
  const [enhancedResults, setEnhancedResults] = useState<EnhancedSearchResult[]>([]);
  const [nextPageLoading, setNextPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<EnhancedSearchResult | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [playerProgress, setPlayerProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerInitialized, setPlayerInitialized] = useState(false);
  const [segmentEndReached, setSegmentEndReached] = useState(false);
  const [lastSeekTime, setLastSeekTime] = useState<number | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(false);
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);

  // Using intersection observer to detect when to load more results
  const { ref: observerRef, inView } = useInView({
    threshold: 0.1,
    triggerOnce: false,
  });

  // Add a ref to keep the player instance with proper type annotation
  const playerRef = useRef<ReactPlayer>(null);

  // Format the score as a percentage
  const formatScore = (score: number): string => {
    return `${score.toFixed(1)}`;
  };

  // Handle video thumbnail click
  const handleThumbnailClick = (result: EnhancedSearchResult) => {
    setSelectedResult(result);
    setShowModal(true);
  };

  // Close the modal
  const closeModal = () => {
    setShowModal(false);
    setSelectedResult(null);
    setModalOpened(false);
  };

  // Get start and end times for the selected segment
  const getSegmentTimes = () => {
    if (!selectedResult) return { startTime: 0, endTime: 0 };

    const startTime = selectedResult.start ||
                     (selectedResult.segments && selectedResult.segments.length > 0 ?
                      selectedResult.segments[0].start : 0);

    const endTime = selectedResult.end ||
                   (selectedResult.segments && selectedResult.segments.length > 0 ?
                    selectedResult.segments[0].end :
                    (selectedResult.videoDetail?.system_metadata?.duration || 0));

    return { startTime, endTime };
  };

  // Handle player progress updates to enforce segment end time
  const handleProgress = (state: { playedSeconds: number }) => {
    const { startTime, endTime } = getSegmentTimes();
    setPlayerProgress(state.playedSeconds);

    // Simple debug info
    console.log(`Player Progress: ${state.playedSeconds.toFixed(2)}s, End: ${endTime.toFixed(2)}s`);

    // Strict end detection: directly compare if we've reached or passed the end time
    if (state.playedSeconds >= endTime && !segmentEndReached) {
      console.log(`Segment end reached: ${state.playedSeconds.toFixed(2)}s > ${endTime.toFixed(2)}s`);
      setSegmentEndReached(true);

      // Force immediate pause
      setIsPlaying(false);

      // Implement looping behavior
      const now = Date.now();
      const minSeekInterval = 500; // milliseconds
      const canSeek = !lastSeekTime || now - lastSeekTime > minSeekInterval;

      if (canSeek && playerRef.current) {
        // Set last seek time
        setLastSeekTime(now);

        // Seek back to start
        setTimeout(() => {
          if (playerRef.current) {
            console.log(`Seeking to segment start: ${startTime.toFixed(2)}s`);
            playerRef.current.seekTo(startTime, 'seconds');

            // Resume playback after a short delay
            setTimeout(() => {
              console.log('Resuming playback after segment loop');
              setIsPlaying(true);
              setSegmentEndReached(false);
            }, 250);
          }
        }, 150);
      }
    } else if (state.playedSeconds < endTime - 1.0 && segmentEndReached) {
      // Reset end reached flag when we're well before the end
      setSegmentEndReached(false);
    }
  };

  // Simple replay segment handler
  const handleReplaySegment = () => {
    const { startTime } = getSegmentTimes();
    console.log("Replaying segment from:", startTime);

    // Ensure smooth replay sequence with proper timing
    if (playerRef.current) {
      // First pause to ensure clean state
      setIsPlaying(false);

      // Set last seek time to prevent conflicting seeks
      setLastSeekTime(Date.now());

      // Small delay before seeking
      setTimeout(() => {
        if (playerRef.current) {
          console.log(`Seeking to segment start: ${startTime}`);
          playerRef.current.seekTo(startTime, 'seconds');
          setSegmentEndReached(false);

          // Resume playback after seeking completes
          setTimeout(() => {
            console.log("Starting playback");
            setIsPlaying(true);
          }, 250);
        }
      }, 100);
    }
  };

  // Reset player state when modal opens
  useEffect(() => {
    if (showModal && selectedResult) {
      const { startTime } = getSegmentTimes();
      console.log("Modal opened with video segment at:", startTime);

      // Reset all player state
      setSegmentEndReached(false);
      setLastSeekTime(null);
      setModalOpened(true);
      setPlayerProgress(startTime);
      setPlayerInitialized(false);
      setIsPlaying(true);
    } else {
      // Clean up state when modal closes
      setIsPlaying(false);
      setModalOpened(false);
      setSegmentEndReached(false);
      setLastSeekTime(null);
    }
  }, [showModal, selectedResult]);

  // Initialize player when it's ready
  useEffect(() => {
    if (modalOpened && playerInitialized) {
      console.log("Player initialized - starting playback");

      const { startTime } = getSegmentTimes();
      if (playerRef.current) {
        // Set initial position
        setLastSeekTime(Date.now());
        playerRef.current.seekTo(startTime, 'seconds');

        // Ensure playback starts after seeking is complete
        setTimeout(() => {
          console.log("Starting initial playback");
          setIsPlaying(true);
        }, 250);
      }
    }
  }, [modalOpened, playerInitialized]);

  // Close modal when ESC key is pressed
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeModal();
      }
    };

    if (showModal) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showModal]);

  // Enhance search results (fetch video details) for the initial page
  useEffect(() => {
    const enhanceSearchResults = async () => {
      // Check for search query right at the start
      if (!textSearchQuery) {
        console.error("[DEBUG] Pagination: Search query is required but was null");
        setError("Cannot load results: Search query is missing");
        return;
      }

      if (searchResultData?.textSearchResults?.length > 0) {
        setNextPageLoading(true);

        // Initialize pagination variables with fallbacks
        const initialPage = searchResultData.pageInfo?.page || 1;

        // Check for next_page_token in the initial response
        if (searchResultData.pageInfo?.next_page_token) {
          console.log('[DEBUG] Pagination: Found initial next_page_token:', searchResultData.pageInfo.next_page_token);
          setNextPageToken(searchResultData.pageInfo.next_page_token);
          setHasMorePages(true);
        } else {
          // If there's no token but we have results, use result count to determine if there are more pages
          const resultsCount = searchResultData.textSearchResults.length;
          const hasMore = resultsCount >= 10; // If we received a full page, assume there are more
          console.log('[DEBUG] Pagination: No initial next_page_token, using result count to determine hasMorePages:', hasMore);
          setHasMorePages(hasMore);
        }

        console.log('[DEBUG] Pagination: Initial page:', initialPage,
          'API Total pages:', searchResultData.pageInfo?.total_page || 0,
          'Estimated total pages:', searchResultData.textSearchResults.length === 10 ? 2 : 1,
          'Final total pages:', searchResultData.pageInfo?.total_page || 0,
          'Has more pages:', searchResultData.pageInfo?.next_page_token ? true : (searchResultData.textSearchResults.length >= 10));

        setCurrentPage(initialPage);

        try {
          // Get index_id from the first result, or fall back to the default
          // IMPORTANT: Extract the index_id from ALL results to avoid mixing content
          // This ensures we consistently use the same index throughout
          const allIndexIds = searchResultData.textSearchResults.map(result => result.index_id);
          // Use the most common index_id from the results
          const indexId = mostCommonValue(allIndexIds) || defaultIndexId;

          console.log('[DEBUG] Pagination: Index IDs in results:', allIndexIds);
          console.log('[DEBUG] Pagination: Using most common index_id:', indexId,
                      'Is ads index?', indexId === process.env.NEXT_PUBLIC_ADS_INDEX_ID,
                      'Is content index?', indexId === process.env.NEXT_PUBLIC_CONTENT_INDEX_ID);

          // Use search query from props instead of URL
          console.log('[DEBUG] Pagination: Using query:', textSearchQuery, 'index_id:', indexId);

          if (!indexId) {
            console.error("[DEBUG] Pagination: Missing index_id in search results and no default configured");
            setError("Cannot load video information: Missing index ID");
            setNextPageLoading(false);
            return;
          }

          console.log("[DEBUG] Pagination: Using index_id for video details:", indexId);

          // Fetch details for all video results
          console.log('[DEBUG] Pagination: Fetching details for', searchResultData.textSearchResults.length, 'initial results');

          const detailedResults = await Promise.all(
            searchResultData.textSearchResults.map(async (result, index) => {
              try {
                console.log(`[DEBUG] Pagination: Fetching details for initial video ${index + 1}/${searchResultData.textSearchResults.length}: ${result.video_id}`);
                // Get video details using videoId and indexId
                const videoDetail = await fetchVideoDetails(result.video_id, indexId);
                return {
                  ...result,
                  videoDetail,
                };
              } catch (err) {
                console.error(`[DEBUG] Pagination: Failed to fetch details for video ${result.video_id}:`, err);
                return result;
              }
            })
          );

          console.log('[DEBUG] Pagination: Setting initial', detailedResults.length, 'results');
          setEnhancedResults(detailedResults);
        } catch (err: unknown) {
          console.error("[DEBUG] Pagination: Error enhancing search results:", err);
          setError(err instanceof Error ? err.message : "An error occurred loading video details");
        } finally {
          setNextPageLoading(false);
          console.log('[DEBUG] Pagination: Finished initial load');
        }
      } else {
        console.log('[DEBUG] Pagination: No initial search results to process');
      }
    };

    if (searchResultData?.textSearchResults?.length > 0) {
      console.log('[DEBUG] Pagination: Setting initial', searchResultData.textSearchResults.length, 'results');

      // No longer need to get query from URL
      if (textSearchQuery) {
        console.log('[DEBUG] Pagination: Using search query:', textSearchQuery);
        enhanceSearchResults().then(() => {
          console.log('[DEBUG] Pagination: Finished initial load');
        });
      } else {
        console.error("[DEBUG] Pagination: No search query provided");
        setError("Cannot load results: Search query is missing");
      }
    }
  }, [searchResultData, textSearchQuery]);

  // Fetch and enhance the next page of search results
  const fetchNextPage = useCallback(async () => {
    if (isLoadingNextPage || !hasMorePages) {
      console.log('[DEBUG] Pagination: Skip fetchNextPage - isLoadingNextPage:', isLoadingNextPage, 'hasMorePages:', hasMorePages);
      return;
    }

    setIsLoadingNextPage(true);
    console.log(`[DEBUG] Pagination: Fetching page ${currentPage + 1}, current results count: ${enhancedResults.length}`);

    try {
      // Get index_id from all results to ensure consistency
      const allIndexIds = searchResultData.textSearchResults.map(result => result.index_id);
      // Use the most common index_id from the results
      const indexId = mostCommonValue(allIndexIds) || defaultIndexId;

      console.log('[DEBUG] Pagination: Index IDs in results for pagination:', allIndexIds);
      console.log('[DEBUG] Pagination: Using most common index_id for pagination:', indexId,
                  'Is ads index?', indexId === process.env.NEXT_PUBLIC_ADS_INDEX_ID,
                  'Is content index?', indexId === process.env.NEXT_PUBLIC_CONTENT_INDEX_ID);

      // Use search query from props
      console.log('[DEBUG] Pagination: Using query:', textSearchQuery, 'index_id:', indexId);

      if (!indexId) {
        console.error("[DEBUG] Pagination: Missing index_id for pagination");
        setError("Cannot load more results: Missing index ID");
        setIsLoadingNextPage(false);
        return;
      }

      // Don't make the request if search query is null
      if (!textSearchQuery) {
        console.error("[DEBUG] Pagination: Search query is required but was null");
        setError("Cannot load more results: Search query is required");
        setIsLoadingNextPage(false);
        return;
      }

      let response;
      let endpoint;

      // For the first page or if we don't have a next_page_token, use the search endpoint
      if (currentPage === 1 || !nextPageToken) {
        // Call API with pagination parameters
        console.log(`[DEBUG] Pagination: Making initial search request for page ${currentPage + 1}`);

        const requestBody = {
          textSearchQuery: textSearchQuery,
          indexId: indexId,
          page_size: 10
        };
        console.log('[DEBUG] Pagination: Request payload:', requestBody);

        endpoint = '/api/search';
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
      } else {
        // Use the retrieve endpoint with the page token for subsequent pages
        console.log(`[DEBUG] Pagination: Retrieving next page using token: ${nextPageToken}`);

        endpoint = `/api/search/retrieve/${nextPageToken}?indexId=${encodeURIComponent(indexId)}`;
        console.log('[DEBUG] Pagination: Retrieve URL with indexId:', endpoint);

        response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DEBUG] Pagination: API error response:', errorText);
        throw new Error(`Failed to fetch page ${currentPage + 1}: ${response.status} ${response.statusText}`);
      }

      const nextPageData = await response.json();
      console.log('[DEBUG] Pagination: Received data:', nextPageData);
      console.log('[DEBUG] Pagination: Results count in response:', nextPageData?.textSearchResults?.length || 0);

      // Update total results if available
      if (nextPageData.pageInfo?.total_results && onUpdateTotalResults) {
        console.log('[DEBUG] Pagination: Updating total results to:', nextPageData.pageInfo.total_results);
        onUpdateTotalResults(nextPageData.pageInfo.total_results);
      }

      // Extract the next page token if available
      if (nextPageData.pageInfo && nextPageData.pageInfo.next_page_token) {
        console.log('[DEBUG] Pagination: Found next_page_token:', nextPageData.pageInfo.next_page_token);
        setNextPageToken(nextPageData.pageInfo.next_page_token);
        setHasMorePages(true);
      } else {
        console.log('[DEBUG] Pagination: No next_page_token found, this is the last page');
        setNextPageToken(null);
        setHasMorePages(false);
      }

      // Fetch video details for the new results
      if (nextPageData?.textSearchResults?.length > 0) {
        console.log('[DEBUG] Pagination: Fetching video details for', nextPageData.textSearchResults.length, 'results');

        const newResults = await Promise.all(
          nextPageData.textSearchResults.map(async (result: EnhancedSearchResult, index: number) => {
            try {
              console.log(`[DEBUG] Pagination: Fetching details for video ${index + 1}/${nextPageData.textSearchResults.length}: ${result.video_id}`);
              const videoDetail = await fetchVideoDetails(result.video_id, indexId);
              return {
                ...result,
                videoDetail,
              };
            } catch (err) {
              console.error(`[DEBUG] Pagination: Failed to fetch details for video ${result.video_id}:`, err);
              return result;
            }
          })
        );

        console.log('[DEBUG] Pagination: Processed', newResults.length, 'new results');

        // Append new results to existing ones
        setEnhancedResults(prev => {
          // Check for duplicates based on unique video IDs and segment times
          const existingIds = new Set(prev.map(item => `${item.video_id}_${item.start}_${item.end}`));

          // Filter out duplicates
          const uniqueNewResults = newResults.filter(item => {
            const itemKey = `${item.video_id}_${item.start}_${item.end}`;
            return !existingIds.has(itemKey);
          });

          console.log(`[DEBUG] Pagination: Filtered out ${newResults.length - uniqueNewResults.length} duplicate results`);

          const updated = [...prev, ...uniqueNewResults];
          console.log('[DEBUG] Pagination: Updated results length:', updated.length);
          return updated;
        });

        // Update current page and check if there are more pages
        // Improved pagination status update logic
        const nextPage = currentPage + 1;
        setCurrentPage(nextPage);

        // Determine if there are more pages based on next_page_token existence
        // This is already handled above where we set the nextPageToken
        // and hasMorePages based on the API response
      } else {
        console.log('[DEBUG] Pagination: No results in response, setting hasMorePages: false');
        setHasMorePages(false);
      }
    } catch (err) {
      console.error("[DEBUG] Pagination: Error loading more search results:", err);
      setError(err instanceof Error ? err.message : "Failed to load more results");
    } finally {
      setIsLoadingNextPage(false);
      console.log('[DEBUG] Pagination: Finished fetch attempt');
    }
  }, [isLoadingNextPage, hasMorePages, currentPage, searchResultData, textSearchQuery, enhancedResults.length]);

  // Trigger pagination when scroll reaches the observer element
  useEffect(() => {
    console.log('[DEBUG] Pagination: Intersection observed:', inView,
      'isLoadingNextPage:', isLoadingNextPage,
      'hasMorePages:', hasMorePages);

    if (inView && !isLoadingNextPage && hasMorePages) {
      console.log('[DEBUG] Pagination: Triggering next page fetch from intersection observer');
      fetchNextPage();
    }
  }, [inView, isLoadingNextPage, hasMorePages, fetchNextPage]);

  // Report initial total results if available
  useEffect(() => {
    if (searchResultData?.pageInfo?.total_results && onUpdateTotalResults) {
      console.log('[DEBUG] Initial total results:', searchResultData.pageInfo.total_results);
      onUpdateTotalResults(searchResultData.pageInfo.total_results);
    }
  }, [searchResultData, onUpdateTotalResults]);

  if (nextPageLoading && enhancedResults.length === 0) {
    return (
      <div className="flex justify-center items-center py-10">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 text-center py-5">
        {error}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Background content with blur when modal is shown */}
      <div className={`${showModal ? 'filter blur-sm brightness-75 transition-all duration-200' : ''}`}>
        {/* Search Results Header */}
        {/* <div className="mb-6 flex items-center">
          <h2 className="text-xl font-semibold">Search Results</h2>
          <span className="ml-2 text-gray-500 text-sm">{totalMatches} matches</span>
        </div> */}

        {/* Grid of search results */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {enhancedResults.map((result, index) => (
            <div
              key={`${result.video_id}-${index}`}
              className="rounded-lg overflow-hidden shadow-md bg-white hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => handleThumbnailClick(result)}
            >
              <div className="relative">
                {/* Thumbnail */}
                <div className="w-full h-40 relative">
                  <img
                    src={result.thumbnail_url || (result.videoDetail?.hls?.thumbnail_urls?.[0] || 'https://placehold.co/600x400')}
                    alt="Video thumbnail"
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Video segment information badge */}
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                  {Math.floor(result.start || result.segments?.[0]?.start || 0)}s -
                  {Math.floor(result.end || result.segments?.[0]?.end || 0)}s
                </div>

                {/* Confidence badge */}
                <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
                  {result.confidence}
                </div>
              </div>

              {/* Video title */}
              <div className="p-2">
                <h3 className="text-sm font-medium truncate">
                  {result.videoDetail?.system_metadata?.video_title || result.video_title || 'Untitled'}
                </h3>
              </div>
            </div>
          ))}

          {/* Loading element for infinite scroll */}
          {hasMorePages && (
            <div ref={observerRef} className="col-span-full text-center py-8 mt-4">
              {isLoadingNextPage ? (
                <div className="flex justify-center items-center w-full">
                  <LoadingSpinner />
                  <span className="ml-2 text-sm text-gray-500">Loading more results...</span>
                </div>
              ) : (
                <div className="text-sm text-gray-500">Scroll for more results</div>
              )}
            </div>
          )}

          {/* No more results indicator */}
          {!hasMorePages && enhancedResults.length > 0 && (
            <div className="col-span-full text-center py-4 text-gray-500">
              {`End of results - ${enhancedResults.length} videos found`}
            </div>
          )}
        </div>
      </div>

      {/* Modal with overlay */}
      {showModal && selectedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Dark overlay */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={closeModal}
          />

          {/* Modal content */}
          <div className="relative z-50 w-[90%] max-w-[800px] bg-white rounded-lg shadow-xl overflow-hidden">
            {/* Modal header */}
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold truncate">
                {selectedResult.videoDetail?.system_metadata?.video_title || selectedResult.video_title || 'Untitled'}
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-200">
              {/* Video Player */}
              <div className="w-full md:w-3/5 p-4">
                <div className="relative aspect-video">
                  {selectedResult.videoDetail?.hls?.video_url ? (
                    <ReactPlayer
                      ref={playerRef}
                      url={selectedResult.videoDetail.hls.video_url}
                      controls
                      width="100%"
                      height="100%"
                      style={{ position: 'absolute', top: 0, left: 0 }}
                      light={false}
                      playIcon={<></>}
                      playing={isPlaying}
                      onProgress={handleProgress}
                      progressInterval={50} // More frequent updates for better end detection
                      config={{
                        file: {
                          attributes: {
                            preload: "auto",
                            controlsList: "nodownload",
                            crossOrigin: "anonymous"
                          },
                          forceVideo: true,
                          forceHLS: false, // Don't force HLS to allow fallback to other formats
                          hlsOptions: {
                            enableWorker: true,
                            debug: false,
                            lowLatencyMode: false,
                            backBufferLength: 90
                          }
                        },
                      }}
                      onReady={() => {
                        console.log("ReactPlayer ready");

                        if (!playerInitialized) {
                          const { startTime } = getSegmentTimes();

                          // Set initial position directly
                          if (playerRef.current) {
                            console.log(`Setting initial position: ${startTime}s`);
                            setLastSeekTime(Date.now());
                            playerRef.current.seekTo(startTime, 'seconds');
                          }

                          // Mark as initialized
                          setPlayerInitialized(true);

                          // Start playback after a delay
                          setTimeout(() => {
                            console.log("Starting initial playback");
                            setIsPlaying(true);
                          }, 250);
                        }
                      }}
                      onError={(e) => {
                        console.error("ReactPlayer error:", e);
                        // Show a user-friendly error message instead of crashing
                        setError("Video playback error. Please try again later.");
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                      <span className="text-gray-500">
                        {selectedResult.videoDetail ?
                          "Video URL is missing" :
                          "Loading video details..."}
                      </span>
                    </div>
                  )}
                </div>

                {/* Segment indicator - simplified */}
                <div className="mt-2 bg-gray-100 p-2 rounded text-sm flex items-center justify-between">
                  <div>
                    Search segment: {Math.floor(getSegmentTimes().startTime)}s ~ {Math.floor(getSegmentTimes().endTime)}s
                    <button
                      className="ml-3 bg-blue-500 text-white px-2 py-1 rounded text-xs"
                      onClick={handleReplaySegment}
                    >
                      Replay Segment
                    </button>
                    <span className="ml-2 text-xs text-gray-500">
                      Current: {Math.floor(playerProgress)}s
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Auto-repeating segment
                  </div>
                </div>
              </div>

              {/* Video Details */}
              <div className="w-full md:w-2/5 p-4 max-h-[50vh] md:max-h-[70vh] overflow-y-auto">
                <h4 className="text-lg font-semibold mb-4">Video Details</h4>

                <div className="mb-4">
                  <p className="text-sm text-gray-700">
                    {selectedResult.videoDetail?.system_metadata?.filename || ""}
                  </p>
                  <p className="text-sm text-gray-500">
                    Duration: {Math.round(selectedResult.videoDetail?.system_metadata?.duration || 0)}s
                  </p>
                </div>

                <div className="mb-4">
                  <h5 className="text-md font-medium mb-2">Segment Info</h5>
                  <div className="bg-gray-100 p-3 rounded">
                    <p className="text-sm">
                      Start: {Math.floor(selectedResult.start || selectedResult.segments?.[0]?.start || 0)}s
                    </p>
                    <p className="text-sm">
                      End: {Math.floor(selectedResult.end || selectedResult.segments?.[0]?.end || 0)}s
                    </p>
                    <p className="text-sm">
                      Match Score: {formatScore(selectedResult.score)}
                    </p>
                  </div>
                </div>

                <div className="mb-4">
                  <h5 className="text-md font-medium mb-2">Tags</h5>
                  {selectedResult.videoDetail?.user_metadata ? (
                    <div className="flex flex-wrap gap-2">
                      {convertMetadataToTags(selectedResult.videoDetail.user_metadata).map((tag, i) => (
                        <div key={i} className="inline-block">
                          <div className="flex items-center gap-1">
                            <span className="bg-blue-100 text-sm px-3 py-1 rounded-full">
                              <span className="font-medium">{tag.category}:</span> {tag.value}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No tags available</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Add this utility function at the bottom of the component before the closing brace
/**
 * Helper function to find the most common value in an array
 */
const mostCommonValue = <T,>(arr: T[]): T | undefined => {
  if (!arr || arr.length === 0) return undefined;

  const counts = arr.reduce((acc, value) => {
    acc[String(value)] = (acc[String(value)] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  let maxCount = 0;
  let maxValue: string | undefined;

  for (const [value, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxValue = value;
    }
  }

  // Return the actual value (not the string representation)
  return arr.find(item => String(item) === maxValue);
};

export default SearchResultList;