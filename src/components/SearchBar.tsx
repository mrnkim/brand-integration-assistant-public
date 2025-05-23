import { FC, FormEvent, useRef, useState, useEffect } from 'react';

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
  const [inputValue, setInputValue] = useState(defaultValue);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (searchInputRef.current) {
      onSearch(searchInputRef.current.value);
    }
  };

  const handleSearchClear = () => {
    setInputValue('');
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
      searchInputRef.current.focus();
    }
    if (onClear) {
      onClear();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  // 초기 defaultValue가 변경되면 입력값도 업데이트
  useEffect(() => {
    setInputValue(defaultValue);
  }, [defaultValue]);

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="self-stretch h-14 px-3 bg-gray-200 rounded-2xl inline-flex justify-start items-center gap-2.5 overflow-hidden w-full">
        <div className="flex-1 self-stretch px-3 flex justify-start items-center gap-5">
          {/* 왼쪽 영역 - 검색 아이콘 */}
          <div className="flex justify-start items-center">
            <img src="/Union.svg" alt="Search" className="w-5 h-5 text-stone-900" />
          </div>

          {/* 입력 필드 */}
          <div className="flex-1 flex items-center relative">
            <input
              type="text" // search 대신 text 사용
              ref={searchInputRef}
              value={inputValue}
              onChange={handleInputChange}
              className="w-full bg-transparent border-none focus:outline-none text-stone-900 text-xl font-normal leading-7 tracking-tight placeholder-black pr-8"
              placeholder={placeholder}
            />

            {/* Custom X button - 검색어가 있을 때만 표시 */}
            {inputValue && (
              <button
                type="button"
                onClick={handleSearchClear}
                className="absolute right-0 flex items-center justify-center w-8 h-8 cursor-pointer"
              >
                <svg
                  className="w-5 h-5 text-stone-900" // 검정색으로 변경
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
};

export default SearchBar;