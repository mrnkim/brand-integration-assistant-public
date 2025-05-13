"use client";

import { useState } from 'react';
import PlanCampaignForm from '@/components/PlanCampaignForm';
import Sidebar from '@/components/Sidebar';

export default function Plan() {
  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <Sidebar activeMenu="plan" />

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <h1 className="text-2xl font-bold mb-6">Plan Campaign</h1>
          <p className="mb-6 text-gray-600">
            Create a new campaign by defining keywords for each category.
            The system will check for video embeddings in Snowflake and generate them if needed.
          </p>
          <PlanCampaignForm />
        </div>
      </div>
    </div>
  );
}