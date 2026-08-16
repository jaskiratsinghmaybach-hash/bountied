"use client";

import { useEffect } from "react";

export function StickyHeaderWatcher() {
  useEffect(() => {
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
