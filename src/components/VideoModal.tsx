import React, { useState, useRef, useEffect } from 'react';
import ReactPlayer from 'react-player';
import { useQuery } from '@tanstack/react-query';
import { generateChapters, Chapter, fetchVideoDetails } from '@/hooks/apiHooks';
import LoadingSpinner from './LoadingSpinner';
import { useGlobalState } from '@/providers/ReactQueryProvider';
import { VideoData } from '@/types';

interface VideoModalProps {
  videoUrl: string;
  videoId: string;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  searchScore?: number;
  textScore?: number;
  videoScore?: number;
  originalSource?: 'TEXT' | 'VIDEO' | 'BOTH';
  contentMetadata?: VideoData;
}

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

  // Get global state values
  const { selectedAdId } = useGlobalState();
  const adsIndexId = process.env.NEXT_PUBLIC_ADS_INDEX_ID || '';

  // Fetch ad video details
  const { data: adVideoDetail } = useQuery({
    queryKey: ["adVideoDetail", selectedAdId],
    queryFn: () => fetchVideoDetails(selectedAdId!, adsIndexId),
    enabled: !!selectedAdId && !!adsIndexId && isOpen
  });

  // 챕터 데이터 가져오기
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
      }
      setIsTransitioning(false);
    }
  }, [playbackSequence, returnToTime, isTransitioning]);

  // 시간을 00:00:00 형식으로 변환하는 함수
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

  // 비디오 진행 상황 추적
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

  // 챕터 클릭 핸들러
  const handleChapterClick = (index: number) => {
    if (playbackSequence === 'ad') {
      return; // Don't allow chapter selection during ad playback
    }

    // Check if an ad is available
    if (!adVideoDetail?.hls?.video_url) {
      console.warn("No ad selected. Please select an ad in the contextual analysis page.");
      return;
    }

    if (!chaptersData) return;

    const chapter = chaptersData.chapters[index];
    setSelectedChapter(index);
    setHasPlayedAd(false);
    setPlaybackSequence('video');

    if (playerRef.current) {
      // Start 3 seconds before the chapter end time
      const startTime = Math.max(0, chapter.end - 3);
      playerRef.current.seekTo(startTime, 'seconds');
    }
  };

  // 광고 종료 핸들러
  const handleAdEnded = () => {
    if (selectedChapter === null || !chaptersData) return;

    const chapter = chaptersData.chapters[selectedChapter];
    setPlaybackSequence('video');
    setReturnToTime(chapter.end);
  };

  // 비디오 로드 완료 핸들러
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

  // Generate explanation text based on search results
  const getExplanationText = (): string => {
    if (!originalSource) return "This content was found in the search results.";

    const adMetadata = adVideoDetail?.user_metadata;
    const contentTags = contentMetadata?.user_metadata
      ? Object.entries(contentMetadata.user_metadata)
          .filter(([key, value]) => key !== 'source' && value != null && value.toString().length > 0)
          .flatMap(entry => (entry[1] as string).split(',').map(tag => tag.trim()))
          .filter(tag => tag.length > 0)
      : [];

    const adTags = adMetadata
      ? Object.entries(adMetadata)
          .filter(([key, value]) => key !== 'source' && value != null && value.toString().length > 0)
          .flatMap(entry => (entry[1] as string).split(',').map(tag => tag.trim()))
          .filter(tag => tag.length > 0)
      : [];

    const commonTags = adTags.filter(tag => contentTags.includes(tag));

    let explanation = "";

    switch (originalSource) {
      case "BOTH":
        explanation = `it shares both visual and thematic elements with the selected ad.`;
        if (commonTags.length > 0) {
          explanation += ` They share common tags: ${commonTags.slice(0, 3).join(", ")}${commonTags.length > 3 ? '...' : ''}.`;
        }
        break;
      case "TEXT":
        explanation = `it shares thematic elements and keywords with the selected ad.`;
        if (commonTags.length > 0) {
          explanation += ` They share common tags: ${commonTags.slice(0, 3).join(", ")}${commonTags.length > 3 ? '...' : ''}.`;
        }
        break;
      case "VIDEO":
        explanation = `it shares visual elements and style with the selected ad.`;
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
        className="relative bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-xl font-medium truncate pr-4">
            {playbackSequence === 'ad' ? adTitle : (title || 'Video Player')}
            {playbackSequence === 'ad' && <span className="ml-2 text-red-500 text-sm">(Ad)</span>}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 focus:outline-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contextual alignment explanation */}
        {originalSource && (
          <div className="px-6 py-3 bg-blue-50 text-blue-700 border-b border-blue-100">
            <p className="text-sm font-medium">
              <span className="mr-1">This content was recommended as</span>
              {getExplanationText()}
            </p>
            {searchScore !== undefined && (
              <div className="mt-1 text-xs text-blue-600 flex flex-wrap gap-x-4">
                  {videoScore !== undefined && videoScore > 0 && (
                  <span>Video Match: <strong>{formatScore(videoScore)}</strong></span>
                )}
                {textScore !== undefined && textScore > 0 && (
                  <span>Keyword Match: <strong>{formatScore(textScore)}</strong></span>
                )}

              </div>
            )}
          </div>
        )}

        <div className="relative w-full px-6 pt-6 pb-2 overflow-auto flex-grow">
          <div className="relative w-full overflow-hidden" style={{ paddingTop: '56.25%' }}> {/* 16:9 Aspect Ratio */}
            {playbackSequence === 'ad' && adVideoDetail?.hls?.video_url ? (
              <ReactPlayer
                url={adVideoDetail.hls.video_url}
                controls
                playing
                width="100%"
                height="100%"
                style={{ position: 'absolute', top: 0, left: 0 }}
                onEnded={handleAdEnded}
              />
            ) : (
              <ReactPlayer
                ref={playerRef}
                url={videoUrl}
                controls
                playing
                width="100%"
                height="100%"
                style={{ position: 'absolute', top: 0, left: 0 }}
                onDuration={handleDuration}
                onProgress={handleProgress}
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

          {/* 챕터 타임라인 바 */}
          <div className="relative w-full h-28 bg-gray-100 p-4 mt-6 rounded-md">
            {isChaptersLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <LoadingSpinner />
              </div>
            ) : (
              <>
                <div className="absolute w-[96%] h-1 bg-black top-1/3 left-[2%] -translate-y-1/2 z-0"></div>
                {chaptersData?.chapters?.map((chapter: Chapter, index: number) => {
                  // Adjust position to ensure dots stay within the visible area
                  const position = Math.max(2, Math.min(98, (chapter.end / (duration || 1)) * 96 + 2));

                  return (
                    <div
                      key={`timeline-${index}`}
                      className={`absolute w-4 h-4 rounded-full -translate-y-1/2 -translate-x-1/2 z-10
                        ${selectedChapter === index
                            ? 'bg-green-500 ring-2 ring-black'
                            : 'bg-white ring-2 ring-black'}
                        ${playbackSequence === 'ad' || !adVideoDetail?.hls?.video_url
                            ? 'cursor-not-allowed'
                            : 'cursor-pointer hover:scale-110 transition-transform'}`}
                      style={{
                        left: `${position}%`,
                        top: '33%'
                      }}
                      onClick={() => handleChapterClick(index)}
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
  );
};

export default VideoModal;