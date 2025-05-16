"use client";

import { useState, useEffect, useCallback } from 'react';
import { useInfiniteQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SearchBar from '@/components/SearchBar';
import ActionButtons from '@/components/ActionButtons';
// FilterTabs는 지금 사용하지 않으므로 주석 처리
// import FilterTabs from '@/components/FilterTabs';
import ContentItem from '@/components/ContentItem';
import SearchResults from '@/components/SearchResults';
// 타입 충돌을 해결하기 위해 로컬 타입 정의만 사용
// import { ContentItem as AdItemType, VideoData, Tag } from '@/types';
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
  { id: 'video', label: 'Video', width: '300px' },
  { id: 'topic_category', label: 'Topic Category', width: '120px' },
  { id: 'emotions', label: 'Emotions', width: '120px' },
  { id: 'brands', label: 'Brands', width: '120px' },
  { id: 'demo_gender', label: 'Target Demo: Gender', width: '120px' },
  { id: 'demo_age', label: 'Target Demo: Age', width: '120px' },
  { id: 'location', label: 'Location', width: '120px' },
  { id: 'source', label: 'Source', width: '200px' },
];

// Limit for concurrent metadata processing
const CONCURRENCY_LIMIT = 10;

// 타입 정의
interface Tag {
  category: string;
  value: string;
}

interface AdItemType {
  id: string;
  thumbnailUrl: string;
  title: string;
  videoUrl: string;
  tags: Tag[];
  metadata?: {
    source?: string;
    topic_category?: string;
    emotions?: string;
    brands?: string;
    locations?: string;
    demo_age?: string;
    demo_gender?: string;
  };
}

interface VideoData {
  _id: string;
  hls?: {
    thumbnail_urls?: string[];
    video_url?: string;
  };
  system_metadata?: {
    video_title?: string;
    filename?: string;
  };
  user_metadata?: Record<string, unknown>;
  metadata?: {
    tags?: Tag[];
  };
}

