import { useState, useRef, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import LoadingSpinner from "./LoadingSpinner";
import { fetchVideoDetails, VideoDetailResponse } from "@/hooks/apiHooks";
import { convertMetadataToTags } from "@/hooks/apiHooks";

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

  const modalVideoRef = useRef<HTMLVideoElement>(null);

  // Using intersection observer to detect elements in view
  const { ref: observerRef } = useInView({
    threshold: 0.1,
    triggerOnce: false,
  });

  // Format the score as a percentage
  const formatScore = (score: number): string => {
    return `${score.toFixed(1)}%`;
  };

  // Handle video thumbnail click
  const handleThumbnailClick = (result: EnhancedSearchResult) => {
    setSelectedResult(result);
    setShowModal(true);
  };

  // Close the modal
  const closeModal = () => {
    if (modalVideoRef.current) {
      modalVideoRef.current.pause();
    }
    setShowModal(false);
    setSelectedResult(null);
  };

  // Handle play in modal
  useEffect(() => {
    if (showModal && selectedResult && modalVideoRef.current && selectedResult.videoDetail?.hls?.video_url) {
      const startTime = selectedResult.start || selectedResult.segments?.[0]?.start || 0;
      modalVideoRef.current.currentTime = startTime;
      modalVideoRef.current.play().catch(err => console.error("Error playing video:", err));
    }
  }, [showModal, selectedResult]);

  // Handle video time update event for modal video
  const handleModalTimeUpdate = () => {
    if (!modalVideoRef.current || !selectedResult) return;

    const endTime = selectedResult.end || selectedResult.segments?.[0]?.end;

    if (endTime && modalVideoRef.current.currentTime >= endTime) {
      modalVideoRef.current.pause();
    }
  };

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
          <div className={`${showModal ? 'filter blur-sm brightness-75 transition-all duration-200' : ''}`}>
</div>

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
                    <video
                      ref={modalVideoRef}
                      src={selectedResult.videoDetail.hls.video_url}
                      poster={selectedResult.thumbnail_url || selectedResult.videoDetail.hls.thumbnail_urls?.[0] || ''}
                      className="w-full h-full object-contain"
                      onTimeUpdate={handleModalTimeUpdate}
                      controls
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                      <span className="text-gray-500">Loading video...</span>
                    </div>
                  )}
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