import { FC } from 'react';

type VideoPlayerProps = {
  url: string;
  title: string;
  poster?: string;
};

// Placeholder VideoPlayer component that will be replaced by the actual implementation
const VideoPlayer: FC<VideoPlayerProps> = ({ url, title, poster }) => {
  return (
    <div className="flex flex-col">
      <div className="w-full h-36 md:h-48 lg:h-64 bg-gray-200 relative rounded-md overflow-hidden">
        {poster && (
          <img
            src={poster}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            aria-label="Play video"
            className="w-12 h-12 bg-white/80 rounded-full flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mt-2 font-medium">{title}</div>
    </div>
  );
};

export default VideoPlayer;