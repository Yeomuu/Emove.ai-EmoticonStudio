import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type TouchEvent } from "react";
import { Icon } from "./Icon";

interface StepConfig {
  id: string;
  label: string;
  content: ReactNode;
  /** Returns null if valid, or a warning message string if incomplete */
  validate?: () => string | null;
}

interface ProgressItem {
  id: string;
  label: string;
  targetStep?: number;
}

interface ScrollSlideContainerProps {
  steps: StepConfig[];
  className?: string;
  currentStep?: number;
  onStepChange?: (index: number) => void;
  onComplete?: () => void;
  busy?: boolean;
  completeLabel?: string;
  busyLabel?: string;
  progressItems?: ProgressItem[];
  progressIndex?: number;
}

export function ScrollSlideContainer({
  steps,
  className = "",
  currentStep: propStep,
  onStepChange,
  onComplete,
  busy = false,
  completeLabel = "생성하기",
  busyLabel = "생성 중",
  progressItems,
  progressIndex,
}: ScrollSlideContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [localStep, setLocalStep] = useState(0);
  const currentStep = propStep !== undefined ? propStep : localStep;
  const displayedProgress = progressItems ?? steps.map((step, index) => ({ id: step.id, label: step.label, targetStep: index }));
  const activeProgressIndex = progressIndex ?? currentStep;
  const [warning, setWarning] = useState<{ message: string; stepIndex: number; targetIndex: number } | null>(null);
  const isScrolling = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const scrollToStep = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const slides = container.querySelectorAll<HTMLElement>(".scroll-slide");
    const target = slides[index];
    if (!target) return;
    isScrolling.current = true;
    if (propStep === undefined) {
      setLocalStep(index);
    }
    onStepChange?.(index);
    window.setTimeout(() => { isScrolling.current = false; }, 600);
  }, [propStep, onStepChange]);

  // Sync scroll positioning when propStep changes externally
  useEffect(() => {
    if (propStep !== undefined && propStep !== localStep) {
      setLocalStep(propStep);
      scrollToStep(propStep);
    }
  }, [propStep, scrollToStep]);

  const attemptNavigation = useCallback((targetIndex: number) => {
    if (busy) return;
    // Going forward: validate current step
    if (targetIndex > currentStep) {
      const step = steps[currentStep];
      const validationMessage = step?.validate?.();
      if (validationMessage) {
        setWarning({ message: validationMessage, stepIndex: currentStep, targetIndex });
        return;
      }
    }
    scrollToStep(targetIndex);
  }, [busy, currentStep, steps, scrollToStep]);

  const handleWheel = useCallback((event: WheelEvent) => {
    if (busy || isScrolling.current || warning) return;
    const delta = event.deltaY;
    if (Math.abs(delta) < 30) return;
    event.preventDefault();
    if (delta > 0 && currentStep < steps.length - 1) {
      attemptNavigation(currentStep + 1);
    } else if (delta < 0 && currentStep > 0) {
      attemptNavigation(currentStep - 1);
    }
  }, [busy, currentStep, steps.length, attemptNavigation, warning]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (busy || warning) return;
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault();
      if (currentStep < steps.length - 1) attemptNavigation(currentStep + 1);
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      if (currentStep > 0) attemptNavigation(currentStep - 1);
    }
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element
      ? event.target.closest("button, a, input, select, textarea, label, [role='button']")
      : null;
    if (target || event.touches.length !== 1) {
      touchStart.current = null;
      return;
    }
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || busy || warning || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaY) < 54 || Math.abs(deltaY) < Math.abs(deltaX) * 1.2) return;
    if (deltaY < 0 && currentStep < steps.length - 1) attemptNavigation(currentStep + 1);
    else if (deltaY > 0 && currentStep > 0) attemptNavigation(currentStep - 1);
  };

  const dismissWarning = () => setWarning(null);
  const forceAdvance = () => {
    if (!warning) return;
    scrollToStep(warning.targetIndex);
    setWarning(null);
  };

  return (
    <div
      className={`scroll-slide-container ${className}`}
      ref={containerRef}
      data-current-step={currentStep}
      aria-busy={busy}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Step indicator */}
      <nav className="scroll-slide-nav" aria-label="단계 탐색">
        {displayedProgress.map((step, index) => (
          <button
            key={step.id}
            type="button"
            className={`slide-nav-dot ${index === activeProgressIndex ? "active" : ""} ${index < activeProgressIndex ? "completed" : ""} ${step.targetStep === undefined ? "display-only" : ""}`}
            onClick={() => step.targetStep !== undefined && attemptNavigation(step.targetStep)}
            disabled={busy || step.targetStep === undefined}
            aria-label={`${step.label} 단계`}
            aria-current={index === activeProgressIndex ? "step" : undefined}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
          </button>
        ))}
      </nav>

      {/* Slides */}
      {steps.map((step, index) => (
        <section
          key={step.id}
          className={`scroll-slide ${index === currentStep ? "is-active" : index < currentStep ? "is-before" : "is-after"}`}
          data-step={index}
          aria-hidden={index !== currentStep}
        >
          {step.content}
        </section>
      ))}

      {/* Step footer with navigation buttons */}
      <div className="scroll-slide-footer">
        <button
          type="button"
          className="slide-prev-button"
          onClick={() => attemptNavigation(currentStep - 1)}
          disabled={busy || currentStep === 0}
        >
          <Icon name="previous" size={16} />
          이전 단계
        </button>
        <span className="slide-step-label">{steps[currentStep]?.label}</span>
        {currentStep === steps.length - 1 ? (
          <button
            type="button"
            className="slide-next-button complete-button"
            onClick={onComplete}
            disabled={busy}
          >
            {busy ? busyLabel : completeLabel}
            <Icon name="star" size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="slide-next-button"
            onClick={() => attemptNavigation(currentStep + 1)}
            disabled={busy}
          >
            다음 단계
            <Icon name="next" size={16} />
          </button>
        )}
      </div>

      {/* Incomplete step warning dialog */}
      {warning ? (
        <div className="slide-warning-overlay" role="alertdialog" aria-modal="true">
          <div className="slide-warning-dialog glass-panel">
            <Icon name="star" size={28} />
            <h3>이 단계가 완료되지 않았습니다</h3>
            <p>{warning.message}</p>
            <div className="slide-warning-actions">
              <button type="button" className="warning-stay" onClick={dismissWarning}>
                <Icon name="edit" size={14} />
                이어서 채우기
              </button>
              <button type="button" className="warning-continue" onClick={forceAdvance}>
                <Icon name="next" size={14} />
                계속 진행
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
