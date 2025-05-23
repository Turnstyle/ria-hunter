"use client";

import React from 'react';
import { motion } from 'framer-motion';
// Corrected and reduced icon list for simplicity and to ensure they exist
import { Archive, Box, Component, Package, SquareStack, ToyBrick, Layers, Database, Code2, Blocks, Palette, ServerCog, Settings2, Shapes, ShieldCheck, TerminalSquare, Workflow, GitBranch, Puzzle, Zap, Plus, Share2 } from 'lucide-react'; 

const icons = [
  <SquareStack key={1} />, <Box key={2} />, <Archive key={3} />, <Component key={4} />, <ToyBrick key={5} />, <Package key={6} />,
];

const StackingAnimation: React.FC = () => {
  return (
    <div className="flex justify-center items-end h-32 w-full my-6">
      <div className="relative w-16 h-full flex flex-col-reverse items-center">
        {icons.map((IconComponent, index) => (
          <motion.div
            key={index}
            className="absolute text-app-foundation-accent-light/70"
            initial={{ opacity: 0, y: -50, scale: 0.8 }}
            animate={{
              opacity: 1,
              y: - (index * 18), // Adjust this value to control spacing and height
              scale: 1,
            }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 15,
              delay: 0.5 + index * 0.3, // Stagger animation
            }}
            style={{ zIndex: icons.length - index }} // Ensure correct stacking order
          >
            {React.cloneElement(IconComponent, { size: 24 + index * 2 })} 
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default StackingAnimation; 