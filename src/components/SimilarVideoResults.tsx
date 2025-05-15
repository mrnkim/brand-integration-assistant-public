import React from 'react';
import Video from './Video';
import { EmbeddingSearchResult } from '@/hooks/apiHooks';

interface SimilarVideoResultsProps {
  results: EmbeddingSearchResult[];
  indexId: string;
}

const SimilarVideoResults: React.FC<SimilarVideoResultsProps> = ({ results, indexId }) => {
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

  // Function to get the appropriate color classes based on the color name
  const getColorClasses = (color: string) => {
    switch (color) {
      case 'green':
        return 'bg-green-100 text-green-800';
      case 'yellow':
        return 'bg-yellow-100 text-yellow-800';
      case 'red':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="mt-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {results.slice(0, 9).map((result, index) => {
          const { label, color } = getSimilarityLabel(result.score, result.originalSource as string);
          const videoId = result.metadata?.tl_video_id;

          // Only render videos with valid IDs
          if (!videoId) return null;

          return (
            <div key={index} className="flex flex-col">
              <Video
                videoId={videoId}
                indexId={indexId}
                showTitle={true}
              />
              <div className="flex justify-between items-center mt-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getColorClasses(color)}`}>
                  {label} ({(result.score * 100).toFixed(1)}%)
                </span>
                {result.originalSource && (
                  <span className="text-xs text-gray-500">
                    {result.originalSource === "BOTH" ? "Text & Video" :
                     result.originalSource === "TEXT" ? "Text Match" : "Video Match"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SimilarVideoResults;