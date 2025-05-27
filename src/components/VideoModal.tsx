import React, { useState, useRef, useEffect } from 'react';
import ReactPlayer from 'react-player';
import { useQuery } from '@tanstack/react-query';
import { generateChapters, Chapter, fetchVideoDetails } from '@/hooks/apiHooks';
import LoadingSpinner from './LoadingSpinner';
import { useGlobalState } from '@/providers/ReactQueryProvider';
import { VideoData } from '@/types';

// 확장된 Chapter 인터페이스
interface ChapterWithMetadata extends Chapter {
  chapter_title?: string;
  chapter_summary?: string;
  chapter_number?: number;
}

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

  // 챕터 데이터 가져오기
  const { data: chaptersData, isLoading: isChaptersLoading } = useQuery({
    queryKey: ["chapters", videoId],
    queryFn: () => generateChapters(videoId),
    enabled: isOpen && !!videoId,
  });
  console.log("🚀 > chaptersData=", chaptersData)

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
    setShowChapterInfo(true);

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
    // 광고가 끝나면 isPlaying 상태를 true로 설정
    setIsPlaying(true);
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
          const capitalizedTags = commonTags.slice(0, 3).map(tag => capitalizeText(tag));
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
          const capitalizedTags = commonTags.slice(0, 3).map(tag => capitalizeText(tag));
          explanation += ` They share common tags: ${capitalizedTags.join(", ")}${commonTags.length > 3 ? '...' : ''}.`;
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
        className="p-5 relative z-50 w-[90%] max-w-[950px] rounded-[45.60px] shadow-xl overflow-hidden bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 flex justify-between items-center">
        <h3 className="text-2xl font-medium">
        {playbackSequence === 'ad' ? adTitle : (title || 'Video Player')}
            {playbackSequence === 'ad' && <span className="ml-2 text-red text-sm font-bold">(Ad)</span>}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 focus:outline-none cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

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

        <div className="relative w-full px-6 pt-2 pb-1 overflow-auto flex-grow">
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

          {/* 챕터 정보 표시 섹션 */}
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

                  // 마지막 문장만 추출 (마침표, 느낌표, 물음표로 끝나는 문장 기준)
                  const sentences = summary.match(/[^.!?]+[.!?]+/g) || [summary];
                  return sentences[sentences.length - 1].trim();
                })()}
                </span>
              </p>
            </div>
          )}

          {/* 챕터 타임라인 바 */}
          <div className="relative w-full h-28 p-4 rounded-md">
            {isChaptersLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <LoadingSpinner />
              </div>
            ) : (
              <>
                <div className="absolute w-[96%] h-2 bg-black top-1/3 left-[2%] -translate-y-1/2 z-10"></div>
                {chaptersData?.chapters?.map((chapter: Chapter, index: number) => {
                  // Adjust position to ensure dots stay within the visible area
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
  );
};

export default VideoModal;