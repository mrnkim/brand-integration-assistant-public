"use client";

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
          <PlanCampaignForm />
        </div>
      </div>
    </div>
  );
}