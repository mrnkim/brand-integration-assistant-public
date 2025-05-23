import { useState, useEffect, useCallback } from "react";
import { useInView } from "react-intersection-observer";
import LoadingSpinner from "./LoadingSpinner";
import { fetchVideoDetails, VideoDetailResponse } from "@/hooks/apiHooks";
import SearchResultItem from "./SearchResultItem";
import SearchResultModal from "./SearchResultModal";

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

          // Use search query from props instead of URL
          console.log('[DEBUG] Pagination: Using query:', textSearchQuery, 'index_id:', indexId);

          if (!indexId) {
            console.error("[DEBUG] Pagination: Missing index_id in search results and no default configured");
            setError("Cannot load video information: Missing index ID");
            setNextPageLoading(false);
            return;
          }

          console.log("[DEBUG] Pagination: Using index_id for video details:", indexId);


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
            <SearchResultItem
              key={`${result.video_id}-${index}`}
              videoId={result.video_id}
              thumbnailUrl={result.thumbnail_url || (result.videoDetail?.hls?.thumbnail_urls?.[0] || 'https://placehold.co/600x400')}
              videoTitle={result.video_title || result.videoDetail?.system_metadata?.video_title || result.videoDetail?.system_metadata?.filename || 'Untitled'}
              confidence={result.confidence}
              startTime={result.start || result.segments?.[0]?.start || 0}
              endTime={result.end || result.segments?.[0]?.end || 0}
              onClick={() => handleThumbnailClick(result)}
              videoDetail={result.videoDetail}
            />
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
        <SearchResultModal
          selectedResult={selectedResult}
          closeModal={closeModal}
          modalOpened={modalOpened}
        />
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