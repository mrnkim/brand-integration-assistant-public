import { useState, useEffect, useRef } from "react";
import { useInView } from "react-intersection-observer";
import LoadingSpinner from "./LoadingSpinner";
import { fetchVideoDetails, VideoDetailResponse } from "@/hooks/apiHooks";
import { convertMetadataToTags } from "@/hooks/apiHooks";
import ReactPlayer from "react-player";

// Default content index ID from environment variables
const defaultIndexId = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID || '';

interface SearchResultListProps {
  searchResultData: {
    pageInfo: {
      page: number;
      total_page: number;
      total_videos: number;
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
const SearchResultList = ({ searchResultData }: SearchResultListProps) => {
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

  // Using intersection observer to detect elements in view
  const { ref: observerRef } = useInView({
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

  // Enhance search results (fetch video details)
  useEffect(() => {
    const enhanceSearchResults = async () => {
      if (searchResultData?.textSearchResults?.length > 0) {
        setNextPageLoading(true);
        try {
          // Get index_id from the first result, or fall back to the default
          let indexId = searchResultData.textSearchResults[0].index_id;

          // If index_id is missing, use the default from environment variables
          if (!indexId) {
            indexId = defaultIndexId;
            console.log("Using default index_id for video details:", indexId);
          }

          if (!indexId) {
            console.error("Missing index_id in search results and no default configured");
            setError("Cannot load video information: Missing index ID");
            setNextPageLoading(false);
            return;
          }

          console.log("Using index_id for video details:", indexId);

          // Fetch details for all video results
          const detailedResults = await Promise.all(
            searchResultData.textSearchResults.map(async (result) => {
              try {
                // Get video details using videoId and indexId
                const videoDetail = await fetchVideoDetails(result.video_id, indexId);
                return {
                  ...result,
                  videoDetail,
                };
              } catch (err) {
                console.error(`Failed to fetch details for video ${result.video_id}:`, err);
                return result;
              }
            })
          );

          setEnhancedResults(detailedResults);
        } catch (err: unknown) {
          console.error("Error enhancing search results:", err);
          setError(err instanceof Error ? err.message : "An error occurred loading video details");
        } finally {
          setNextPageLoading(false);
        }
      }
    };

    enhanceSearchResults();
  }, [searchResultData]);

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

  const totalMatches = enhancedResults.length;

  return (
    <div className="relative">
      {/* Background content with blur when modal is shown */}
      <div className={`${showModal ? 'filter blur-sm brightness-75 transition-all duration-200' : ''}`}>
        {/* Search Results Header */}
        <div className="mb-6 flex items-center">
          <h2 className="text-xl font-semibold">Search Results</h2>
          <span className="ml-2 text-gray-500 text-sm">{totalMatches} matches</span>
        </div>

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
                  {formatScore(result.score)}
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
          <div ref={observerRef} className="col-span-full text-center py-4">
            {nextPageLoading && enhancedResults.length > 0 && (
              <div className="flex justify-center items-center w-full">
                <LoadingSpinner />
              </div>
            )}
          </div>
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
                          },
                          forceVideo: true,
                          forceHLS: true, // Force HLS to ensure proper streaming
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

export default SearchResultList;