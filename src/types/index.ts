// Tag type for content metadata
export type Tag = {
  category: string;
  value: string;
};

// Content item type
export type ContentItem = {
  id: string;
  thumbnailUrl: string;
  title: string;
  videoUrl: string;
  tags: Tag[];
};