import { FC } from 'react';
import Link from 'next/link';

type MenuItemProps = {
  title: string;
  href: string;
  isActive?: boolean;
};

const MenuItem: FC<MenuItemProps> = ({ title, href, isActive = false }) => {
  return (
    <Link
      href={href}
      className={`block p-4 rounded-lg mb-2 transition-colors ${
        isActive
          ? 'bg-gray-500'
          : 'hover:bg-gray-300'
      }`}
    >
      <div className={`font-medium`}>{title}</div>
    </Link>
  );
};

type SidebarProps = {
  activeMenu: 'ads-library' | 'contextual-analysis';
};

const menuConfig = [
  {
    id: 'ads-library',
    title: 'Ads Library',
    href: '/ads-library'
  },
  {
    id: 'contextual-analysis',
    title: 'Contextual Alignment Analysis',
    href: '/contextual-analysis'
  }
];

const Sidebar: FC<SidebarProps> = ({ activeMenu }) => {
  return (
    <div className="w-54 bg-zinc-100 h-screen fixed left-0 top-0 p-4 flex flex-col z-[100]">
      <div className="text-xl font-bold mb-6 pl-2">Brand Integration Assistant and Ad Break Finder</div>

      <nav className="flex-1">
        {menuConfig.map(item => (
          <MenuItem
            key={item.id}
            title={item.title}
            href={item.href}
            isActive={activeMenu === item.id}
          />
        ))}
      </nav>
    </div>
  );
};

export default Sidebar;