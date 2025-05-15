import React, { useState, useEffect } from 'react';
import Video from './Video';
import { EmbeddingSearchResult, fetchVideoDetails } from '@/hooks/apiHooks';
import { VideoData } from '@/types';

interface SimilarVideoResultsProps {
  results: EmbeddingSearchResult[];
  indexId: string;
}

const SimilarVideoResults: React.FC<SimilarVideoResultsProps> = ({ results, indexId }) => {
  const [videoDetails, setVideoDetails] = useState<Record<string, VideoData>>({});
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  // Fetch video details for each result
  useEffect(() => {
    const fetchAllVideoDetails = async () => {
      if (results.length === 0) return;

      setLoadingDetails(true);
      const detailsMap: Record<string, VideoData> = {};

      // Fetch details for the first 9 results to avoid too many requests
      const videosToFetch = results.slice(0, 9).filter(result => result.metadata?.tl_video_id);

      try {
        // Use Promise.all to fetch all video details in parallel
        await Promise.all(
          videosToFetch.map(async (result) => {
            const videoId = result.metadata?.tl_video_id;
            if (!videoId) return;

            try {
              const details = await fetchVideoDetails(videoId, indexId);
              detailsMap[videoId] = details;
            } catch (error) {
              console.error(`Error fetching details for video ${videoId}:`, error);
            }
          })
        );

        setVideoDetails(detailsMap);
      } catch (error) {
        console.error('Error fetching video details:', error);
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchAllVideoDetails();
  }, [results, indexId]);

  // Skip if no results
  if (!results || results.length === 0) {
    return null;
  }

  // Define similarity label and color
  const getSimilarityLabel = (score: number, source?: string) => {
    // BOTH source results are always High
    if (source === "BOTH") {
      return { label: "High", color: "green" };
    }

    // Single source cases based on score
    if (score >= 1) return { label: "High", color: "green" };
    if (score >= 0.5) return { label: "Medium", color: "yellow" };
    return { label: "Low", color: "red" };
  };

  // Render tags from user_metadata (similar to the main page)
  const renderTags = (videoData: VideoData | undefined) => {
    if (!videoData || !videoData.user_metadata) return null;

    // 모든 태그를 수집
    const allTags = Object.entries(videoData.user_metadata)
      .filter(([key, value]) => key !== 'source' && value != null && value.toString().length > 0)
      .flatMap(([, value]) => {
        // Split comma-separated values
        const tagValues = (value as unknown as string).toString().split(',');

        // 각 태그 생성
        return tagValues
          .map((tag: string) => tag.trim())
          .filter((tag: string) => tag !== '');
      });

    return (
      <div className="mt-1 overflow-x-auto pb-1" style={{
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch'
      }}>
        <div className="flex gap-2 min-w-min">
          {allTags.map((tag, idx) => (
            <div
              key={idx}
              className="inline-block flex-shrink-0 bg-gray-100 rounded-full px-3 py-1 text-xs whitespace-nowrap"
            >
              {tag}
            </div>
          ))}
        </div>
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
      </div>
    );
  };

  return (
    <div className="mt-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {results.slice(0, 9).map((result, index) => {
          const { label, color } = getSimilarityLabel(result.score, result.originalSource as string);
          const videoId = result.metadata?.tl_video_id;

          // Only render videos with valid IDs
          if (!videoId) return null;

          // Get the full video details from our fetched data
          const videoData = videoDetails[videoId];

          return (
            <div key={index} className="flex flex-col">
              <Video
                videoId={videoId}
                indexId={indexId}
                showTitle={true}
                confidenceLabel={label}
                confidenceColor={color as 'green' | 'yellow' | 'red'}
              />

              {/* Show loading indicator if details are still loading */}
              {loadingDetails && !videoData ? (
                <div className="text-xs text-gray-400 mt-1">Loading tags...</div>
              ) : (
                /* Render actual tags from the fetched video data */
                renderTags(videoData)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SimilarVideoResults;