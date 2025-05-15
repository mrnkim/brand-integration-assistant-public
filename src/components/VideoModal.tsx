import React, { useState, useRef } from 'react';
import ReactPlayer from 'react-player';
import { useQuery } from '@tanstack/react-query';
import { generateChapters, Chapter } from '@/hooks/apiHooks';
import LoadingSpinner from './LoadingSpinner';

interface VideoModalProps {
  videoUrl: string;
  videoId: string;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

const VideoModal: React.FC<VideoModalProps> = ({ videoUrl, videoId, isOpen, onClose, title }) => {
  const playerRef = useRef<ReactPlayer>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(0);

  // 챕터 데이터 가져오기
  const { data: chaptersData, isLoading: isChaptersLoading } = useQuery({
    queryKey: ["chapters", videoId],
    queryFn: () => generateChapters(videoId),
    enabled: isOpen && !!videoId,
  });

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

  // 챕터 클릭 핸들러
  const handleChapterClick = (index: number) => {
    if (!chaptersData) return;

    const chapter = chaptersData.chapters[index];
    setSelectedChapter(index);

    if (playerRef.current) {
      // 챕터 시작 시간으로 이동 - 해당 챕터의 end 시간으로 이동
      playerRef.current.seekTo(chapter.end, 'seconds');
    }
  };

  // 비디오 로드 완료 핸들러
  const handleDuration = (duration: number) => {
    setDuration(duration);
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
            {title || 'Video Player'}
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

        <div className="relative w-full px-6 pt-6 pb-2 overflow-auto flex-grow">
          <div className="relative w-full overflow-hidden" style={{ paddingTop: '56.25%' }}> {/* 16:9 Aspect Ratio */}
            <ReactPlayer
              ref={playerRef}
              url={videoUrl}
              controls
              playing
              width="100%"
              height="100%"
              style={{ position: 'absolute', top: 0, left: 0 }}
              onDuration={handleDuration}
              config={{
                file: {
                  attributes: {
                    controlsList: 'nodownload',
                    disablePictureInPicture: true,
                  },
                },
              }}
            />
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
                      className={`absolute w-4 h-4 rounded-full -translate-y-1/2 -translate-x-1/2 z-10 cursor-pointer hover:scale-110 transition-transform
                        ${selectedChapter === index ? 'bg-green-500 ring-2 ring-black' : 'bg-white ring-2 ring-black'}`}
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