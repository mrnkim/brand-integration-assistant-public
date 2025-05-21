import { FC, FormEvent, useRef, useEffect } from 'react';

type SearchBarProps = {
  onSearch: (query: string) => void;
  placeholder?: string;
  defaultValue?: string;
  onClear?: () => void;
};

const SearchBar: FC<SearchBarProps> = ({
  onSearch,
  placeholder = 'What are you looking for?',
  defaultValue = '',
  onClear
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (searchInputRef.current) {
      onSearch(searchInputRef.current.value);
    }
  };

  const handleSearchClear = () => {
    if (onClear) {
      onClear();
    }
  };

  useEffect(() => {
    const searchInput = searchInputRef.current;
    if (searchInput) {
      searchInput.addEventListener('search', (e) => {
        if ((e.target as HTMLInputElement).value === '') {
          handleSearchClear();
        }
      });
    }

    return () => {
      if (searchInput) {
        searchInput.removeEventListener('search', () => {});
      }
    };
  }, [onClear]);

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="self-stretch h-14 px-3 bg-gray-200 rounded-2xl inline-flex justify-start items-center gap-2.5 overflow-hidden w-full">
        <div className="flex-1 self-stretch px-3 flex justify-start items-center gap-5">
          {/* 왼쪽 영역 */}
          <div className="flex justify-start items-center">
            <img src="/Union.svg" alt="Search" className="w-5 h-5 text-stone-900" />
          </div>

          {/* 입력 필드 */}
          <input
            type="search"
            ref={searchInputRef}
            defaultValue={defaultValue}
            className="flex-1 bg-transparent border-none focus:outline-none text-stone-900 text-xl font-normal leading-7 tracking-tight placeholder-black"
            placeholder={placeholder}
          />
        </div>
      </div>
    </form>
  );
};

export default SearchBar;