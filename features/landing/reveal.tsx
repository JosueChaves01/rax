"use client";

import { motion, MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/** Aparición suave al entrar en pantalla. Respeta «reducir movimiento» del sistema. */
export function Reveal({ children, delay = 0, className, y = 24 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        initial={{ opacity: 0, y }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

/** Tarjeta flotante del hero, con un leve vaivén. */
export function Float({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: [0, -6, 0], scale: 1 }}
        transition={{
          opacity: { duration: 0.6, delay },
          scale: { duration: 0.6, delay },
          y: { duration: 5, repeat: Infinity, ease: "easeInOut", delay: delay + 0.6 },
        }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
