import React from 'react';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { NotificationToastContainer } from '../common/NotificationToast';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#333333] font-sans flex flex-col">
      <Sidebar />
      <div className="flex flex-1 flex-col lg:pl-[280px] transition-all duration-300">
        <TopHeader />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
      <NotificationToastContainer />
    </div>
  );
};
