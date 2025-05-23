"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { LucideProps, Package, FastForward, Type, Blocks, Palette, Database } from 'lucide-react'; // Example icons

interface TechCardProps {
  icon: React.ReactElement<LucideProps>;
  title: string;
  description: string;
  techName: 'nextjs' | 'typescript' | 'nx' | 'tailwindcss' | 'supabase';
}

const TechSpecificIcon: React.FC<{ techName: TechCardProps['techName'], className?: string }> = ({ techName, className }) => {
  const baseClasses = "h-8 w-8 text-app-foundation-accent-light";
  const combinedClassName = `${baseClasses} ${className || ''}`;

  switch (techName) {
    case 'nextjs':
      return <FastForward className={combinedClassName} />;
    case 'typescript':
      return <Type className={combinedClassName} />;
    case 'nx':
      return <Blocks className={combinedClassName} />;
    case 'tailwindcss':
      return <Palette className={combinedClassName} />;
    case 'supabase':
      return <Database className={combinedClassName} />;
    default:
      return <Package className={combinedClassName} />;
  }
};

const TechCard: React.FC<TechCardProps> = ({ icon, title, description, techName }) => {
  return (
    <motion.div
      className="group relative bg-app-foundation-start/20 p-6 rounded-lg border border-app-foundation-accent-dark/20 overflow-hidden cursor-pointer h-full flex flex-col justify-between"
      whileHover={{ scale: 1.05, y: -5 }}
      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
    >
      <div>
        <div className="relative mb-4 h-16 w-16 mx-auto">
          <motion.div
            className="absolute inset-0 flex items-center justify-center opacity-100 group-hover:opacity-0 transition-opacity duration-300"
            animate={{ opacity: 1 }} // icon visible by default
            whileHover={{ opacity: 0 }} // icon fades out on hover
          >
            {React.cloneElement(icon, { className: "h-12 w-12 text-app-foundation-accent-light"})}
          </motion.div>
          <motion.div
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            initial={{ opacity: 0, scale: 0.5 }}
            whileHover={{ opacity: 1, scale: 1 }} // tech specific icon fades in and scales up
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            <TechSpecificIcon techName={techName} />
          </motion.div>
        </div>
        <h3 className="font-semibold text-app-foundation-accent-light text-xl mb-2 text-center">{title}</h3>
        <p className="text-app-foundation-text-dark/80 text-sm text-center">{description}</p>
      </div>
    </motion.div>
  );
};

export default TechCard; 