"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useInfiniteQuery, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import SearchBar from '@/components/SearchBar';
import ActionButtons from '@/components/ActionButtons';
import ContentItem from '@/components/ContentItem';
import SearchResults from '@/components/SearchResults';

import {
  fetchVideos,
  fetchIndex,
  generateMetadata,
  parseHashtags,
  updateVideoMetadata,
  convertMetadataToTags,
  fetchVideoDetails,
} from '@/hooks/apiHooks';
import LoadingSpinner from '../../components/LoadingSpinner';
import { AdItemType, VideoData, Tag } from '@/types';
import FilterMenu, { ActiveFilters, useFilterState } from '@/components/FilterMenu';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      retry: false,
    },
  },
});

const contentIndexId = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID || 'default-content-index';

const COLUMNS = [
  { id: 'video', label: 'Video', width: '280px' },
  { id: 'topic_category', label: 'Topic Category', width: '110px' },
  { id: 'emotions', label: 'Emotions', width: '110px' },
  { id: 'brands', label: 'Brands', width: '110px' },
  { id: 'demo_gender', label: 'Target Demo: Gender', width: '110px' },
  { id: 'demo_age', label: 'Target Demo: Age', width: '110px' },
  { id: 'location', label: 'Location', width: '110px' },
  { id: 'source', label: 'Source', width: '250px' },
];

// Limit for concurrent metadata processing
const CONCURRENCY_LIMIT = 10;

