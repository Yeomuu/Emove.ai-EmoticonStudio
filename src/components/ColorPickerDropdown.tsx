import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import {
  COLOR_PICKER_SWATCHES,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  normalizePickerHex,
  rgbToHex,
  type RgbColor,
} from "../services/color-picker";

type PickerTab = "default" | "custom";

interface ColorPickerDropdownProps {
  value: string;
  onChange: (color: string) => void;
  ariaLabel: string;
  colors?: readonly string[];
  className?: string;
}

export function ColorPickerDropdown({
  value,
  onChange,
  ariaLabel,
  colors = COLOR_PICKER_SWATCHES,
  className = "",
}: ColorPickerDropdownProps) {
  const normalizedValue = normalizePickerHex(value) ?? "#BBB6FF";
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PickerTab>("default");
  const [draft, setDraft] = useState(normalizedValue);
  const [hexInput, setHexInput] = useState(normalizedValue);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hsv = useMemo(() => hexToHsv(draft), [draft]);
  const rgb = useMemo(() => hexToRgb(draft), [draft]);

  const updateDraft = (next: string) => {
    const normalized = normalizePickerHex(next);
    if (!normalized) return;
    setDraft(normalized);
    setHexInput(normalized);
  };

  const closeWithoutCommit = () => {
    setDraft(normalizedValue);
    setHexInput(normalizedValue);
    setOpen(false);
  };

  const openMenu = () => {
    setDraft(normalizedValue);
    setHexInput(normalizedValue);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = popoverRef.current?.offsetWidth ?? 222;
      const height = popoverRef.current?.offsetHeight ?? (tab === "custom" ? 303 : 234);
      const gap = 8;
      const margin = 12;
      const left = Math.min(window.innerWidth - width - margin, Math.max(margin, rect.left));
      const below = rect.bottom + gap;
      const top = below + height <= window.innerHeight - margin
        ? below
        : Math.max(margin, rect.top - height - gap);
      setPosition({ left, top });
    };
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (triggerRef.current?.contains(target) || popoverRef.current?.contains(target))) return;
      closeWithoutCommit();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeWithoutCommit();
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, normalizedValue]);

  const setRgbChannel = (channel: keyof RgbColor, rawValue: string) => {
    const nextValue = Math.min(255, Math.max(0, Number.parseInt(rawValue || "0", 10) || 0));
    updateDraft(rgbToHex({ ...rgb, [channel]: nextValue }));
  };

  const updateSaturationValue = (clientX: number, clientY: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const saturation = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const brightness = Math.min(100, Math.max(0, (1 - (clientY - rect.top) / rect.height) * 100));
    updateDraft(hsvToHex({ h: hsv.h, s: saturation, v: brightness }));
  };

  const handleSaturationPointer = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    updateSaturationValue(event.clientX, event.clientY, element);
    const move = (next: globalThis.PointerEvent) => updateSaturationValue(next.clientX, next.clientY, element);
    const finish = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", finish);
      element.removeEventListener("pointercancel", finish);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", finish);
    element.addEventListener("pointercancel", finish);
  };

  const handleSaturationKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    let next = hsv;
    if (event.key === "ArrowLeft") next = { ...hsv, s: hsv.s - step };
    else if (event.key === "ArrowRight") next = { ...hsv, s: hsv.s + step };
    else if (event.key === "ArrowUp") next = { ...hsv, v: hsv.v + step };
    else if (event.key === "ArrowDown") next = { ...hsv, v: hsv.v - step };
    else return;
    event.preventDefault();
    updateDraft(hsvToHex(next));
  };

  const popover = open ? (
    <div
      ref={popoverRef}
      className="color-picker-popover"
      data-tab={tab}
      role="dialog"
      aria-label={`${ariaLabel} 메뉴`}
      style={{ left: position.left, top: position.top }}
    >
      <div className="color-picker-tabs" role="tablist" aria-label="색상 선택 방식">
        <button type="button" role="tab" aria-selected={tab === "default"} className={tab === "default" ? "active" : ""} onClick={() => setTab("default")}>Default</button>
        <button type="button" role="tab" aria-selected={tab === "custom"} className={tab === "custom" ? "active" : ""} onClick={() => setTab("custom")}>Custom</button>
      </div>

      {tab === "default" ? (
        <div className="color-picker-swatches" aria-label="기본 색상">
          {colors.map((color) => {
            const normalized = normalizePickerHex(color) ?? color;
            return (
              <button
                key={color}
                type="button"
                className={normalized === draft ? "selected" : ""}
                style={{ "--color-picker-swatch": normalized } as CSSProperties}
                aria-label={`${normalized} 선택`}
                aria-pressed={normalized === draft}
                onClick={() => updateDraft(normalized)}
              />
            );
          })}
        </div>
      ) : (
        <div className="color-picker-custom">
          <div
            className="color-picker-saturation"
            role="slider"
            tabIndex={0}
            aria-label="채도와 명도"
            aria-valuetext={`채도 ${Math.round(hsv.s)}%, 명도 ${Math.round(hsv.v)}%`}
            style={{ "--color-picker-hue": hsvToHex({ h: hsv.h, s: 100, v: 100 }) } as CSSProperties}
            onPointerDown={handleSaturationPointer}
            onKeyDown={handleSaturationKey}
          >
            <i style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }} />
          </div>
          <div className="color-picker-hue-row">
            <input
              type="range"
              min="0"
              max="359"
              value={Math.round(hsv.h)}
              aria-label="색조"
              onChange={(event) => updateDraft(hsvToHex({ ...hsv, h: Number(event.currentTarget.value) }))}
            />
            <i style={{ "--color-picker-swatch": draft } as CSSProperties} aria-hidden="true" />
          </div>
          <div className="color-picker-fields">
            <label className="color-picker-hex-field">
              <span>HEX</span>
              <input
                value={hexInput}
                maxLength={7}
                spellCheck={false}
                aria-label="HEX 색상 코드"
                onChange={(event) => {
                  const next = event.currentTarget.value.toUpperCase();
                  setHexInput(next);
                  const normalized = normalizePickerHex(next);
                  if (normalized) setDraft(normalized);
                }}
                onBlur={() => setHexInput(draft)}
              />
            </label>
            {(["r", "g", "b"] as const).map((channel) => (
              <label key={channel}>
                <span>{channel.toUpperCase()}</span>
                <input
                  type="number"
                  min="0"
                  max="255"
                  value={rgb[channel]}
                  aria-label={`${channel.toUpperCase()} 색상 값`}
                  onChange={(event) => setRgbChannel(channel, event.currentTarget.value)}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="color-picker-actions">
        <button type="button" onClick={closeWithoutCommit}>취소</button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            onChange(draft);
            setOpen(false);
            triggerRef.current?.focus();
          }}
        >선택</button>
      </div>
    </div>
  ) : null;

  return (
    <span className={`color-picker-dropdown ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="color-picker-trigger"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={normalizedValue}
        onClick={() => (open ? closeWithoutCommit() : openMenu())}
      >
        <i className="color-picker-trigger-swatch" style={{ "--color-picker-swatch": normalizedValue } as CSSProperties} aria-hidden="true" />
        <Icon name="next" size={16} className="color-picker-chevron" />
      </button>
      {typeof document !== "undefined" && popover ? createPortal(popover, document.body) : null}
    </span>
  );
}
