import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[transform,background,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(187,182,255,.42)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[rgba(255,255,255,.08)] text-[var(--text)] border border-[var(--line-purple)] hover:bg-[rgba(255,255,255,.13)]",
        glass: "border border-[var(--liquid-glass-edge)] bg-[var(--liquid-glass-fill)] text-[var(--text)] shadow-[var(--shadow)] backdrop-blur-xl hover:border-[var(--liquid-glass-edge-hot)]",
        ghost: "text-[var(--muted)] hover:bg-[rgba(255,255,255,.08)] hover:text-[var(--text)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
));
Button.displayName = "Button";
