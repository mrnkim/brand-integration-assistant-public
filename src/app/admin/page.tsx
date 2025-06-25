"use client";

import { useState } from 'react';
import { fetchVideos, generateMetadata, parseHashtags, updateVideoMetadata } from '@/hooks/apiHooks';
import LoadingSpinner from '@/components/LoadingSpinner';
import { VideoData } from '@/types';

// Content Index IDs from .env
const adsIndexId = process.env.NEXT_PUBLIC_ADS_INDEX_ID || 'default-ads-index';
const contentIndexId = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID || 'default-content-index';

export default function AdminPage() {
  const [isAdsProcessing, setIsAdsProcessing] = useState(false);
  const [isContentProcessing, setIsContentProcessing] = useState(false);
  const [adsStatus, setAdsStatus] = useState<{ processed: number; total: number; current: string }>({ processed: 0, total: 0, current: '' });
  const [contentStatus, setContentStatus] = useState<{ processed: number; total: number; current: string }>({ processed: 0, total: 0, current: '' });
  const [logs, setLogs] = useState<string[]>([]);
  const [adsProcessLimit, setAdsProcessLimit] = useState<number>(0); // 0 means process all
  const [contentProcessLimit, setContentProcessLimit] = useState<number>(0); // 0 means process all
  const [processOnlyNoMetadata, setProcessOnlyNoMetadata] = useState<boolean>(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const addLog = (message: string) => {
    setLogs(prev => [message, ...prev].slice(0, 10)); // Keep last 100 logs

    // Check for configuration errors in logs
    if (message.includes('API returned a 400 error') ||
        message.includes('invalid index ID') ||
        message.includes('6836a0b9dad860d6bd2f61e7')) {
      setConfigError('There appears to be an issue with your index configuration. Please check your .env file and ensure your index IDs are correct.');
    }

    // Also check for limit errors
    if (message.includes('page size') && message.includes('exceeds API limit')) {
      setConfigError('The page size used exceeds the API limit of 50. The application will automatically use a maximum of 50 records per page.');
    }
  };

    // Function to fetch all videos from a specific index
  const fetchAllVideos = async (indexId: string, pageSize: number = 50): Promise<VideoData[]> => {
    try {
      // Check if indexId is provided and valid
      if (!indexId) {
        addLog(`❌ Error: Index ID is required but not provided`);
        return [];
      }

      // Ensure pageSize doesn't exceed the API limit
      const validatedPageSize = Math.min(pageSize, 50);
      if (pageSize > 50) {
        addLog(`⚠️ Requested page size ${pageSize} exceeds API limit of 50. Using 50 instead.`);
      }

      let allVideos: VideoData[] = [];
      let currentPage = 1;
      let hasMorePages = true;

      while (hasMorePages) {
        addLog(`Fetching page ${currentPage} from index ${indexId}...`);
        try {
          const response = await fetchVideos(currentPage, indexId, validatedPageSize);

          if (response && response.data && response.data.length > 0) {
            allVideos = [...allVideos, ...response.data];
            addLog(`Fetched ${response.data.length} videos from page ${currentPage}.`);

            // Check if there are more pages
            if (response.page_info && response.page_info.page < response.page_info.total_page) {
              currentPage++;
            } else {
              hasMorePages = false;
            }
          } else {
            addLog(`No videos found on page ${currentPage} or empty response.`);
            hasMorePages = false;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          addLog(`❌ Error fetching page ${currentPage}: ${errorMessage}`);

          // If we get a 400 error, it might be due to an invalid indexId or other parameter issue
          if (errorMessage.includes('400')) {
            addLog(`❌ API returned a 400 error - this might be due to an invalid index ID (${indexId}) or other request parameter`);
            // Break the loop completely to avoid further attempts with the same parameters
            hasMorePages = false;
            break;
          }

          // For other errors, we still continue to the next page
          hasMorePages = false;
        }

        // Add a short delay between requests to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      addLog(`Total videos fetched from ${indexId}: ${allVideos.length}`);
      return allVideos;
    } catch (error) {
      console.error(`Error fetching videos from ${indexId}:`, error);
      addLog(`❌ Error fetching videos: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return []; // Return empty array instead of throwing so we can continue with empty results
    }
  };

    // Function to regenerate metadata for a single video
  const regenerateVideoMetadata = async (video: VideoData, indexId: string): Promise<boolean> => {
    try {
      const videoId = video._id;
      const videoTitle = video.system_metadata?.filename || video.system_metadata?.video_title || 'Unknown';
      addLog(`Processing video: ${videoId} - ${videoTitle}`);

      try {
        // Generate new metadata
        addLog(`Generating metadata for ${videoId}...`);
        const hashtagText = await generateMetadata(videoId);

        if (hashtagText) {
          addLog(`Generated metadata for ${videoId}: ${hashtagText}`);

          // Parse hashtags into metadata structure
          const metadata = parseHashtags(hashtagText);

          // Add delay before updating to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));

          // Update the video's metadata
          addLog(`Updating metadata for ${videoId}...`);
          try {
            const updated = await updateVideoMetadata(videoId, indexId, metadata);

            if (updated) {
              addLog(`✅ Successfully updated metadata for ${videoId}`);
              return true;
            } else {
              addLog(`❌ Failed to update metadata for ${videoId}`);
              return false;
            }
          } catch (updateError) {
            addLog(`❌ Error updating metadata for ${videoId}: ${updateError instanceof Error ? updateError.message : 'Unknown error'}`);
            return false;
          }
        } else {
          addLog(`❌ Failed to generate metadata for ${videoId} - Empty response`);
          return false;
        }
      } catch (genError) {
        addLog(`❌ Error generating metadata for ${videoId}: ${genError instanceof Error ? genError.message : 'Unknown error'}`);
        return false;
      }
    } catch (error) {
      console.error(`Error regenerating metadata for video ${video?._id || 'unknown'}:`, error);
      addLog(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  };

  // Function to regenerate metadata for all videos in an index
  const regenerateAllMetadata = async (indexId: string, isAds: boolean = true) => {
    try {
      // Set processing state
      if (isAds) {
        setIsAdsProcessing(true);
        setAdsStatus({ processed: 0, total: 0, current: '' });
      } else {
        setIsContentProcessing(true);
        setContentStatus({ processed: 0, total: 0, current: '' });
      }

      // Fetch all videos
      const allVideos = await fetchAllVideos(indexId);

      // Filter videos if needed
      let videosToProcess = [...allVideos];

      // Filter out videos that already have metadata if flag is set
      if (processOnlyNoMetadata) {
        videosToProcess = videosToProcess.filter(video =>
          !video.user_metadata ||
          Object.keys(video.user_metadata).length === 0 ||
          (!video.user_metadata.sector &&
           !video.user_metadata.emotions && !video.user_metadata.brands &&
           !video.user_metadata.locations)
        );
        addLog(`Filtered to ${videosToProcess.length} videos without metadata.`);
      }

      // Apply limit if set
      const limit = isAds ? adsProcessLimit : contentProcessLimit;
      if (limit > 0 && videosToProcess.length > limit) {
        videosToProcess = videosToProcess.slice(0, limit);
        addLog(`Limited to ${limit} videos for processing.`);
      }

      // Update total count
      if (isAds) {
        setAdsStatus(prev => ({ ...prev, total: videosToProcess.length }));
      } else {
        setContentStatus(prev => ({ ...prev, total: videosToProcess.length }));
      }

      addLog(`Starting to process ${videosToProcess.length} videos from ${isAds ? 'Ads' : 'Content'} Library...`);

            // Process videos in smaller batches to avoid overwhelming the API
      const batchSize = 3; // Reduced batch size
      let processed = 0;

      for (let i = 0; i < videosToProcess.length; i += batchSize) {
        const batch = videosToProcess.slice(i, i + batchSize);

        // Process batch in parallel, but with a smaller batch size
        await Promise.all(batch.map(async (video) => {
          try {
            // Update current video being processed
            const videoId = video._id;
            const videoTitle = video.system_metadata?.filename || video.system_metadata?.video_title || 'Unknown';

            if (isAds) {
              setAdsStatus(prev => ({ ...prev, current: `${videoTitle} (${videoId})` }));
            } else {
              setContentStatus(prev => ({ ...prev, current: `${videoTitle} (${videoId})` }));
            }

            // Process the video with metadata generation and update
            await regenerateVideoMetadata(video, indexId);

            // Update processed count regardless of success
            processed++;
            if (isAds) {
              setAdsStatus(prev => ({ ...prev, processed }));
            } else {
              setContentStatus(prev => ({ ...prev, processed }));
            }
          } catch (error) {
            console.error(`Error processing video ${video._id}:`, error);
            addLog(`❌ Error processing video ${video._id}: ${error instanceof Error ? error.message : 'Unknown error'}`);

            // Still increment processed count even if there was an error
            processed++;
            if (isAds) {
              setAdsStatus(prev => ({ ...prev, processed }));
            } else {
              setContentStatus(prev => ({ ...prev, processed }));
            }
          }
        }));

        // Add a small delay between batches to avoid overwhelming the API
        addLog(`Completed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(videosToProcess.length/batchSize)}. Waiting before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Delay is already added above
      }

      addLog(`✅ Completed processing ${processed} out of ${videosToProcess.length} videos from ${isAds ? 'Ads' : 'Content'} Library`);

    } catch (error) {
      console.error(`Error regenerating metadata for ${isAds ? 'Ads' : 'Content'} Library:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog(`❌ Error regenerating metadata: ${errorMessage}`);

      // If the error is related to the API, add more specific details
      if (errorMessage.includes('400')) {
        addLog(`❌ This may be due to an API issue or invalid index ID. Please check your index configurations.`);
      }
    } finally {
      // Reset processing state
      if (isAds) {
        setIsAdsProcessing(false);
      } else {
        setIsContentProcessing(false);
      }
    }
  };

  // Handle regenerate ads library metadata
  const handleRegenerateAdsMetadata = async () => {
    if (isAdsProcessing) return;
    regenerateAllMetadata(adsIndexId, true);
  };

  // Handle regenerate content library metadata
  const handleRegenerateContentMetadata = async () => {
    if (isContentProcessing) return;
    regenerateAllMetadata(contentIndexId, false);
  };

  // No need for custom sidebar, using the updated Sidebar component

  return (
    <div className="flex min-h-screen bg-zinc-100">
      {/* Main content */}
      <div className="flex-1 ml-54 p-8">
        <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>

        {/* Configuration Error Alert */}
        {configError && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded">
            <div className="flex items-center">
              <div className="flex-shrink-0 text-red-500">
                ⚠️
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">
                  {configError}
                </p>
                <p className="text-xs text-red-500 mt-1">
                  If you&apos;re seeing HTTP 400 errors, your index IDs might be incorrect. Current index IDs: <code className="bg-red-100 px-1 py-0.5 rounded">ads={adsIndexId}</code>, <code className="bg-red-100 px-1 py-0.5 rounded">content={contentIndexId}</code>
                </p>
              </div>
              <div className="ml-auto pl-3">
                <button
                  onClick={() => setConfigError(null)}
                  className="text-red-500 hover:text-red-800"
                >
                  <span className="sr-only">Dismiss</span>
                  &times;
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6 bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Processing Options</h2>

          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Process limit for Ads Library
              </label>
              <input
                type="number"
                min="0"
                value={adsProcessLimit}
                onChange={(e) => setAdsProcessLimit(Number(e.target.value))}
                disabled={isAdsProcessing}
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder="0 = all videos"
              />
              <p className="mt-1 text-xs text-gray-500">0 = process all videos, or enter a number to limit</p>
            </div>

            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Process limit for Content Library
              </label>
              <input
                type="number"
                min="0"
                value={contentProcessLimit}
                onChange={(e) => setContentProcessLimit(Number(e.target.value))}
                disabled={isContentProcessing}
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder="0 = all videos"
              />
              <p className="mt-1 text-xs text-gray-500">0 = process all videos, or enter a number to limit</p>
            </div>
          </div>

          <div className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={processOnlyNoMetadata}
                onChange={(e) => setProcessOnlyNoMetadata(e.target.checked)}
                disabled={isAdsProcessing || isContentProcessing}
                className="h-4 w-4 text-black rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Process only videos without metadata</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Ads Library Section */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Ads Library</h2>
            <p className="mb-4 text-gray-600">
              Regenerate metadata and tags for all videos in the Ads Library.
            </p>

            <button
              onClick={handleRegenerateAdsMetadata}
              disabled={isAdsProcessing}
              className={`cursor-pointer w-full py-3 px-4 rounded-lg font-medium text-white ${
                isAdsProcessing ? 'bg-gray-400' : 'bg-black hover:bg-black/60'
              }`}
            >
              {isAdsProcessing ? (
                <div className="flex items-center justify-center">
                  <LoadingSpinner />
                  <span className="ml-2">Processing...</span>
                </div>
              ) : (
                'Regenerate Ads Metadata'
              )}
            </button>

            {isAdsProcessing && (
              <div className="mt-4">
                <div className="flex justify-between mb-2">
                  <span>Progress:</span>
                  <span>{adsStatus.processed} / {adsStatus.total}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-black h-2.5 rounded-full"
                    style={{ width: `${adsStatus.total ? (adsStatus.processed / adsStatus.total) * 100 : 0}%` }}
                  ></div>
                </div>
                <div className="mt-2 text-sm text-gray-500 truncate">
                  Current: {adsStatus.current}
                </div>
              </div>
            )}
          </div>

          {/* Content Library Section */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Content Library</h2>
            <p className="mb-4 text-gray-600">
              Regenerate metadata and tags for all videos in the Content Library.
            </p>

            <button
              onClick={handleRegenerateContentMetadata}
              disabled={isContentProcessing}
              className={`cursor-pointer w-full py-3 px-4 rounded-lg font-medium text-white ${
                isContentProcessing ? 'bg-gray-400' : 'bg-black hover:bg-black/60'
              }`}
            >
              {isContentProcessing ? (
                <div className="flex items-center justify-center">
                  <LoadingSpinner />
                  <span className="ml-2">Processing...</span>
                </div>
              ) : (
                'Regenerate Content Metadata'
              )}
            </button>

            {isContentProcessing && (
              <div className="mt-4">
                <div className="flex justify-between mb-2">
                  <span>Progress:</span>
                  <span>{contentStatus.processed} / {contentStatus.total}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-black h-2.5 rounded-full"
                    style={{ width: `${contentStatus.total ? (contentStatus.processed / contentStatus.total) * 100 : 0}%` }}
                  ></div>
                </div>
                <div className="mt-2 text-sm text-gray-500 truncate">
                  Current: {contentStatus.current}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Logs Section */}
        <div className="mt-8 bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Process Logs</h2>
          <div className="bg-gray-100 p-4 rounded-lg h-96 overflow-y-auto font-mono text-sm">
            {logs.length === 0 ? (
              <p className="text-gray-500">No logs yet. Start a process to see logs here.</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="mb-1">
                  <span className="text-gray-400">[{new Date().toLocaleTimeString()}]</span> {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}