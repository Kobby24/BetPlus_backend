"use client";

import { useEffect, type ReactNode } from "react";

export const managerPanelInputClass =
  "w-full rounded-md border border-border bg-white px-2.5 py-2 text-sm font-medium text-foreground outline-none focus:border-brand placeholder:text-muted";
export const managerPanelLabelClass = "text-[11px] font-medium text-muted";
export const managerPanelHintClass = "text-[10px] text-muted";

interface ManagerEditPopupProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function ManagerEditPopup({
  open,
  onClose,
  children,
}: ManagerEditPopupProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-1 shadow-2xl sm:rounded-2xl"
      >
        {children}
      </div>
    </div>
  );
}
