import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function CollapseChevron({
  collapsed,
  className = 'w-3 h-3',
}: {
  collapsed: boolean;
  className?: string;
}) {
  return (
    <ChevronDown
      aria-hidden="true"
      className={`${className} shrink-0 transition-transform duration-200 ease-out ${
        collapsed ? '-rotate-90 rtl:rotate-90' : 'rotate-0'
      }`}
    />
  );
}

export function CollapsibleBody({
  isOpen,
  children,
  className = '',
}: {
  isOpen: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden={!isOpen}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
        isOpen
          ? 'grid-rows-[1fr] opacity-100'
          : 'grid-rows-[0fr] opacity-0 pointer-events-none'
      } ${className}`}
    >
      <div className="overflow-hidden min-h-0">{children}</div>
    </div>
  );
}
