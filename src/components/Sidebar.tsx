import { FC } from 'react';
import Link from 'next/link';

type MenuItemProps = {
  title: string;
  description: string;
  href: string;
  isActive?: boolean;
};

const MenuItem: FC<MenuItemProps> = ({ title, description, href, isActive = false }) => {
  return (
    <Link
      href={href}
      className={`block p-4 rounded-lg mb-2 transition-colors ${
        isActive
          ? 'bg-white shadow-sm'
          : 'hover:bg-gray-100'
      }`}
    >
      <div className="font-medium text-gray-800">{title}</div>
      <div className="text-xs text-gray-500">{description}</div>
    </Link>
  );
};

type SidebarProps = {
  activeMenu: 'content-library' | 'ads-library' | 'plan';
};

// 메뉴 아이템 설정
const menuConfig = [
  {
    id: 'content-library',
    title: 'Content Library',
    description: 'Filter / search content',
    href: '/content-library'
  },
  {
    id: 'ads-library',
    title: 'Ads Library',
    description: 'Filter / search ads',
    href: '/ads-library'
  },
  {
    id: 'plan',
    title: 'Plan',
    description: 'Plan your campaign and get recommendations',
    href: '/plan'
  }
];

const Sidebar: FC<SidebarProps> = ({ activeMenu }) => {
  return (
    <div className="w-64 bg-gray-200 h-screen p-4 flex flex-col">
      <div className="text-xl font-bold mb-6 pl-2">Brand Integration Assistant</div>

      <nav className="flex-1">
        {menuConfig.map(item => (
          <MenuItem
            key={item.id}
            title={item.title}
            description={item.description}
            href={item.href}
            isActive={activeMenu === item.id}
          />
        ))}
      </nav>
    </div>
  );
};

export default Sidebar;