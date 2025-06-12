import React from 'react';
import { AdItemType, ActiveFiltersProps, FilterMenuProps } from '@/types';

export const ActiveFilters: React.FC<ActiveFiltersProps> = ({
  activeFilters,
  onResetCategoryFilters,
  onResetAllFilters,
  getTotalActiveFilterCount,
  capitalizeText
}) => {
  if (getTotalActiveFilterCount() === 0) return null;

  return (
    <div className="flex items-center">
      <div className="ml-3 flex flex-wrap items-center gap-2">
        {Object.entries(activeFilters).map(([category, values]) =>
          values.length > 0 && (
            <div key={category} className="flex items-center bg-light-purple px-2 py-1 rounded-md">
              <span className="text-sm font-medium text-gray-800 mr-1">
                {capitalizeText(category.replace(/_/g, ' '))}:
              </span>
              <span className="text-sm">
                {values.join(', ')}
              </span>
              <button
                onClick={() => onResetCategoryFilters(category)}
                className="ml-1 text-gray-600 hover:text-gray-700 cursor-pointer"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )
        )}
      </div>
      <button
        onClick={onResetAllFilters}
        className="ml-2 text-sm hover:text-red cursor-pointer"
      >
        Clear All
      </button>
    </div>
  );
};

// Main FilterMenu component
const FilterMenu: React.FC<FilterMenuProps> = ({
  showFilterMenu,
  selectedFilterCategory,
  filterCategories,
  filterOptions,
  onFilterCategorySelect,
  onToggleFilter,
  onResetCategoryFilters,
  onCloseFilterMenu,
  getActiveCategoryFilterCount,
  isFilterActive,
  capitalizeText
}) => {
  if (!showFilterMenu) return null;

  return (
    <div className="relative">
      <div className="absolute z-[100] mt-1 bg-white rounded-[45.60px] overflow-hidden p-3">
        {selectedFilterCategory === null ? (
          <div className="bg-white cursor-pointer">
            {filterCategories.map((category) => (
              <button
                key={category.id}
                className="rounded-2xl flex items-center justify-between w-full text-left px-4 py-2 text-md hover:bg-gray-200 cursor-pointer"
                onClick={() => onFilterCategorySelect(category.id)}
              >
                <span>{capitalizeText(category.label.replace(/_/g, ' '))}</span>
                {getActiveCategoryFilterCount(category.id) > 0 && (
                  <span className="ml-2 bg-light-purple text-xs font-medium px-2 py-0.5 rounded-full">
                    {getActiveCategoryFilterCount(category.id)}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="p-4 w-64 bg-white rounded-[45.60px]">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium text-md">
                {capitalizeText((filterCategories.find(c => c.id === selectedFilterCategory)?.label || '').replace(/_/g, ' '))}
              </h3>
              <div className="flex items-center">
                {getActiveCategoryFilterCount(selectedFilterCategory) > 0 && (
                  <button
                    className="text-sm hover:text-red mr-3 cursor-pointer"
                    onClick={() => onResetCategoryFilters(selectedFilterCategory)}
                  >
                    Clear
                  </button>
                )}
                <button
                  className="hover:text-gray-500 cursor-pointer"
                  onClick={() => onFilterCategorySelect(null)}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Filter options */}
            <div className="max-h-60 overflow-y-auto">
              {filterOptions[selectedFilterCategory]?.length > 0 ? (
                <div className="space-y-2">
                  {filterOptions[selectedFilterCategory].map((option, index) => (
                    <div key={index} className="flex items-start cursor-pointer hover:bg-gray-200 px-2 py-2 rounded min-h-[32px]">
                      <input
                        id={`filter-${selectedFilterCategory}-${index}`}
                        type="checkbox"
                        className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                        checked={isFilterActive(selectedFilterCategory, option)}
                        onChange={() => onToggleFilter(selectedFilterCategory, option)}
                      />
                      <label
                        htmlFor={`filter-${selectedFilterCategory}-${index}`}
                        className="ml-3 flex-1 text-md cursor-pointer leading-tight break-words"
                      >
                        {capitalizeText(option)}
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No options available</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Backdrop to close menu when clicking outside */}
      <div
        className="fixed inset-0 z-[90]"
        onClick={onCloseFilterMenu}
      ></div>
    </div>
  );
};

// Hook to manage filter state
export const useFilterState = (adItems: AdItemType[]) => {
  const [filterOptions, setFilterOptions] = React.useState<{[key: string]: string[]}>({
    topic_category: [],
    emotions: [],
    brands: [],
    demo_age: [],
    demo_gender: [],
    location: []
  });

  const [activeFilters, setActiveFilters] = React.useState<{[key: string]: string[]}>({
    topic_category: [],
    emotions: [],
    brands: [],
    demo_age: [],
    demo_gender: [],
    location: []
  });

  const [filteredItems, setFilteredItems] = React.useState<AdItemType[]>([]);
  const [isFiltering, setIsFiltering] = React.useState(false);
  const [showFilterMenu, setShowFilterMenu] = React.useState(false);
  const [selectedFilterCategory, setSelectedFilterCategory] = React.useState<string | null>(null);

  // Filter categories
  const filterCategories = [
    { id: 'topic_category', label: 'Topic Category' },
    { id: 'emotions', label: 'Emotions' },
    { id: 'brands', label: 'Brands' },
    { id: 'demo_age', label: 'Target Demo: Age' },
    { id: 'demo_gender', label: 'Target Demo: Gender' },
    { id: 'location', label: 'Location' },
  ];

  // Helper function to properly capitalize text
  const capitalizeText = (text: string): string => {
    return text
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Check if a filter is active
  const isFilterActive = (category: string, value: string) => {
    return activeFilters[category].includes(value);
  };

  // Get active filter count for a category
  const getActiveCategoryFilterCount = (category: string) => {
    return activeFilters[category].length;
  };

  // Get total active filter count
  const getTotalActiveFilterCount = () => {
    return Object.values(activeFilters).reduce((total, filters) => total + filters.length, 0);
  };

  // Toggle filter selection
  const toggleFilter = (category: string, value: string) => {
    setActiveFilters(prev => {
      const current = [...prev[category]];

      if (current.includes(value)) {
        return {
          ...prev,
          [category]: current.filter(v => v !== value)
        };
      } else {
        return {
          ...prev,
          [category]: [...current, value]
        };
      }
    });
  };

  // Reset filters for a specific category
  const resetCategoryFilters = (category: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [category]: []
    }));
  };

  // Reset all filters
  const resetAllFilters = () => {
    setActiveFilters({
      topic_category: [],
      emotions: [],
      brands: [],
      demo_age: [],
      demo_gender: [],
      location: []
    });
    setShowFilterMenu(false);
    setSelectedFilterCategory(null);
  };

  const handleFilter = () => {
    setShowFilterMenu(!showFilterMenu);
    setSelectedFilterCategory(null);
  };

  const handleFilterCategorySelect = (categoryId: string | null) => {
    setSelectedFilterCategory(categoryId);
  };

  // Close filter menu
  const closeFilterMenu = () => {
    setShowFilterMenu(false);
    setSelectedFilterCategory(null);
  };

  // Extract unique filter options from ads items
  React.useEffect(() => {
    if (adItems.length > 0) {
      const options: {[key: string]: Map<string, string>} = {
        topic_category: new Map<string, string>(),
        emotions: new Map<string, string>(),
        brands: new Map<string, string>(),
        demo_age: new Map<string, string>(),
        demo_gender: new Map<string, string>(),
        location: new Map<string, string>()
      };

      adItems.forEach(item => {
        if (item.metadata) {
          // Extract topic_category
          if (item.metadata.topic_category) {
            const topics = item.metadata.topic_category.split(',').map(s => s.trim());
            topics.forEach((topic: string) => {
              if (topic) {
                const lowercaseTopic = topic.toLowerCase();
                if (!options.topic_category.has(lowercaseTopic)) {
                  options.topic_category.set(lowercaseTopic, topic);
                }
              }
            });
          }

          // Extract emotions
          if (item.metadata.emotions) {
            const emotions = item.metadata.emotions.split(',').map(e => e.trim());
            emotions.forEach((emotion: string) => {
              if (emotion) {
                const lowercaseEmotion = emotion.toLowerCase();
                if (!options.emotions.has(lowercaseEmotion)) {
                  options.emotions.set(lowercaseEmotion, emotion);
                }
              }
            });
          }

          // Extract brands
          if (item.metadata.brands) {
            const brands = item.metadata.brands.split(',').map((b: string) => b.trim());
            brands.forEach((brand: string) => {
              if (brand) {
                const lowercaseBrand = brand.toLowerCase();
                if (!options.brands.has(lowercaseBrand)) {
                  options.brands.set(lowercaseBrand, brand);
                }
              }
            });
          }

          // Extract demo_age
          if (item.metadata.demo_age) {
            const ages = item.metadata.demo_age.split(',').map((a: string) => a.trim());
            ages.forEach((age: string) => {
              if (age) {
                const lowercaseAge = age.toLowerCase();
                if (!options.demo_age.has(lowercaseAge)) {
                  options.demo_age.set(lowercaseAge, age);
                }
              }
            });
          }

          // Extract demo_gender
          if (item.metadata.demo_gender) {
            const genders = item.metadata.demo_gender.split(',').map((g: string) => g.trim());
            genders.forEach((gender: string) => {
              if (gender) {
                const lowercaseGender = gender.toLowerCase();
                if (!options.demo_gender.has(lowercaseGender)) {
                  options.demo_gender.set(lowercaseGender, gender);
                }
              }
            });
          }

          // Extract locations
          if (item.metadata.locations) {
            const locations = item.metadata.locations.split(',').map((l: string) => l.trim());
            locations.forEach((location: string) => {
              if (location) {
                const lowercaseLocation = location.toLowerCase();
                if (!options.location.has(lowercaseLocation)) {
                  options.location.set(lowercaseLocation, location);
                }
              }
            });
          }
        }
      });

      const sortOptions = (a: string, b: string) => {
        if (a[0].toLowerCase() !== b[0].toLowerCase()) {
          return a.localeCompare(b);
        }
        return a.length - b.length;
      };

      setFilterOptions({
        topic_category: Array.from(options.topic_category.values()).sort(sortOptions),
        emotions: Array.from(options.emotions.values()).sort(sortOptions),
        brands: Array.from(options.brands.values()).sort(sortOptions),
        demo_age: Array.from(options.demo_age.values()).sort(sortOptions),
        demo_gender: Array.from(options.demo_gender.values()).sort(sortOptions),
        location: Array.from(options.location.values()).sort(sortOptions)
      });
    }
  }, [adItems]);

  // Apply filters to ads items
  React.useEffect(() => {
    const hasActiveFilters = Object.values(activeFilters).some(filters => filters.length > 0);
    setIsFiltering(hasActiveFilters);

    if (!hasActiveFilters) {
      setFilteredItems(adItems);
      return;
    }

    const filtered = adItems.filter(item => {
      return Object.entries(activeFilters).every(([category, filters]) => {
        if (filters.length === 0) return true;

        let metadataValue = '';
        switch (category) {
          case 'topic_category':
            metadataValue = item.metadata?.topic_category || '';
            break;
          case 'emotions':
            metadataValue = item.metadata?.emotions || '';
            break;
          case 'brands':
            metadataValue = item.metadata?.brands || '';
            break;
          case 'demo_age':
            metadataValue = item.metadata?.demo_age || '';
            break;
          case 'demo_gender':
            metadataValue = item.metadata?.demo_gender || '';
            break;
          case 'location':
            metadataValue = item.metadata?.locations || '';
            break;
        }

        if (metadataValue === '' && filters.length > 0) {
          return false;
        }

        const values = metadataValue.split(',').map(v => v.trim());

        return filters.some(filter =>
          values.some(value => {
            const normalizedValue = value.toLowerCase();
            const normalizedFilter = filter.toLowerCase();

            if (normalizedValue === normalizedFilter) {
              return true;
            }

            const valueWords = normalizedValue.split(/\s+|,|\/|\&/);
            const filterWords = normalizedFilter.split(/\s+|,|\/|\&/);

            const wordMatch = filterWords.some(filterWord =>
              valueWords.some(valueWord => valueWord === filterWord)
            );

            if (wordMatch) {
              return true;
            }

            return false;
          })
        );
      });
    });

    setFilteredItems(filtered);
  }, [activeFilters, adItems]);

  return {
    filterOptions,
    activeFilters,
    filteredItems,
    isFiltering,
    showFilterMenu,
    selectedFilterCategory,
    filterCategories,
    capitalizeText,
    isFilterActive,
    getActiveCategoryFilterCount,
    getTotalActiveFilterCount,
    toggleFilter,
    resetCategoryFilters,
    resetAllFilters,
    handleFilter,
    handleFilterCategorySelect,
    closeFilterMenu,
  };
};

export default FilterMenu;