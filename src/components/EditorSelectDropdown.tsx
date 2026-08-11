import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export interface EditorSelectOption<T extends string> {
  value: T;
  label: string;
  fontFamily?: string;
  previewClassName?: string;
}

interface EditorSelectDropdownProps<T extends string> {
  value: T;
  options: readonly EditorSelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

export function EditorSelectDropdown<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
}: EditorSelectDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 224 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const height = popoverRef.current?.offsetHeight ?? options.length * 44 + 16;
      const gap = 8;
      const margin = 12;
      const width = Math.max(189, rect.width);
      const left = Math.min(window.innerWidth - width - margin, Math.max(margin, rect.left));
      const below = rect.bottom + gap;
      const top = below + height <= window.innerHeight - margin
        ? below
        : Math.max(margin, rect.top - height - gap);
      setPosition({ left, top, width });
    };
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const close = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (triggerRef.current?.contains(target) || popoverRef.current?.contains(target))) return;
      setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const popover = open ? (
    <div
      ref={popoverRef}
      className="editor-select-popover"
      role="listbox"
      aria-label={`${ariaLabel} 목록`}
      style={{ left: position.left, top: position.top, width: position.width }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={option.value === value}
          className={option.value === value ? "active" : ""}
          style={option.fontFamily ? { "--editor-option-font": option.fontFamily } as CSSProperties : undefined}
          onClick={() => {
            onChange(option.value);
            setOpen(false);
            triggerRef.current?.focus();
          }}
        >
          <span>{option.label}</span>
          {option.previewClassName ? <i className={`editor-shape-preview ${option.previewClassName}`} aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <span className={`editor-select-dropdown ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="editor-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span style={selected?.fontFamily ? { "--editor-option-font": selected.fontFamily } as CSSProperties : undefined}>{selected?.label}</span>
        {selected?.previewClassName ? <i className={`editor-shape-preview ${selected.previewClassName}`} aria-hidden="true" /> : null}
        <Icon name="next" size={15} />
      </button>
      {typeof document !== "undefined" && popover ? createPortal(popover, document.body) : null}
    </span>
  );
}
