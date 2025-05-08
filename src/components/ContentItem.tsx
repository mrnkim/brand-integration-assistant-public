import { FC, useState } from 'react';
import { Tag } from '@/types';
import Video from './Video';
import LoadingSpinner from './LoadingSpinner';

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
  };
  isLoadingMetadata?: boolean;
};

const ContentItem: FC<ContentItemProps> = ({
  videoUrl,
  tags,
  videoId,
  indexId,
  metadata,
  isLoadingMetadata = false
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  // Group tags by category
  const tagsByCategory = tags.reduce((acc, tag) => {
    if (!acc[tag.category]) {
      acc[tag.category] = [];
    }
    acc[tag.category].push(tag.value);
    return acc;
  }, {} as Record<string, string[]>);

  // Helper function to render tags
  const renderTags = (category: string) => {
    return tagsByCategory[category]?.map(value => (
      <span
        key={`${category}-${value}`}
        className="px-2 py-1 bg-gray-100 rounded-full text-xs inline-block"
      >
        {value}
      </span>
    )) || null;
  };

  // Helper function to render metadata
  const renderMetadataItem = (value?: string) => {
    if (!value) return renderPlaceholder();

    return (
      <span className="px-2 py-1 bg-gray-100 rounded-full text-xs inline-block">
        {value}
      </span>
    );
  };

  // 카테고리가 없을 경우 표시할 placeholder
  const renderPlaceholder = () => (
    <span className="text-xs text-gray-400">-</span>
  );

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
  const needsMetadata = !metadata ||
    Object.keys(metadata).length === 0 ||
    !metadata.source ||
    !metadata.sector ||
    !metadata.emotions ||
    !metadata.brands ||
    !metadata.locations;

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
          metadata?.source ? (
            renderMetadataItem(metadata.source)
          ) : (
            <div className="text-xs text-gray-500 truncate">{videoUrl || '-'}</div>
          )
        )}
      </div>

      {/* Sector */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {isLoadingMetadata && (!metadata?.sector) ? renderLoading() : (
          metadata?.sector ? renderMetadataItem(metadata.sector) : (renderTags('Sector') || renderPlaceholder())
        )}
      </div>

      {/* Emotions */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {isLoadingMetadata && (!metadata?.emotions) ? renderLoading() : (
          metadata?.emotions ? renderMetadataItem(metadata.emotions) : (renderTags('Emotions') || renderPlaceholder())
        )}
      </div>

      {/* Brands */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {isLoadingMetadata && (!metadata?.brands) ? renderLoading() : (
          metadata?.brands ? renderMetadataItem(metadata.brands) : (renderTags('Brands') || renderPlaceholder())
        )}
      </div>

      {/* Demographics */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {renderTags('Demographics') || renderPlaceholder()}
      </div>

      {/* Location */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {isLoadingMetadata && (!metadata?.locations) ? renderLoading() : (
          metadata?.locations ? renderMetadataItem(metadata.locations) : (renderTags('Location') || renderPlaceholder())
        )}
      </div>
    </div>
  );
};

export default ContentItem;