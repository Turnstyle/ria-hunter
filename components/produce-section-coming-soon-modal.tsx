"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Apple, Carrot, Egg, Grape, Leaf, Bomb, Sparkles } from "lucide-react"; // Fun icons

interface ProduceSectionComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const icons = [
  { icon: Apple, color: "text-red-500" },
  { icon: Carrot, color: "text-orange-500" },
  { icon: Leaf, color: "text-lime-500" },
  { icon: Grape, color: "text-purple-500" },
  { icon: Egg, color: "text-amber-700" }, // Representing something unexpected like an egg in produce!
];

export const ProduceSectionComingSoonModal: React.FC<ProduceSectionComingSoonModalProps> = ({ isOpen, onClose }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border-slate-200 dark:border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden">
        <DialogHeader className="p-6 text-center relative overflow-hidden">
          {/* Animated background icons */}
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 10 }).map((_, i) => {
              const IconComponent = icons[i % icons.length].icon;
              const color = icons[i % icons.length].color;
              const animationDelay = `${Math.random() * 5}s`;
              const duration = `${2 + Math.random() * 3}s`;
              return (
                <IconComponent
                  key={i}
                  className={`absolute opacity-20 ${color} animate-bounce`}
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    width: `${20 + Math.random() * 30}px`,
                    height: `${20 + Math.random() * 30}px`,
                    animationDelay,
                    animationDuration: duration,
                  }}
                />
              );
            })}
          </div>
          
          <Apple className="relative mx-auto h-12 w-12 text-green-500 mb-3 animate-ping once" />
          <DialogTitle className="relative text-3xl font-bold text-slate-800 dark:text-slate-100">
            The Produce Section: <span className="text-green-500">Coming Soon!</span>
          </DialogTitle>
          <DialogDescription className="relative text-slate-600 dark:text-slate-400 mt-3 text-lg leading-relaxed">
            Get ready to unleash your inner food artist! 🎨 <br />
            Soon, you&apos;ll be able to create <strong className="text-green-600 dark:text-green-400">wildly imaginative images</strong> using fruits, vegetables, and all sorts of grocery store goodies. 
            Think carrots as rocket ships, or broccoli forests guarded by lemon-knights! <br />
            The only limit is your imagination (and what&apos;s in season!).
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 flex flex-col items-center justify-center space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Keep an eye out, this feature will be ripe for picking soon!
            </p>
        </div>

        <DialogFooter className="p-6 pt-0 sm:justify-center">
          <DialogClose asChild>
            <Button 
                type="button" 
                variant="default"
                size="lg"
                className="w-full sm:w-auto bg-gradient-to-r from-green-500 to-lime-500 hover:from-green-600 hover:to-lime-600 text-white group transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-green-500/40"
            >
              <Carrot className="mr-2 h-5 w-5 animate-spin group-hover:animate-none [animation-duration:3s]" />
              Sounds Delicious!
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 