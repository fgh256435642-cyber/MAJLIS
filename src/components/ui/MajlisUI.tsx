import type { ReactElement, ReactNode } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useAuth } from '../../hooks/useAuth';

export function MajlisTooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={220} skipDelayDuration={120}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function MajlisTooltip({
  content,
  side = 'top',
  align = 'center',
  sideOffset = 8,
  children,
}: {
  content?: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  children: ReactElement;
}) {
  const { language } = useAuth();
  if (!content) return children;

  const isRtl = language === 'ar';

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={8}
          dir={isRtl ? 'rtl' : 'ltr'}
          className="majlis-floating-motion z-[70] max-w-xs rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-text shadow-xl select-none pointer-events-none"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-elevated" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const MajlisPopover = PopoverPrimitive.Root;
export const MajlisPopoverTrigger = PopoverPrimitive.Trigger;
export const MajlisPopoverAnchor = PopoverPrimitive.Anchor;

export function MajlisPopoverContent({
  children,
  side = 'bottom',
  align = 'start',
  sideOffset = 6,
  collisionPadding = 8,
  onOpenAutoFocus,
  className = '',
}: {
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  collisionPadding?: number;
  onOpenAutoFocus?: (event: Event) => void;
  className?: string;
}) {
  const { language } = useAuth();
  const isRtl = language === 'ar';

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        onOpenAutoFocus={onOpenAutoFocus}
        dir={isRtl ? 'rtl' : 'ltr'}
        className={`majlis-floating-motion z-[60] outline-accent ${className}`}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
