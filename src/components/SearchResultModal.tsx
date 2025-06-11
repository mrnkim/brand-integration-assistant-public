import ReactPlayer from "react-player";
import { useState, useRef, useEffect } from "react";
import { SearchResultModalProps } from "@/types";

const SearchResultModal = ({ selectedResult, closeModal, modalOpened }: SearchResultModalProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerInitialized, setPlayerInitialized] = useState(false);
  const [lastSeekTime, setLastSeekTime] = useState<number | null>(null);
  const [segmentEndReached, setSegmentEndReached] = useState(false);

  const playerRef = useRef<ReactPlayer>(null);

  // Format time as HH:MM:SS
  const formatTime = (timeInSeconds: number): string => {
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = Math.floor(timeInSeconds % 60);

    return `${hours > 0 ? hours + ':' : ''}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Get confidence label color
  const getConfidenceColor = (confidence?: string): string => {
    if (!confidence) return "#1d1c1c"; // default dark color

    switch(confidence.toLowerCase()) {
      case 'high':
        return "#30710e"; // green
      case 'medium':
        return "#846617"; // yellow-ish
      default:
        return "#1d1c1c"; // default dark color for low or unknown
    }
  };

  // Handle player progress updates to enforce segment end time
  const handleProgress = (state: { playedSeconds: number }) => {
    const { startTime, endTime } = getSegmentTimes();

    // Strict end detection: directly compare if we've reached or passed the end time
    if (state.playedSeconds >= endTime && !segmentEndReached) {
      setSegmentEndReached(true);

      // Force immediate pause
      setIsPlaying(false);

      // Implement looping behavior
      const now = Date.now();
      const minSeekInterval = 500; // milliseconds
      const canSeek = !lastSeekTime || now - lastSeekTime > minSeekInterval;

      if (canSeek && playerRef.current) {
        // Set last seek time
        setLastSeekTime(now);

        // Seek back to start
        setTimeout(() => {
          if (playerRef.current) {
            playerRef.current.seekTo(startTime, 'seconds');

            // Resume playback after a short delay
            setTimeout(() => {
              setIsPlaying(true);
              setSegmentEndReached(false);
            }, 250);
          }
        }, 150);
      }
    } else if (state.playedSeconds < endTime - 1.0 && segmentEndReached) {
      // Reset end reached flag when we're well before the end
      setSegmentEndReached(false);
    }
  };

  // Simple replay segment handler
  const handleReplaySegment = () => {
    const { startTime } = getSegmentTimes();

    // Ensure smooth replay sequence with proper timing
    if (playerRef.current) {
      // First pause to ensure clean state
      setIsPlaying(false);

      // Set last seek time to prevent conflicting seeks
      setLastSeekTime(Date.now());

      // Small delay before seeking
      setTimeout(() => {
        if (playerRef.current) {
          playerRef.current.seekTo(startTime, 'seconds');
          setSegmentEndReached(false);

          // Resume playback after seeking completes
          setTimeout(() => {
            setIsPlaying(true);
          }, 250);
        }
      }, 100);
    }
  };

  const getSegmentTimes = () => {
    return {
      startTime: selectedResult.start ||
                 (selectedResult.segments && selectedResult.segments.length > 0 ?
                  selectedResult.segments[0].start : 0),
      endTime: selectedResult.end ||
               (selectedResult.segments && selectedResult.segments.length > 0 ?
                selectedResult.segments[0].end :
                (selectedResult.videoDetail?.system_metadata?.duration || 0))
    };
  };

  // Reset player state when modal opens
  useEffect(() => {
    // Reset all player state
    setSegmentEndReached(false);
    setLastSeekTime(null);
    setPlayerInitialized(false);
    setIsPlaying(true);

    // Add an effect cleanup function
    return () => {
      // Clean up state when component unmounts
      setIsPlaying(false);
      setSegmentEndReached(false);
      setLastSeekTime(null);
    };
  }, []);

  // Initialize player when it's ready
  useEffect(() => {
    if (modalOpened && playerInitialized) {
      const { startTime } = getSegmentTimes();
      if (playerRef.current) {
        // Set initial position
        setLastSeekTime(Date.now());
        playerRef.current.seekTo(startTime, 'seconds');

        // Ensure playback starts after seeking is complete
        setTimeout(() => {
          setIsPlaying(true);
        }, 250);
      }
    }
  }, [modalOpened, playerInitialized]);

  const { startTime, endTime } = getSegmentTimes();
  const confidenceColor = getConfidenceColor(selectedResult.confidence);
  const formattedTimeRange = `${formatTime(startTime)}-${formatTime(endTime)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Dark overlay - using rgba background color */}
      <div
        className="fixed inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
        onClick={closeModal}
      />

      {/* Modal content */}
      <div className="p-5 relative z-50 w-[90%] max-w-[950px] rounded-[45.60px] shadow-xl overflow-hidden bg-white">
        {/* Modal header */}
        <div className="flex flex-col p-4">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-medium">
              {selectedResult.video_title || selectedResult.videoDetail?.system_metadata?.video_title || selectedResult.videoDetail?.system_metadata?.filename || 'Untitled'}
            </h3>
            <button
              onClick={closeModal}
              className="hover:text-gray-700 cursor-pointer"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Confidence label and time range */}
          <div className="flex items-center mt-5 gap-5">
            {selectedResult.confidence && (
              <div
                className="text-white text-xs px-1 py-0.5 rounded uppercase font-semibold"
                style={{ backgroundColor: confidenceColor }}
              >
                {selectedResult.confidence}
              </div>
            )}
            <div className="flex items-center">
              <button
                className="border rounded px-1 py-0.5 text-xs cursor-pointer"
                onClick={handleReplaySegment}
              >
                {formattedTimeRange}
              </button>
            </div>
          </div>
        </div>

        {/* Modal body */}
        <div className="flex flex-col md:flex-row gap-3">
          {/* Video Player */}
          <div className="w-full md:w-3/5">
            <div className="relative aspect-video rounded-[45.60px] overflow-hidden">
              {selectedResult.videoDetail?.hls?.video_url ? (
                <ReactPlayer
                  ref={playerRef}
                  url={selectedResult.videoDetail.hls.video_url}
                  controls
                  width="100%"
                  height="100%"
                  style={{ position: 'absolute', top: 0, left: 0 }}
                  light={false}
                  playIcon={<></>}
                  playing={isPlaying}
                  onProgress={handleProgress}
                  progressInterval={50} // More frequent updates for better end detection
                  config={{
                    file: {
                      attributes: {
                        preload: "auto",
                        controlsList: "nodownload",
                        crossOrigin: "anonymous"
                      },
                      forceVideo: true,
                      forceHLS: false, // Don't force HLS to allow fallback to other formats
                      hlsOptions: {
                        enableWorker: true,
                        debug: false,
                        lowLatencyMode: false,
                        backBufferLength: 90
                      }
                    },
                  }}
                  onReady={() => {
                    if (!playerInitialized) {
                      const { startTime } = getSegmentTimes();

                      // Set initial position directly
                      if (playerRef.current) {
                        setLastSeekTime(Date.now());
                        playerRef.current.seekTo(startTime, 'seconds');
                      }

                      // Mark as initialized
                      setPlayerInitialized(true);

                      // Start playback after a delay
                      setTimeout(() => {
                        setIsPlaying(true);
                      }, 250);
                    }
                  }}
                  onError={(e) => {
                    console.error("ReactPlayer error:", e);
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gray-200 flex items-center justify-center rounded-[45.60px]">
                  <span className="text-gray-500">
                    {selectedResult.videoDetail ?
                      "Video URL is missing" :
                      "Loading video details..."}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Video Details */}
          <div className="w-full md:w-2/5 p-5 overflow-y-auto rounded-[45.60px] bg-zinc-100" style={{ height: '302.88px' }}>
            <h4 className="text-lg mb-4">Video Details</h4>

            {selectedResult.videoDetail?.user_metadata && (
              <div className="mb-4">
                <div>
                  {Object.entries(selectedResult.videoDetail.user_metadata).map(([key, value]) => {
                    // 값이 없거나 빈 문자열인 경우 표시하지 않음
                    if (!value || value.toString().trim() === '') return null;

                    // 각 단어의 첫 글자를 대문자로 변환하는 함수
                    const capitalizeWords = (text: string) => {
                      return text
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ');
                    };

                    const formattedKey = capitalizeWords(key);
                    const formattedValue = capitalizeWords(value.toString());

                    return (
                      <div key={key} className="m-2">
                        <span className="text-md font-medium min-w-[100px]">{formattedKey}: </span>
                        <span className="text-md">{formattedValue}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchResultModal;