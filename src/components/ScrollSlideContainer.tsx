import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

interface StepConfig {
  id: string;
  label: string;
  content: ReactNode;
  /** Returns null if valid, or a warning message string if incomplete */
  validate?: () => string | null;
}

interface ScrollSlideContainerProps {
  steps: StepConfig[];
  className?: string;
  currentStep?: number;
  onStepChange?: (index: number) => void;
}

export function ScrollSlideContainer({ steps, className = "", currentStep: propStep, onStepChange }: ScrollSlideContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [localStep, setLocalStep] = useState(0);
  const currentStep = propStep !== undefined ? propStep : localStep;
  const [warning, setWarning] = useState<{ message: string; stepIndex: number; targetIndex: number } | null>(null);
  const isScrolling = useRef(false);

  const scrollToStep = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const slides = container.querySelectorAll<HTMLElement>(".scroll-slide");
    const target = slides[index];
    if (!target) return;
    isScrolling.current = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
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
  }, [currentStep, steps, scrollToStep]);

  const handleWheel = useCallback((event: WheelEvent) => {
    if (isScrolling.current || warning) return;
    const delta = event.deltaY;
    if (Math.abs(delta) < 30) return;
    event.preventDefault();
    if (delta > 0 && currentStep < steps.length - 1) {
      attemptNavigation(currentStep + 1);
    } else if (delta < 0 && currentStep > 0) {
      attemptNavigation(currentStep - 1);
    }
  }, [currentStep, steps.length, attemptNavigation, warning]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const dismissWarning = () => setWarning(null);
  const forceAdvance = () => {
    if (!warning) return;
    scrollToStep(warning.targetIndex);
    setWarning(null);
  };

  return (
    <div className={`scroll-slide-container ${className}`} ref={containerRef}>
      {/* Step indicator */}
      <nav className="scroll-slide-nav" aria-label="단계 탐색">
        {steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            className={`slide-nav-dot ${index === currentStep ? "active" : ""} ${index < currentStep ? "completed" : ""}`}
            onClick={() => attemptNavigation(index)}
            aria-label={`${step.label} (${index + 1}/${steps.length})`}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
          </button>
        ))}
      </nav>

      {/* Slides */}
      {steps.map((step, index) => (
        <section
          key={step.id}
          className={`scroll-slide ${index === currentStep ? "is-active" : ""}`}
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
          disabled={currentStep === 0}
        >
          <Icon name="previous" size={16} />
          이전 단계
        </button>
        <span className="slide-step-label">{steps[currentStep]?.label}</span>
        <button
          type="button"
          className="slide-next-button"
          onClick={() => attemptNavigation(currentStep + 1)}
          disabled={currentStep === steps.length - 1}
        >
          다음 단계
          <Icon name="next" size={16} />
        </button>
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
