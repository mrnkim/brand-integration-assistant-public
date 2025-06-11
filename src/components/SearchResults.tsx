"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import SearchResultList from "./SearchResultList";
import LoadingSpinner from "./LoadingSpinner";
import { ErrorBoundary } from "react-error-boundary";
import { searchVideos } from "@/hooks/apiHooks";
import { SearchResultsProps } from "@/types";

const defaultIndexId = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID || '';

const ErrorFallback = ({ error }: { error: Error }) => (
  <div className="min-h-[20vh] flex justify-center items-center h-full">
    <div className="text-center">
      <h2 className="text-xl font-bold text-red-600">Something went wrong:</h2>
      <p className="text-gray-700">{error.message}</p>
    </div>
  </div>
);



/**
 * Component to display search results
 */
const SearchResults = ({
  textSearchQuery,
  textSearchSubmitted,
  indexId,
}: SearchResultsProps) => {
  const queryClient = useQueryClient();
  // Use the provided indexId or fall back to the default content index
  const searchIndexId = indexId || defaultIndexId;

  // State to track the total results count
  const [totalResultsCount, setTotalResultsCount] = useState<number>(0);

  /** Query to fetch text search results */
  const {
    data: textSearchResultData,
    isLoading: textSearchResultLoading,
    error: textSearchError,
  } = useQuery({
    queryKey: ["textSearch", textSearchQuery, searchIndexId],
    queryFn: () => searchVideos(textSearchQuery, searchIndexId),
    enabled: textSearchSubmitted && textSearchQuery.trim() !== '',
    staleTime: 300000, // 5 minutes
  });

  // Update total results count when data is loaded - first priority is API total_results
  useEffect(() => {
    if (textSearchResultData?.pageInfo?.total_results) {
      // Always use the most accurate count from the API
      setTotalResultsCount(textSearchResultData.pageInfo.total_results);
    }
  }, [textSearchResultData?.pageInfo?.total_results]);

  /** Invalidate cached query only when text search query changes */
  useEffect(() => {
    if (textSearchSubmitted && textSearchQuery.trim() !== '') {
      // Reset total count when query changes
      setTotalResultsCount(0);

      queryClient.invalidateQueries({
        queryKey: ["textSearch", textSearchQuery, searchIndexId]
      });
    }
  }, [textSearchQuery, searchIndexId, queryClient, textSearchSubmitted]);

  // Function to update the total results count from SearchResultList pagination
  const updateTotalResults = (count: number) => {
    if (count > totalResultsCount) {
      setTotalResultsCount(count);
    }
  };

  // Get the final count to display
  const displayCount = totalResultsCount ||
                       textSearchResultData?.pageInfo?.total_results ||
                       textSearchResultData?.textSearchResults?.length || 0;

  if (textSearchError) {
    return <ErrorFallback error={textSearchError as Error} />;
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div>
        {/* Hidden debug element */}
        <div className="hidden">
          <pre>
            {JSON.stringify({
              total_results: textSearchResultData?.pageInfo?.total_results,
              pageInfo: textSearchResultData?.pageInfo,
              resultCount: textSearchResultData?.textSearchResults?.length
            }, null, 2)}
          </pre>
        </div>

        {textSearchResultLoading ? (
          <div className="fixed inset-0 flex items-center justify-center bg-opacity-75 z-50">
            <LoadingSpinner />
          </div>
        ) : textSearchSubmitted && textSearchResultData && textSearchResultData.textSearchResults && textSearchResultData.textSearchResults.length > 0 ? (
          <>
            <div className="flex items-center mt-5 mb-5">
              <p className="text-lg font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                Search Results
              </p>
              <p className="text-gray-600 my-0 text-sm whitespace-nowrap ml-1.5">
                <span> • </span>
                {"  "}
                {displayCount} matches
              </p>
            </div>
            <SearchResultList
              searchResultData={textSearchResultData}
              onUpdateTotalResults={updateTotalResults}
              textSearchQuery={textSearchQuery}
            />
          </>
        ) : textSearchSubmitted ? (
          <div className="min-h-[20vh] flex justify-center items-center h-full">
            <div className="h-full w-full flex flex-col items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="mt-2 text-center text-sm font-normal text-gray-900">
                <p>No search results found.</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ErrorBoundary>
  );
};

export default SearchResults;