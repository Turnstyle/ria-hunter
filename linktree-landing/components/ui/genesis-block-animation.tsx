"use client";

import React from 'react';
import { motion, Variants } from 'framer-motion';
import { Layers, Zap, Code, Cog, Plus, Share2, GitBranch, Puzzle } from 'lucide-react';

const iconVariants: Variants = {
  hidden: { opacity: 0, scale: 0.5, rotate: () => Math.random() * 180 - 90 },
  visible: (i: number) => ({
    opacity: 0.7,
    scale: 1,
    x: Math.random() * 100 - 50, // Spread them out a bit initially
    y: Math.random() * 100 - 50,
    rotate: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.5,
      type: 'spring',
      stiffness: 100,
    },
  }),
  coalesce: (i: number) => ({
    opacity: [0.7, 1, 0], // Fade in, then out as part of the main icon
    scale: [1, 1.2, 0.1],
    x: 0,
    y: 0,
    rotate: [0, Math.random() * 360, 0],
    transition: {
      delay: 1 + i * 0.03, // Stagger coalescence after initial visibility
      duration: 0.8,
      type: 'spring',
      stiffness: 120,
      opacity: { delay: 1 + i * 0.03 + 0.7, duration: 0.1 }, // Start fading out just before end
      scale: { delay: 1 + i * 0.03, duration: 0.8 },
    },
  }),
};

const mainIconVariants: Variants = {
  hidden: { opacity: 0, scale: 0.2, rotate: -90 },
  visible: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: {
      delay: 1.8, // After small icons coalesce
      type: 'spring',
      stiffness: 150,
      damping: 10,
      duration: 0.7,
    },
  },
  pulse: {
    scale: [1, 1.1, 1],
    filter: [
        "drop-shadow(0 0 8px #5eead4) drop-shadow(0 0 16px #14b8a6)",
        "drop-shadow(0 0 12px #5eead4) drop-shadow(0 0 24px #14b8a6)",
        "drop-shadow(0 0 8px #5eead4) drop-shadow(0 0 16px #14b8a6)",
    ],
    transition: {
      delay: 2.5, // Start pulsing after appearing
      duration: 2,
      repeat: Infinity,
      repeatType: 'mirror',
    },
  },
};

const particleIcons = [
  { key: "zap", icon: Zap, size: "h-4 w-4" },
  { key: "code", icon: Code, size: "h-5 w-5" },
  { key: "cog", icon: Cog, size: "h-4 w-4" },
  { key: "plus", icon: Plus, size: "h-3 w-3" },
  { key: "share", icon: Share2, size: "h-4 w-4" },
  { key: "branch", icon: GitBranch, size: "h-5 w-5" },
  { key: "puzzle", icon: Puzzle, size: "h-4 w-4" },
  { key: "zap2", icon: Zap, size: "h-3 w-3" },
  { key: "code2", icon: Code, size: "h-4 w-4" },
  { key: "cog2", icon: Cog, size: "h-5 w-5" },
];

const GenesisBlockAnimation: React.FC = () => {
  return (
    <div className="relative h-24 w-24 mx-auto mb-8 flex items-center justify-center">
      {particleIcons.map((item, i) => {
        const IconComponent = item.icon;
        return (
          <motion.div
            key={item.key}
            custom={i}
            variants={iconVariants}
            initial="hidden"
            animate={["visible", "coalesce"]}
            className="absolute text-app-foundation-accent-light"
            style={{ originX: '50%', originY: '50%' }}
          >
            <IconComponent className={item.size} />
          </motion.div>
        );
      })}
      <motion.div
        variants={mainIconVariants}
        initial="hidden"
        animate={["visible", "pulse"]}
        className="flex items-center justify-center"
      >
        <Layers className="h-20 w-20 text-app-foundation-accent-light" />
      </motion.div>
    </div>
  );
};

export default GenesisBlockAnimation; 