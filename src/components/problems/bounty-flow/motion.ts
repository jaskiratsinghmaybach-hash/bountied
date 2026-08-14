/** Shared framer-motion presets for the bounty creation flow (§1). */
export const flowEase = [0.16, 1, 0.3, 1] as const;

export const flowTransition = {
  duration: 0.35,
  ease: flowEase,
} as const;

export const flowEnter = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: flowTransition,
} as const;
