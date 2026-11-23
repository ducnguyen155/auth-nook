import { useId, useRef } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from './Button.tsx';

interface ItemActionsMenuProps {
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Compact `...` popover action panel housing Edit and Delete actions to save space
 * and prevent accidental clicks, using the native Popover API and CSS Anchor Positioning.
 */
export function ItemActionsMenu({ onEdit, onDelete }: ItemActionsMenuProps) {
  const menuId = useId();
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const hidePopover = () => {
    const el = popoverRef.current as (HTMLDivElement & { hidePopover?: () => void }) | null;
    el?.hidePopover?.();
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        popoverTarget={menuId}
        aria-label="More actions"
        title="More actions"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>

      <div
        ref={popoverRef}
        id={menuId}
        popover="auto"
        className="authnook-action-popover w-32 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      >
        <button
          type="button"
          onClick={() => {
            hidePopover();
            onEdit();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            hidePopover();
            onDelete();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-500 dark:text-red-400 dark:hover:bg-red-950/50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Delete
        </button>
      </div>
    </div>
  );
}
