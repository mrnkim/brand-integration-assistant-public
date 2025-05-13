import React, { useState, useEffect } from 'react';
import { fetchVideos, checkVectorExists, getAndStoreEmbeddings, resetPineconeVectors } from '@/hooks/apiHooks';
import LoadingSpinner from './LoadingSpinner';

interface Category {
  name: string;
  label: string;
}

const categories: Category[] = [
  { name: 'sector', label: 'Sector' },
  { name: 'emotion', label: 'Emotion' },
  { name: 'brand', label: 'Brand' },
  { name: 'demographics', label: 'Demographics' },
  { name: 'location', label: 'Location' },
];

// Type for embedding process status
interface EmbeddingStatus {
  adsVideos: {
    total: number;
    processed: number;
    completed: boolean;
  };
  contentVideos: {
    total: number;
    processed: number;
    completed: boolean;
  };
}

const PlanCampaignForm: React.FC = () => {
  const [keywords, setKeywords] = useState<Record<string, string[]>>({
    sector: [],
    emotion: [],
    brand: [],
    demographics: [],
    location: [],
  });
  const [inputs, setInputs] = useState<Record<string, string>>({
    sector: '',
    emotion: '',
    brand: '',
    demographics: '',
    location: '',
  });

  // New states for embeddings processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus>({
    adsVideos: { total: 0, processed: 0, completed: false },
    contentVideos: { total: 0, processed: 0, completed: false },
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Environment variables for index IDs (with fallback values)
  const adsIndexId = process.env.NEXT_PUBLIC_ADS_INDEX_ID || 'default-ads-index';
  const contentIndexId = process.env.NEXT_PUBLIC_CONTENT_INDEX_ID || 'default-content-index';

  // Log index IDs for debugging
  console.log(`Using ads index ID: ${adsIndexId}`);
  console.log(`Using content index ID: ${contentIndexId}`);

  // Function to check embeddings when component loads
  useEffect(() => {
    checkAndProcessEmbeddings();
  }, []);

  // Function to check and process embeddings
  const checkAndProcessEmbeddings = async () => {
    console.log('### DEBUG: Starting embedding check and processing');
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // For testing purposes, just process one video from each library

      // Step 1: Get one video from ads index
      console.log('### DEBUG: Fetching one ads video from index:', adsIndexId);
      const adsVideosResponse = await fetchVideos(1, adsIndexId);
      const adsVideos = adsVideosResponse?.data && adsVideosResponse.data.length > 0
        ? [adsVideosResponse.data[0]] // Just take the first video
        : [];
      console.log(`### DEBUG: Found ${adsVideos.length} ads videos for testing`);

      // Step 2: Get one video from content index
      console.log('### DEBUG: Fetching one content video from index:', contentIndexId);
      const contentVideosResponse = await fetchVideos(1, contentIndexId);
      const contentVideos = contentVideosResponse?.data && contentVideosResponse.data.length > 0
        ? [contentVideosResponse.data[0]] // Just take the first video
        : [];
      console.log(`### DEBUG: Found ${contentVideos.length} content videos for testing`);

      // Update status with total counts
      console.log('### DEBUG: Updating UI status with video counts');
      setEmbeddingStatus({
        adsVideos: {
          total: adsVideos.length,
          processed: 0,
          completed: false
        },
        contentVideos: {
          total: contentVideos.length,
          processed: 0,
          completed: false
        }
      });

      // Step 3: Process ads videos
      if (adsVideos.length > 0) {
        const adsVideo = adsVideos[0];
        console.log(`### DEBUG: Checking if embedding exists for ads video ${adsVideo._id}`);

        // Check if embedding exists in Pinecone
        const adsEmbeddingExists = await checkVectorExists(adsVideo._id, adsIndexId);

        if (adsEmbeddingExists) {
          console.log(`### DEBUG: Embedding already exists for ads video ${adsVideo._id}`);
          setEmbeddingStatus(prev => ({
            ...prev,
            adsVideos: {
              ...prev.adsVideos,
              processed: 1,
              completed: true
            }
          }));
        } else {
          console.log(`### DEBUG: Embedding does not exist for ads video ${adsVideo._id}, storing it now`);

          // Store the embedding
          const result = await getAndStoreEmbeddings(adsIndexId, adsVideo._id);

          console.log(`### DEBUG: Store embedding result for ads video:`, result);

          setEmbeddingStatus(prev => ({
            ...prev,
            adsVideos: {
              ...prev.adsVideos,
              processed: result.success ? 1 : 0,
              completed: true
            }
          }));
        }
      } else {
        console.log('### DEBUG: No ads videos to process');
        setEmbeddingStatus(prev => ({
          ...prev,
          adsVideos: {
            ...prev.adsVideos,
            completed: true
          }
        }));
      }

      // Step 4: Process content videos
      if (contentVideos.length > 0) {
        const contentVideo = contentVideos[0];
        console.log(`### DEBUG: Checking if embedding exists for content video ${contentVideo._id}`);

        // Check if embedding exists in Pinecone
        const contentEmbeddingExists = await checkVectorExists(contentVideo._id, contentIndexId);

        if (contentEmbeddingExists) {
          console.log(`### DEBUG: Embedding already exists for content video ${contentVideo._id}`);
          setEmbeddingStatus(prev => ({
            ...prev,
            contentVideos: {
              ...prev.contentVideos,
              processed: 1,
              completed: true
            }
          }));
        } else {
          console.log(`### DEBUG: Embedding does not exist for content video ${contentVideo._id}, storing it now`);

          // Store the embedding
          const result = await getAndStoreEmbeddings(contentIndexId, contentVideo._id);

          console.log(`### DEBUG: Store embedding result for content video:`, result);

          setEmbeddingStatus(prev => ({
            ...prev,
            contentVideos: {
              ...prev.contentVideos,
              processed: result.success ? 1 : 0,
              completed: true
            }
          }));
        }
      } else {
        console.log('### DEBUG: No content videos to process');
        setEmbeddingStatus(prev => ({
          ...prev,
          contentVideos: {
            ...prev.contentVideos,
            completed: true
          }
        }));
      }

      console.log('### DEBUG: Finished all embedding processing successfully');
    } catch (error) {
      console.error('### DEBUG ERROR: Error in check and process embeddings:', error);
      setErrorMessage('Failed to process embeddings. Please try again.');
    } finally {
      console.log('### DEBUG: Setting isProcessing to false');
      setIsProcessing(false);
    }
  };

  // Add a new function to reset and reload embeddings
  const handleResetAndReload = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // 1. Reset Pinecone vectors
      console.log('Resetting all vectors in Pinecone');
      const resetResult = await resetPineconeVectors(undefined, undefined, true);

      if (!resetResult) {
        setErrorMessage('Failed to reset vectors');
        setIsProcessing(false);
        return;
      }

      console.log('Reset successful. Reloading embeddings...');

      // 2. Reload embeddings
      await checkAndProcessEmbeddings();

    } catch (error) {
      console.error('Error in reset and reload:', error);
      setErrorMessage('Failed to reset and reload embeddings');
      setIsProcessing(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, category: string) => {
    setInputs({ ...inputs, [category]: e.target.value });
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, category: string) => {
    if (e.key === 'Enter' && inputs[category].trim()) {
      e.preventDefault();
      if (!keywords[category].includes(inputs[category].trim())) {
        setKeywords({
          ...keywords,
          [category]: [...keywords[category], inputs[category].trim()],
        });
      }
      setInputs({ ...inputs, [category]: '' });
    }
  };

  const handleRemoveKeyword = (category: string, idx: number) => {
    setKeywords({
      ...keywords,
      [category]: keywords[category].filter((_, i) => i !== idx),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Submit logic
    console.log('Submitted keywords:', keywords);
  };

  // Calculate overall progress
  const totalVideos = embeddingStatus.adsVideos.total + embeddingStatus.contentVideos.total;
  const processedVideos = embeddingStatus.adsVideos.processed + embeddingStatus.contentVideos.processed;
  const progress = totalVideos > 0 ? Math.round((processedVideos / totalVideos) * 100) : 0;

  // Check if all processing is complete
  const isComplete = embeddingStatus.adsVideos.completed && embeddingStatus.contentVideos.completed;

  // Check if submit should be enabled
  const hasKeywords = Object.values(keywords).some(category => category.length > 0);
  const isSubmitEnabled = !isProcessing && isComplete && hasKeywords;

  return (
    <div style={styles.container}>
      {/* Embedding processing status */}
      {(isProcessing || !isComplete) && (
        <div style={styles.processingBox}>
          <h3 style={styles.processingTitle}>Processing Video Embeddings</h3>

          <div style={styles.progressContainer}>
            <div style={{...styles.progressBar, width: `${progress}%`}} />
          </div>

          <p style={styles.processingText}>
            {isProcessing ? (
              <span>
                <LoadingSpinner size="sm" /> Checking and processing embeddings...
              </span>
            ) : (
              `Processed ${processedVideos} of ${totalVideos} videos (${progress}%)`
            )}
          </p>

          <div style={styles.processingDetails}>
            <p>
              <strong>Ads Videos:</strong> {embeddingStatus.adsVideos.processed} of {embeddingStatus.adsVideos.total} processed
              {embeddingStatus.adsVideos.completed && ' ✓'}
            </p>
            <p>
              <strong>Content Videos:</strong> {embeddingStatus.contentVideos.processed} of {embeddingStatus.contentVideos.total} processed
              {embeddingStatus.contentVideos.completed && ' ✓'}
            </p>
          </div>

          {errorMessage && (
            <p style={styles.errorMessage}>{errorMessage}</p>
          )}

          {/* Add reset button for testing */}
          {!isProcessing && (
            <button
              onClick={handleResetAndReload}
              style={styles.resetBtn}
              type="button"
            >
              Reset & Reload Embeddings
            </button>
          )}
        </div>
      )}

      {/* Campaign form */}
      <form onSubmit={handleSubmit} style={styles.form}>
        <h2 style={styles.title}>Plan Campaign</h2>
        {categories.map((cat) => (
          <div key={cat.name} style={styles.categoryBox}>
            <label style={styles.label}>{cat.label}</label>
            <div style={styles.tagsContainer}>
              {keywords[cat.name].map((kw, idx) => (
                <span key={kw + idx} style={styles.tag}>
                  {kw}
                  <button
                    type="button"
                    style={styles.removeBtn}
                    onClick={() => handleRemoveKeyword(cat.name, idx)}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={inputs[cat.name]}
                onChange={(e) => handleInputChange(e, cat.name)}
                onKeyDown={(e) => handleInputKeyDown(e, cat.name)}
                placeholder={`Add ${cat.label}`}
                style={styles.input}
                disabled={isProcessing}
              />
            </div>
          </div>
        ))}
        <button
          type="submit"
          style={{
            ...styles.submitBtn,
            ...(isSubmitEnabled ? {} : styles.disabledBtn)
          }}
          disabled={!isSubmitEnabled}
        >
          Submit
        </button>
      </form>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    maxWidth: 800,
    margin: '0 auto',
  },
  form: {
    background: '#fff',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  title: {
    margin: 0,
    marginBottom: 8,
    fontSize: 22,
    fontWeight: 700,
    textAlign: 'center',
  },
  categoryBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontWeight: 600,
    marginBottom: 4,
  },
  tagsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    minHeight: 36,
    background: '#f5f5f5',
    borderRadius: 8,
    padding: '6px 8px',
  },
  tag: {
    background: '#e0e7ff',
    color: '#3730a3',
    borderRadius: 12,
    padding: '4px 10px',
    display: 'flex',
    alignItems: 'center',
    fontSize: 14,
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#a1a1aa',
    marginLeft: 4,
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
  },
  input: {
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: 15,
    minWidth: 80,
    flex: 1,
  },
  submitBtn: {
    marginTop: 16,
    padding: '10px 0',
    borderRadius: 8,
    border: 'none',
    background: '#6366f1',
    color: '#fff',
    fontWeight: 700,
    fontSize: 16,
    cursor: 'pointer',
  },
  disabledBtn: {
    background: '#c7d2fe',
    cursor: 'not-allowed',
  },
  processingBox: {
    background: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  processingTitle: {
    margin: 0,
    marginBottom: 16,
    fontSize: 18,
    fontWeight: 600,
  },
  processingText: {
    margin: '8px 0',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  processingDetails: {
    fontSize: 14,
    margin: '16px 0 0 0',
  },
  progressContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#6366f1',
    transition: 'width 0.3s ease-in-out',
  },
  errorMessage: {
    color: '#ef4444',
    margin: '16px 0 0 0',
    fontSize: 14,
  },
  resetBtn: {
    marginTop: 16,
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    background: '#ef4444',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  }
};

export default PlanCampaignForm;