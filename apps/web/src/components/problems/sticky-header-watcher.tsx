"use client";

import { useLayoutEffect } from "react";

/**
 * Measures the page's .sticky-header element and publishes its real
 * height as --header-height, so any sticky element anchored to
 * `top: var(--header-height, <fallback>)` sits flush against it with no
 * gap. Fallback values differ per page (edit/page.tsx, [id]/page.tsx,
 * wallet/page.tsx each set their own) because each page's header has a
 * different real height — the fallback only matters for the first paint
 * before this effect runs, so it should be set to that page's actual
 * measured height, not copy-pasted from elsewhere.
 *
 * Runs in useLayoutEffect, not useEffect: useEffect fires after the
 * browser paints, so a first-paint frame would render with the fallback
 * value even when it's wrong for this page, producing a visible one-frame
 * gap where scrolled content shows through between the sticky header and
 * whatever is anchored below it. useLayoutEffect runs synchronously
 * before paint, so the correct height is committed before anything is
 * ever shown on screen.
 */
export function StickyHeaderWatcher() {
  useLayoutEffect(() => {
    const updateHeight = () => {
      const header = document.querySelector(".sticky-header");
      if (header instanceof HTMLElement) {
        document.documentElement.style.setProperty(
          "--header-height",
          `${header.offsetHeight}px`
        );
      }
    };

    updateHeight();

    const header = document.querySelector(".sticky-header");
    let observer: ResizeObserver | null = null;
    if (header) {
      observer = new ResizeObserver(updateHeight);
      observer.observe(header);
    }

    window.addEventListener("resize", updateHeight);

    return () => {
      window.removeEventListener("resize", updateHeight);
      if (observer) {
        observer.disconnect();
      }
    };
  }, []);

  return null;
}
