import React from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const NotificationToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
      {toasts.map((toast) => {
        const getIcon = () => {
          switch (toast.type) {
            case 'success':
              return <CheckCircle2 className="h-5 w-5 text-[#2F855A] shrink-0" />;
            case 'error':
              return <AlertCircle className="h-5 w-5 text-[#C53030] shrink-0" />;
            case 'warning':
              return <AlertTriangle className="h-5 w-5 text-[#B7791F] shrink-0" />;
            default:
              return <Info className="h-5 w-5 text-[#17A2B8] shrink-0" />;
          }
        };

        const getBorder = () => {
          switch (toast.type) {
            case 'success':
              return 'border-l-4 border-l-[#2F855A]';
            case 'error':
              return 'border-l-4 border-l-[#C53030]';
            case 'warning':
              return 'border-l-4 border-l-[#B7791F]';
            default:
              return 'border-l-4 border-l-[#17A2B8]';
          }
        };

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-lg border border-[#E2E8F0] ${getBorder()} animate-in slide-in-from-bottom-5 duration-200`}
          >
            <div className="flex items-center gap-3">
              {getIcon()}
              <p className="text-xs font-medium text-[#333333]">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-[#64748B] hover:text-[#333333] p-1 rounded-md hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
