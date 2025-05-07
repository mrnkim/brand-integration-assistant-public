"use client";

import Sidebar from '@/components/Sidebar';

export default function Plan() {
  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <Sidebar activeMenu="plan" />

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <h1 className="text-2xl font-bold mb-4">Plan</h1>
        <p className="text-gray-500 text-center max-w-md">
          This page is under construction. Plan your campaign and get recommendations here.
        </p>
      </div>
    </div>
  );
}