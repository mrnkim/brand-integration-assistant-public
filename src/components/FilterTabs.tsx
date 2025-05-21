import { FC } from 'react';

type FilterTabProps = {
  label: string;
  active?: boolean;
  onClick?: () => void;
};

const FilterTab: FC<FilterTabProps> = ({ label, active = false, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        active
          ? 'bg-white text-gray-800 shadow-sm'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
};

type FilterTabsProps = {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
};

const FilterTabs: FC<FilterTabsProps> = ({
  activeTab = 'Video',
  onTabChange = () => {}
}) => {
  const tabs = [
    'Video',
    'Source',
    'Topic Category',
    'Emotions',
    'Brands',
    'Target Demo: Age',
    'Target Demo: Gender',
    'Location'
  ];

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <div className="flex space-x-2 overflow-x-auto pb-2 bg-zinc-100 shadow-md px-4">
        {tabs.map(tab => (
          <FilterTab
            key={tab}
            label={tab}
            active={activeTab === tab}
            onClick={() => onTabChange(tab)}
          />
        ))}
      </div>
    </div>
  );
};

export default FilterTabs;