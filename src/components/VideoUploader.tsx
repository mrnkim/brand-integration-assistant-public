import { useState, useRef, useEffect } from 'react';
import LoadingSpinner from './LoadingSpinner';

const MAX_FILES = 10; // Maximum number of files to upload at once

interface VideoUploaderProps {
  indexId: string;
  onUploadComplete: () => void;
  onClose: () => void;
}

interface UploadingFile {
  id: string; // Local ID for tracking
  file: File;
  progress: number;
  status: 'queued' | 'uploading' | 'indexing' | 'completed' | 'failed';
  message: string;
  taskId?: string; // From Twelve Labs API
  videoId?: string; // From Twelve Labs API
  thumbnail?: string; // Base64 thumbnail preview
  duration?: number; // Duration in seconds
  title?: string; // Video title (from filename)
}

const VideoUploader: React.FC<VideoUploaderProps> = ({ indexId, onUploadComplete, onClose }) => {
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);
  const [showThumbnailView, setShowThumbnailView] = useState(false);

  // Check indexing status periodically
  useEffect(() => {
    if (!files.some(file => file.status === 'indexing')) {
      return; // No files are indexing, don't start the interval
    }

    const interval = setInterval(() => {
      // Check each file in 'indexing' status
      files.forEach(file => {
        if (file.status === 'indexing' && file.taskId) {
          checkIndexingStatus(file.taskId, file.id);
        }
      });
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [files]);

  // Calculate total duration when files change
  useEffect(() => {
    const total = files.reduce((sum, file) => sum + (file.duration || 0), 0);
    setTotalDuration(total);

    // If files are added, switch to thumbnail view
    if (files.length > 0) {
      setShowThumbnailView(true);
    } else {
      setShowThumbnailView(false);
    }
  }, [files]);

  // Generate video thumbnail
  const generateThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.playsInline = true;
      video.muted = true;

      // Create object URL for the file
      const url = URL.createObjectURL(file);
      video.src = url;

      // When video metadata is loaded, seek to a frame for the thumbnail
      video.onloadedmetadata = () => {
        // Seek to 25% of the video
        video.currentTime = Math.min(video.duration * 0.25, 3);
      };

      // When the time update happens, grab the frame as a thumbnail
      video.ontimeupdate = () => {
        // Create canvas and draw the video frame
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Convert to base64
          const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

          // Cleanup
          URL.revokeObjectURL(url);

          resolve(thumbnail);
        } else {
          // Fallback if canvas context isn't available
          URL.revokeObjectURL(url);
          resolve('');
        }
      };

      // Fallback in case of error
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve('');
      };
    });
  };

  // Get video duration
  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';

      // Create object URL for the file
      const url = URL.createObjectURL(file);
      video.src = url;

      // When video metadata is loaded, get the duration
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(video.duration);
      };

      // Fallback in case of error
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
    });
  };

  // Format seconds to min:sec
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}min ${secs}sec`;
  };

  // Extract title from filename
  const getTitleFromFilename = (filename: string): string => {
    // Remove extension and replace underscores/hyphens with spaces
    return filename
      .replace(/\.[^/.]+$/, "") // Remove extension
      .replace(/[_-]/g, " ") // Replace underscores and hyphens with spaces
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  // Handle file selection
  const handleFileChange = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    // Check if adding these files would exceed the limit
    if (files.length + selectedFiles.length > MAX_FILES) {
      alert(`You can only upload up to ${MAX_FILES} videos at once.`);
      return;
    }

    // Process each file to get thumbnail and duration
    const newFilesPromises = Array.from(selectedFiles)
      .filter(file => file.type.startsWith('video/')) // Only accept video files
      .map(async file => {
        // Generate thumbnail and get duration in parallel
        const [thumbnail, duration] = await Promise.all([
          generateThumbnail(file),
          getVideoDuration(file)
        ]);

        const title = getTitleFromFilename(file.name);

        return {
          id: crypto.randomUUID(), // Generate a unique ID
          file,
          progress: 0,
          status: 'queued',
          message: 'Ready to upload',
          thumbnail,
          duration,
          title
        } as UploadingFile;
      });

    const newFiles = await Promise.all(newFilesPromises);
    setFiles(prev => [...prev, ...newFiles]);
  };

  // Handle drag events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  // Handle drop event
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files);
    }
  };

  // Trigger file input click
  const handleButtonClick = () => {
    inputRef.current?.click();
  };

  // Remove file from list
  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(file => file.id !== id));
  };

  // Upload a single file to Twelve Labs
  const uploadFile = async (file: UploadingFile) => {
    try {
      // Update file status
      setFiles(prev => prev.map(f =>
        f.id === file.id
          ? { ...f, status: 'uploading', message: 'Uploading...' }
          : f
      ));

      // Create FormData for the API request
      const formData = new FormData();
      formData.append('index_id', indexId);
      formData.append('video_file', file.file);
      formData.append('enable_video_stream', 'true');

      // Upload to Twelve Labs via our API proxy
      const response = await fetch('/api/videos/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${errorText}`);
      }

      const data = await response.json();
      console.log('Upload response:', data);

      // Update file with task and video IDs
      setFiles(prev => prev.map(f =>
        f.id === file.id
          ? {
              ...f,
              taskId: data._id,
              videoId: data.video_id,
              status: 'indexing',
              progress: 50,
              message: 'Indexing in progress...'
            }
          : f
      ));

      // Return the task ID for monitoring
      return { taskId: data._id, videoId: data.video_id };
    } catch (error) {
      console.error('Error uploading file:', error);

      // Update file status to failed
      setFiles(prev => prev.map(f =>
        f.id === file.id
          ? { ...f, status: 'failed', message: error instanceof Error ? error.message : 'Upload failed' }
          : f
      ));

      return null;
    }
  };

  // Check indexing status of a task
  const checkIndexingStatus = async (taskId: string, fileId: string) => {
    try {
      const response = await fetch(`/api/videos/indexing-status?taskId=${taskId}`);

      if (!response.ok) {
        console.error(`Failed to check status: ${response.statusText}`);
        // Update file status with the error, but don't throw
        setFiles(prev => prev.map(f => {
          if (f.id !== fileId) return f;
          return {
            ...f,
            message: `Status check error: ${response.statusText}`
          };
        }));
        return;
      }

      // Parse the response as JSON with error handling
      let data;
      try {
        data = await response.json();
        console.log('Indexing status:', data);
      } catch (jsonError) {
        console.error('Error parsing status response:', jsonError);
        return;
      }

      // Update file status based on the response
      setFiles(prev => prev.map(f => {
        if (f.id !== fileId) return f;

        // Check status
        if (data.status === 'ready') {
          // If indexing is complete, process metadata and store embeddings
          if (f.videoId) {
            // Process asynchronously without blocking the UI update
            setTimeout(() => {
              processCompletedVideo(f.videoId!);
            }, 1000);
          }

          return {
            ...f,
            status: 'completed',
            progress: 100,
            message: 'Indexing complete'
          };
        } else if (data.status === 'failed' || data.status === 'error') {
          return {
            ...f,
            status: 'failed',
            message: 'Indexing failed'
          };
        } else {
          // Still in progress
          return {
            ...f,
            message: `Indexing in progress (${data.status || 'unknown'})`
          };
        }
      }));

    } catch (error) {
      console.error('Error checking indexing status:', error);

      // Update status with error, but don't fail the entire process
      setFiles(prev => prev.map(f => {
        if (f.id !== fileId) return f;
        return {
          ...f,
          message: `Status check error: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }));
    }
  };

  // Process a completed video (generate metadata and store embeddings)
  const processCompletedVideo = async (videoId: string) => {
    try {
      console.log(`Processing completed video ${videoId} for metadata and embeddings`);

      // 1. Generate metadata
      const response = await fetch(`/api/generate?videoId=${videoId}`);

      if (!response.ok) {
        throw new Error('Failed to generate metadata');
      }

      const metadataResult = await response.json();
      console.log('Generated metadata:', metadataResult);

      // 2. Parse hashtags and update video metadata
      if (metadataResult.data) {
        const metadata = parseHashtags(metadataResult.data);
        await updateVideoMetadata(videoId, indexId, metadata);
      }

      // 3. Get and store embeddings
      const embeddingResult = await getAndStoreEmbeddings(indexId, videoId);
      console.log('Embedding storage result:', embeddingResult);

    } catch (error) {
      console.error('Error processing completed video:', error);
    }
  };

  // Start the upload process for all queued files
  const startUpload = async () => {
    if (files.length === 0 || uploadInProgress) return;

    setUploadInProgress(true);

    try {
      // Upload files sequentially
      for (const file of files.filter(f => f.status === 'queued')) {
        await uploadFile(file);
      }
    } finally {
      setUploadInProgress(false);
    }

    // If all files are processed, call the completion handler
    if (files.every(f => f.status === 'completed' || f.status === 'failed')) {
      onUploadComplete();
    }
  };

  // Helper functions borrowed from apiHooks.ts
  const parseHashtags = (hashtagText: string): Record<string, string> => {
    // This implementation should mirror the one in apiHooks.ts
    const metadata: Record<string, string> = {
      source: '',
      sector: '',
      emotions: '',
      brands: '',
      locations: '',
      demographics: ''
    };

    // Clean text and extract hashtags
    const cleanText = hashtagText.replace(/\n/g, ' ');
    const hashtags = cleanText.split(/\s+/).filter(tag => tag.startsWith('#'));

    // Categories for classification
    const categoryTags: Record<string, string[]> = {
      demographics: [],
      sector: [],
      emotions: [],
      locations: [],
      brands: []
    };

    // Category keywords (lowercase)
    const demographicsKeywords = ['male', 'female', '18-25', '25-34', '35-44', '45-54', '55+'];
    const sectorKeywords = ['beauty', 'fashion', 'tech', 'travel', 'cpg', 'food', 'bev', 'retail'];
    const emotionKeywords = ['happy', 'positive', 'happypositive', 'happy/positive', 'exciting', 'relaxing', 'inspiring', 'serious', 'festive', 'calm', 'determined'];
    const locationKeywords = ['seoul', 'dubai', 'doha', 'newyork', 'new york', 'paris', 'tokyo', 'london', 'berlin', 'lasvegas', 'las vegas', 'france', 'korea', 'qatar', 'uae', 'usa', 'bocachica', 'bocachicabeach', 'marathon'];
    const brandKeywords = ['fentybeauty', 'adidas', 'nike', 'spacex', 'apple', 'microsoft', 'google', 'amazon', 'ferrari', 'heineken', 'redbullracing', 'redbull', 'sailgp', 'fifaworldcup', 'fifa', 'tourdefrance', 'nttdata', 'oracle'];

    // Classify hashtags
    for (const tag of hashtags) {
      const cleanTag = tag.slice(1).toLowerCase();

      if (demographicsKeywords.includes(cleanTag)) {
        categoryTags.demographics.push(cleanTag);
      } else if (sectorKeywords.includes(cleanTag)) {
        categoryTags.sector.push(cleanTag);
      } else if (emotionKeywords.includes(cleanTag)) {
        categoryTags.emotions.push(cleanTag);
      } else if (locationKeywords.includes(cleanTag)) {
        categoryTags.locations.push(cleanTag);
      } else if (brandKeywords.includes(cleanTag)) {
        categoryTags.brands.push(cleanTag);
      }
    }

    // Handle unclassified tags
    const unclassifiedTags = hashtags.filter(tag => {
      const cleanTag = tag.slice(1).toLowerCase();
      return !demographicsKeywords.includes(cleanTag) &&
             !sectorKeywords.includes(cleanTag) &&
             !emotionKeywords.includes(cleanTag) &&
             !locationKeywords.includes(cleanTag) &&
             !brandKeywords.includes(cleanTag);
    });

    // Assign unclassified tags if needed
    if (unclassifiedTags.length > 0 && categoryTags.locations.length === 0) {
      categoryTags.locations.push(unclassifiedTags[0].slice(1).toLowerCase());
      unclassifiedTags.shift();
    }

    if (unclassifiedTags.length > 0 && categoryTags.brands.length === 0) {
      categoryTags.brands.push(unclassifiedTags[0].slice(1).toLowerCase());
    }

    // Convert to metadata object
    for (const category in categoryTags) {
      if (categoryTags[category as keyof typeof categoryTags].length > 0) {
        metadata[category] = categoryTags[category as keyof typeof categoryTags].join(', ');
      }
    }

    return metadata;
  };

  const updateVideoMetadata = async (videoId: string, indexId: string, metadata: Record<string, string>): Promise<boolean> => {
    try {
      // Transform metadata to API format
      const apiMetadata: Record<string, string> = {};

      if ('source' in metadata) apiMetadata.source = metadata.source;
      if ('emotions' in metadata) apiMetadata.emotions = metadata.emotions;
      if ('brands' in metadata) apiMetadata.brands = metadata.brands;
      if ('locations' in metadata) apiMetadata.locations = metadata.locations;
      if ('sector' in metadata) apiMetadata.sector = metadata.sector;

      // Handle demographics
      if ('demographics' in metadata) {
        apiMetadata.demographics = metadata.demographics;
      }

      const payload = { videoId, indexId, metadata: apiMetadata };

      const response = await fetch('/api/videos/metadata', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return response.ok;
    } catch (error) {
      console.error('Error updating video metadata:', error);
      return false;
    }
  };

  const getAndStoreEmbeddings = async (indexId: string, videoId: string) => {
    try {
      // Fetch video details with embedding
      const videoDetails = await fetch(`/api/videos/${videoId}?indexId=${indexId}&embed=true`).then(res => res.json());

      if (!videoDetails || !videoDetails.embedding) {
        return { success: false, message: 'No embedding data found' };
      }

      const embedding = videoDetails.embedding;

      // Get filename and title
      let filename = '';
      let videoTitle = '';

      if (videoDetails.system_metadata) {
        filename = videoDetails.system_metadata.filename || '';
        videoTitle = videoDetails.system_metadata.video_title || '';
      }

      // Fallbacks if data is missing
      if (!filename) {
        filename = `${videoId}.mp4`;
      }

      if (!videoTitle && filename) {
        videoTitle = filename.split('.')[0];
      }

      // Store in Pinecone
      const response = await fetch('/api/vectors/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          videoName: filename,
          embedding: {
            ...embedding,
            system_metadata: {
              ...(videoDetails.system_metadata || {}),
              filename: filename,
              video_title: videoTitle
            }
          },
          indexId,
        }),
      });

      if (!response.ok) {
        return { success: false, message: `Failed to store embedding: ${response.statusText}` };
      }

      return response.json();
    } catch (error) {
      console.error('Error storing embeddings:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Upload videos</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!showThumbnailView ? (
          <div className="mb-4">
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="video/*"
                onChange={(e) => handleFileChange(e.target.files)}
                className="hidden"
              />

              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-gray-400 mb-2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>

              <p className="mb-2 text-sm text-gray-700">
                Drag and drop videos here, or
              </p>
              <button
                type="button"
                onClick={handleButtonClick}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                disabled={uploadInProgress}
              >
                Browse files
              </button>
              <p className="mt-1 text-xs text-gray-500">
                Maximum {MAX_FILES} videos. Supported formats: MP4, MOV, AVI
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Thumbnail view */}
            <div className="mb-6 border-2 border-dashed rounded-xl p-4">
              <div className="flex justify-between items-center mb-4">
                <div className="text-md font-medium">{files.length} videos</div>
                <div className="flex items-center">
                  <button
                    onClick={handleButtonClick}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium mr-4"
                    disabled={uploadInProgress || files.length >= MAX_FILES}
                  >
                    Browse
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept="video/*"
                    onChange={(e) => handleFileChange(e.target.files)}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Thumbnails grid */}
              <div className="grid grid-cols-3 gap-4">
                {files.map((file) => (
                  <div key={file.id} className="relative group">
                    {/* Thumbnail with status indicator */}
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100">
                      {file.thumbnail ? (
                        <img
                          src={file.thumbnail}
                          alt={file.title || file.file.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-200">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-gray-400">
                            <path strokeLinecap="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                          </svg>
                        </div>
                      )}

                      {/* Remove button (X) - only show for queued files */}
                      {file.status === 'queued' && (
                        <button
                          onClick={() => removeFile(file.id)}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black bg-opacity-60 flex items-center justify-center text-white hover:bg-opacity-80"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}

                      {/* Status overlay */}
                      {file.status !== 'queued' && (
                        <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
                          {file.status === 'uploading' || file.status === 'indexing' ? (
                            <div className="text-white">
                              <LoadingSpinner />
                            </div>
                          ) : file.status === 'completed' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-green-500">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-500">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 6.75v-.75" />
                            </svg>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Title and duration below thumbnail */}
                    <div className="mt-1">
                      <p className="text-sm font-medium truncate">{file.title || file.file.name}</p>
                      <div className="flex justify-between items-center text-xs text-gray-500">
                        <span>{file.duration ? formatDuration(file.duration) : ''}</span>
                        <span>{file.status !== 'queued' ? file.status.charAt(0).toUpperCase() + file.status.slice(1) : ''}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total duration */}
              <div className="mt-4 text-right">
                Total video duration is {formatDuration(totalDuration)}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-between">
              <button
                onClick={onClose}
                className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={uploadInProgress}
              >
                Cancel
              </button>
              <button
                onClick={startUpload}
                className="px-6 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-800 disabled:bg-gray-400"
                disabled={uploadInProgress || files.length === 0 || !files.some(f => f.status === 'queued')}
              >
                {uploadInProgress ? (
                  <span className="flex items-center">
                    <LoadingSpinner /> Uploading...
                  </span>
                ) : 'Upload'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VideoUploader;