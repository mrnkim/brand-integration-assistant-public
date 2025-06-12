"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useInfiniteQuery, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import SearchBar from '@/components/SearchBar';
import ActionButtons from '@/components/ActionButtons';
import ContentItem from '@/components/ContentItem';
import SearchResults from '@/components/SearchResults';
import VideoUploader from '@/components/VideoUploader';
import {
  fetchVideos,
  fetchIndex,
  generateMetadata,
  parseHashtags,
  updateVideoMetadata,
  convertMetadataToTags,
  fetchVideoDetails,
  fetchIndexingTasks,
  IndexingTask,
} from '@/hooks/apiHooks';
import LoadingSpinner from '../../components/LoadingSpinner';
import { AdItemType, VideoData, Tag } from '@/types';

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
  { id: 'video', label: 'Video', width: '220px' },
  { id: 'topic_category', label: 'Topic Category', width: '120px' },
  { id: 'emotions', label: 'Emotions', width: '120px' },
  { id: 'brands', label: 'Brands', width: '120px' },
  { id: 'demo_gender', label: 'Target Demo: Gender', width: '120px' },
  { id: 'demo_age', label: 'Target Demo: Age', width: '120px' },
  { id: 'location', label: 'Location', width: '120px' },
  { id: 'source', label: 'Source', width: '140px' },
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
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [recentUploads, setRecentUploads] = useState<{
    id: string;
    taskId: string;
    title: string;
    status: string;
    thumbnailUrl?: string;
    duration?: string;
  }[]>([]);

  const { data: indexData, refetch: refetchIndex } = useQuery({
    queryKey: ['index', contentIndexId],
    queryFn: () => fetchIndex(contentIndexId),
    staleTime: 0,
    refetchInterval: 5000,
  });

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

  const filterCategories = [
    { id: 'topic_category', label: 'Topic Category' },
    { id: 'emotions', label: 'Emotions' },
    { id: 'brands', label: 'Brands' },
    { id: 'demo_age', label: 'Target Demo: Age' },
    { id: 'demo_gender', label: 'Target Demo: Gender' },
    { id: 'location', label: 'Location' },
  ];

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
      console.log("getNextPageParam - current page:", lastPage.page_info.page, "total pages:", lastPage.page_info.total_page);

      // Calculate loaded video count from all pages
      const loadedCount = allPages.flatMap(page => page.data).length;
      console.log("getNextPageParam - loaded videos:", loadedCount, "total videos:", lastPage.page_info.total_count);

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

    const indexingVideo = recentUploads.find(uploadingVideo =>
      uploadingVideo.id === video._id && uploadingVideo.status !== 'ready'
    );
    const isStillIndexing = !!indexingVideo;

    if (isStillIndexing) {
      console.log(`Video ${video._id} is still indexing, skipping tag generation`);
      tags = [];
    }
    else if (video.metadata?.tags) {
      tags = video.metadata.tags;
    }
    else if (video.user_metadata) {
      console.log(`Converting metadata for video ${video._id}:`, video.user_metadata);
      tags = convertMetadataToTags(video.user_metadata);
    }
    else {
      tags = [];
      console.log(`No metadata or tags available for video ${video._id}`);
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

    if (metadata) {
      console.log(`Video ${video._id} metadata converted:`, metadata);
    }

    const thumbnailUrl = video.hls?.thumbnail_urls?.[0] || 'https://placehold.co/600x400?text=No+Thumbnail';
    console.log(`Video ${video._id} thumbnail URL: ${thumbnailUrl}`);

    return {
      id: video._id,
      thumbnailUrl: thumbnailUrl,
      title: video.system_metadata?.video_title || video.system_metadata?.filename || 'Untitled Video',
      videoUrl: video.hls?.video_url || '',
      tags: tags,
      metadata: metadata,
      isIndexing: isStillIndexing,
      status: isStillIndexing ? (indexingVideo?.status || 'processing') : undefined
    };
  };

  // Function to refresh metadata for a specific video
  const refreshVideoMetadata = useCallback(async (videoId: string) => {
    if (!contentIndexId) return;

    try {
      const updatedVideo = await fetchVideoDetails(videoId, contentIndexId);

      if (updatedVideo) {
        console.log(`Received updated video data for ${videoId}:`, updatedVideo);

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

              console.log(`Updated content item for ${videoId}:`, updatedItem);
              return updatedItem;
            }
            return item;
          });
        });
      }
    } catch (error) {
      console.error(`Error refreshing metadata for video ${videoId}:`, error);
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

    if (processedVideoIds.has(videoId) || videosInProcessing.includes(videoId)) {
      console.log(`Video ${videoId} already processed or processing, skipping...`);
      return false;
    }

    try {
      if (!video.user_metadata ||
          Object.keys(video.user_metadata).length === 0 ||
          (!video.user_metadata.source && !video.user_metadata.topic_category &&
           !video.user_metadata.emotions && !video.user_metadata.brands &&
           !video.user_metadata.locations)) {

        console.log(`Generating metadata for video ${videoId}`);
        setVideosInProcessing(prev => [...prev, videoId]);

        const hashtagText = await generateMetadata(videoId);
        console.log(`Generated hashtags for video ${videoId}: ${hashtagText}`);

        if (hashtagText) {
          const metadata = parseHashtags(hashtagText);
          console.log(`Parsed metadata for video ${videoId}:`, metadata);

          console.log(`Updating metadata for video ${videoId}`, metadata);
          await updateVideoMetadata(videoId, contentIndexId, metadata);

          setAdItems(prevItems => {
            return prevItems.map(item => {
              if (item.id === videoId) {
                const updatedTags = convertMetadataToTags(metadata);
                console.log(`Generated ${updatedTags.length} tags for video ${videoId}`);

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
        console.log(`Video ${videoId} already has metadata, skipping...`);
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

    const videosNeedingMetadata = videos.filter(video => {
      if (processedVideoIds.has(video._id) || videosInProcessing.includes(video._id)) {
        return false;
      }

      const isStillIndexing = recentUploads.some(uploadingVideo =>
        uploadingVideo.id === video._id && uploadingVideo.status !== 'ready'
      );
      if (isStillIndexing) {
        console.log(`Video ${video._id} is still indexing, skipping metadata generation`);
        return false;
      }

      return (!video.user_metadata ||
        Object.keys(video.user_metadata).length === 0 ||
        (!video.user_metadata.source &&
         !video.user_metadata.topic_category &&
         !video.user_metadata.emotions &&
         !video.user_metadata.brands &&
         !video.user_metadata.locations));
    });

    if (videosNeedingMetadata.length === 0) {
      console.log('No videos need metadata processing');
      return;
    }

    console.log(`Processing metadata for ${videosNeedingMetadata.length} videos`);
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

      console.log('All metadata processing completed');
    } catch (error) {
      console.error("Error processing video metadata:", error);
    } finally {
      setProcessingMetadata(false);
      setVideosInProcessing([]);
      // Re-enable metadata processing after completion
      setTimeout(() => setSkipMetadataProcessing(false), 2000);
    }
  }, [contentIndexId, processVideoMetadataSingle, skipMetadataProcessing, processedVideoIds, videosInProcessing, recentUploads]);

  // Update ContentItems array whenever video data changes
  useEffect(() => {
    if (videosData) {
      console.log('Processing video data update:', videosData.pages.length, 'pages');

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
              console.log(`Preserving existing metadata for video ${videoId}`);

              return {
                ...existingItem,
                thumbnailUrl: video.hls?.thumbnail_urls?.[0] || existingItem.thumbnailUrl || 'https://placehold.co/600x400?text=No+Thumbnail',
                videoUrl: video.hls?.video_url || existingItem.videoUrl || '',
                title: video.system_metadata?.video_title || video.system_metadata?.filename || existingItem.title || 'Untitled Video',
              };
            }

            const newItem = convertToAdItem(video);
            console.log(`Video ${video._id} converted:`, {
              hasMetadata: !!video.user_metadata,
              metadataKeys: video.user_metadata ? Object.keys(video.user_metadata) : [],
              tagsCount: newItem.tags.length,
              hasThumbnail: !!newItem.thumbnailUrl,
              thumbnailUrl: newItem.thumbnailUrl
            });
            return newItem;
          })
        );

        console.log(`Updated content items: ${updatedItems.length} items, ${prevItems.length} were existing`);
        return updatedItems;
      });

      if (videosData.pages.length > 0 && !processingMetadata && !skipMetadataProcessing) {
        setTimeout(() => {
          const allVideos = videosData.pages.flatMap(page => page.data);
          const newlyLoadedVideos = filterVideosNeedingMetadata(allVideos, processedVideoIds, videosInProcessing);

          if (newlyLoadedVideos.length > 0) {
            console.log(`Processing metadata for ${newlyLoadedVideos.length} newly loaded videos`);
            processVideoMetadata(newlyLoadedVideos);
          }
        }, 100);
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

          if (item.metadata.emotions) {
            const emotions = item.metadata.emotions.split(',').map(e => e.trim());
            emotions.forEach(emotion => {
              if (emotion) options.emotions.add(emotion);
            });
          }

          if (item.metadata.brands) {
            const brands = item.metadata.brands.split(',').map(b => b.trim());
            brands.forEach(brand => {
              if (brand) options.brands.add(brand);
            });
          }

          if (item.metadata.demo_age) {
            const ages = item.metadata.demo_age.split(',').map(a => a.trim());
            ages.forEach(age => {
              if (age) options.demo_age.add(age);
            });
          }

          if (item.metadata.demo_gender) {
            const genders = item.metadata.demo_gender.split(',').map(g => g.trim());
            genders.forEach(gender => {
              if (gender) options.demo_gender.add(gender);
            });
          }

          if (item.metadata.locations) {
            const locations = item.metadata.locations.split(',').map(l => l.trim());
            locations.forEach(location => {
              if (location) options.location.add(location);
            });
          }
        }
      });

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
      return Object.entries(activeFilters).every(([category, filters]) => {
        if (filters.length === 0) return true;

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

        const values = metadataValue.split(',').map(v => v.trim());

        return filters.some(filter => values.includes(filter));
      });
    });

    setFilteredItems(filtered);
  }, [activeFilters, adItems]);

  // Toggle filter selection
  const toggleFilter = (category: string, value: string) => {
    setActiveFilters(prev => {
      const current = [...prev[category]];

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
    setShowUploader(true);
  };

  const handleUploadComplete = () => {
    fetchRecentTasks();

    if (refetch) {
      refetch();
    }
    setShowUploader(false);
  };

  // Fetch recent indexing tasks
  const fetchRecentTasks = useCallback(async () => {
    try {
      console.log(`Fetching recent indexing tasks for content index: ${contentIndexId}`);
      const tasks = await fetchIndexingTasks(contentIndexId);

      if (tasks && tasks.length > 0) {
        console.log(`Received ${tasks.length} indexing tasks`);

        const statusCounts: Record<string, number> = {};
        tasks.forEach((task: IndexingTask) => {
          statusCounts[task.status || 'unknown'] = (statusCounts[task.status || 'unknown'] || 0) + 1;
        });
        console.log('Task status distribution:', statusCounts);

        const taskMap = new Map<string, IndexingTask>();
        tasks.forEach((task: IndexingTask) => {
          if (task.video_id) {
            taskMap.set(task.video_id, task);
          }
        });

        const indexingTasks = tasks.filter((task: IndexingTask) => task.status !== 'ready');

        const newIndexingItems = indexingTasks
          .map((task: IndexingTask) => {
            console.log(`Indexing task details for ${task.video_id || 'unknown video'}:`, {
              id: task._id,
              status: task.status,
              videoId: task.video_id,
              hasSystemMetadata: !!task.system_metadata
            });

            return {
              id: task.video_id || '',
              taskId: task._id,
              title: task.system_metadata?.filename || task.video_id || 'Untitled Video',
              status: task.status || 'processing',
              duration: task.system_metadata?.duration ? formatDuration(task.system_metadata.duration) : undefined
            };
          });

        console.log(`Created ${newIndexingItems.length} indexing item entries for display`);
        setRecentUploads(newIndexingItems);

        setAdItems(prev => {
          return prev.map(item => {
            const task = taskMap.get(item.id);

            if (task && task.status !== 'ready') {
              console.log(`Marking video ${item.id} as still indexing with status: ${task.status}`);
              return {
                ...item,
                isIndexing: true,
                indexingStatus: task.status,
                tags: [],
                status: task.status
              };
            }
            else if (task && task.status === 'ready') {
              console.log(`Marking video ${item.id} as indexing complete`);
              return {
                ...item,
                isIndexing: false,
                indexingStatus: undefined,
                status: undefined
              };
            }
            return item;
          });
        });

        const justCompleted = tasks.filter((task: IndexingTask) => task.status === 'ready');
        if (justCompleted.length > 0) {

          const completedVideoIds = justCompleted
            .map(task => task.video_id)
            .filter(Boolean) as string[];


          if (completedVideoIds.length > 0 && refetch) {
            refetch();
          }
        }
      } else {
        setRecentUploads([]);
      }
    } catch (error) {
      console.error('Error fetching indexing tasks:', error);
    }
  }, [contentIndexId, refetch]);

  // Format duration in seconds to MM:SS format
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Call fetchRecentTasks when component mounts and after upload completes
  useEffect(() => {
    fetchRecentTasks();

    const intervalId = setInterval(() => {
      fetchRecentTasks();
      refetchIndex();
    }, 10000);

    return () => clearInterval(intervalId);
  }, [fetchRecentTasks, refetchIndex]);

  const handleFilter = () => {
    console.log('Filter clicked');
    setShowFilterMenu(!showFilterMenu);
    setSelectedFilterCategory(null);
  };

  const handleFilterCategorySelect = (categoryId: string) => {
    setSelectedFilterCategory(categoryId);
  };

  const closeFilterMenu = () => {
    setShowFilterMenu(false);
    setSelectedFilterCategory(null);
  };

  const combinedItems = useMemo(() => {
    const itemsMap = new Map(
      adItems.map(item => [item.id, item])
    );

    recentUploads.forEach(video => {
      if (!itemsMap.has(video.id) && video.id) {
        itemsMap.set(video.id, {
          id: video.id,
          title: video.title,
          thumbnailUrl: '',
          videoUrl: '',
          tags: [],
          isIndexing: true,
          status: video.status || 'processing'
        });
      }
    });

    return Array.from(itemsMap.values());
  }, [adItems, recentUploads]);

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
      <div className="flex min-h-screen">
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

              {/* Action buttons and filter tabs */}
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

              {/* Table header */}
              <div className="sticky top-[106px] z-10 bg-gray-100 border-b border-gray-200 shadow-sm">
                <div className="flex py-2 px-4">
                  {COLUMNS.map(column => (
                    <div
                      key={column.id}
                      className="font-medium text-center text-sm text-gray-600 flex-shrink-0 pr-4"
                      style={{ width: column.width }}
                    >
                      {column.label.includes('\n')
                        ? column.label.split('\n').map((part, i) => (
                            <div key={i}>{part.charAt(0).toUpperCase() + part.slice(1)}</div>
                          ))
                        : column.label.charAt(0).toUpperCase() + column.label.slice(1)
                      }
                    </div>
                  ))}
                </div>
              </div>

              {/* Content area */}
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
                <div>
                  {(isFiltering ? filteredItems : displayItems).map(item => (
                    item.isIndexing ? (
                      <div key={item.id} className="flex w-full mb-4">
                        <div className="w-[300px] flex-shrink-0 mr-4">
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

      {showUploader && (
        <VideoUploader
          indexId={contentIndexId}
          onUploadComplete={handleUploadComplete}
          onClose={() => setShowUploader(false)}
        />
      )}
    </QueryClientProvider>
  );
};