import { FC } from 'react';

type ActionButtonsProps = {
  onUpload?: () => void;
  onFilter?: () => void;
};

const ActionButtons: FC<ActionButtonsProps> = ({
  onUpload = () => {},
  onFilter = () => {}
}) => {
  return (
    <div className="flex space-x-5">
      <button
        onClick={onUpload}
        className="flex items-center justify-center p-2 rounded-md border border-gray-300 hover:bg-gray-100 transition-colors"
        aria-label="Upload"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
        </svg>
      </button>

      <button
        onClick={onFilter}
        className="flex items-center justify-center p-2 rounded-md border border-gray-300 hover:bg-gray-100 transition-colors"
        aria-label="Filter"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
        </svg>
      </button>
    </div>
  );
};

export default ActionButtons;