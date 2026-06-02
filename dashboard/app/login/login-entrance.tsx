"use client";

import { motion } from "framer-motion";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const item = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  show:   { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const } },
};

export function LoginEntrance({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex w-full max-w-sm flex-col items-center gap-8 rounded-md border border-border bg-surface p-10"
    >
      {children}
    </motion.div>
  );
}

export function LoginItem({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={item} className="flex flex-col items-center gap-3 text-center">
      {children}
    </motion.div>
  );
}
