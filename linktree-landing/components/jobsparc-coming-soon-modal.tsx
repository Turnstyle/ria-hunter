"use client";

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Lock, Sparkles, Mail, Send, AlertTriangle, CheckCircle, Flame } from "lucide-react";

interface JobSparcComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JobSparcComingSoonModal: React.FC<JobSparcComingSoonModalProps> = ({ isOpen, onClose }) => {
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"error" | "success" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setMessageType(null);

    // Simulate checking invite code
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (inviteCode.trim() === "") {
      setMessage("Please enter an invite code.");
      setMessageType("error");
    } else {
      // For now, all codes lead to this message
      setMessage("Access not yet granted with this code. If you super badly need it, please email the creator directly!");
      setMessageType("error"); // Or "info" if you have a style for it
    }
    setIsSubmitting(false);
    setInviteCode(""); // Clear input after submission
  };

  const handleCloseDialog = () => {
    onClose();
    // Reset modal state on close after a short delay to allow animation
    setTimeout(() => {
        setInviteCode("");
        setMessage(null);
        setMessageType(null);
        setIsSubmitting(false);
    }, 300);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleCloseDialog}>
      <DialogContent className="sm:max-w-md bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border-slate-200 dark:border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden">
        <DialogHeader className="p-6 text-center">
          <Flame className="mx-auto h-12 w-12 text-orange-500 animate-pulse mb-3" />
          <DialogTitle className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            JobSparc is Igniting Soon!
          </DialogTitle>
          <DialogDescription className="text-slate-600 dark:text-slate-400 mt-2">
            This feature is currently in private beta and by <strong className="text-[#f35e54] dark:text-[#f35e54]">invite only</strong>.
            Enter your code below to request access.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          <div className="relative">
            <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500 transition-colors duration-300 ${isSubmitting ? 'animate-ping' : ''}`} />
            <Input
              type="text"
              name="inviteCode"
              placeholder="Enter Invite Code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
              disabled={isSubmitting}
              className="pl-10 w-full bg-slate-50 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600 focus:ring-orange-500 focus:border-orange-500 transition-all"
            />
          </div>

          {message && (
            <div className={`flex items-start p-3 rounded-md text-sm ${ 
                messageType === 'error' ? 
                'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 
                'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            }`}>
              {messageType === 'error' ? 
                <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" /> : 
                <CheckCircle className="h-5 w-5 mr-2 flex-shrink-0" />}
              <span>{message}</span>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-end sm:space-x-2 space-y-2 sm:space-y-0 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="w-full sm:w-auto transition-all hover:bg-slate-100 dark:hover:bg-slate-700" disabled={isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              className="w-full sm:w-auto text-white transition-all group relative overflow-hidden bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin inline-block mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                  Checking...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                  Request Access
                </>
              )}
              <Sparkles className="absolute top-0 right-0 mt-1 mr-1 h-4 w-4 text-yellow-300 opacity-0 group-hover:opacity-100 group-hover:animate-ping transition-opacity duration-500" />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}; 