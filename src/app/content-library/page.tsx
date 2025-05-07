"use client";

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import SearchBar from '@/components/SearchBar';
import ActionButtons from '@/components/ActionButtons';
import FilterTabs from '@/components/FilterTabs';
import ContentItem from '@/components/ContentItem';
import { ContentItem as ContentItemType } from '@/types';

// Mock data for content items
const MOCK_CONTENT_ITEMS: ContentItemType[] = [
  {
    id: '1',
    thumbnailUrl: 'https://placehold.co/600x400',
    title: 'Video title',
    videoUrl: 'https://www.youtube.com/watch?v=example1',
    tags: [
      { category: 'Architecture', value: 'Architecture' },
      { category: 'Emotions', value: 'Serious' },
      { category: 'Brands', value: 'Skanska' },
      { category: 'Location', value: 'New York' },
      { category: 'History', value: 'History' },
      { category: 'Topics', value: 'Construction' },
      { category: 'Demographics', value: 'Professionals' },
    ]
  },
  {
    id: '2',
    thumbnailUrl: 'https://placehold.co/600x400',
    title: 'Video title',
    videoUrl: 'https://www.youtube.com/watch?v=example2',
    tags: [
      { category: 'Architecture', value: 'Architecture' },
      { category: 'Emotions', value: 'Serious' },
      { category: 'Brands', value: 'Skanska' },
      { category: 'Location', value: 'New York' },
      { category: 'History', value: 'History' },
      { category: 'Topics', value: 'Urban Planning' },
      { category: 'Demographics', value: 'Architects' },
    ]
  },
  {
    id: '3',
    thumbnailUrl: 'https://placehold.co/600x400',
    title: 'Video title',
    videoUrl: 'https://www.youtube.com/watch?v=example3',
    tags: [
      { category: 'Architecture', value: 'Architecture' },
      { category: 'Emotions', value: 'Serious' },
      { category: 'Brands', value: 'Skanska' },
      { category: 'Location', value: 'New York' },
      { category: 'History', value: 'History' },
      { category: 'Topics', value: 'Real Estate' },
      { category: 'Demographics', value: 'Investors' },
    ]
  }
];

const COLUMNS = [
  { id: 'video', label: 'Video', width: '250px' },
  { id: 'source', label: 'Source', width: '180px' },
  { id: 'topics', label: 'Topics', width: '140px' },
  { id: 'emotions', label: 'Emotions', width: '140px' },
  { id: 'brands', label: 'Brands', width: '140px' },
  { id: 'demographics', label: 'Demographics', width: '140px' },
  { id: 'location', label: 'Location', width: '140px' },
  { id: 'architecture', label: 'Architecture', width: '140px' },
  { id: 'history', label: 'History', width: '140px' }
];

export default function ContentLibrary() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('Video');

  const handleSearch = (value: string) => {
    setSearchQuery(value);
  };

  const handleUpload = () => {
    console.log('Upload clicked');
  };

  const handleFilter = () => {
    console.log('Filter clicked');
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <Sidebar activeMenu="content-library" />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search area */}
        <div className="p-4 border-b border-gray-200">
          <SearchBar
            value={searchQuery}
            onChange={handleSearch}
          />
        </div>

        {/* Action buttons and filter tabs */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <ActionButtons
              onUpload={handleUpload}
              onFilter={handleFilter}
            />
            <div className="text-sm text-gray-500">
              {MOCK_CONTENT_ITEMS.length} results
            </div>
          </div>

          {/* Filter tabs in horizontal row */}
          <FilterTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>

        {/* Content area with fixed header and scrollable content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Fixed header */}
          <div className="flex items-center bg-gray-100 py-3 px-4 border-b border-gray-200 shadow-sm">
            {COLUMNS.map(column => (
              <div
                key={column.id}
                className="font-medium text-sm text-gray-600 flex-shrink-0 pr-4"
                style={{ width: column.width }}
              >
                {column.label}
              </div>
            ))}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-auto">
            <div className="min-w-max">
              {MOCK_CONTENT_ITEMS.map(item => (
                <ContentItem
                  key={item.id}
                  thumbnailUrl={item.thumbnailUrl}
                  title={item.title}
                  videoUrl={item.videoUrl}
                  tags={item.tags}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}