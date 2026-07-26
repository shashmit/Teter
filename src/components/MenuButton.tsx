'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

export interface MenuAction {
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  /** Short hint shown right-aligned, e.g. a supported file kind. */
  hint?: string;
}

interface MenuButtonProps {
  icon: React.ReactNode;
  label: string;
  actions: MenuAction[];
  disabled?: boolean;
  /** Anchors the menu to the button's right edge instead of its left. */
  align?: 'left' | 'right';
}

/**
 * Icon button that opens a dropdown menu.
 *
 * Unlike the ad-hoc dropdown in the file tree, this one is fully keyboard
 * operable: arrow keys move between items, Enter/Space activate, Escape closes
 * and returns focus to the trigger, and focus is moved into the menu on open.
 */
export default function MenuButton({
  icon,
  label,
  actions,
  disabled = false,
  align = 'right',
}: MenuButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const open = (index: number) => {
    setActiveIndex(index);
    setIsOpen(true);
  };

  // Dismiss on click or focus leaving the menu entirely.
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [isOpen, close]);

  // Move focus onto the active item so arrow keys and Escape work immediately.
  useEffect(() => {
    if (isOpen) itemRefs.current[activeIndex]?.focus();
  }, [isOpen, activeIndex]);

  const step = (delta: number) => {
    setActiveIndex(prev => (prev + delta + actions.length) % actions.length);
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      open(actions.length - 1);
    }
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        step(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        step(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(actions.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
    }
  };

  const select = (action: MenuAction) => {
    close(true);
    action.onSelect();
  };

  return (
    <div className="menu-button" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`btn btn-icon ${isOpen ? 'is-active' : ''}`}
        onClick={() => (isOpen ? close(false) : open(0))}
        onKeyDown={onTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={label}
        title={label}
      >
        {icon}
      </button>

      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`menu-panel align-${align}`}
          onKeyDown={onMenuKeyDown}
        >
          {actions.map((action, index) => (
            <button
              key={action.label}
              ref={node => { itemRefs.current[index] = node; }}
              type="button"
              role="menuitem"
              tabIndex={index === activeIndex ? 0 : -1}
              className={`menu-item ${action.danger ? 'danger' : ''}`}
              onClick={() => select(action)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="menu-item-icon">{action.icon}</span>
              <span className="menu-item-label">{action.label}</span>
              {action.hint && <span className="menu-item-hint">{action.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
