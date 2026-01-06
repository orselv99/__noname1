import { useState, useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PortalDropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  align?: 'left' | 'right';
  className?: string;
}

export const PortalDropdown = ({
  trigger,
  children,
  isOpen: controlledIsOpen,
  onOpenChange,
  align = 'left',
  className = ''
}: PortalDropdownProps) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const isControlled = controlledIsOpen !== undefined;
  const show = isControlled ? controlledIsOpen : internalIsOpen;

  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) {
      setInternalIsOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  };

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const estimatedHeight = 200; // Estimated max height of dropdown
      const openUpwards = spaceBelow < estimatedHeight;

      // Calculate left position
      let left = rect.left;
      if (align === 'right') {
        left = rect.right - 140; // Approximate width or adjust after render? 
        // Better to target the right edge alignment if possible, but absolute positioning makes "right: 0" hard relative to trigger without more complex css.
        // mimicking the logic from departments page:
        // left: Math.max(10, rect.right - 140)
        // Let's use the explicit align prop logic
      }

      // Fine-tuning based on departments logic
      if (align === 'right') {
        // Assuming width ~140px for safety, can be adjusted by CSS
        left = rect.right - 140;
      }

      setPosition({
        top: openUpwards ? rect.top - estimatedHeight : rect.bottom + 4,
        left: Math.max(10, left),
      });

      // If we could measure the content *before* positioning, that'd be better, but for now this mimics the reference.
    }
  };

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!show) {
      updatePosition();
    }
    handleOpenChange(!show);
  };

  useEffect(() => {
    if (show) {
      const handleScroll = () => handleOpenChange(false);
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node;
        if (
          triggerRef.current && !triggerRef.current.contains(target) &&
          contentRef.current && !contentRef.current.contains(target)
        ) {
          handleOpenChange(false);
        }
      };

      window.addEventListener('scroll', handleScroll, true);
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('resize', handleScroll);

      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('resize', handleScroll);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  return (
    <>
      <div
        ref={triggerRef}
        onClick={toggle}
        className={`inline-block cursor-pointer ${className}`}
      >
        {trigger}
      </div>

      {show && createPortal(
        <div
          ref={contentRef}
          style={{
            position: 'fixed',
            top: position.top,
            // If opening upwards, we might need adjustments if we don't know exact height. 
            // The reference used explicit calculation `rect.top - height + 15`. 
            // For a generic component, render first then Position? OR just use bottom-aligned logic with CSS transforms?
            // Simplest: just use the calculations.
            left: position.left,
            zIndex: 99999,
          }}
          className="min-w-[140px]"
        >
          {children}
        </div>,
        document.body
      )}
    </>
  );
};
