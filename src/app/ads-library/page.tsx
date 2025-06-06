"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useInfiniteQuery, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import Sidebar from '@/components/Sidebar';
import SearchBar from '@/components/SearchBar';
import ActionButtons from '@/components/ActionButtons';
import ContentItem from '@/components/ContentItem';
import SearchResults from '@/components/SearchResults';
import VideoUploader from '@/components/VideoUploader';
import LoadingSpinner from '../../components/LoadingSpinner';
import { AdItemType, VideoData, Tag } from '@/types';
import {
  fetchVideos,
  fetchIndex,
  generateMetadata,
  parseHashtags,
  updateVideoMetadata,
  convertMetadataToTags,
  fetchVideoDetails,
  fetchIndexingTasks,
  IndexingTask
} from '@/hooks/apiHooks';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      retry: false,
    },
  },
});

// Content Index ID from .env
const adsIndexId = process.env.NEXT_PUBLIC_ADS_INDEX_ID || 'default-ads-index';

// Column definitions
const COLUMNS = [
  { id: 'video', label: 'Video', width: '320px' },
  { id: 'topic_category', label: 'Topic Category', width: '130px' },
  { id: 'emotions', label: 'Emotions', width: '130px' },
  { id: 'brands', label: 'Brands', width: '130px' },
  { id: 'demo_gender', label: 'Target Demo:\nGender', width: '130px' },
  { id: 'demo_age', label: 'Target Demo:\nAge', width: '130px' },
  { id: 'location', label: 'Location', width: '130px' },
  { id: 'source', label: 'Source', width: '300px' },
];

// Limit for concurrent metadata processing
const CONCURRENCY_LIMIT = 10;

