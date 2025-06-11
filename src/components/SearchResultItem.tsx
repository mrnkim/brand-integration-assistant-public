"use client";

import React from "react";
import { VideoDetailResponse } from "@/types";

interface SearchResultItemProps {
  videoId: string;
  thumbnailUrl: string;
  videoTitle: string;
  confidence?: string;
  startTime: number;
  endTime: number;
  onClick: () => void;
  videoDetail?: VideoDetailResponse;
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({
  thumbnailUrl,
  videoTitle,
  confidence,
  startTime,
  endTime,
  onClick,
}) => {
  // Format time to display in hh:mm:ss format
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Get confidence color class based on label
  const getConfidenceColorClass = (): string => {
    if (!confidence) return "bg-confidence-high";

    const confidenceLower = confidence.toLowerCase();
    if (confidenceLower === "high") return "bg-confidence-high";
    if (confidenceLower === "medium") return "bg-confidence-medium";
    if (confidenceLower === "low") return "bg-confidence-low";
    return "bg-confidence-high";
  };

  return (
    <div
      className="rounded-lg overflow-hidden transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="relative">
        {/* Thumbnail with rounded corners like Video component */}
        <div className="w-full h-50 relative rounded-[45.60px] overflow-hidden">
          <img
            src={thumbnailUrl || 'https://placehold.co/600x400'}
            alt="Video thumbnail"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Confidence badge (top-left) - 위치 변경 */}
        {confidence && (
          <div className="absolute top-3 left-7 z-[1]">
            <div className={`${getConfidenceColorClass()} px-1 rounded-sm border-1 border-white`}>
              <p className="text-white text-xs font-medium uppercase">
                {confidence}
              </p>
            </div>
          </div>
        )}

        {/* Time segment indicator (bottom-center) */}
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-[1] bg-black/5 rounded">
          <div className="p-1 rounded outline outline-1 outline-zinc-100 justify-start items-center gap-2">
            <div className="justify-start text-zinc-100 text-xs font-semibold uppercase leading-tight tracking-tight">
              {formatTime(startTime)} - {formatTime(endTime)}
            </div>
          </div>
        </div>
      </div>

      {/* Video title */}
      <div className="p-2">
        <h3 className="text-md font-medium truncate">
          {videoTitle}
        </h3>
      </div>
    </div>
  );
};

export default SearchResultItem;
