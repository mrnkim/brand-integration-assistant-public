import { FC, useState, useEffect } from 'react';
import { Tag } from '@/types';
import Video from './Video';
import LoadingSpinner from './LoadingSpinner';
import EditableTag from './EditableTag';
import { updateVideoMetadata } from '@/hooks/apiHooks';
import VideoModalSimple from './VideoModalSimple';

type ContentItemProps = {
  videoUrl: string;
  tags: Tag[];
  videoId: string;
  indexId: string;
  thumbnailUrl?: string;
  title?: string;
  metadata?: {
    source?: string;
    topic_category?: string;
    emotions?: string;
    brands?: string;
    locations?: string;
    demo_age?: string;
    demo_gender?: string;
  };
  isLoadingMetadata?: boolean;
  onMetadataUpdated?: () => void;
};

const ContentItem: FC<ContentItemProps> = ({
  videoUrl,
  title,
  videoId,
  indexId,
  metadata,
  isLoadingMetadata = false,
  onMetadataUpdated
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updatingField, setUpdatingField] = useState<string | null>(null);
  const [localMetadata, setLocalMetadata] = useState(metadata || {});

  useEffect(() => {
    return () => {
      setIsModalOpen(false);
      setIsPlaying(false);
    };
  }, []);

  useEffect(() => {
    setLocalMetadata(metadata || {});
  }, [metadata, videoId]);

  // Helper function to save metadata when a tag is edited
  const handleSaveMetadata = async (category: string, value: string) => {
    setUpdatingField(category.toLowerCase());

    try {
      let field = '';
      switch (category.toLowerCase()) {
        case 'source':
          field = 'source';
          break;
        case 'topic category':
          field = 'sector'; // 중요: Topic Category는 sector 필드로 매핑해야 함
          break;
        case 'emotions':
          field = 'emotions';
          break;
        case 'brands':
          field = 'brands';
          break;
        case 'location':
          field = 'locations';
          break;
        case 'target demo: age':
          field = 'demo_age';
          break;
        case 'target demo: gender':
          field = 'demo_gender';
          break;
        default:
          throw new Error(`Unknown category: ${category}`);
      }

      let normalizedValue = value.trim();

      if (normalizedValue) {

        if (normalizedValue.includes(',')) {
          normalizedValue = normalizedValue
            .split(',')
            .map(part => {
              const trimmedPart = part.trim();
              if (!trimmedPart) return '';

              return trimmedPart
                .toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            })
            .filter(part => part)
            .join(', ');
        } else {
          normalizedValue = normalizedValue
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        }
      }

      const updatedMetadata = {
        ...localMetadata,
        [field]: normalizedValue
      };

      setLocalMetadata(updatedMetadata);

      const success = await updateVideoMetadata(videoId, indexId, updatedMetadata);

      if (success) {
      } else {
        console.error(`Failed to update metadata for field: ${field}`);
        setLocalMetadata(metadata || {});
      }

      if (onMetadataUpdated && success) {
        onMetadataUpdated();
      }
    } catch (error) {
      console.error('Failed to save metadata:', error);
      setLocalMetadata(metadata || {});
    } finally {
      setUpdatingField(null);
    }
  };

  // Helper function to render editable metadata
  const renderEditableMetadata = (category: string, field: string) => {
    const value = localMetadata[field as keyof typeof localMetadata] || '';

    return (
      <EditableTag
        category={category}
        value={value}
        onSave={handleSaveMetadata}
        disabled={isLoadingMetadata || updatingField !== null}
      />
    );
  };

  const renderLoading = () => (
    <div className="flex justify-center">
      <div className="w-4 h-4">
        <LoadingSpinner />
      </div>
    </div>
  );

  const handlePlay = () => {
    setIsModalOpen(true);
    setIsPlaying(false);
  };

  const isFieldUpdating = (field: string) => updatingField === field.toLowerCase();

  return (
    <>
      <div className="flex items-center border-b border-gray-200 py-4">
        {/* Video */}
        <div style={{ width: '280px' }} className="flex-shrink-0">
          <Video
            videoId={videoId}
            indexId={indexId}
            playing={isPlaying}
            onPlay={handlePlay}
          />
        </div>

        {/* Topic Category */}
        <div style={{ width: '110px' }} className="flex-shrink-0 flex flex-wrap gap-0.5 justify-center items-center">
          {isLoadingMetadata && (!localMetadata.topic_category) ? renderLoading() : (
            isFieldUpdating('topic_category') ? renderLoading() : renderEditableMetadata('Topic Category', 'topic_category')
          )}
        </div>

        {/* Emotions */}
        <div style={{ width: '110px' }} className="flex-shrink-0 flex flex-wrap gap-0.5 justify-center items-center">
          {isLoadingMetadata && (!localMetadata.emotions) ? renderLoading() : (
            isFieldUpdating('emotions') ? renderLoading() : renderEditableMetadata('Emotions', 'emotions')
          )}
        </div>

        {/* Brands */}
        <div style={{ width: '110px' }} className="flex-shrink-0 flex flex-wrap gap-0.5 justify-center items-center">
          {isLoadingMetadata && (!localMetadata.brands) ? renderLoading() : (
            isFieldUpdating('brands') ? renderLoading() : renderEditableMetadata('Brands', 'brands')
          )}
        </div>

        {/* Target Demo: Gender */}
        <div style={{ width: '110px' }} className="flex-shrink-0 flex flex-wrap gap-0.5 justify-center items-center">
          {isLoadingMetadata && (!localMetadata.demo_gender) ? renderLoading() : (
            isFieldUpdating('demo_gender') ? renderLoading() : renderEditableMetadata('Target Demo: Gender', 'demo_gender')
          )}
        </div>

        {/* Target Demo: Age */}
        <div style={{ width: '110px' }} className="flex-shrink-0 flex flex-wrap gap-0.5 justify-center items-center">
          {isLoadingMetadata && (!localMetadata.demo_age) ? renderLoading() : (
            isFieldUpdating('demo_age') ? renderLoading() : renderEditableMetadata('Target Demo: Age', 'demo_age')
          )}
        </div>

        {/* Location */}
        <div style={{ width: '110px' }} className="flex-shrink-0 flex flex-wrap gap-0.5 justify-center items-center">
          {isLoadingMetadata && (!localMetadata.locations) ? renderLoading() : (
            isFieldUpdating('location') ? renderLoading() : renderEditableMetadata('Location', 'locations')
          )}
        </div>

        {/* Source */}
        <div style={{ width: '250px' }} className="flex-shrink-0 flex flex-wrap gap-0.5 justify-center items-center overflow-hidden">
          {isLoadingMetadata && (!localMetadata.source) ? renderLoading() : (
            isFieldUpdating('source') ? renderLoading() : renderEditableMetadata('Source', 'source')
          )}
        </div>
      </div>

      {/* Video Modal */}
      <VideoModalSimple
        videoUrl={videoUrl}
        videoId={videoId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={title}
      />
    </>
  );
};

export default ContentItem;