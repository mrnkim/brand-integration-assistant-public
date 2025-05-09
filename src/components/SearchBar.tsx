import { FC, ChangeEvent, FormEvent, useRef } from 'react';

type SearchBarProps = {
  onSearch: (query: string) => void;
  placeholder?: string;
  defaultValue?: string;
};

const SearchBar: FC<SearchBarProps> = ({
  onSearch,
  placeholder = 'What are you looking for?',
  defaultValue = ''
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (searchInputRef.current) {
      onSearch(searchInputRef.current.value);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <button
        type="submit"
        className="absolute inset-y-0 left-0 flex items-center pl-3 cursor-pointer"
        aria-label="Search"
      >
        <svg className="w-4 h-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
          <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
        </svg>
      </button>
      <input
        type="search"
        ref={searchInputRef}
        defaultValue={defaultValue}
        className="block w-full p-4 pl-10 text-sm text-gray-900 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        placeholder={placeholder}
      />
    </form>
  );
};

export default SearchBar;