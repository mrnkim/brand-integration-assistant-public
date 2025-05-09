"use client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import SearchResultList from "./SearchResultList";
import LoadingSpinner from "./LoadingSpinner";
import { ErrorBoundary } from "react-error-boundary";
import { searchVideos } from "@/hooks/apiHooks";

// Get content index ID from environment
const contentIndexId = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID || '';

const ErrorFallback = ({ error }: { error: Error }) => (
  <div className="min-h-[50vh] flex justify-center items-center h-full">
    <div className="text-center">
      <h2 className="text-xl font-bold text-red-600">Something went wrong:</h2>
      <p className="text-gray-700">{error.message}</p>
    </div>
  </div>
);

interface SearchResultsProps {
  textSearchQuery: string;
  textSearchSubmitted: boolean;
}

/**
 * Component to display search results
 */
const SearchResults = ({
  textSearchQuery,
  textSearchSubmitted,
}: SearchResultsProps) => {
  const queryClient = useQueryClient();

  /** Query to fetch text search results */
  const {
    data: textSearchResultData,
    isLoading: textSearchResultLoading,
    error: textSearchError,
  } = useQuery({
    queryKey: ["textSearch", textSearchQuery],
    queryFn: () => searchVideos(textSearchQuery, contentIndexId),
    enabled: textSearchSubmitted && textSearchQuery.trim() !== '',
    staleTime: 300000, // 5 minutes
  });

  /** Invalidate cached query only when text search query changes */
  useEffect(() => {
    if (textSearchSubmitted && textSearchQuery.trim() !== '') {
      queryClient.invalidateQueries({
        queryKey: ["textSearch", textSearchQuery]
      });
    }
  }, [textSearchQuery, queryClient, textSearchSubmitted]);

  if (textSearchError) {
    return <ErrorFallback error={textSearchError as Error} />;
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div>
        {textSearchResultLoading ? (
          <div className="fixed inset-0 flex items-center justify-center bg-white bg-opacity-75 z-50">
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
                {textSearchResultData.textSearchResults.length || 0} matches
              </p>
            </div>
            <SearchResultList
              searchResultData={textSearchResultData}
            />
          </>
        ) : textSearchSubmitted ? (
          <div className="min-h-[50vh] flex justify-center items-center h-full">
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