import { FC, useState, useEffect } from 'react';
import { Tag } from '@/types';
import Video from './Video';
import LoadingSpinner from './LoadingSpinner';
import EditableTag from './EditableTag';
import { updateVideoMetadata } from '@/hooks/apiHooks';

type ContentItemProps = {
  videoUrl: string;
  tags: Tag[];
  videoId: string;
  indexId: string;
  // 호환성을 위해 남겨두지만 내부에서는 사용하지 않음
  thumbnailUrl?: string;
  title?: string;
  // Add user metadata
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
  // videoUrl은 현재 직접 사용하지 않지만 타입 호환성을 위해 남겨둠
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  videoUrl,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tags,
  videoId,
  indexId,
  metadata,
  isLoadingMetadata = false,
  onMetadataUpdated
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [updatingField, setUpdatingField] = useState<string | null>(null);
  const [localMetadata, setLocalMetadata] = useState(metadata || {});

  // metadata prop이 변경되면 로컬 상태 업데이트
  useEffect(() => {
    setLocalMetadata(metadata || {});
  }, [metadata, videoId]);

  // Helper function to save metadata when a tag is edited
  const handleSaveMetadata = async (category: string, value: string) => {
    setUpdatingField(category.toLowerCase());

    try {
      // Map category to metadata field
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

      // Normalize the value - convert to lowercase and properly capitalize
      let normalizedValue = value.trim();

      // Only process if there's actually a value
      if (normalizedValue) {
        console.log(`[ContentItem] Before normalization - field: ${field}, value: "${normalizedValue}"`);

        // For comma-separated values, process each part individually
        if (normalizedValue.includes(',')) {
          // Split by comma, trim each part, normalize capitalization, then rejoin
          normalizedValue = normalizedValue
            .split(',')
            .map(part => {
              const trimmedPart = part.trim();
              if (!trimmedPart) return '';

              // Convert to lowercase first, then capitalize first letter of each word
              return trimmedPart
                .toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            })
            .filter(part => part) // Remove empty parts
            .join(', ');
        } else {
          // Single value - convert to lowercase then capitalize first letter of each word
          normalizedValue = normalizedValue
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        }

        console.log(`[ContentItem] After normalization - field: ${field}, value: "${normalizedValue}"`);
      }

      // 로컬 메타데이터 먼저 업데이트하여 UI에 즉시 반영
      const updatedMetadata = {
        ...localMetadata,
        [field]: normalizedValue
      };

      // 로컬 상태 업데이트
      setLocalMetadata(updatedMetadata);

      console.log('Updating metadata:', { videoId, indexId, metadata: updatedMetadata, field, value });

      // Call API to update metadata
      const success = await updateVideoMetadata(videoId, indexId, updatedMetadata);

      if (success) {
        console.log(`Metadata updated successfully for field: ${field}`);
      } else {
        console.error(`Failed to update metadata for field: ${field}`);
        // 업데이트 실패 시 이전 메타데이터로 복원
        setLocalMetadata(metadata || {});
      }

      // Notify parent component if callback is provided
      if (onMetadataUpdated && success) {
        onMetadataUpdated();
      }
    } catch (error) {
      console.error('Failed to save metadata:', error);
      // 에러 발생 시 이전 메타데이터로 복원
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

  // 로딩 스피너 렌더링
  const renderLoading = () => (
    <div className="flex justify-center">
      <div className="w-4 h-4">
        <LoadingSpinner />
      </div>
    </div>
  );

  const handlePlay = () => {
    setIsPlaying(true);
  };

  // 로딩 중인지 확인하고 메타데이터 필드가 비어있는 경우 로딩 스피너 표시
  const needsMetadata = !localMetadata ||
    Object.keys(localMetadata).length === 0 ||
    !localMetadata.source ||
    !localMetadata.topic_category ||
    !localMetadata.emotions ||
    !localMetadata.brands ||
    !localMetadata.locations;

  // 특정 필드가 현재 업데이트 중인지 확인
  const isFieldUpdating = (field: string) => updatingField === field.toLowerCase();

  return (
    <div className="flex items-center border-b border-gray-200 py-4 px-4 hover:bg-gray-50 transition-colors">
      {/* Video */}
      <div style={{ width: '300px' }} className="flex-shrink-0 pr-4">
        <Video
          videoId={videoId}
          indexId={indexId}
          playing={isPlaying}
          onPlay={handlePlay}
        />
      </div>

      {/* Topic Category */}
      <div style={{ width: '120px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1 justify-center items-center">
        {isLoadingMetadata && (!localMetadata.topic_category) ? renderLoading() : (
          isFieldUpdating('topic_category') ? renderLoading() : renderEditableMetadata('Topic Category', 'topic_category')
        )}
      </div>

      {/* Emotions */}
      <div style={{ width: '120px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1 justify-center items-center">
        {isLoadingMetadata && (!localMetadata.emotions) ? renderLoading() : (
          isFieldUpdating('emotions') ? renderLoading() : renderEditableMetadata('Emotions', 'emotions')
        )}
      </div>

      {/* Brands */}
      <div style={{ width: '120px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1 justify-center items-center">
        {isLoadingMetadata && (!localMetadata.brands) ? renderLoading() : (
          isFieldUpdating('brands') ? renderLoading() : renderEditableMetadata('Brands', 'brands')
        )}
      </div>

      {/* Target Demo: Gender */}
      <div style={{ width: '120px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1 justify-center items-center">
        {isFieldUpdating('demo_gender') ? renderLoading() : renderEditableMetadata('Target Demo: Gender', 'demo_gender')}
      </div>

      {/* Target Demo: Age */}
      <div style={{ width: '120px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1 justify-center items-center">
        {isFieldUpdating('demo_age') ? renderLoading() : renderEditableMetadata('Target Demo: Age', 'demo_age')}
      </div>

      {/* Location */}
      <div style={{ width: '120px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1 justify-center items-center">
        {isLoadingMetadata && (!localMetadata.locations) ? renderLoading() : (
          isFieldUpdating('locations') ? renderLoading() : renderEditableMetadata('Location', 'locations')
        )}
      </div>

      {/* Source */}
      <div style={{ width: '200px' }} className="flex-shrink-0 pr-4 flex justify-center items-center">
        {isLoadingMetadata && needsMetadata ? renderLoading() : (
          isFieldUpdating('source') ? renderLoading() : renderEditableMetadata('Source', 'source')
        )}
      </div>

    </div>
  );
};

export default ContentItem;