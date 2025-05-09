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
  convertMetadataToTags,
  fetchVideoDetails
} from '@/hooks/apiHooks';
import LoadingSpinner from '../../components/LoadingSpinner';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't cache queries to ensure we always get fresh data
      staleTime: 0,
      // Disable retry on failure
      retry: false,
    },
  },
});

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
const CONCURRENCY_LIMIT = 10;

export default function ContentLibrary() {
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('Video');
  const [processingMetadata, setProcessingMetadata] = useState(false);
  const [videosInProcessing, setVideosInProcessing] = useState<string[]>([]);
  const [contentItems, setContentItems] = useState<ContentItemType[]>([]);
  const [skipMetadataProcessing, setSkipMetadataProcessing] = useState(false);
  // Keep track of videos we've already processed to avoid duplicates
  const [processedVideoIds, setProcessedVideoIds] = useState<Set<string>>(new Set());

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
    // Convert user metadata to tags if available
    else if (video.user_metadata) {
      console.log(`Converting metadata for video ${video._id}:`, video.user_metadata);
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

  // Function to refresh metadata for a specific video
  const refreshVideoMetadata = useCallback(async (videoId: string) => {
    if (!contentIndexId) return;

    console.log(`Refreshing metadata for video ${videoId}`);
    try {
      // Fetch fresh video details from API
      const updatedVideo = await fetchVideoDetails(videoId, contentIndexId);

      if (updatedVideo) {
        // Update content items with fresh data
        setContentItems(prevItems => {
          return prevItems.map(item => {
            if (item.id === videoId) {
              // Create a new content item with the fresh metadata
              const updatedItem = {
                ...item,
                tags: updatedVideo.user_metadata ? convertMetadataToTags(updatedVideo.user_metadata) : [],
                metadata: updatedVideo.user_metadata as {
                  source?: string;
                  sector?: string;
                  emotions?: string;
                  brands?: string;
                  locations?: string;
                  demographics?: string;
                }
              };
              console.log(`Updated content item for ${videoId}:`, updatedItem);
              return updatedItem;
            }
            return item;
          });
        });
      }
    } catch (error) {
      console.error(`Error refreshing metadata for video ${videoId}:`, error);
      // If direct update fails, use refetch as a fallback
      if (refetch) {
        console.log("Direct metadata refresh failed, falling back to full refetch");
        refetch();
      }
    }
  }, [contentIndexId, refetch]);

  // Process metadata for a single video
  const processVideoMetadataSingle = useCallback(async (video: VideoData): Promise<boolean> => {
    if (!contentIndexId) return false;

    const videoId = video._id;

    // Skip if already processed or currently processing
    if (processedVideoIds.has(videoId) || videosInProcessing.includes(videoId)) {
      console.log(`Video ${videoId} already processed or processing, skipping...`);
      return false;
    }

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

          // 5. Refresh the video metadata directly
          await refreshVideoMetadata(videoId);

          // Add to processed videos set
          setProcessedVideoIds(prev => new Set(prev).add(videoId));
          setVideosInProcessing(prev => prev.filter(id => id !== videoId));
          return true;
        }

        setVideosInProcessing(prev => prev.filter(id => id !== videoId));
      } else {
        console.log(`Video ${videoId} already has metadata, skipping...`);
        // Still mark as processed to avoid checking again
        setProcessedVideoIds(prev => new Set(prev).add(videoId));
      }
      return false;
    } catch (error) {
      console.error(`Error processing metadata for video ${videoId}:`, error);
      setVideosInProcessing(prev => prev.filter(id => id !== videoId));
      return false;
    }
  }, [contentIndexId, processedVideoIds, videosInProcessing, refreshVideoMetadata]);

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
    // Temporarily disable metadata processing to prevent recursive processing
    setSkipMetadataProcessing(true);

    try {
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
        await processBatch(batch);
      }

      // No need to refetch here since we update the UI immediately in processVideoMetadataSingle
      console.log('All metadata processing completed');
    } catch (error) {
      console.error("Error processing video metadata:", error);
    } finally {
      setProcessingMetadata(false);
      setVideosInProcessing([]);
      // Re-enable metadata processing after completion
      setTimeout(() => setSkipMetadataProcessing(false), 2000);
    }
  }, [contentIndexId, processVideoMetadataSingle, skipMetadataProcessing]);

  // Update ContentItems array whenever video data changes
  useEffect(() => {
    if (videosData) {
      console.log('Processing video data update:', videosData.pages.length, 'pages');

      // Convert videos to content items with proper logging
      const items = videosData.pages.flatMap(page =>
        page.data.map(video => {
          const item = convertToContentItem(video);
          console.log(`Video ${video._id} converted:`, {
            hasMetadata: !!video.user_metadata,
            metadataKeys: video.user_metadata ? Object.keys(video.user_metadata) : [],
            tagsCount: item.tags.length
          });
          return item;
        })
      );

      setContentItems(items);

      // Process all videos that were just loaded (not just initial load)
      if (videosData.pages.length > 0 && !processingMetadata && !skipMetadataProcessing) {
        // Get all videos from all pages
        const allVideos = videosData.pages.flatMap(page => page.data);

        // Find newly loaded videos that don't have metadata yet and aren't already processed
        const newlyLoadedVideos = allVideos.filter(video =>
          !processedVideoIds.has(video._id) && // Skip already processed videos
          !videosInProcessing.includes(video._id) && // Skip videos currently being processed
          (!video.user_metadata ||
          Object.keys(video.user_metadata).length === 0 ||
          (!video.user_metadata.source && !video.user_metadata.sector &&
          !video.user_metadata.emotions && !video.user_metadata.brands &&
          !video.user_metadata.locations))
        );

        if (newlyLoadedVideos.length > 0) {
          console.log(`Processing metadata for ${newlyLoadedVideos.length} newly loaded videos`);
          processVideoMetadata(newlyLoadedVideos);
        }
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
      // Make sure metadata processing is enabled when loading more videos
      setSkipMetadataProcessing(false);
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
                          onMetadataUpdated={() => {
                            // Refresh the content after user updates metadata
                            console.log('Metadata updated by user, refreshing metadata for video', item.id);
                            refreshVideoMetadata(item.id);
                          }}
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