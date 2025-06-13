import { useState, useEffect, useCallback } from "react";
import { useInView } from "react-intersection-observer";
import LoadingSpinner from "./LoadingSpinner";
import { fetchVideoDetails } from "@/hooks/apiHooks";
import SearchResultItem from "./SearchResultItem";
import SearchResultModal from "./SearchResultModal";
import { SearchResultListProps, EnhancedSearchResult } from "@/types";

const defaultIndexId = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID || '';

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
      if (!textSearchQuery) {
        console.error("[DEBUG] Pagination: Search query is required but was null");
        setError("Cannot load results: Search query is missing");
        return;
      }

      if (searchResultData?.textSearchResults?.length > 0) {
        setNextPageLoading(true);

        const initialPage = searchResultData.pageInfo?.page || 1;

        if (searchResultData.pageInfo?.next_page_token) {
          setNextPageToken(searchResultData.pageInfo.next_page_token);
          setHasMorePages(true);
        } else {
          const resultsCount = searchResultData.textSearchResults.length;
          const hasMore = resultsCount >= 10;
          setHasMorePages(hasMore);
        }

        setCurrentPage(initialPage);

        try {
          const allIndexIds = searchResultData.textSearchResults.map(result => result.index_id);
          const indexId = mostCommonValue(allIndexIds) || defaultIndexId;

          if (!indexId) {
            setError("Cannot load video information: Missing index ID");
            setNextPageLoading(false);
            return;
          }

          const detailedResults = await Promise.all(
            searchResultData.textSearchResults.map(async (result) => {
              try {
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

          setEnhancedResults(detailedResults);
        } catch (err: unknown) {
          console.error("[DEBUG] Pagination: Error enhancing search results:", err);
          setError(err instanceof Error ? err.message : "An error occurred loading video details");
        } finally {
          setNextPageLoading(false);
        }
      } else {
      }
    };

    if (searchResultData?.textSearchResults?.length > 0) {
      if (textSearchQuery) {
        enhanceSearchResults();
      } else {
        console.error("[DEBUG] Pagination: No search query provided");
        setError("Cannot load results: Search query is missing");
      }
    }
  }, [searchResultData, textSearchQuery]);

  // Fetch and enhance the next page of search results
  const fetchNextPage = useCallback(async () => {
    if (isLoadingNextPage || !hasMorePages) {
      return;
    }

    setIsLoadingNextPage(true);

    try {
      const allIndexIds = searchResultData.textSearchResults.map(result => result.index_id);
      // Use the most common index_id from the results
      const indexId = mostCommonValue(allIndexIds) || defaultIndexId;


      if (!indexId) {
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

        const requestBody = {
          textSearchQuery: textSearchQuery,
          indexId: indexId,
          page_size: 10
        };

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
        endpoint = `/api/search/retrieve/${nextPageToken}?indexId=${encodeURIComponent(indexId)}`;

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

      // Update total results if available
      if (nextPageData.pageInfo?.total_results && onUpdateTotalResults) {
        onUpdateTotalResults(nextPageData.pageInfo.total_results);
      }

      // Extract the next page token if available
      if (nextPageData.pageInfo && nextPageData.pageInfo.next_page_token) {
        setNextPageToken(nextPageData.pageInfo.next_page_token);
        setHasMorePages(true);
      } else {
        setNextPageToken(null);
        setHasMorePages(false);
      }

      // Fetch video details for the new results
      if (nextPageData?.textSearchResults?.length > 0) {

        const newResults = await Promise.all(
          nextPageData.textSearchResults.map(async (result: EnhancedSearchResult) => {
            try {
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


          const updated = [...prev, ...uniqueNewResults];
          return updated;
        });

        const nextPage = currentPage + 1;
        setCurrentPage(nextPage);

      } else {
        setHasMorePages(false);
      }
    } catch (err) {
      console.error("[DEBUG] Pagination: Error loading more search results:", err);
      setError(err instanceof Error ? err.message : "Failed to load more results");
    } finally {
      setIsLoadingNextPage(false);
    }
  }, [isLoadingNextPage, hasMorePages, currentPage, searchResultData, textSearchQuery, enhancedResults.length]);

  // Trigger pagination when scroll reaches the observer element
  useEffect(() => {
    if (inView && !isLoadingNextPage && hasMorePages) {
      fetchNextPage();
    }
  }, [inView, isLoadingNextPage, hasMorePages, fetchNextPage]);

  // Report initial total results if available
  useEffect(() => {
    if (searchResultData?.pageInfo?.total_results && onUpdateTotalResults) {
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