export default function AdsLibrary() {
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


  // Fetch index data
  const { data: indexData, refetch: refetchIndex } = useQuery({
    queryKey: ['index', adsIndexId],
    queryFn: () => fetchIndex(adsIndexId),
    staleTime: 0, // Always get fresh data
  });

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

  // Fetch videos
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
    queryKey: ['videos', adsIndexId],
    queryFn: ({ pageParam }) => fetchVideos(pageParam, adsIndexId),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.page_info.page < lastPage.page_info.total_page) {
        return lastPage.page_info.page + 1;
      }
      return undefined;
    },
    enabled: !!adsIndexId,
  });

  // Convert API response to AdItemType
  const convertToAdItem = (video: VideoData): AdItemType => {
    let tags: Tag[] = [];

    const indexingVideo = recentUploads.find(uploadingVideo =>
      uploadingVideo.id === video._id && uploadingVideo.status !== 'ready'
    );
    const isStillIndexing = !!indexingVideo;

    if (isStillIndexing) {
      tags = [];
    }
    else if (video.metadata?.tags) {
      tags = video.metadata.tags;
    }
    else if (video.user_metadata) {
      tags = convertMetadataToTags(video.user_metadata);
    }

    const metadata = (!isStillIndexing && video.user_metadata) ? {
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

    return {
      id: video._id,
      thumbnailUrl: video.hls?.thumbnail_urls?.[0] || '@videoFallback.jpg',
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
    if (!adsIndexId) return;

    try {
      const updatedVideo = await fetchVideoDetails(videoId, adsIndexId);

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
                metadata: updatedMetadata
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
  }, [refetch]);

  // Process metadata for a single video
  const processVideoMetadataSingle = useCallback(async (video: VideoData): Promise<boolean> => {
    if (!adsIndexId) return false;

    const videoId = video._id;

    if (processedVideoIds.has(videoId) || videosInProcessing.includes(videoId)) {
      return false;
    }

    try {
      if (!video.user_metadata ||
          Object.keys(video.user_metadata).length === 0 ||
          (!video.user_metadata.source && !video.user_metadata.topic_category &&
           !video.user_metadata.emotions && !video.user_metadata.brands &&
           !video.user_metadata.locations)) {

        setVideosInProcessing(prev => [...prev, videoId]);

        const hashtagText = await generateMetadata(videoId);

        if (hashtagText) {
          const metadata = parseHashtags(hashtagText);

          await updateVideoMetadata(videoId, adsIndexId, metadata);

          setAdItems(prevItems => {
            return prevItems.map(item => {
              if (item.id === videoId) {
                return {
                  ...item,
                  metadata: metadata,
                  tags: convertMetadataToTags(metadata),
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
  }, [processedVideoIds, videosInProcessing]);

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
    if (!adsIndexId || videos.length === 0 || skipMetadataProcessing) return;

    // Filter videos that need metadata
    const videosNeedingMetadata = videos.filter(video => {
      if (processedVideoIds.has(video._id) || videosInProcessing.includes(video._id)) {
        return false;
      }

      const isStillIndexing = recentUploads.some(uploadingVideo =>
        uploadingVideo.id === video._id && uploadingVideo.status !== 'ready'
      );
      if (isStillIndexing) {
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
      return;
    }

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
    } catch (error) {
      console.error("Error processing video metadata:", error);
    } finally {
      setProcessingMetadata(false);
      setVideosInProcessing([]);
      // Re-enable metadata processing after completion
      setTimeout(() => setSkipMetadataProcessing(false), 2000);
    }
  }, [processVideoMetadataSingle, skipMetadataProcessing, processedVideoIds, videosInProcessing, recentUploads]);

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
              return existingItem;
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

  // Extract unique filter options from ads items
  useEffect(() => {
    if (adItems.length > 0) {
      const options: {[key: string]: Map<string, string>} = {
        topic_category: new Map<string, string>(),
        emotions: new Map<string, string>(),
        brands: new Map<string, string>(),
        demo_age: new Map<string, string>(),
        demo_gender: new Map<string, string>(),
        location: new Map<string, string>()
      };

      adItems.forEach(item => {
        if (item.metadata) {
          // Extract topic_category
          if (item.metadata.topic_category) {
            const topics = item.metadata.topic_category.split(',').map(s => s.trim());
            topics.forEach((topic: string) => {
              if (topic) {
                // Use lowercase as key for uniqueness, but store display version
                const lowercaseTopic = topic.toLowerCase();
                // Prefer capitalized version if we haven't seen this value before,
                // otherwise keep the existing display version
                if (!options.topic_category.has(lowercaseTopic)) {
                  options.topic_category.set(lowercaseTopic, capitalizeText(topic));
                }
              }
            });
          }

          // Extract emotions
          if (item.metadata.emotions) {
            const emotions = item.metadata.emotions.split(',').map(e => e.trim());
            emotions.forEach((emotion: string) => {
              if (emotion) {
                const lowercaseEmotion = emotion.toLowerCase();
                if (!options.emotions.has(lowercaseEmotion)) {
                  options.emotions.set(lowercaseEmotion, capitalizeText(emotion));
                }
              }
            });
          }

          // Extract brands
          if (item.metadata.brands) {
            const brands = item.metadata.brands.split(',').map((b: string) => b.trim());
            brands.forEach((brand: string) => {
              if (brand) {
                const lowercaseBrand = brand.toLowerCase();
                if (!options.brands.has(lowercaseBrand)) {
                  options.brands.set(lowercaseBrand, capitalizeText(brand));
                }
              }
            });
          }

          // Extract demo_age
          if (item.metadata.demo_age) {
            const ages = item.metadata.demo_age.split(',').map((a: string) => a.trim());
            ages.forEach((age: string) => {
              if (age) {
                const lowercaseAge = age.toLowerCase();
                if (!options.demo_age.has(lowercaseAge)) {
                  options.demo_age.set(lowercaseAge, capitalizeText(age));
                }
              }
            });
          }

          // Extract demo_gender
          if (item.metadata.demo_gender) {
            const genders = item.metadata.demo_gender.split(',').map((g: string) => g.trim());
            genders.forEach((gender: string) => {
              if (gender) {
                const lowercaseGender = gender.toLowerCase();
                if (!options.demo_gender.has(lowercaseGender)) {
                  options.demo_gender.set(lowercaseGender, capitalizeText(gender));
                }
              }
            });
          }

          // Extract locations
          if (item.metadata.locations) {
            const locations = item.metadata.locations.split(',').map((l: string) => l.trim());
            locations.forEach((location: string) => {
              if (location) {
                const lowercaseLocation = location.toLowerCase();
                if (!options.location.has(lowercaseLocation)) {
                  options.location.set(lowercaseLocation, capitalizeText(location));
                }
              }
            });
          }
        }
      });

      const sortOptions = (a: string, b: string) => {
        if (a[0].toLowerCase() !== b[0].toLowerCase()) {
          return a.localeCompare(b);
        }
        // Then sort by length
        return a.length - b.length;
      };

      setFilterOptions({
        topic_category: Array.from(options.topic_category.values()).sort(sortOptions),
        emotions: Array.from(options.emotions.values()).sort(sortOptions),
        brands: Array.from(options.brands.values()).sort(sortOptions),
        demo_age: Array.from(options.demo_age.values()).sort(sortOptions),
        demo_gender: Array.from(options.demo_gender.values()).sort(sortOptions),
        location: Array.from(options.location.values()).sort(sortOptions)
      });
    }
  }, [adItems]);

  // Apply filters to ads items
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

        if (metadataValue === '' && filters.length > 0) {
          return false;
        }

        const values = metadataValue.split(',').map(v => v.trim());

        return filters.some(filter =>
          values.some(value => {
            const normalizedValue = value.toLowerCase();
            const normalizedFilter = filter.toLowerCase();

            if (normalizedValue === normalizedFilter) {
              return true;
            }

            const valueWords = normalizedValue.split(/\s+|,|\/|\&/);
            const filterWords = normalizedFilter.split(/\s+|,|\/|\&/);

            const wordMatch = filterWords.some(filterWord =>
              valueWords.some(valueWord => valueWord === filterWord)
            );

            if (wordMatch) {
              return true;
            }

            return false;
          })
        );
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

  // Helper function to properly capitalize text
  const capitalizeText = (text: string): string => {
    return text
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
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

  // Clear search handler
  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchSubmitted(false);
  };

  const handleUpload = () => {
    setShowUploader(true);
  };

  const handleUploadComplete = () => {
    fetchRecentTasks();

    if (refetch) {
      refetch();
    }
    // Close the uploader
    setShowUploader(false);
  };

  const handleFilter = () => {
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

  // Intersection Observer for infinite scroll
  const { ref: observerRef, inView } = useInView({
    threshold: 0.1,
    triggerOnce: false,
  });

  // Load next page when observer is in view
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage && !isFiltering) {
      setSkipMetadataProcessing(false);
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, isFiltering, fetchNextPage]);

  // Fetch recent indexing tasks
  const fetchRecentTasks = useCallback(async () => {
    try {
      const tasks = await fetchIndexingTasks(adsIndexId);

      if (tasks && tasks.length > 0) {

        const statusCounts: Record<string, number> = {};
        tasks.forEach((task: IndexingTask) => {
          statusCounts[task.status || 'unknown'] = (statusCounts[task.status || 'unknown'] || 0) + 1;
        });

        const taskMap = new Map<string, IndexingTask>();
        tasks.forEach((task: IndexingTask) => {
          if (task.video_id) {
            taskMap.set(task.video_id, task);
          }
        });

        const indexingTasks = tasks.filter((task: IndexingTask) => task.status !== 'ready');

        const newIndexingItems = indexingTasks
          .map((task: IndexingTask) => {
            return {
              id: task.video_id || '',
              taskId: task._id,
              title: task.system_metadata?.filename || task.video_id || 'Untitled Video',
              status: task.status || 'processing',
              duration: task.system_metadata?.duration ? formatDuration(task.system_metadata.duration) : undefined
            };
          });

        setRecentUploads(newIndexingItems);

        // Update existing items to mark as indexing or not indexing
        setAdItems(prev => {
          return prev.map(item => {
            const task = taskMap.get(item.id);

            if (task && task.status !== 'ready') {
              return {
                ...item,
                isIndexing: true,
                indexingStatus: task.status,
                // 인덱싱 중일 땐 태그를 비움
                tags: [],
                status: task.status
              };
            }
            else if (task && task.status === 'ready') {
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
  }, [refetch]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    fetchRecentTasks();

    const intervalId = setInterval(() => {
      fetchRecentTasks();
      refetchIndex();
    }, 10000);

    return () => clearInterval(intervalId);
  }, [fetchRecentTasks, refetchIndex]);

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
      <div className="flex min-h-screen bg-zinc-100">
        {/* Sidebar */}
        <Sidebar activeMenu="ads-library" />

        {/* Main content */}
        <div className="flex-1 flex flex-col ml-20 bg-zinc-100">
          <div className="mx-auto w-4/5">
            {/* Fixed header area - combined all sticky elements */}
            <div className="fixed top-0 ml-5 z-50 bg-zinc-100 w-[calc(80%-5rem)]">
              {/* Search area with solid background */}
              <div className="bg-zinc-100 -mx-4 w-full">
                <div className="p-4 mt-2">
                  <SearchBar
                    onSearch={handleSearch}
                    onClear={handleClearSearch}
                    placeholder="What are you looking for?"
                    defaultValue={searchQuery}
                  />
                </div>

                {/* Action buttons and filter tabs - hide when search results are shown */}
                {!searchSubmitted && (
                  <div className="px-4 pb-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <ActionButtons
                          onUpload={handleUpload}
                          onFilter={handleFilter}
                        />
                        {/* Active filter indicators */}
                        {getTotalActiveFilterCount() > 0 && (
                          <div className="flex items-center">
                            {/* Active filters display */}
                            <div className="ml-3 flex flex-wrap items-center gap-2">
                              {Object.entries(activeFilters).map(([category, values]) =>
                                values.length > 0 && (
                                  <div key={category} className="flex items-center bg-light-purple px-2 py-1 rounded-md">
                                    <span className="text-sm font-medium text-gray-800 mr-1">
                                      {capitalizeText(category.replace(/_/g, ' '))}:
                                    </span>
                                    <span className="text-sm">
                                      {values.join(', ')}
                                    </span>
                                    <button
                                      onClick={() => resetCategoryFilters(category)}
                                      className="ml-1 text-gray-600 hover:text-gray-700 cursor-pointer"
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
                              className="ml-2 text-sm hover:text-red cursor-pointer"
                            >
                              Clear All
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="text-sm">
                        {isFiltering ? filteredItems.length : totalVideoCount} Videos
                        {processingMetadata && videosInProcessing.length > 0 && (
                          <span className="ml-2 text-blue-500 flex items-center">
                            <span className="mr-2">Processing metadata... ({videosInProcessing.length} Videos)</span>
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
                        <div className="absolute z-[100] mt-1 bg-white rounded-[45.60px] overflow-hidden p-3">
                          {selectedFilterCategory === null ? (
                            <div className="bg-white cursor-pointer">
                              {filterCategories.map((category) => (
                                <button
                                  key={category.id}
                                  className="rounded-2xl flex items-center justify-between w-full text-left px-4 py-2 text-md hover:bg-gray-200 cursor-pointer"
                                  onClick={() => handleFilterCategorySelect(category.id)}
                                >
                                  <span>{capitalizeText(category.label.replace(/_/g, ' '))}</span>
                                  {getActiveCategoryFilterCount(category.id) > 0 && (
                                    <span className="ml-2 bg-light-purple text-xs font-medium px-2 py-0.5 rounded-full">
                                      {getActiveCategoryFilterCount(category.id)}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="p-4 w-54 bg-white rounded-[45.60px]">
                              <div className="flex justify-between items-center mb-3">
                                <h3 className="font-medium text-md">
                                  {capitalizeText((filterCategories.find(c => c.id === selectedFilterCategory)?.label || '').replace(/_/g, ' '))}
                                </h3>
                                <div className="flex items-center">
                                  {getActiveCategoryFilterCount(selectedFilterCategory) > 0 && (
                                    <button
                                      className="text-sm hover:text-red mr-3 cursor-pointer"
                                      onClick={() => resetCategoryFilters(selectedFilterCategory)}
                                    >
                                      Clear
                                    </button>
                                  )}
                                  <button
                                    className="hover:text-gray-500 cursor-pointer"
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
                                      <div key={index} className="flex items-center cursor-pointer hover:bg-gray-200 px-2 py-1 rounded">
                                        <input
                                          id={`filter-${selectedFilterCategory}-${index}`}
                                          type="checkbox"
                                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                                          checked={isFilterActive(selectedFilterCategory, option)}
                                          onChange={() => toggleFilter(selectedFilterCategory, option)}
                                        />
                                        <label
                                          htmlFor={`filter-${selectedFilterCategory}-${index}`}
                                          className="ml-2 block text-md cursor-pointer"
                                        >
                                          {capitalizeText(option)}
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
                          className="fixed inset-0 z-[90]"
                          onClick={closeFilterMenu}
                        ></div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Table header with solid background - hide when search results are shown */}
              {!searchSubmitted && (
                <div className="bg-zinc-100 w-full">
                  <div className="flex border-b pb-3 w-full">
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

            {/* Content area with padding to account for fixed header */}
            <div className={`${searchSubmitted ? 'pt-[90px]' : 'pt-[185px]'} w-full`}>
              {searchSubmitted ? (
                <div className="px-4 w-full">
                  <SearchResults
                    textSearchQuery={searchQuery}
                    textSearchSubmitted={searchSubmitted}
                    indexId={adsIndexId}
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
                  ) : displayItems.length === 0 ? (
                    <div className="flex justify-center items-center h-40 text-gray-500">
                      {isFiltering ? 'No videos match the current filters' : 'No videos available'}
                    </div>
                  ) : (
                    <div className="mt-3 ml-2">
                      {displayItems.map((item, index) => (
                        item.isIndexing ? (
                          // Special rendering for indexing videos
                          <div key={`indexing-${item.id}-${index}`} className="flex w-full mb-4">
                            <div className="w-[320px] flex-shrink-0 mr-4">
                              <div className="relative aspect-video bg-black rounded-[45.60px] overflow-hidden">
                                {/* Black background for indexing videos */}
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
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
                            {/* Empty columns for consistency with ContentItem layout */}
                            {COLUMNS.slice(1).map((column, colIndex) => (
                              <div
                                key={`${item.id}-${column.id}-${colIndex}`}
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
                          // Regular ContentItem for indexed videos
                          <ContentItem
                            key={`content-${item.id}-${index}`}
                            videoId={item.id}
                            indexId={adsIndexId}
                            thumbnailUrl={item.thumbnailUrl}
                            title={item.title}
                            videoUrl={item.videoUrl}
                            tags={item.tags}
                            metadata={item.metadata}
                            isLoadingMetadata={videosInProcessing.includes(item.id)}
                            onMetadataUpdated={() => {
                              // Refresh the content after user updates metadata
                              refreshVideoMetadata(item.id);
                            }}
                          />
                        )
                      ))}

                      {/* Load more button - only show when not filtering */}
                      {!isFiltering && hasNextPage && (
                        <div
                          className="flex justify-center py-4 mb-8"
                          ref={observerRef}
                        >
                          {isFetchingNextPage ? (
                            <div className="flex items-center space-x-2">
                              <LoadingSpinner />
                              <span className="text-gray-500">Loading more videos...</span>
                            </div>
                          ) : (
                            <div className="h-10 w-full" />
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

      {/* Video Uploader Modal */}
      {showUploader && (
        <VideoUploader
          indexId={adsIndexId}
          onUploadComplete={handleUploadComplete}
          onClose={() => setShowUploader(false)}
        />
      )}
    </QueryClientProvider>
  );
}