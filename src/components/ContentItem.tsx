import { FC } from 'react';
import { Tag } from '@/types';

type ContentItemProps = {
  thumbnailUrl: string;
  title: string;
  videoUrl: string;
  tags: Tag[];
};

const ContentItem: FC<ContentItemProps> = ({ thumbnailUrl, title, videoUrl, tags }) => {
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

  return (
    <div className="flex items-center border-b border-gray-200 py-4 px-4 hover:bg-gray-50 transition-colors">
      {/* Video */}
      <div style={{ width: '250px' }} className="flex-shrink-0 pr-4">
        <div className="flex flex-col">
          <div className="relative w-full h-24 rounded-md overflow-hidden mb-2">
            <img
              src={thumbnailUrl}
              alt={title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="text-sm font-medium truncate">{title}</div>
        </div>
      </div>

      {/* Source */}
      <div style={{ width: '180px' }} className="flex-shrink-0 pr-4">
        <div className="text-xs text-gray-500 truncate">{videoUrl}</div>
      </div>

      {/* Topics */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {renderTags('Topics')}
      </div>

      {/* Emotions */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {renderTags('Emotions')}
      </div>

      {/* Brands */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {renderTags('Brands')}
      </div>

      {/* Demographics */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {renderTags('Demographics')}
      </div>

      {/* Location */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {renderTags('Location')}
      </div>

      {/* Architecture */}
      <div style={{ width: '140px' }} className="flex-shrink-0 pr-4 flex flex-wrap gap-1">
        {renderTags('Architecture')}
      </div>

      {/* History */}
      <div style={{ width: '140px' }} className="flex-shrink-0 flex flex-wrap gap-1">
        {renderTags('History')}
      </div>
    </div>
  );
};

export default ContentItem;