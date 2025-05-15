"use client";

import React, { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import ErrorFallback from "./ErrorFallback";
import clsx from "clsx";
import ReactPlayer from "react-player";
import { fetchVideoDetails } from "@/hooks/apiHooks";
import LoadingSpinner from "./LoadingSpinner";
import { VideoProps, VideoDetails } from "@/types";

interface EnhancedVideoProps extends VideoProps {
  confidenceLabel?: string;
  confidenceColor?: 'green' | 'yellow' | 'red';
  timeRange?: { start: string; end: string };
  disablePlayback?: boolean;
}

const Video: React.FC<EnhancedVideoProps> = ({
  videoId,
  indexId,
  showTitle = true,
  videoDetails: providedVideoDetails,
  playing = false,
  onPlay,
  confidenceLabel,
  confidenceColor = 'green',
  timeRange,
  disablePlayback = false
}) => {
  console.log("🚀 > videoId, indexId, showTitle = true, videoDetails=", videoId, indexId, showTitle, providedVideoDetails)

  const { data: videoDetails } = useQuery<VideoDetails, Error>({
    queryKey: ["videoDetails", videoId],
    queryFn: () => {
      if (!videoId) {
        throw new Error("Video ID is missing");
      }
      return fetchVideoDetails((videoId)!, indexId);
    },
    enabled: !!indexId && (!!videoId) && !providedVideoDetails,
  });
  console.log("🚀 > videoDetails=", videoDetails)

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return [
      hours.toString().padStart(2, "0"),
      minutes.toString().padStart(2, "0"),
      secs.toString().padStart(2, "0"),
    ].join(":");
  };

  const finalVideoDetails = providedVideoDetails || videoDetails;

  // Get confidence label background color
  const getConfidenceBgColor = () => {
    switch (confidenceColor) {
      case 'green': return 'bg-green-500';
      case 'yellow': return 'bg-yellow-500';
      case 'red': return 'bg-red-500';
      default: return 'bg-green-500';
    }
  };

  // 비디오 플레이 방지 핸들러
  const preventPlayback = (e: React.MouseEvent) => {
    if (disablePlayback) {
      // Only prevent default behavior, but allow click event to propagate to parent
      e.preventDefault();
      // Don't call e.stopPropagation() so the click reaches the parent handler
    }
  };

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<LoadingSpinner />}>
        <div className="flex flex-col w-full max-w-sm h-full">
          <div className="relative">
            <div
              className="w-full h-0 pb-[56.25%] relative overflow-hidden rounded cursor-pointer"
              onClick={disablePlayback ? preventPlayback : onPlay}
            >
              {disablePlayback ? (
                <div className="absolute inset-0">
                  <img
                    src={
                      finalVideoDetails?.hls?.thumbnail_urls?.[0] ||
                      '/videoFallback.jpg'
                    }
                    className="object-cover w-full h-full"
                    alt="thumbnail"
                  />
                </div>
              ) : (
                <ReactPlayer
                  url={finalVideoDetails?.hls?.video_url}
                  controls={!disablePlayback}
                  width="100%"
                  height="100%"
                  style={{ position: 'absolute', top: 0, left: 0 }}
                  light={
                    <img
                      src={
                        finalVideoDetails?.hls?.thumbnail_urls?.[0] ||
                        '/videoFallback.jpg'
                      }
                      className="object-cover w-full h-full"
                      alt="thumbnail"
                    />
                  }
                  playing={playing}
                  config={{
                    file: {
                      attributes: {
                        preload: "auto",
                      },
                    },
                  }}
                  progressInterval={100}
                  onPlay={() => onPlay && onPlay()}
                />
              )}

              {/* Confidence Label (top-left) */}
              {confidenceLabel && (
                <div className="absolute top-2 left-2 z-[1]">
                  <div className={`${getConfidenceBgColor()} px-3 py-1 rounded-md`}>
                    <p className="text-white text-xs font-medium uppercase">
                      {confidenceLabel}
                    </p>
                  </div>
                </div>
              )}

              {/* Timestamp/Duration (bottom-center) - only show when not playing */}
              {timeRange ? (
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-[1]">
                  <div className="bg-black/60 px-3 py-1 rounded-md">
                    <p className="text-white text-xs font-medium">
                      {timeRange.start} - {timeRange.end}
                    </p>
                  </div>
                </div>
              ) : (
                !playing && (
                  <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-[1]">
                    <div className="bg-black/60 px-3 py-1 rounded-md">
                      <p className="text-white text-xs font-medium">
                        {formatDuration(finalVideoDetails?.system_metadata?.duration ?? 0)}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
          {showTitle && (
            <div className="mt-2 mb-0">
              <p className={clsx("text-body3", "truncate", "text-grey-700")}>
                {finalVideoDetails?.system_metadata?.filename || finalVideoDetails?.system_metadata?.video_title}
              </p>
            </div>
          )}
        </div>
      </Suspense>
    </ErrorBoundary>
  );
};

export default Video;