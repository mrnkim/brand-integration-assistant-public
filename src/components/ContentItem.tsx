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
    sector?: string;
    emotions?: string;
    brands?: string;
    locations?: string;
    demographics?: string;
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
        case 'sector':
          field = 'sector';
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
        case 'demographics':
          // Demographics는 더 이상 source 필드에 저장하지 않고 별도로 처리
          field = 'demographics';
          break;
        default:
          throw new Error(`Unknown category: ${category}`);
      }

      // 로컬 메타데이터 먼저 업데이트하여 UI에 즉시 반영
      const updatedMetadata = {
        ...localMetadata,
        [field]: value.trim() // 입력값 앞뒤 공백 제거
      };

      // 로컬 상태 업데이트
      setLocalMetadata(updatedMetadata);

      console.log('Updating metadata:', { videoId, indexId, metadata: updatedMetadata });

      // Call API to update metadata
      await updateVideoMetadata(videoId, indexId, updatedMetadata);

      // Notify parent component if callback is provided
      if (onMetadataUpdated) {
        onMetadataUpdated();
      }
    } catch (error) {
      console.error('Failed to save metadata:', error);
      // 에러 발생 시 이전 메타데이터로 복원
      setLocalMetadata(metadata || {});
      throw error;
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
    !localMetadata.sector ||
    !localMetadata.emotions ||
    !localMetadata.brands ||
    !localMetadata.locations;

  // 특정 필드가 현재 업데이트 중인지 확인
  const isFieldUpdating = (field: string) => updatingField === field.toLowerCase();

  return (
    <div className="flex items-center border-b border-gray-200 py-4 px-4 hover:bg-gray-50 transition-colors">
      {/* Video */}
      <div style={{ width: '250px' }} className="flex-shrink-0 pr-4">
        <Video
          videoId={videoId}
          indexId={indexId}
          playing={isPlaying}
          onPlay={handlePlay}
        />
      </div>

      {/* Source */}
      <div style={{ width: '180px' }} className="flex-shrink-0 pr-4">
        {isLoadingMetadata && needsMetadata ? renderLoading() : (
          isFieldUpdating('source') ? renderLoading() : renderEditableMetadata('Source', 'source')
        )}
      </div>

      {/* Sector */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {isLoadingMetadata && (!localMetadata.sector) ? renderLoading() : (
          isFieldUpdating('sector') ? renderLoading() : renderEditableMetadata('Sector', 'sector')
        )}
      </div>

      {/* Emotions */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {isLoadingMetadata && (!localMetadata.emotions) ? renderLoading() : (
          isFieldUpdating('emotions') ? renderLoading() : renderEditableMetadata('Emotions', 'emotions')
        )}
      </div>

      {/* Brands */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {isLoadingMetadata && (!localMetadata.brands) ? renderLoading() : (
          isFieldUpdating('brands') ? renderLoading() : renderEditableMetadata('Brands', 'brands')
        )}
      </div>

      {/* Demographics */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {isFieldUpdating('demographics') ? renderLoading() : renderEditableMetadata('Demographics', 'demographics')}
      </div>

      {/* Location */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {isLoadingMetadata && (!localMetadata.locations) ? renderLoading() : (
          isFieldUpdating('locations') ? renderLoading() : renderEditableMetadata('Location', 'locations')
        )}
      </div>
    </div>
  );
};

export default ContentItem;