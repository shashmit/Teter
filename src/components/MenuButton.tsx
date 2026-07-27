'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

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
  /**
   * Use `fixed` inside a scrolling/clipping ancestor, where an absolutely
   * positioned panel would be cut off. Fixed panels close on scroll rather than
   * chasing the anchor.
   */
  strategy?: 'absolute' | 'fixed';
  /** Extra classes for the trigger, e.g. to reveal it only on row hover. */
  triggerClassName?: string;
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
  strategy = 'absolute',
  triggerClassName = '',
}: MenuButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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

  /*
   * Move focus onto the active item so arrow keys and Escape work immediately.
   * `preventScroll` matters: inside a scrolling list, focus would scroll the row
   * into view and shift the trigger out from under the just-positioned panel.
   */
  useEffect(() => {
    if (isOpen) itemRefs.current[activeIndex]?.focus({ preventScroll: true });
  }, [isOpen, activeIndex]);

  /*
   * Fixed panels are positioned from the trigger's viewport rect. Written
   * straight to the node rather than through state: this is a measure-then-place
   * pass, and useLayoutEffect runs before paint so nothing flashes.
   */
  useLayoutEffect(() => {
    if (!isOpen || strategy !== 'fixed') return;

    const panel = panelRef.current;
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!panel || !trigger) return;

    /*
     * Park at the origin before measuring. The panel is shrink-to-fit, so its
     * width depends on the space available where it currently sits; measured at
     * its static position it can report `min-width` and then grow once moved.
     */
    panel.style.top = '0px';
    panel.style.left = '0px';
    const { offsetWidth: panelWidth, offsetHeight: panelHeight } = panel;
    const margin = 8;

    /*
     * Only `top` and `left` are ever assigned. Setting `bottom` to flip upward
     * would leave the stylesheet's `top` in force too, and an element with both
     * set stretches between them instead of sizing to its content.
     */
    let top = trigger.bottom + 4;
    if (top + panelHeight + margin > window.innerHeight) {
      const above = trigger.top - panelHeight - 4;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - panelHeight - margin);
    }

    let left = align === 'right' ? trigger.right - panelWidth : trigger.left;
    left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - panelWidth - margin));

    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
    panel.style.visibility = 'visible';
  }, [isOpen, strategy, align]);

  // The anchor moves with its scroll container, so dismiss instead of chasing.
  useEffect(() => {
    if (!isOpen || strategy !== 'fixed') return;

    const dismiss = () => close(false);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [isOpen, strategy, close]);

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
        className={`btn btn-icon ${triggerClassName} ${isOpen ? 'is-active' : ''}`}
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
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={`menu-panel align-${align} ${strategy === 'fixed' ? 'is-fixed' : ''}`}
          style={strategy === 'fixed' ? { visibility: 'hidden' } : undefined}
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