export default function ContentLibraryPage() {
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [processingMetadata, setProcessingMetadata] = useState(false);
  const [videosInProcessing, setVideosInProcessing] = useState<string[]>([]);
  const [adItems, setAdItems] = useState<AdItemType[]>([]);
  const [skipMetadataProcessing, setSkipMetadataProcessing] = useState(false);
  const [processedVideoIds, setProcessedVideoIds] = useState<Set<string>>(new Set());


  const { data: indexData } = useQuery({
    queryKey: ['index', contentIndexId],
    queryFn: () => fetchIndex(contentIndexId),
    staleTime: 0,
    refetchInterval: 5000,
  });

  // Replace the filter state with the useFilterState hook
  const {
    filterOptions,
    activeFilters,
    filteredItems,
    isFiltering,
    showFilterMenu: filterMenuShow,
    selectedFilterCategory: filterSelectedCategory,
    filterCategories,
    capitalizeText,
    isFilterActive,
    getActiveCategoryFilterCount,
    getTotalActiveFilterCount,
    toggleFilter,
    resetCategoryFilters,
    resetAllFilters,
    handleFilter,
    handleFilterCategorySelect,
    closeFilterMenu,
  } = useFilterState(adItems);

  // Intersection Observer for infinite scroll
  const { ref: observerRef, inView } = useInView({
    threshold: 0.1,
    triggerOnce: false,
    rootMargin: '200px 0px', // Load earlier before the user sees the end
  });

  const {
    data: videosData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch
  } = useInfiniteQuery({
    queryKey: ['videos', contentIndexId],
    queryFn: ({ pageParam }) => fetchVideos(pageParam, contentIndexId),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {

      // Calculate loaded video count from all pages
      const loadedCount = allPages.flatMap(page => page.data).length;

      // Load next page if we haven't loaded all videos and there's a next page
      if (loadedCount < lastPage.page_info.total_count && lastPage.page_info.page < lastPage.page_info.total_page) {
        return lastPage.page_info.page + 1;
      }
      return undefined;
    },
    enabled: !!contentIndexId,
  });

  // Load next page when observer is in view
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage && !isFiltering) {
      setSkipMetadataProcessing(false);
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, isFiltering, fetchNextPage]);

  // Convert API response to AdItemType
  const convertToAdItem = (video: VideoData): AdItemType => {
    let tags: Tag[] = [];

    const isStillIndexing = false;

    if (isStillIndexing) {
      tags = [];
    }
    else if (video.metadata?.tags) {
      tags = video.metadata.tags;
    }
    else if (video.user_metadata) {
      tags = convertMetadataToTags(video.user_metadata);
    }
    else {
      tags = [];
    }

    const metadata = (!isStillIndexing && video.user_metadata) ? {
      source: video.user_metadata.source as string || '',
      topic_category: video.user_metadata.sector as string || '',
      emotions: video.user_metadata.emotions as string || '',
      brands: video.user_metadata.brands as string || '',
      locations: video.user_metadata.locations as string || '',
      demo_age: video.user_metadata.demographics ?
                (video.user_metadata.demographics as string).split(',')
                .filter(d => d.toLowerCase().includes('age') ||
                            d.toLowerCase().includes('old') ||
                            /\d+-\d+/.test(d)).join(', ') : '',
      demo_gender: video.user_metadata.demographics ?
                  (video.user_metadata.demographics as string).split(',')
                  .filter(d => d.toLowerCase().includes('male') ||
                              d.toLowerCase().includes('women') ||
                              d.toLowerCase().includes('men')).join(', ') : '',
    } : undefined;

    const thumbnailUrl = video.hls?.thumbnail_urls?.[0] || 'https://placehold.co/600x400?text=No+Thumbnail';

    return {
      id: video._id,
      thumbnailUrl: thumbnailUrl,
      title: video.system_metadata?.video_title || video.system_metadata?.filename || 'Untitled Video',
      videoUrl: video.hls?.video_url || '',
      tags: tags,
      metadata: metadata,
      isIndexing: isStillIndexing,
      status: undefined
    };
  };

  // Function to refresh metadata for a specific video
  const refreshVideoMetadata = useCallback(async (videoId: string) => {
    if (!contentIndexId) return;

    try {
      const updatedVideo = await fetchVideoDetails(videoId, contentIndexId);

      if (updatedVideo) {

        setAdItems(prevItems => {
          return prevItems.map(item => {
            if (item.id === videoId) {
              const updatedMetadata = updatedVideo.user_metadata ? {
                source: updatedVideo.user_metadata.source || '',
                topic_category: updatedVideo.user_metadata.sector || '',
                emotions: updatedVideo.user_metadata.emotions || '',
                brands: updatedVideo.user_metadata.brands || '',
                locations: updatedVideo.user_metadata.locations || '',
                demo_age: updatedVideo.user_metadata.demographics ?
                  (updatedVideo.user_metadata.demographics as string).split(',')
                  .filter(d => d.toLowerCase().includes('age') ||
                    d.toLowerCase().includes('old') ||
                    /\d+-\d+/.test(d)).join(', ') : '',
                demo_gender: updatedVideo.user_metadata.demographics ?
                  (updatedVideo.user_metadata.demographics as string).split(',')
                  .filter(d => d.toLowerCase().includes('male') ||
                    d.toLowerCase().includes('women') ||
                    d.toLowerCase().includes('men')).join(', ') : '',
              } : undefined;

              const updatedTags = updatedVideo.user_metadata ? convertMetadataToTags(updatedVideo.user_metadata) : [];

              const updatedItem = {
                ...item,
                tags: updatedTags,
                metadata: updatedMetadata,
                status: item.status === 'indexing' ? 'indexing' : undefined
              };

              return updatedItem;
            }
            return item;
          });
        });
      }
    } catch (error) {
      console.error(`Error refreshing metadata for video ${videoId}:`, error);
      if (refetch) {
        refetch();
      }
    }
  }, [contentIndexId, refetch]);

  // Process metadata for a single video
  const processVideoMetadataSingle = useCallback(async (video: VideoData): Promise<boolean> => {
    if (!contentIndexId) return false;

    const videoId = video._id;

    if (processedVideoIds.has(videoId) || videosInProcessing.includes(videoId)) {
      return false;
    }

    try {
      if (!video.user_metadata ||
          Object.keys(video.user_metadata).length === 0 ||
          (!video.user_metadata.topic_category &&
           !video.user_metadata.emotions && !video.user_metadata.brands &&
           !video.user_metadata.locations)) {

        setVideosInProcessing(prev => [...prev, videoId]);

        const hashtagText = await generateMetadata(videoId);

        if (hashtagText) {
          const metadata = parseHashtags(hashtagText);

          await updateVideoMetadata(videoId, contentIndexId, metadata);

          setAdItems(prevItems => {
            return prevItems.map(item => {
              if (item.id === videoId) {
                const updatedTags = convertMetadataToTags(metadata);

                return {
                  ...item,
                  metadata: metadata,
                  tags: updatedTags,
                  status: item.isIndexing ? item.status : undefined
                };
              }
              return item;
            });
          });

          setProcessedVideoIds(prev => new Set(prev).add(videoId));
          setVideosInProcessing(prev => prev.filter(id => id !== videoId));
          return true;
        }

        setVideosInProcessing(prev => prev.filter(id => id !== videoId));
      } else {
        setProcessedVideoIds(prev => new Set(prev).add(videoId));
      }
      return false;
    } catch (error) {
      console.error(`Error processing metadata for video ${videoId}:`, error);
      setVideosInProcessing(prev => prev.filter(id => id !== videoId));
      return false;
    }
  }, [contentIndexId, processedVideoIds, videosInProcessing]);

  // Function to filter videos that need metadata processing
  const filterVideosNeedingMetadata = (videos: VideoData[], processedIds: Set<string>, inProcessingIds: string[]) => {
    return videos.filter(video =>
      !processedIds.has(video._id) &&
      !inProcessingIds.includes(video._id) &&
      (!video.user_metadata ||
      Object.keys(video.user_metadata).length === 0 ||
      (
       !video.user_metadata.topic_category &&
       !video.user_metadata.emotions &&
       !video.user_metadata.brands &&
       !video.user_metadata.locations))
    );
  };

  // Batch process video metadata with concurrency control
  const processVideoMetadata = useCallback(async (videos: VideoData[]) => {
    if (!contentIndexId || videos.length === 0 || skipMetadataProcessing) return;

    const videosNeedingMetadata = videos.filter(video => {
      if (processedVideoIds.has(video._id) || videosInProcessing.includes(video._id)) {
        return false;
      }

              const isStillIndexing = false;
      if (isStillIndexing) {
        return false;
      }

      return (!video.user_metadata ||
        Object.keys(video.user_metadata).length === 0 ||
        (
         !video.user_metadata.topic_category &&
         !video.user_metadata.emotions &&
         !video.user_metadata.brands &&
         !video.user_metadata.locations));
    });

    if (videosNeedingMetadata.length === 0) {
      return;
    }

    setProcessingMetadata(true);
    setSkipMetadataProcessing(true);

    try {
      const processBatch = async (batch: VideoData[]) => {
        const results = await Promise.all(
          batch.map(async (video) => {
            const result = await processVideoMetadataSingle(video);
            return result;
          })
        );

        return results.some(result => result);
      };

      for (let i = 0; i < videosNeedingMetadata.length; i += CONCURRENCY_LIMIT) {
        const batch = videosNeedingMetadata.slice(i, i + CONCURRENCY_LIMIT);
        await processBatch(batch);
      }

    } catch (error) {
      console.error("Error processing video metadata:", error);
    } finally {
      setProcessingMetadata(false);
      setVideosInProcessing([]);
      // Re-enable metadata processing after completion
      setTimeout(() => setSkipMetadataProcessing(false), 2000);
    }
        }, [contentIndexId, processVideoMetadataSingle, skipMetadataProcessing, processedVideoIds, videosInProcessing]);

  // Update ContentItems array whenever video data changes
  useEffect(() => {
    if (videosData) {

      setAdItems(prevItems => {
        const existingItemsMap = new Map(
          prevItems.map(item => [item.id, item])
        );

        const updatedItems = videosData.pages.flatMap(page =>
          page.data.map(video => {
            const videoId = video._id;
            const existingItem = existingItemsMap.get(videoId);

            if (existingItem && (
              (existingItem.metadata && Object.keys(existingItem.metadata).length > 0) ||
              (existingItem.tags && existingItem.tags.length > 0)
            )) {

              return {
                ...existingItem,
                thumbnailUrl: video.hls?.thumbnail_urls?.[0] || existingItem.thumbnailUrl || 'https://placehold.co/600x400?text=No+Thumbnail',
                videoUrl: video.hls?.video_url || existingItem.videoUrl || '',
                title: video.system_metadata?.video_title || video.system_metadata?.filename || existingItem.title || 'Untitled Video',
              };
            }

            const newItem = convertToAdItem(video);
            return newItem;
          })
        );

        return updatedItems;
      });

      if (videosData.pages.length > 0 && !processingMetadata && !skipMetadataProcessing) {
        setTimeout(() => {
          const allVideos = videosData.pages.flatMap(page => page.data);
          const newlyLoadedVideos = filterVideosNeedingMetadata(allVideos, processedVideoIds, videosInProcessing);

          if (newlyLoadedVideos.length > 0) {
            processVideoMetadata(newlyLoadedVideos);
          }
        }, 100);
      }
    }
  }, [videosData, processingMetadata, processVideoMetadata, skipMetadataProcessing, processedVideoIds, videosInProcessing]);

  // Search handler
  const handleSearch = (query: string) => {
    if (query.trim() !== '') {
      setSearchQuery(query);
      setSearchSubmitted(true);
    } else {
      setSearchSubmitted(false);
    }
  };









  const combinedItems = useMemo(() => {
    return adItems;
  }, [adItems]);

  const displayItems = useMemo(() => {
    if (isFiltering) {
      return filteredItems;
    }
    return combinedItems;
  }, [isFiltering, filteredItems, combinedItems]);

  const totalVideoCount = useMemo(() => {
    if (isFiltering) {
      return filteredItems.length;
    }

    if (indexData?.video_count) {
      return indexData.video_count;
    }

    if (adItems.length > 0) {
      return adItems.length;
    }

    return 0;
  }, [isFiltering, filteredItems.length, indexData?.video_count, adItems.length]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen bg-zinc-100 overflow-x-hidden">
        {/* Main content */}
        <div className="flex-1 flex flex-col bg-zinc-100 min-w-0">
          {/* Fixed header area - positioned relative to main content area */}
          <div className="fixed top-0 left-0 right-0 z-40 bg-zinc-100">
            <div className="w-full px-8">
              {/* Search area with solid background */}
              <div className="bg-zinc-100 w-full">
                <div className="p-4 mt-2">
                  <SearchBar
                    onSearch={handleSearch}
                    placeholder="Search videos..."
                    defaultValue={searchQuery}
                  />
                </div>

                {/* Action buttons and filter tabs - hide when search results are shown */}
                {!searchSubmitted && (
                  <div className="px-4 pb-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <ActionButtons
                          onFilter={handleFilter}
                        />

                        {/* Active filter indicators */}
                        {getTotalActiveFilterCount() > 0 && (
                          <ActiveFilters
                            activeFilters={activeFilters}
                            onResetCategoryFilters={resetCategoryFilters}
                            onResetAllFilters={resetAllFilters}
                            getTotalActiveFilterCount={getTotalActiveFilterCount}
                            capitalizeText={capitalizeText}
                          />
                        )}
                      </div>
                      <div className="text-sm">
                        {isFiltering ? filteredItems.length : totalVideoCount} videos
                        {processingMetadata && videosInProcessing.length > 0 && (
                          <span className="ml-2 text-blue-500 flex items-center">
                            <div className="w-4 h-4">
                              <LoadingSpinner />
                            </div>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Filter Menu */}
                    {filterMenuShow && (
                      <FilterMenu
                        showFilterMenu={filterMenuShow}
                        selectedFilterCategory={filterSelectedCategory}
                        filterCategories={filterCategories}
                        filterOptions={filterOptions}
                        onFilterCategorySelect={handleFilterCategorySelect}
                        onToggleFilter={toggleFilter}
                        onResetCategoryFilters={resetCategoryFilters}
                        onCloseFilterMenu={closeFilterMenu}
                        getActiveCategoryFilterCount={getActiveCategoryFilterCount}
                        isFilterActive={isFilterActive}
                        capitalizeText={capitalizeText}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Table header with solid background - hide when search results are shown */}
              {!searchSubmitted && (
                <div className="bg-zinc-100 w-full">
                  <div className="flex border-b pb-3 w-full overflow-x-auto px-4">
                    {COLUMNS.map(column => (
                      <div
                        key={column.id}
                        className="font-medium text-center text-md flex-shrink-0"
                        style={{ width: column.width }}
                      >
                        {column.label.includes('\n')
                          ? column.label.split('\n').map((part, i) => (
                              <div key={i}>{capitalizeText(part)}</div>
                            ))
                          : capitalizeText(column.label)
                        }
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Content area with proper spacing and overflow handling */}
          <div className="w-full">
            <div className="w-full px-8">
              <div className={`${searchSubmitted ? 'pt-[90px]' : 'pt-[185px]'} w-full`}>
                {searchSubmitted ? (
                  <div className="px-4 w-full">
                    <SearchResults
                      textSearchQuery={searchQuery}
                      textSearchSubmitted={searchSubmitted}
                      indexId={contentIndexId}
                    />
                  </div>
                ) : (
                  <div className="px-4">
                    {/* Video content grid */}
                    {isLoading ? (
                      <div className="flex flex-col justify-center items-center h-40">
                        <LoadingSpinner />
                        <p className="mt-4 text-gray-500">Loading videos...</p>
                      </div>
                    ) : isError ? (
                      <div className="flex justify-center items-center h-40 text-red-500">
                        Error loading data: {error instanceof Error ? error.message : 'Unknown error'}
                      </div>
                    ) : (isFiltering ? filteredItems : displayItems).length === 0 ? (
                      <div className="flex justify-center items-center h-40 text-gray-500">
                        {isFiltering ? 'No videos match the current filters' : 'No videos available'}
                      </div>
                    ) : (
                      <div className="mt-3 ml-2 overflow-x-auto">
                        {(isFiltering ? filteredItems : displayItems).map(item => (
                          item.isIndexing ? (
                            <div key={item.id} className="flex w-full mb-4 min-w-max">
                              <div className="w-64 flex-shrink-0 mr-4">
                                <div className="relative aspect-video bg-black rounded-[45.60px] overflow-hidden">
                                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <div className="w-10 h-10 mb-2 rounded-full bg-black bg-opacity-40 flex items-center justify-center">
                                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                                    </div>
                                    <div className="text-white text-sm font-medium text-center bg-black bg-opacity-40 px-2 py-1 rounded">
                                      {item.status && item.status !== 'unknown'
                                        ? `${item.status.charAt(0).toUpperCase() + item.status.slice(1)}`
                                        : 'Processing'}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-2">
                                  <p className="text-sm font-medium truncate">{item.title}</p>
                                </div>
                              </div>
                              {COLUMNS.slice(1).map(column => (
                                <div
                                  key={`${item.id}-${column.id}`}
                                  className="flex-shrink-0 text-center flex items-center justify-center"
                                  style={{ width: column.width }}
                                >
                                  {column.id === 'video' ? null : (
                                    <div className="flex items-center justify-center">
                                      <div className="w-5 h-5">
                                        <LoadingSpinner />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <ContentItem
                              key={item.id}
                              videoId={item.id}
                              indexId={contentIndexId}
                              thumbnailUrl={item.thumbnailUrl}
                              title={item.title}
                              videoUrl={item.videoUrl}
                              tags={item.tags}
                              metadata={item.metadata}
                              isLoadingMetadata={videosInProcessing.includes(item.id)}
                              onMetadataUpdated={() => {
                                refreshVideoMetadata(item.id);
                              }}
                            />
                          )
                        ))}

                        {/* Infinite scroll loading indicator */}
                        {!isFiltering && (
                          <div
                            className="flex justify-center py-4 mb-8"
                            ref={observerRef}
                          >
                            {isFetchingNextPage ? (
                              <div className="flex items-center space-x-2">
                                <LoadingSpinner />
                                <span className="text-gray-500">Loading more videos...</span>
                              </div>
                            ) : hasNextPage ? (
                              <div className="h-10 w-full" />
                            ) : (
                              <div className="text-sm text-gray-500">All videos loaded</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>


    </QueryClientProvider>
  );
};