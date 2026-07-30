import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  type = 'danger',
}) => {
  const isDanger = type === 'danger';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="md">
      <div className="flex gap-4 items-start">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            isDanger ? 'bg-[#C53030]/10 text-[#C53030]' : 'bg-[#B7791F]/10 text-[#B7791F]'
          }`}
        >
          {isDanger ? <AlertTriangle className="h-5 w-5" /> : <Info className="h-5 w-5" />}
        </div>
        <div>
          <p className="text-sm text-[#64748B]">{message}</p>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
        <button
          onClick={onClose}
          className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#333333] hover:bg-slate-50 transition-colors"
        >
          {cancelText}
        </button>
        <button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
            isDanger ? 'bg-[#C53030] hover:bg-[#a12424]' : 'bg-[#800020] hover:bg-[#5F0018]'
          }`}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
};
