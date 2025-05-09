"use client";

import { useState, useEffect, useCallback } from 'react';
import { useInfiniteQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Sidebar from '@/components/Sidebar';
import SearchBar from '@/components/SearchBar';
import ActionButtons from '@/components/ActionButtons';
import FilterTabs from '@/components/FilterTabs';
import ContentItem from '@/components/ContentItem';
import SearchResults from '@/components/SearchResults';
import { ContentItem as ContentItemType, VideoData, Tag } from '@/types';
import {
  fetchVideos,
  generateMetadata,
  parseHashtags,
  updateVideoMetadata,
  convertMetadataToTags
} from '@/hooks/apiHooks';
import LoadingSpinner from '../../components/LoadingSpinner';

// Create a client
const queryClient = new QueryClient();

// Content Index ID from .env
const contentIndexId = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID || 'default-content-index';

// Column definitions
const COLUMNS = [
  { id: 'video', label: 'Video', width: '250px' },
  { id: 'source', label: 'Source', width: '180px' },
  { id: 'sector', label: 'Sector', width: '140px' },
  { id: 'emotions', label: 'Emotions', width: '140px' },
  { id: 'brands', label: 'Brands', width: '140px' },
  { id: 'demographics', label: 'Demographics', width: '140px' },
  { id: 'location', label: 'Location', width: '140px' },
];

// Limit for concurrent metadata processing
const CONCURRENCY_LIMIT = 3;

export default function ContentLibrary() {
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('Video');
  const [processingMetadata, setProcessingMetadata] = useState(false);
  const [videosInProcessing, setVideosInProcessing] = useState<string[]>([]);
  const [contentItems, setContentItems] = useState<ContentItemType[]>([]);
  const [initialLoadCompleted, setInitialLoadCompleted] = useState(false);
  const [skipMetadataProcessing, setSkipMetadataProcessing] = useState(false);

  // Fetch videos from API
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
    getNextPageParam: (lastPage) => {
      if (lastPage.page_info.page < lastPage.page_info.total_page) {
        return lastPage.page_info.page + 1;
      }
      return undefined;
    },
    enabled: !!contentIndexId,
  });

  // Convert API response to ContentItemType
  const convertToContentItem = (video: VideoData): ContentItemType => {
    let tags: Tag[] = [];

    // Use existing tags if available
    if (video.metadata?.tags) {
      tags = video.metadata.tags;
    }
    // Convert user metadata to tags
    else if (video.user_metadata) {
      tags = convertMetadataToTags(video.user_metadata);
    }

    return {
      id: video._id,
      thumbnailUrl: video.hls?.thumbnail_urls?.[0] || 'https://placehold.co/600x400',
      title: video.system_metadata?.video_title || video.system_metadata?.filename || 'Untitled Video',
      videoUrl: video.hls?.video_url || '',
      tags: tags,
      metadata: video.user_metadata as {
        source?: string;
        sector?: string;
        emotions?: string;
        brands?: string;
        locations?: string;
      }
    };
  };

  // Process metadata for a single video
  const processVideoMetadataSingle = useCallback(async (video: VideoData): Promise<boolean> => {
    if (!contentIndexId) return false;

    const videoId = video._id;

    try {
      // 1. Only process if metadata is missing - stricter check
      if (!video.user_metadata ||
          Object.keys(video.user_metadata).length === 0 ||
          (!video.user_metadata.source && !video.user_metadata.sector &&
           !video.user_metadata.emotions && !video.user_metadata.brands &&
           !video.user_metadata.locations)) {

        // 2. Generate metadata
        console.log(`Generating metadata for video ${videoId}`);
        setVideosInProcessing(prev => [...prev, videoId]);

        const hashtagText = await generateMetadata(videoId);

        if (hashtagText) {
          // 3. Parse hashtags to create metadata object
          const metadata = parseHashtags(hashtagText);

          // 4. Save metadata
          console.log(`Updating metadata for video ${videoId}`, metadata);
          await updateVideoMetadata(videoId, contentIndexId, metadata);
          setVideosInProcessing(prev => prev.filter(id => id !== videoId));
          return true;
        }

        setVideosInProcessing(prev => prev.filter(id => id !== videoId));
      } else {
        console.log(`Video ${videoId} already has metadata, skipping...`);
      }
      return false;
    } catch (error) {
      console.error(`Error processing metadata for video ${videoId}:`, error);
      setVideosInProcessing(prev => prev.filter(id => id !== videoId));
      return false;
    }
  }, [contentIndexId]);

  // Batch process video metadata with concurrency control
  const processVideoMetadata = useCallback(async (videos: VideoData[]) => {
    if (!contentIndexId || videos.length === 0 || skipMetadataProcessing) return;

    // Filter videos that need metadata
    const videosNeedingMetadata = videos.filter(video =>
      !video.user_metadata ||
      Object.keys(video.user_metadata).length === 0 ||
      (!video.user_metadata.source && !video.user_metadata.sector &&
       !video.user_metadata.emotions && !video.user_metadata.brands &&
       !video.user_metadata.locations)
    );

    if (videosNeedingMetadata.length === 0) return;

    setProcessingMetadata(true);

    try {
      let metadataUpdated = false;

      // Function for concurrency control
      const processBatch = async (batch: VideoData[]) => {
        const results = await Promise.all(
          batch.map(async (video) => {
            const result = await processVideoMetadataSingle(video);
            return result;
          })
        );

        return results.some(result => result);
      };

      // Process videos in batches
      for (let i = 0; i < videosNeedingMetadata.length; i += CONCURRENCY_LIMIT) {
        const batch = videosNeedingMetadata.slice(i, i + CONCURRENCY_LIMIT);
        const batchResult = await processBatch(batch);
        metadataUpdated = metadataUpdated || batchResult;
      }

      // Reload video list if metadata was updated
      if (metadataUpdated) {
        console.log('Metadata updated, refreshing video list');
        // Skip metadata processing on next refetch
        setSkipMetadataProcessing(true);
        await refetch();
        // Re-enable metadata processing after a delay
        setTimeout(() => setSkipMetadataProcessing(false), 2000);
      }
    } catch (error) {
      console.error("Error processing video metadata:", error);
    } finally {
      setProcessingMetadata(false);
      setVideosInProcessing([]);
    }
  }, [contentIndexId, processVideoMetadataSingle, refetch, skipMetadataProcessing]);

  // Update ContentItems array whenever video data changes
  useEffect(() => {
    if (videosData) {
      const items = videosData.pages.flatMap(page =>
        page.data.map(video => convertToContentItem(video))
      );
      setContentItems(items);

      // Only run metadata processing on initial load
      if (!initialLoadCompleted && videosData.pages[0].data.length > 0 && !processingMetadata && !skipMetadataProcessing) {
        setInitialLoadCompleted(true);
        processVideoMetadata(videosData.pages[0].data);
      }
    }
  }, [videosData, processingMetadata, processVideoMetadata, initialLoadCompleted, skipMetadataProcessing]);

  // Search handler
  const handleSearch = (query: string) => {
    if (query.trim() !== '') {
      setSearchQuery(query);
      setSearchSubmitted(true);
    } else {
      setSearchSubmitted(false);
    }
  };

  const handleUpload = () => {
    console.log('Upload clicked');
    // Implement upload functionality
  };

  const handleFilter = () => {
    console.log('Filter clicked');
    // Implement filter functionality
  };

  // Load more data
  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen bg-white">
        {/* Sidebar */}
        <Sidebar activeMenu="content-library" />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search area */}
          <div className="p-4 border-b border-gray-200">
            <SearchBar
              onSearch={handleSearch}
              placeholder="Search videos..."
              defaultValue={searchQuery}
            />
          </div>

          {/* Content area */}
          {searchSubmitted ? (
            <div className="flex-1 overflow-auto px-4">
              <SearchResults
                textSearchQuery={searchQuery}
                textSearchSubmitted={searchSubmitted}
              />
            </div>
          ) : (
            <>
              {/* Action buttons and filter tabs */}
              <div className="p-4 border-b border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <ActionButtons
                    onUpload={handleUpload}
                    onFilter={handleFilter}
                  />
                  <div className="text-sm text-gray-500">
                    {contentItems.length} results
                    {processingMetadata && videosInProcessing.length > 0 && (
                      <span className="ml-2 text-blue-500 flex items-center">
                        <span className="mr-2">Processing metadata... ({videosInProcessing.length} videos)</span>
                        <div className="w-4 h-4">
                          <LoadingSpinner />
                        </div>
                      </span>
                    )}
                  </div>
                </div>

                {/* Filter tabs in horizontal row */}
                <FilterTabs
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                />
              </div>

              {/* Content area with fixed header and scrollable content */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Fixed header */}
                <div className="flex items-center bg-gray-100 py-3 px-4 border-b border-gray-200 shadow-sm">
                  {COLUMNS.map(column => (
                    <div
                      key={column.id}
                      className="font-medium text-sm text-gray-600 flex-shrink-0 pr-4"
                      style={{ width: column.width }}
                    >
                      {column.label}
                    </div>
                  ))}
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-auto">
                  {isLoading ? (
                    <div className="flex flex-col justify-center items-center h-40">
                      <LoadingSpinner />
                      <p className="mt-4 text-gray-500">Loading videos...</p>
                    </div>
                  ) : isError ? (
                    <div className="flex justify-center items-center h-40 text-red-500">
                      Error loading data: {error instanceof Error ? error.message : 'Unknown error'}
                    </div>
                  ) : contentItems.length === 0 ? (
                    <div className="flex justify-center items-center h-40 text-gray-500">
                      No videos available
                    </div>
                  ) : (
                    <div className="min-w-max">
                      {contentItems.map(item => (
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
                        />
                      ))}

                      {/* Load more button */}
                      {hasNextPage && (
                        <div className="flex justify-center py-4">
                          <button
                            onClick={handleLoadMore}
                            disabled={isFetchingNextPage}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            {isFetchingNextPage ? 'Loading...' : 'Load More'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </QueryClientProvider>
  );
}