export default function AdsLibrary() {
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // activeTab은 현재 사용하지 않으므로 주석 처리
  // const [activeTab, setActiveTab] = useState('Video');
  const [processingMetadata, setProcessingMetadata] = useState(false);
  const [videosInProcessing, setVideosInProcessing] = useState<string[]>([]);
  const [adItems, setAdItems] = useState<AdItemType[]>([]);
  const [skipMetadataProcessing, setSkipMetadataProcessing] = useState(false);
  // Keep track of videos we've already processed to avoid duplicates
  const [processedVideoIds, setProcessedVideoIds] = useState<Set<string>>(new Set());
  // State for filter menu
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string | null>(null);

  // Filter states
  const [filterOptions, setFilterOptions] = useState<{[key: string]: string[]}>({
    topic_category: [],
    emotions: [],
    brands: [],
    demo_age: [],
    demo_gender: [],
    location: []
  });
  const [activeFilters, setActiveFilters] = useState<{[key: string]: string[]}>({
    topic_category: [],
    emotions: [],
    brands: [],
    demo_age: [],
    demo_gender: [],
    location: []
  });
  const [filteredItems, setFilteredItems] = useState<AdItemType[]>([]);
  const [isFiltering, setIsFiltering] = useState(false);

  // Filter categories
  const filterCategories = [
    { id: 'topic_category', label: 'Topic Category' },
    { id: 'emotions', label: 'Emotions' },
    { id: 'brands', label: 'Brands' },
    { id: 'demo_age', label: 'Target Demo: Age' },
    { id: 'demo_gender', label: 'Target Demo: Gender' },
    { id: 'location', label: 'Location' },
  ];

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

  // Convert API response to AdItemType
  const convertToAdItem = (video: VideoData): AdItemType => {
    let tags: Tag[] = [];

    // Use existing tags if available
    if (video.metadata?.tags) {
      tags = video.metadata.tags;
    }
    // Convert user metadata to tags if available
    else if (video.user_metadata) {
      console.log(`Converting metadata for video ${video._id}:`, video.user_metadata);
      tags = convertMetadataToTags(video.user_metadata);
      console.log("🚀 > convertToAdItem > tags=", tags)
    }

    // 데이터 타입에 맞게 메타데이터를 추출합니다
    const metadata = video.user_metadata ? {
      source: video.user_metadata.source as string,
      topic_category: video.user_metadata.sector as string,
      emotions: video.user_metadata.emotions as string,
      brands: video.user_metadata.brands as string,
      locations: video.user_metadata.locations as string,
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

    // 메타데이터 상태를 보존하기 위해 로그 추가
    if (metadata) {
      console.log(`Video ${video._id} metadata converted:`, metadata);
    }

    return {
      id: video._id,
      thumbnailUrl: video.hls?.thumbnail_urls?.[0] || 'https://placehold.co/600x400',
      title: video.system_metadata?.video_title || video.system_metadata?.filename || 'Untitled Video',
      videoUrl: video.hls?.video_url || '',
      tags: tags,
      metadata: metadata
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
        console.log(`Received updated video data for ${videoId}:`, updatedVideo);

        // Update content items with fresh data
        setAdItems(prevItems => {
          return prevItems.map(item => {
            if (item.id === videoId) {
              // Create a proper metadata object from user_metadata
              const updatedMetadata = updatedVideo.user_metadata ? {
                source: updatedVideo.user_metadata.source || '',
                topic_category: updatedVideo.user_metadata.sector || '',  // 중요: sector를 topic_category로 매핑
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

              // 태그도 올바르게 업데이트
              const updatedTags = updatedVideo.user_metadata ? convertMetadataToTags(updatedVideo.user_metadata) : [];

              // 새 아이템 생성
              const updatedItem = {
                ...item,
                tags: updatedTags,
                metadata: updatedMetadata
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
          (!video.user_metadata.source && !video.user_metadata.topic_category &&
           !video.user_metadata.emotions && !video.user_metadata.brands &&
           !video.user_metadata.locations)) {

        // 2. Generate metadata
        console.log(`Generating metadata for video ${videoId}`);
        setVideosInProcessing(prev => [...prev, videoId]);

        const hashtagText = await generateMetadata(videoId);

        if (hashtagText) {
          // 3. Parse hashtags to create metadata object
          const metadata = parseHashtags(hashtagText);

          // 4. Save metadata and immediately update UI
          console.log(`Updating metadata for video ${videoId}`, metadata);
          await updateVideoMetadata(videoId, contentIndexId, metadata);

          // 5. Update this specific video in the UI without waiting for a full refresh
          setAdItems(prevItems => {
            return prevItems.map(item => {
              if (item.id === videoId) {
                return {
                  ...item,
                  metadata: metadata,
                  tags: convertMetadataToTags(metadata)
                };
              }
              return item;
            });
          });

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
  }, [contentIndexId, processedVideoIds, videosInProcessing]);

  // Function to filter videos that need metadata processing
  const filterVideosNeedingMetadata = (videos: VideoData[], processedIds: Set<string>, inProcessingIds: string[]) => {
    return videos.filter(video =>
      !processedIds.has(video._id) &&
      !inProcessingIds.includes(video._id) &&
      (!video.user_metadata ||
      Object.keys(video.user_metadata).length === 0 ||
      (!video.user_metadata.source &&
       !video.user_metadata.topic_category &&
       !video.user_metadata.emotions &&
       !video.user_metadata.brands &&
       !video.user_metadata.locations))
    );
  };

  // Batch process video metadata with concurrency control
  const processVideoMetadata = useCallback(async (videos: VideoData[]) => {
    if (!contentIndexId || videos.length === 0 || skipMetadataProcessing) return;

    // Filter videos that need metadata
    const videosNeedingMetadata = filterVideosNeedingMetadata(videos, processedVideoIds, videosInProcessing);

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
  }, [contentIndexId, processVideoMetadataSingle, skipMetadataProcessing, processedVideoIds, videosInProcessing]);

  // Update ContentItems array whenever video data changes
  useEffect(() => {
    if (videosData) {
      console.log('Processing video data update:', videosData.pages.length, 'pages');

      // 1. 현재 상태의 adItems를 유지하면서 새 비디오 데이터를 통합합니다
      setAdItems(prevItems => {
        // 기존 아이템의 ID 맵을 생성하여 빠르게 조회할 수 있게 합니다
        const existingItemsMap = new Map(
          prevItems.map(item => [item.id, item])
        );

        // 모든 페이지에서 비디오 데이터를 처리합니다
        const updatedItems = videosData.pages.flatMap(page =>
          page.data.map(video => {
            const videoId = video._id;
            const existingItem = existingItemsMap.get(videoId);

            // 이미 존재하는 아이템이 있고 메타데이터가 있으면 그것을 유지합니다
            if (existingItem && (
              (existingItem.metadata && Object.keys(existingItem.metadata).length > 0) ||
              (existingItem.tags && existingItem.tags.length > 0)
            )) {
              console.log(`Preserving existing metadata for video ${videoId}`);
              return existingItem;
            }

            // 그렇지 않으면 새 컨텐츠 아이템을 생성합니다
            const newItem = convertToAdItem(video);
            console.log(`Video ${video._id} converted:`, {
              hasMetadata: !!video.user_metadata,
              metadataKeys: video.user_metadata ? Object.keys(video.user_metadata) : [],
              tagsCount: newItem.tags.length
            });
            return newItem;
          })
        );

        console.log(`Updated content items: ${updatedItems.length} items, ${prevItems.length} were existing`);
        return updatedItems;
      });

      // 2. 배경에서 메타데이터 처리를 시작하고 준비가 되면 아이템을 업데이트
      if (videosData.pages.length > 0 && !processingMetadata && !skipMetadataProcessing) {
        // 새로 로드된 모든 비디오에 대해 메타데이터 처리를 지연시킵니다
        setTimeout(() => {
          const allVideos = videosData.pages.flatMap(page => page.data);
          const newlyLoadedVideos = filterVideosNeedingMetadata(allVideos, processedVideoIds, videosInProcessing);

          if (newlyLoadedVideos.length > 0) {
            console.log(`Processing metadata for ${newlyLoadedVideos.length} newly loaded videos`);
            processVideoMetadata(newlyLoadedVideos);
          }
        }, 100); // 짧은 시간 지연으로 비디오 렌더링이 우선 처리되도록 함
      }
    }
  }, [videosData, processingMetadata, processVideoMetadata, skipMetadataProcessing, processedVideoIds, videosInProcessing]);

  // Extract unique filter options from content items
  useEffect(() => {
    if (adItems.length > 0) {
      const options: {[key: string]: Set<string>} = {
        topic_category: new Set<string>(),
        emotions: new Set<string>(),
        brands: new Set<string>(),
        demo_age: new Set<string>(),
        demo_gender: new Set<string>(),
        location: new Set<string>()
      };

      adItems.forEach(item => {
        if (item.metadata) {
          // Extract topic_category
          if (item.metadata.topic_category) {
            const topics = item.metadata.topic_category.split(',').map(s => s.trim());
            topics.forEach(topic => {
              if (topic) options.topic_category.add(topic);
            });
          }

          // Extract emotions
          if (item.metadata.emotions) {
            const emotions = item.metadata.emotions.split(',').map(e => e.trim());
            emotions.forEach(emotion => {
              if (emotion) options.emotions.add(emotion);
            });
          }

          // Extract brands
          if (item.metadata.brands) {
            const brands = item.metadata.brands.split(',').map(b => b.trim());
            brands.forEach(brand => {
              if (brand) options.brands.add(brand);
            });
          }

          // Extract demo_age
          if (item.metadata.demo_age) {
            const ages = item.metadata.demo_age.split(',').map(a => a.trim());
            ages.forEach(age => {
              if (age) options.demo_age.add(age);
            });
          }

          // Extract demo_gender
          if (item.metadata.demo_gender) {
            const genders = item.metadata.demo_gender.split(',').map(g => g.trim());
            genders.forEach(gender => {
              if (gender) options.demo_gender.add(gender);
            });
          }

          // Extract locations
          if (item.metadata.locations) {
            const locations = item.metadata.locations.split(',').map(l => l.trim());
            locations.forEach(location => {
              if (location) options.location.add(location);
            });
          }
        }
      });

      // Convert Sets to arrays
      setFilterOptions({
        topic_category: Array.from(options.topic_category),
        emotions: Array.from(options.emotions),
        brands: Array.from(options.brands),
        demo_age: Array.from(options.demo_age),
        demo_gender: Array.from(options.demo_gender),
        location: Array.from(options.location)
      });
    }
  }, [adItems]);

  // Apply filters to content items
  useEffect(() => {
    const hasActiveFilters = Object.values(activeFilters).some(filters => filters.length > 0);
    setIsFiltering(hasActiveFilters);

    if (!hasActiveFilters) {
      setFilteredItems(adItems);
      return;
    }

    const filtered = adItems.filter(item => {
      // Check if the item matches all active filters
      return Object.entries(activeFilters).every(([category, filters]) => {
        // If no filters are active for this category, it's a match
        if (filters.length === 0) return true;

        // Get the metadata value for this category
        let metadataValue = '';
        switch (category) {
          case 'topic_category':
            metadataValue = item.metadata?.topic_category || '';
            break;
          case 'emotions':
            metadataValue = item.metadata?.emotions || '';
            break;
          case 'brands':
            metadataValue = item.metadata?.brands || '';
            break;
          case 'demo_age':
            metadataValue = item.metadata?.demo_age || '';
            break;
          case 'demo_gender':
            metadataValue = item.metadata?.demo_gender || '';
            break;
          case 'location':
            metadataValue = item.metadata?.locations || '';
            break;
        }

        // Split the metadata value by comma and trim
        const values = metadataValue.split(',').map(v => v.trim());

        // Check if any of the item's values match any of the active filters
        return filters.some(filter => values.includes(filter));
      });
    });

    setFilteredItems(filtered);
  }, [activeFilters, adItems]);

  // Toggle filter selection
  const toggleFilter = (category: string, value: string) => {
    setActiveFilters(prev => {
      const current = [...prev[category]];

      // Toggle the filter
      if (current.includes(value)) {
        return {
          ...prev,
          [category]: current.filter(v => v !== value)
        };
      } else {
        return {
          ...prev,
          [category]: [...current, value]
        };
      }
    });
  };

  // Reset filters for a specific category
  const resetCategoryFilters = (category: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [category]: []
    }));
  };

  // Reset all filters
  const resetAllFilters = () => {
    setActiveFilters({
      topic_category: [],
      emotions: [],
      brands: [],
      demo_age: [],
      demo_gender: [],
      location: []
    });
    setShowFilterMenu(false);
    setSelectedFilterCategory(null);
  };

  // Check if a filter is active
  const isFilterActive = (category: string, value: string) => {
    return activeFilters[category].includes(value);
  };

  // Get active filter count for a category
  const getActiveCategoryFilterCount = (category: string) => {
    return activeFilters[category].length;
  };

  // Get total active filter count
  const getTotalActiveFilterCount = () => {
    return Object.values(activeFilters).reduce((total, filters) => total + filters.length, 0);
  };

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
    setShowFilterMenu(!showFilterMenu);
    setSelectedFilterCategory(null);
  };

  const handleFilterCategorySelect = (categoryId: string) => {
    setSelectedFilterCategory(categoryId);
  };

  // Close filter menu
  const closeFilterMenu = () => {
    setShowFilterMenu(false);
    setSelectedFilterCategory(null);
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
      <div className="flex min-h-screen bg-white">
        {/* Sidebar */}

        {/* Main content */}
        <div className="flex-1 flex flex-col ml-54">
          {/* Search area */}
          <div className="p-4 border-b border-gray-200 sticky top-0 z-30 bg-white">
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
                indexId={contentIndexId}
              />
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Action buttons and filter tabs - 고정 영역 */}
              <div className="p-3 border-b border-gray-200 bg-white sticky top-[45px] z-20">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <ActionButtons
                      onUpload={handleUpload}
                      onFilter={handleFilter}
                    />
                    {/* Active filter indicators */}
                    {getTotalActiveFilterCount() > 0 && (
                      <div className="flex items-center">
                        <span className="text-sm text-gray-600 ml-3">
                          Filters: {getTotalActiveFilterCount()}
                        </span>
                        {/* Active filters display */}
                        <div className="ml-3 flex flex-wrap items-center gap-2">
                          {Object.entries(activeFilters).map(([category, values]) =>
                            values.length > 0 && (
                              <div key={category} className="flex items-center bg-blue-50 px-2 py-1 rounded-md">
                                <span className="text-xs font-medium text-blue-800 mr-1">
                                  {category.charAt(0).toUpperCase() + category.slice(1)}:
                                </span>
                                <span className="text-xs text-blue-700">
                                  {values.join(', ')}
                                </span>
                                <button
                                  onClick={() => resetCategoryFilters(category)}
                                  className="ml-1 text-blue-500 hover:text-blue-700"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            )
                          )}
                        </div>
                        <button
                          onClick={resetAllFilters}
                          className="ml-2 text-xs text-blue-600 hover:text-blue-800"
                        >
                          Clear all
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {isFiltering ? filteredItems.length : adItems.length} videos
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

                {/* Filter Menu */}
                {showFilterMenu && (
                  <div className="relative">
                    <div className="absolute z-40 mt-1 bg-white rounded-md shadow-lg border border-gray-200">
                      {selectedFilterCategory === null ? (
                        <div className="py-1">
                          {filterCategories.map((category) => (
                            <button
                              key={category.id}
                              className="flex items-center justify-between w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              onClick={() => handleFilterCategorySelect(category.id)}
                            >
                              <span>{category.label}</span>
                              {getActiveCategoryFilterCount(category.id) > 0 && (
                                <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full">
                                  {getActiveCategoryFilterCount(category.id)}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 w-54">
                          <div className="flex justify-between items-center mb-3">
                            <h3 className="font-medium text-gray-800">
                              {filterCategories.find(c => c.id === selectedFilterCategory)?.label}
                            </h3>
                            <div className="flex items-center">
                              {getActiveCategoryFilterCount(selectedFilterCategory) > 0 && (
                                <button
                                  className="text-xs text-blue-600 hover:text-blue-800 mr-3"
                                  onClick={() => resetCategoryFilters(selectedFilterCategory)}
                                >
                                  Clear
                                </button>
                              )}
                              <button
                                className="text-gray-400 hover:text-gray-500"
                                onClick={() => setSelectedFilterCategory(null)}
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Filter options */}
                          <div className="max-h-60 overflow-y-auto">
                            {filterOptions[selectedFilterCategory]?.length > 0 ? (
                              <div className="space-y-2">
                                {filterOptions[selectedFilterCategory].map((option, index) => (
                                  <div key={index} className="flex items-center">
                                    <input
                                      id={`filter-${selectedFilterCategory}-${index}`}
                                      type="checkbox"
                                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                      checked={isFilterActive(selectedFilterCategory, option)}
                                      onChange={() => toggleFilter(selectedFilterCategory, option)}
                                    />
                                    <label
                                      htmlFor={`filter-${selectedFilterCategory}-${index}`}
                                      className="ml-2 block text-sm text-gray-700"
                                    >
                                      {option}
                                    </label>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">No options available</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Backdrop to close menu when clicking outside */}
                    <div
                      className="fixed inset-0 z-30"
                      onClick={closeFilterMenu}
                    ></div>
                  </div>
                )}
              </div>

              {/* 테이블 헤더 - 확실하게 고정 */}
              <div className="sticky top-[106px] z-10 bg-gray-100 border-b border-gray-200 shadow-sm">
                <div className="flex py-2 px-4">
                  {COLUMNS.map(column => (
                    <div
                      key={column.id}
                      className="font-medium text-center text-sm text-gray-600 flex-shrink-0 pr-4"
                      style={{ width: column.width }}
                    >
                      {column.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* 컨텐츠 영역 - 별도의 스크롤 컨테이너 없이 페이지 자연스러운 스크롤 사용 */}
              {isLoading ? (
                <div className="flex flex-col justify-center items-center h-40">
                  <LoadingSpinner />
                  <p className="mt-4 text-gray-500">Loading videos...</p>
                </div>
              ) : isError ? (
                <div className="flex justify-center items-center h-40 text-red-500">
                  Error loading data: {error instanceof Error ? error.message : 'Unknown error'}
                </div>
              ) : (isFiltering ? filteredItems : adItems).length === 0 ? (
                <div className="flex justify-center items-center h-40 text-gray-500">
                  {isFiltering ? 'No videos match the current filters' : 'No videos available'}
                </div>
              ) : (
                <div>
                  {(isFiltering ? filteredItems : adItems).map(item => (
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

                  {/* Load more button - only show when not filtering */}
                  {!isFiltering && hasNextPage && (
                    <div className="flex justify-center py-4 mb-8">
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
          )}
        </div>
      </div>
    </QueryClientProvider>
  );
}