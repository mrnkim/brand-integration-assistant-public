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
          ? 'bg-gray-200 text-gray-800'
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
    <div className="flex space-x-2 overflow-x-auto pb-2">
      {tabs.map(tab => (
        <FilterTab
          key={tab}
          label={tab}
          active={activeTab === tab}
          onClick={() => onTabChange(tab)}
        />
      ))}
    </div>
  );
};

export default FilterTabs;