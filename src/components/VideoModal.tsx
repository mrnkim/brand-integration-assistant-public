import React, { useState, useRef, useEffect } from 'react';
import ReactPlayer from 'react-player';
import { useQuery } from '@tanstack/react-query';
import { generateChapters, fetchVideoDetails } from '@/hooks/apiHooks';
import LoadingSpinner from './LoadingSpinner';
import { useGlobalState } from '@/providers/ReactQueryProvider';
import { VideoModalProps, ChapterWithMetadata, Chapter } from '@/types';

const VideoModal: React.FC<VideoModalProps> = ({
  videoUrl,
  videoId,
  isOpen,
  onClose,
  title,
  searchScore,
  textScore,
  videoScore,
  originalSource,
  contentMetadata
}) => {
  const playerRef = useRef<ReactPlayer>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [playbackSequence, setPlaybackSequence] = useState<'video' | 'ad'>('video');
  const [returnToTime, setReturnToTime] = useState<number | null>(null);
  const [hasPlayedAd, setHasPlayedAd] = useState<boolean>(false);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [showChapterInfo, setShowChapterInfo] = useState<boolean>(false);

  // Get global state values
  const { selectedAdId } = useGlobalState();
  const adsIndexId = process.env.NEXT_PUBLIC_ADS_INDEX_ID || '';

  // Fetch ad video details
  const { data: adVideoDetail } = useQuery({
    queryKey: ["adVideoDetail", selectedAdId],
    queryFn: () => fetchVideoDetails(selectedAdId!, adsIndexId),
    enabled: !!selectedAdId && !!adsIndexId && isOpen
  });

  // Fetch chapters data
  const { data: chaptersData, isLoading: isChaptersLoading } = useQuery({
    queryKey: ["chapters", videoId],
    queryFn: () => generateChapters(videoId),
    enabled: isOpen && !!videoId,
  });

  // Effect to handle returning to video at the right timestamp after ad
  useEffect(() => {
    if (playbackSequence === 'video' && returnToTime !== null && !isTransitioning) {
      setIsTransitioning(true);
      if (playerRef.current) {
        playerRef.current.seekTo(returnToTime, 'seconds');
        // 광고 종료 후 원래 콘텐츠 비디오가 자동 재생되도록 설정
        setIsPlaying(true);
      }
      setIsTransitioning(false);
    }
  }, [playbackSequence, returnToTime, isTransitioning]);

  // Initialize isPlaying when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsPlaying(true);
    }
  }, [isOpen]);

  // Format time to 00:00:00 format
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0'),
    ].join(':');
  };

  // Track video progress
  const handleProgress = (state: { playedSeconds: number }) => {
    if (selectedChapter === null || !chaptersData || !adVideoDetail) {
      return;
    }

    const chapter = chaptersData.chapters[selectedChapter];
    const timeDiff = state.playedSeconds - chapter.end;
    const isLastChapter = selectedChapter === chaptersData.chapters.length - 1;

    if (
      playbackSequence === 'video' &&
      !hasPlayedAd &&
      ((isLastChapter && Math.abs(timeDiff) < 0.5) || (!isLastChapter && timeDiff >= 0))
    ) {
      setPlaybackSequence('ad');
      setHasPlayedAd(true);
    }
  };

  // Chapter click handler
  const handleChapterClick = (index: number) => {
    if (playbackSequence === 'ad') {
      return;
    }

    if (!adVideoDetail?.hls?.video_url) {
      console.warn("No ad selected. Please select an ad in the contextual analysis page.");
      return;
    }

    if (!chaptersData) return;

    const chapter = chaptersData.chapters[index];
    setSelectedChapter(index);
    setHasPlayedAd(false);
    setPlaybackSequence('video');
    setShowChapterInfo(true);

    if (playerRef.current) {
      // Start 3 seconds before the chapter end time
      const startTime = Math.max(0, chapter.end - 3);
      playerRef.current.seekTo(startTime, 'seconds');
    }
  };

  // Ad ended handler
  const handleAdEnded = () => {
    if (selectedChapter === null || !chaptersData) return;

    const chapter = chaptersData.chapters[selectedChapter];
    setPlaybackSequence('video');
    setReturnToTime(chapter.end);
    setIsPlaying(true);
  };

  // Video loaded handler
  const handleDuration = (duration: number) => {
    setDuration(duration);
  };

  // Get ad video title for display
  const adTitle = adVideoDetail?.system_metadata?.filename ||
                 adVideoDetail?.system_metadata?.video_title ||
                 'Advertisement';

  // Format percentage for scores
  const formatScore = (score?: number): string => {
    if (score === undefined) return "N/A";
    return `${(score * 100).toFixed(0)}`;
  };

  // Helper function to properly capitalize text
  const capitalizeText = (text: string): string => {
    return text
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Generate explanation text based on search results
  const getExplanationText = (): string => {
    if (!originalSource) return "This content was found in the search results.";
    const adMetadata = adVideoDetail?.user_metadata;

    // Tag extraction function - unified extraction logic considering field name differences
    const extractTagsFromMetadata = (metadata: Record<string, unknown> | undefined) => {
      if (!metadata) {
        return [];
      }

      const allTags: string[] = [];
      const fieldMappings: Record<string, string[]> = {
        sector: ['sector', 'topic_category'],
        emotions: ['emotions'],
        brands: ['brands'],
        locations: ['locations', 'location'],
        gender: ['demographics_gender', 'demo_gender'],
        age: ['demographics_age', 'demo_age']
      };


      // demographics unified field processing (when gender and age are together)
      if (metadata.demographics && typeof metadata.demographics === 'string') {
        const demographicsValue = metadata.demographics as string;

        // Process comma-separated values
        const demoParts = demographicsValue.split(',').map(part => part.trim());

        // Gender keywords
        const genderKeywords = ['male', 'female', 'men', 'women'];

        // Age pattern (number-number format)
        const agePattern = /^\d+-\d+$/;

        demoParts.forEach(part => {
          const lowerPart = part.toLowerCase();

          if (genderKeywords.some(keyword => lowerPart.includes(keyword))) {
            allTags.push(part);
          }
          else if (agePattern.test(part)) {
            allTags.push(part);
          }
          else {
            allTags.push(part);
          }
        });
      }

      Object.values(fieldMappings).forEach(fields => {
        fields.forEach(field => {
          const value = metadata[field];
          if (value && typeof value === 'string') {
            const tags = value.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0);
            tags.forEach(tag => allTags.push(tag));
          } else {
          }
        });
      });

      return allTags;
    };

    const adTags = extractTagsFromMetadata(adMetadata);
    const contentTags = extractTagsFromMetadata(contentMetadata?.user_metadata);

    // Find common tags (case-insensitive)
    const commonTags: string[] = [];

    adTags.forEach(adTag => {
      const normalizedAdTag = adTag.toLowerCase();
      const matchingContentTag = contentTags.find(contentTag =>
        contentTag.toLowerCase() === normalizedAdTag
      );

      if (matchingContentTag) {
        commonTags.push(adTag);
      }
    });


    // Create a mapping from tag value to category
    const tagCategories = new Map<string, string>();

    // Function to assign categories to tags
    const assignCategoryToTags = (metadata: Record<string, unknown> | undefined) => {
      if (!metadata) return;

      if (metadata.demographics && typeof metadata.demographics === 'string') {
        const demographicsValue = metadata.demographics as string;
        const demoParts = demographicsValue.split(',').map(part => part.trim());

        const genderKeywords = ['male', 'female', 'men', 'women'];

        const agePattern = /^\d+-\d+$/;

        demoParts.forEach(part => {
          const lowerPart = part.toLowerCase();

          if (genderKeywords.some(keyword => lowerPart.includes(keyword))) {
            tagCategories.set(lowerPart, 'gender');
          }
          else if (agePattern.test(part)) {
            tagCategories.set(lowerPart, 'age');
          }
        });
      }

      ['sector', 'topic_category'].forEach(field => {
        const value = metadata[field];
        if (value && typeof value === 'string') {
          value.split(',').forEach((tag: string) => {
            const trimmedTag = tag.trim();
            if (trimmedTag) {
              tagCategories.set(trimmedTag.toLowerCase(), 'topic');
            }
          });
        }
      });

      // 감정 (Emotions)
      const emotions = metadata.emotions;
      if (emotions && typeof emotions === 'string') {
        emotions.split(',').forEach((tag: string) => {
          const trimmedTag = tag.trim();
          if (trimmedTag) {
            tagCategories.set(trimmedTag.toLowerCase(), 'emotions');
          }
        });
      }

      const brands = metadata.brands;
      if (brands && typeof brands === 'string') {
        brands.split(',').forEach((tag: string) => {
          const trimmedTag = tag.trim();
          if (trimmedTag) {
            tagCategories.set(trimmedTag.toLowerCase(), 'brands');
          }
        });
      }

      ['locations', 'location'].forEach(field => {
        const value = metadata[field];
        if (value && typeof value === 'string') {
          value.split(',').forEach((tag: string) => {
            const trimmedTag = tag.trim();
            if (trimmedTag) {
              tagCategories.set(trimmedTag.toLowerCase(), 'location');
            }
          });
        }
      });

      ['demographics_gender', 'demo_gender'].forEach(field => {
        const value = metadata[field];
        if (value && typeof value === 'string') {
          value.split(',').forEach((tag: string) => {
            const trimmedTag = tag.trim();
            if (trimmedTag) {
              tagCategories.set(trimmedTag.toLowerCase(), 'gender');
            }
          });
        }
      });

      ['demographics_age', 'demo_age'].forEach(field => {
        const value = metadata[field];
        if (value && typeof value === 'string') {
          value.split(',').forEach((tag: string) => {
            const trimmedTag = tag.trim();
            if (trimmedTag) {
              tagCategories.set(trimmedTag.toLowerCase(), 'age');
            }
          });
        }
      });
    };

    assignCategoryToTags(adMetadata);
    assignCategoryToTags(contentMetadata?.user_metadata);


    // Sort common tags according to the specified order
    const sortedCommonTags = [...commonTags].sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();

      const categoryA = tagCategories.get(aLower) || '';
      const categoryB = tagCategories.get(bLower) || '';


      // Define order priority
      const categoryOrder = {
        'topic': 1,
        'emotions': 2,
        'brands': 3,
        'location': 4,
        'gender': 5,
        'age': 6
      };

      // Get priority or default to high number if category not found
      const priorityA = categoryOrder[categoryA as keyof typeof categoryOrder] || 99;
      const priorityB = categoryOrder[categoryB as keyof typeof categoryOrder] || 99;


      return priorityA - priorityB;
    });


    let explanation = "";

    switch (originalSource) {
      case "BOTH":
        explanation = `it shares both visual and thematic elements with the selected ad.`;
        if (commonTags.length > 0) {
          const capitalizedTags = sortedCommonTags.slice(0, 3).map(tag => capitalizeText(tag));
          explanation += ` They share common tags: `;
          explanation += capitalizedTags.map(tag =>
            `<span class="inline-block bg-gray-100 border rounded-full px-2 py-0.5 text-xs mx-0.5">${tag}</span>`
          ).join("");
          if (commonTags.length > 3) {
            explanation += '...';
          }
        }
        break;
      case "TEXT":
        explanation = `it shares thematic elements and keywords with the selected ad.`;
        if (commonTags.length > 0) {
          const capitalizedTags = sortedCommonTags.slice(0, 3).map(tag => capitalizeText(tag));
          explanation += ` They share common tags: ${capitalizedTags.join(", ")}${commonTags.length > 3 ? '...' : ''}.`;
        } else {
        }
        break;
      case "VIDEO":
        explanation = `it shares visual elements and style with the selected ad.`;
        if (commonTags.length > 0) {
          const capitalizedTags = sortedCommonTags.slice(0, 3).map(tag => capitalizeText(tag));
          explanation += ` They share common tags: `;
          explanation += capitalizedTags.map(tag =>
            `<span class="inline-block bg-gray-100 border rounded-full px-2 py-0.5 text-xs mx-0.5">${tag}</span>`
          ).join("");
          if (commonTags.length > 3) {
            explanation += '...';
          }
        }
        break;
      default:
        explanation = `it was found in the search results.`;
    }

    return explanation;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative z-50 w-[90%] max-w-[950px] max-h-[90vh] rounded-[45.60px] shadow-xl bg-white flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="flex-shrink-0 p-6 relative border-gray-200">
          <h3 className="text-2xl font-medium pr-12">
            {playbackSequence === 'ad' ? adTitle : (title || 'Video Player')}
            {playbackSequence === 'ad' && <span className="ml-2 text-red text-sm font-bold">(Ad)</span>}
          </h3>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 focus:outline-none cursor-pointer p-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Contextual alignment explanation */}
          {originalSource && (
            <div className="flex justify-center w-full mb-4">
              <div className="bg-gray-100 rounded-[45.60px] py-2 px-6 w-full max-w-[95%]">
                {searchScore !== undefined && (
                  <div className="mt-1 text-md flex flex-wrap gap-x-4">
                      {videoScore !== undefined && videoScore > 0 && (
                      <span>Video Match: {formatScore(videoScore)}</span>
                    )}
                    {textScore !== undefined && textScore > 0 && (
                      <span>Keyword Match: {formatScore(textScore)}</span>
                    )}
                  </div>
                )}
                <p className="text-md font-medium">
                  <span className="mr-1">This content was recommended as</span>
                  <span dangerouslySetInnerHTML={{ __html: getExplanationText() }} />
                </p>
              </div>
            </div>
          )}

          <div className="relative w-full px-6 pt-2 pb-1">
            <div className="relative aspect-video rounded-[45.60px] overflow-hidden">
              {playbackSequence === 'ad' && adVideoDetail?.hls?.video_url ? (
                <ReactPlayer
                  url={adVideoDetail.hls.video_url}
                  controls
                  playing={isPlaying}
                  width="100%"
                  height="100%"
                  style={{ position: 'absolute', top: 0, left: 0 }}
                  onEnded={handleAdEnded}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              ) : (
                <ReactPlayer
                  ref={playerRef}
                  url={videoUrl}
                  controls
                  playing={isPlaying}
                  width="100%"
                  height="100%"
                  style={{ position: 'absolute', top: 0, left: 0 }}
                  onDuration={handleDuration}
                  onProgress={handleProgress}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  config={{
                    file: {
                      attributes: {
                        controlsList: 'nodownload',
                        disablePictureInPicture: true,
                      },
                    },
                  }}
                />
              )}
            </div>

            {/* chapter info section */}
            {showChapterInfo && selectedChapter !== null && chaptersData?.chapters && (
              <div className="mt-4 mb-4 rounded-[45.60px] p-4 relative" style={{ backgroundColor: "#FDE3AE" }}>
                <button
                  onClick={() => setShowChapterInfo(false)}
                  className="absolute top-2 right-4 text-gray-400 hover:text-gray-700 cursor-pointer p-2 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                <div className="flex items-center mb-2">
                  <div className="inline-block border rounded-full px-2.5 py-0.5 text-xs font-medium mr-2">
                    {formatTime(chaptersData.chapters[selectedChapter].end)}
                  </div>
                  <h4 className="text-lg font-semibold">
                    {(chaptersData.chapters[selectedChapter] as ChapterWithMetadata).chapter_title || `Chapter ${selectedChapter + 1}`}
                  </h4>
                </div>
                <p className="text-sm leading-relaxed pl-5">
                  <span className="font-light">
                  {(() => {
                    const summary = (chaptersData.chapters[selectedChapter] as ChapterWithMetadata).chapter_summary ||
                                   chaptersData.chapters[selectedChapter].text ||
                                   "No summary available";

                    const sentences = summary.match(/[^.!?]+[.!?]+/g) || [summary];
                    return sentences[sentences.length - 1].trim();
                  })()}
                  </span>
                </p>
              </div>
            )}

            {/* chapter timeline bar */}
            <div className="relative w-full h-28 p-4 rounded-md">
              {isChaptersLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <LoadingSpinner />
                </div>
              ) : (
                <>
                  <div className="absolute w-[96%] h-2 bg-black top-1/3 left-[2%] -translate-y-1/2 z-10"></div>
                  {chaptersData?.chapters?.map((chapter: Chapter, index: number) => {
                    const position = Math.max(2, Math.min(98, (chapter.end / (duration || 1)) * 96 + 2));

                    return (
                      <div
                        key={`timeline-${index}`}
                        className={`absolute w-4 h-4 rounded-full -translate-y-1/2 -translate-x-1/2 z-20
                          ${selectedChapter === index
                              ? 'ring-2 ring-black'
                              : 'bg-white ring-2 ring-black'}
                          ${playbackSequence === 'ad' || !adVideoDetail?.hls?.video_url
                              ? 'cursor-not-allowed'
                              : 'cursor-pointer hover:scale-110 transition-transform'}`}
                        style={{
                          left: `${position}%`,
                          top: '33%',
                          backgroundColor: selectedChapter === index ? '#F4A680' : 'white'
                        }}
                        onClick={() => handleChapterClick(index)}
                        title={(chapter as ChapterWithMetadata).chapter_title || `Chapter ${index + 1}`}
                      >
                        <div className="absolute top-6 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap">
                          {formatTime(chapter.end)}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoModal;