"use client";

import { usePathname, useRouter } from "next/navigation";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { useLabTransition } from "./TransitionProvider";

type PageTransitionLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
};

export function PageTransitionLink({ children, href, onClick, ...props }: PageTransitionLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { startRouteTransition } = useLabTransition();
  const target = href;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      props.target === "_blank" ||
      target.startsWith("#")
    ) return;

    event.preventDefault();
    if (target === pathname) return;
    startRouteTransition(() => router.push(target));
  };

  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}
