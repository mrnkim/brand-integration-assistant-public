"use client";

import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchVideos, textToVideoEmbeddingSearch, EmbeddingSearchResult } from '@/hooks/apiHooks';
import VideosDropDown from '@/components/VideosDropdown';
import Video from '@/components/Video';
import { VideoData, PaginatedResponse, VideoPage } from '@/types';
import Sidebar from '@/components/Sidebar';

// VideoPage adapter for the API response
const adaptToPaginatedResponse = (response: PaginatedResponse): VideoPage => ({
  data: response.data,
  page_info: {
    limit_per_page: 10,
    page: response.page_info.page,
    total_duration: 0,
    total_page: response.page_info.total_page,
    total_results: response.page_info.total_count
  }
});

export default function ContextualAnalysis() {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [similarResults, setSimilarResults] = useState<EmbeddingSearchResult[]>([]);
  const adsIndexId = process.env.NEXT_PUBLIC_ADS_INDEX_ID || '';
  const contentIndexId = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID || '';

  const {
    data: videosData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<PaginatedResponse, Error>({
    queryKey: ['videos', adsIndexId],
    queryFn: ({ pageParam = 1 }) => fetchVideos(pageParam as number, adsIndexId),
    initialPageParam: 1,
    getNextPageParam: (lastPage: PaginatedResponse) => {
      return lastPage.page_info.page < lastPage.page_info.total_page
        ? lastPage.page_info.page + 1
        : undefined;
    },
    enabled: !!adsIndexId,
  });

  const handleVideoChange = (videoId: string) => {
    setSelectedVideoId(videoId);
    const allVideos = videosData?.pages.flatMap((page: PaginatedResponse) => page.data) || [];
    const video = allVideos.find((v: VideoData) => v._id === videoId);
    setSelectedVideo(video || null);
    // Reset analysis results when video changes
    setSimilarResults([]);
  };

  const handleContextualAnalysis = async () => {
    if (!selectedVideoId) return;

    try {
      setIsAnalyzing(true);
      console.log(`Running contextual alignment analysis for video ${selectedVideoId}`);

      const results = await textToVideoEmbeddingSearch(
        selectedVideoId,
        adsIndexId,
        contentIndexId
      );

      setSimilarResults(results);
      console.log("Contextual analysis results:", results);

      // Display additional details for top result
      if (results.length > 0) {
        const topResult = results[0];
        console.log("Top match:", {
          videoId: topResult.metadata?.tl_video_id,
          fileName: topResult.metadata?.video_file,
          score: topResult.score,
        });
      }
    } catch (error) {
      console.error("Error during contextual analysis:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Create adapted data structure for VideosDropDown
  const adaptedVideosData = videosData ? {
    pages: videosData.pages.map(adaptToPaginatedResponse),
    pageParams: videosData.pageParams.map(param => typeof param === 'number' ? param : 1)
  } : { pages: [], pageParams: [] as number[] };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Sidebar */}
      <Sidebar activeMenu="contextual-analysis" />

      <div className="flex-1 overflow-auto ml-64">
        <div className="p-8 max-w-5xl mx-auto">
          {/* Dropdown menu */}
          <div className="mb-6">
            <VideosDropDown
              onVideoChange={handleVideoChange}
              videosData={adaptedVideosData}
              fetchNextPage={fetchNextPage}
              hasNextPage={!!hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              isLoading={isLoading}
              selectedFile={null}
              taskId={null}
              footageVideoId={selectedVideoId}
              indexId={adsIndexId}
            />
          </div>

          {/* Main content area */}
          <div className="flex flex-col">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Video component */}
              <div className="md:w-2/3">
                {selectedVideoId ? (
                  <Video
                    videoId={selectedVideoId}
                    indexId={adsIndexId}
                    showTitle={true}
                    videoDetails={undefined}
                  />
                ) : (
                  <div className="border rounded-md bg-gray-50 p-8 flex items-center justify-center h-64">
                    <p className="text-gray-500">Select an ad from the dropdown</p>
                  </div>
                )}
              </div>

              {/* Tags/metadata */}
              <div className="md:w-1/3">
                <div className="border rounded-md p-4">
                  <h3 className="font-medium mb-3">Tags</h3>
                  {selectedVideo && selectedVideo.user_metadata ? (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(selectedVideo.user_metadata)
                        .filter(([key]) => key !== 'source')
                        .map(([key, value]) => (
                          <div key={key} className="inline-block bg-gray-100 rounded-full px-3 py-1 text-sm">
                            {value?.toString()}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No tags available</p>
                  )}
                </div>
              </div>
            </div>

            {/* Button for contextual alignment analysis */}
            <div className="mt-6 flex justify-center">
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md shadow-sm disabled:opacity-50"
                disabled={!selectedVideoId || isAnalyzing}
                onClick={handleContextualAnalysis}
              >
                {isAnalyzing ? 'Analyzing...' : 'Contextual Alignment Analysis'}
              </button>
            </div>

            {/* Display analysis results count */}
            {similarResults.length > 0 && (
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-600">
                  Found {similarResults.length} similar content items. Check console for details.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}