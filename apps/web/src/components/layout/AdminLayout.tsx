import React, { useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { TopHeader } from './TopHeader';

interface AdminLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ title, subtitle, children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="admin-shell min-h-screen flex bg-[#FAF8F2] text-[#181611]">
      <AppSidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopHeader title={title} subtitle={subtitle} onOpenMenu={() => setMobileOpen(true)} />
        <main className="flex-1 w-full px-4 sm:px-6 py-5 space-y-5">{children}</main>
      </div>
    </div>
  );
};
