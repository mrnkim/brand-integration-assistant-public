"use client";

import Sidebar from '@/components/Sidebar';

export default function AdsLibrary() {
  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <Sidebar activeMenu="ads-library" />

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <h1 className="text-2xl font-bold mb-4">Ads Library</h1>
        <p className="text-gray-500 text-center max-w-md">
          This page is under construction. Please check back later.
        </p>
      </div>
    </div>
  );
}