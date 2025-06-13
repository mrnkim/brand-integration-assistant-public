import { useState, useRef, useEffect } from 'react';
import LoadingSpinner from './LoadingSpinner';
import { VideoUploaderProps, UploadingFile } from '@/types';

const MAX_FILES = 10; // Maximum number of files to upload at once


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

      // Step 1: Get API token from our server
      const tokenResponse = await fetch('/api/videos/get-token');
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Failed to get API token:', errorText);
        throw new Error(`Failed to get API token: ${errorText}`);
      }

      const { token } = await tokenResponse.json();

      // Step 2: Create FormData for direct Twelve Labs API request
      const formData = new FormData();
      formData.append('index_id', indexId);
      formData.append('video_file', file.file);
      formData.append('enable_video_stream', 'true');

      // Step 3: Upload directly to Twelve Labs API
      const response = await fetch('https://api.twelvelabs.io/v1.3/tasks', {
        method: 'POST',
        headers: {
          'x-api-key': token,
          // Content-Type is automatically set by fetch with FormData
        },
        body: formData,
      });


      if (!response.ok) {
        const errorText = await response.text();
        console.error('Twelve Labs API error:', errorText);

        // Parse the error message to extract the meaningful part
        let cleanErrorMessage = "Unknown error occurred";
        try {
          // Try to parse as JSON
          const errorJson = JSON.parse(errorText);

          // Check different possible error formats
          if (errorJson.details && typeof errorJson.details === 'object' && errorJson.details.message) {
            // Format: { details: { message: "..." } }
            cleanErrorMessage = errorJson.details.message;
          } else if (errorJson.message) {
            // Format: { message: "..." }
            cleanErrorMessage = errorJson.message;
          } else if (errorJson.error && typeof errorJson.error === 'string') {
            // Format: { error: "..." }
            cleanErrorMessage = errorJson.error;
          } else if (typeof errorJson === 'object' && errorJson.code && errorJson.message) {
            // TwelveLabs API format: { code: "...", message: "..." }
            cleanErrorMessage = errorJson.message;
          }
        } catch (parseError) {
          console.error('Error parsing JSON response:', parseError);
          // If it's not valid JSON, try to extract information using regex
          const messageMatch = errorText.match(/\"message\"\:\s*\"([^\"]+)\"/);
          if (messageMatch && messageMatch[1]) {
            cleanErrorMessage = messageMatch[1];
          } else {
            // Just use the raw text but limit the length
            cleanErrorMessage = errorText.length > 100 ? errorText.substring(0, 100) + "..." : errorText;
          }
        }

        throw new Error(`Upload failed: ${cleanErrorMessage}`);
      }

      const data = await response.json();

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
          // Extract a clean error message from the response
          let cleanErrorMessage = "Unknown error";
          if (data.error && typeof data.error === 'string') {
            cleanErrorMessage = data.error;
          } else if (data.message && typeof data.message === 'string') {
            cleanErrorMessage = data.message;
          }

          return {
            ...f,
            status: 'failed',
            message: `Indexing failed: ${cleanErrorMessage}`
          };
        } else {
          // Still in progress - show more detailed status
          const statusText = getIndexingStatusText(data.status);
          return {
            ...f,
            message: statusText
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

  // Helper function to get human-readable status text
  const getIndexingStatusText = (status?: string): string => {
    if (!status || status === 'unknown') {
      return 'Starting up indexing...';
    }

    switch (status.toLowerCase()) {
      case 'validating':
        return 'Validating video...';
      case 'pending':
        return 'Pending processing...';
      case 'queued':
        return 'Queued for indexing...';
      case 'indexing':
        return 'Indexing in progress...';
      case 'failed':
        return 'Indexing failed';
      default:
        return `${status.charAt(0).toUpperCase() + status.slice(1)}...`;
    }
  };

  // Process a completed video (generate metadata and store embeddings)
  const processCompletedVideo = async (videoId: string) => {
    try {

      // 1. Generate metadata
      let metadataResult;
      try {
        const response = await fetch(`/api/generate?videoId=${videoId}`);

        if (!response.ok) {
          console.error(`Metadata generation failed with status ${response.status}`);
          // Don't throw, just continue with default metadata
          metadataResult = {
            data: "#male #tech #exciting #newyork #adidas"
          };
        } else {
          metadataResult = await response.json();
        }
      } catch (metadataError) {
        console.error("Error generating metadata:", metadataError);
        // Use default metadata on error
        metadataResult = {
          data: "#male #tech #exciting #newyork #adidas"
        };
      }


      // 2. Parse hashtags and update video metadata
      if (metadataResult.data) {
        const metadata = parseHashtags(metadataResult.data);
        const metadataUpdated = await updateVideoMetadata(videoId, indexId, metadata);

        // Make sure we don't proceed to embeddings storage if metadata update fails
        if (!metadataUpdated) {
          throw new Error('Failed to update metadata');
        }
      }

      // 3. Wait a moment to ensure metadata is properly saved before fetching embeddings
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 4. Get and store embeddings - make multiple attempts if needed
      let embeddingResult = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts && !embeddingResult?.success) {
        attempts++;

        try {
          embeddingResult = await getAndStoreEmbeddings(indexId, videoId);

          if (embeddingResult?.success) {
            break;
          } else {

            if (attempts < maxAttempts) {
              // Wait longer between each attempt
              await new Promise(resolve => setTimeout(resolve, 3000 * attempts));
            }
          }
        } catch (embeddingError) {
          console.error(`Error in attempt ${attempts} to store embeddings:`, embeddingError);

          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 3000 * attempts));
          }
        }
      }

      if (!embeddingResult?.success) {
        console.error(`Failed to store embeddings after ${maxAttempts} attempts`);
      }

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

  const formatErrorMessage = (message: string): string => {
    try {
      if (message.includes('"details":')) {
        const errorObject = JSON.parse(message.substring(message.indexOf('{')));

        if (errorObject.details && typeof errorObject.details === 'string') {
          try {
            // details 내부의 JSON 파싱
            const detailsObject = JSON.parse(errorObject.details);
            if (detailsObject.message) {
              return detailsObject.message;
            }
          } catch {
            return errorObject.details;
          }
        }

        if (errorObject.details && typeof errorObject.details === 'object') {
          if (errorObject.details.message) {
            return errorObject.details.message;
          }
        }

        if (errorObject.message) {
          return errorObject.message;
        }

        if (errorObject.error) {
          return errorObject.error;
        }
      }

      if (message.startsWith('Upload failed:')) {
        const actualMessage = message.substring('Upload failed:'.length).trim();

        // JSON 형식인지 확인
        if (actualMessage.startsWith('{') && actualMessage.endsWith('}')) {
          try {
            const errorObj = JSON.parse(actualMessage);

            if (errorObj.error && errorObj.error.includes('Twelve Labs API error')) {
              if (errorObj.details && typeof errorObj.details === 'string') {
                try {
                  const detailsObj = JSON.parse(errorObj.details);
                  if (detailsObj.message) {
                    return detailsObj.message;
                  }
                } catch {
                  return errorObj.details;
                }
              }
            }

            if (errorObj.message) return errorObj.message;
            if (errorObj.error) return errorObj.error;

            return actualMessage;
          } catch {
            return actualMessage;
          }
        }

        return actualMessage;
      }

      if (message.startsWith('Indexing failed:') || message.startsWith('Status check error:')) {
        const actualMessage = message.split(':', 2)[1].trim();
        return actualMessage;
      }

      return message;
    } catch {
      return message;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-[45.06px] p-10 max-w-2xl w-full min-h-[500px] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-medium">Upload videos</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!showThumbnailView ? (
          <div className="mb-4">
            <button
              className={`border-1 h-[400px] bg-white-200 w-full border-dashed rounded-[45.06px] p-8 text-center ${dragActive ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:bg-[#f5fbf6]'} transition-colors  duration-200 cursor-pointer`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={handleButtonClick}
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="video/*"
                onChange={(e) => handleFileChange(e.target.files)}
                className="hidden"
              />

              <img
                src="/upload.svg"
                alt="Upload icon"
                className="w-14 h-14 mx-auto mb-2"
              />

              <p className="mb-2 text-xl font-medium">
                Drop videos or browse files
              </p>

              <div className="mt-20 flex gap-2 justify-center">
                <span className="inline-block border-1 px-1 py-0.5 rounded-sm text-sm">4sec-0.5hr</span>
                <span className="inline-block border-1 px-1 py-0.5 rounded-sm text-sm">Resolution 360p-4k</span>
                <span className="inline-block border-1 px-1 py-0.5 rounded-sm text-sm">File size ≤2GB per video</span>
              </div>
              <p className="mt-3 text-sm font-medium">
                To upload videos up to 2hrs, create an index with Marengo only
              </p>
            </button>
          </div>
        ) : (
          <>
            {/* Thumbnail view */}
            <div className="flex flex-col relative mb-6 border-1 min-h-[350px] border-gray-300 border-dashed rounded-[45.06px] p-6 bg-light-blue">
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm font-medium">{files.length} videos</div>
                <div className="flex items-center">
                  <button
                    onClick={handleButtonClick}
                    className="cursor-pointer border rounded-lg px-1.5 py-1 text-xs mr-4"
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
              <div className="grid grid-cols-3 gap-4 flex-grow">
                {files.map((file) => (
                  <div key={file.id} className="relative group transition-all duration-200 p-2 rounded-lg">
                    {/* Thumbnail with status indicator */}
                    <div className="relative aspect-video rounded-lg bg-gray-100">
                      {file.thumbnail ? (
                        <img
                          src={file.thumbnail}
                          alt={file.title || file.file.name}
                          className="w-full h-full object-cover rounded-3xl"
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
                          className="cursor-pointer absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center text-white"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
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
                            <div className="flex flex-col items-center">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-500">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 6.75v-.75" />
                              </svg>
                              <div className="mt-2 px-2 py-1 bg-red-600 rounded text-white text-xs max-w-full text-center">
                                Failed
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Title and duration below thumbnail */}
                    <div className="mt-1">
                      <p className="text-xs font-medium truncate">{file.title || file.file.name}</p>
                      <div className="flex justify-between items-center text-xs text-gray-500">
                        <span
                          className={`${file.status === 'failed' ? 'text-red-500 font-medium' : ''}`}
                          title={file.status === 'failed' ? file.message : ''}
                        >
                          {file.status !== 'queued' ? file.status.charAt(0).toUpperCase() + file.status.slice(1) : ''}
                        </span>
                      </div>

                      {/* Error message display for failed uploads */}
                      {file.status === 'failed' && (
                        <div className="mt-1 p-1 bg-red-50 border border-red-200 rounded text-xs text-red-600 truncate hover:whitespace-normal hover:text-wrap" title={formatErrorMessage(file.message)}>
                          {formatErrorMessage(file.message)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Total duration */}
              <div className="self-end mt-auto pt-4 text-sm font-medium">
                Total video duration is {formatDuration(totalDuration)}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-between">
              <button
                onClick={onClose}
                className="cursor-pointer px-4 py-2 text-sm font-medium bg-white border rounded-xl hover:bg-zinc-200 hover:rounded-3xl"
                disabled={uploadInProgress}
              >
                Cancel
              </button>
              <button
                onClick={startUpload}
                className="cursor-pointer px-4 py-2 text-sm font-medium text-white bg-black border rounded-xl hover:bg-zinc-500 hover:rounded-3xl"
                disabled={uploadInProgress || files.length === 0 || !files.some(f => f.status === 'queued')}
              >
                {uploadInProgress ? (
                  <span className="flex items-center">
                    <LoadingSpinner /> Uploading...
                  </span>
                ) : (
                  <>
                    Upload
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VideoUploader;