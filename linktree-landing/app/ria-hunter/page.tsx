"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Search, UserPlus, LogIn, Mail, Send, Rabbit, Sparkles, Building, Phone, User, Menu } from "lucide-react";

// TODO: Create these modal components in separate files
// For now, basic placeholders or inline for simplicity in this step.

// Placeholder for BunnyComingSoonModal props
interface BunnyComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWaitlist: () => void;
}

const BunnyComingSoonModal: React.FC<BunnyComingSoonModalProps> = ({ isOpen, onClose, onOpenWaitlist }) => {
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center text-purple-600 dark:text-purple-400">
            <Rabbit className="inline-block h-8 w-8 mr-2 animate-bounce" />
            Hold Your Horses, Detective!
          </DialogTitle>
          <DialogDescription className="text-center text-slate-600 dark:text-slate-400 mt-2">
            This feature is still under wraps in our top-secret development lab.
            <br />
            The bunny hops from <span className="font-semibold">Coming</span> to <span className="font-semibold">Soon</span>!
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center space-y-4 my-6">
          {/* Basic bunny animation placeholder - can be enhanced with SVG/CSS */}
          <div className="relative text-4xl">
            <Rabbit className="absolute -left-6 -top-2 h-10 w-10 text-slate-400 dark:text-slate-500 opacity-50 transform -rotate-12" />
            <span className="font-bold text-slate-700 dark:text-slate-200">Coming</span>
            <Sparkles className="inline-block h-6 w-6 text-amber-300 mx-1" />
            <span className="font-bold text-slate-700 dark:text-slate-200">Soon!</span>
            <Rabbit className="absolute -right-6 -bottom-2 h-10 w-10 text-purple-500 transform rotate-12" />
          </div>
        </div>
        <DialogFooter className="sm:justify-center flex-col sm:flex-col sm:space-x-0 space-y-2">
          <Button
            type="button"
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            onClick={() => {
              onOpenWaitlist();
              onClose();
            }}
          >
            <UserPlus className="mr-2 h-4 w-4" /> Join the Waitlist for Early Access
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="w-full">
              No Thanks, Boss
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Placeholder for WaitlistFormModal props
interface WaitlistFormModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface WaitlistFormData {
  name: string;
  email: string;
  phone: string;
  company?: string;
  purpose: string;
}

const WaitlistFormModal: React.FC<WaitlistFormModalProps> = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState<WaitlistFormData>({ name: "", email: "", phone: "", company: "", purpose: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitMessage(null);

    // Simulate API call
    try {
      const response = await fetch('/api/ria-hunter-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = await response.json();

      if (response.ok) {
        setSubmitMessage("Thanks! You're on the list. We'll be in touch, detective!");
        setFormData({ name: "", email: "", phone: "", company: "", purpose: "" }); // Reset form
        // Optionally close modal after a delay: setTimeout(onClose, 3000);
      } else {
        setSubmitMessage(result.message || "Something went wrong. Please try again.");
      }
    } catch (error) {
      setSubmitMessage("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center text-purple-600 dark:text-purple-400">
             <Mail className="inline-block h-8 w-8 mr-2" />
            Join the RIA Hunter Waitlist!
          </DialogTitle>
          <DialogDescription className="text-center text-slate-600 dark:text-slate-400 mt-2">
            Get early access and help shape the future of investment investigation.
            <br/>Priority access given for compelling business use cases.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input type="text" name="name" placeholder="Full Name" value={formData.name} onChange={handleChange} required className="pl-10" />
          </div>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input type="email" name="email" placeholder="Email Address" value={formData.email} onChange={handleChange} required className="pl-10" />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input type="tel" name="phone" placeholder="Phone Number" value={formData.phone} onChange={handleChange} required className="pl-10" />
          </div>
          <div className="relative">
            <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input type="text" name="company" placeholder="Company (Optional)" value={formData.company} onChange={handleChange} className="pl-10" />
          </div>
          <div className="relative">
             {/* Using Search as a proxy for purpose/magnifying glass */}
            <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <Textarea name="purpose" placeholder="Your purpose for wanting early access (e.g., business use case, specific research needs...)" value={formData.purpose} onChange={handleChange} required className="pl-10 min-h-[100px]" />
          </div>
          {submitMessage && <p className={`text-sm ${submitMessage.startsWith("Thanks") ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{submitMessage}</p>}
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Request Early Access"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};


export default function RiaHunterPage() {
  const [isBunnyModalOpen, setIsBunnyModalOpen] = useState(false);
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);
  const [chatInputValue, setChatInputValue] = useState("");

  const handleChatAttempt = () => {
    if (chatInputValue.trim() !== "") {
      setIsBunnyModalOpen(true); // Open bunny modal on chat attempt
      setChatInputValue(""); // Clear input
    } else {
      // Maybe a gentle shake or small visual cue if input is empty? For later.
      setIsBunnyModalOpen(true); // Or just open bunny modal anyway
    }
  };
  
  const openWaitlistFromBunny = () => {
    setIsWaitlistModalOpen(true);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-slate-100 font-sans">
      {/* Header */}
      <header className="py-4 px-6 md:px-10 flex justify-between items-center border-b border-slate-700/50">
        <div className="flex items-center space-x-3">
          <Button variant="ghost" size="icon" className="text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => setIsBunnyModalOpen(true)}>
            <Menu className="h-6 w-6" />
            <span className="sr-only">Open Menu</span>
          </Button>
          <div className="text-2xl font-bold tracking-tighter">
            RIA <span className="text-purple-400">Hunter</span>
          </div>
        </div>
        <div className="space-x-3">
          <Button 
            variant="outline" 
            className="text-[#eab308] bg-slate-700 border-slate-600 hover:bg-slate-800 hover:text-[#eab308] hover:border-[#eab308]/50 hover:scale-[1.03] hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-200"
            onClick={() => setIsBunnyModalOpen(true)}
          >
            <UserPlus className="mr-2 h-4 w-4 text-[#eab308]" /> Sign Up
          </Button>
          <Button variant="ghost" className="text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => setIsBunnyModalOpen(true)}>
            <LogIn className="mr-2 h-4 w-4" /> Sign In
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-3xl w-full">
          <Sparkles className="h-16 w-16 text-yellow-300 mx-auto mb-6 animate-pulse [animation:pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite,shimmer_3s_ease-in-out_infinite] [filter:drop-shadow(0_0_4px_theme(colors.yellow.300))_drop-shadow(0_0_8px_theme(colors.yellow.400))]" />
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-6 leading-tight">
            Uncover Who Invests Privately.
            <br />
            <span className="block whitespace-nowrap text-yellow-300 text-3xl sm:text-4xl md:text-5xl lg:text-6xl [text-shadow:0_0_1px_theme(colors.white),_0_0_2px_theme(colors.yellow.300),_0_0_4px_theme(colors.yellow.400),_0_0_7px_theme(colors.yellow.500)]">System Booting... Standby!</span>
          </h1>
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
            Ask your toughest questions of SEC Form ADV data,
            <br />
            get illuminating answers.
          </p>

          {/* Faux Chat Interface */}
          <div className="bg-slate-800/70 p-6 rounded-xl shadow-2xl border border-slate-700/50 max-w-2xl mx-auto mb-12">
            <div className="flex items-center space-x-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-purple-500 flex items-center justify-center text-white">
                <Search className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-200">Agent Hunter <span className="text-xs text-yellow-500">(Build Pending - Standby)</span></p>
                <p className="text-xs text-slate-500">Ask me anything about RIAs... once the case files are open!</p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-left mb-4 h-16 overflow-y-auto p-3 bg-slate-900/50 rounded-md border border-slate-700">
                {/* Removed first message */}
                <p className="text-slate-400"><span className="font-medium text-purple-300">Wealth Hunter:</span> Compiling dossiers on the most elusive RIAs... get ready for deep insights!</p>
            </div>
            <div className="flex space-x-3">
              <Input
                type="text"
                placeholder="Type your query here, detective... (coming soon!)"
                className="flex-grow bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500 focus:ring-purple-500 focus:border-purple-500"
                value={chatInputValue}
                onChange={(e) => setChatInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleChatAttempt()}
              />
              <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleChatAttempt}>
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <Button
            size="lg"
            className="bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-bold text-lg py-4 px-8 rounded-lg shadow-lg hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-yellow-300 transition-all duration-300 transform hover:scale-105 [text-shadow:0_0_3px_rgba(255,255,255,0.3)] [box-shadow:0_0_8px_0_theme(colors.yellow.400),_0_0_15px_0_theme(colors.yellow.500),inset_0_0_5px_rgba(255,255,200,0.5)] hover:[box-shadow:0_0_12px_0_theme(colors.yellow.300),_0_0_25px_0_theme(colors.yellow.400),inset_0_0_8px_rgba(255,255,200,0.7)]"
            onClick={() => setIsWaitlistModalOpen(true)}
          >
            <Sparkles className="mr-3 h-6 w-6 text-purple-600 [filter:drop-shadow(0_0_3px_theme(colors.purple.400))]" />
            Be an Investigator (Join Waitlist)
          </Button>
        </div>
      </main>
      
      {/* "What We're Investigating" Section */}
      <section className="py-16 bg-slate-800/30 border-t border-slate-700/50">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-2 text-slate-100">Special Features</h2>
          <p className="text-lg text-slate-400 mb-10">Here's the kind of intelligence you'll command:</p>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-slate-700/50 p-6 rounded-lg shadow-lg border border-slate-600/50">
              <Search className="h-10 w-10 text-purple-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2 text-slate-100">Pinpoint Private Investors</h3>
              <p className="text-slate-400 text-sm">Zero in on RIAs active in private markets within your target zone (St. Louis MSA, 2020-Present).</p>
            </div>
            <div className="bg-slate-700/50 p-6 rounded-lg shadow-lg border border-slate-600/50">
              <User className="h-10 w-10 text-purple-400 mx-auto mb-4" /> {/* User as proxy for profile */}
              <h3 className="text-xl font-semibold mb-2 text-slate-100">Build Your Case Files</h3>
              <p className="text-slate-400 text-sm">Create "Living Profiles" with your own notes, tags, and links to enrich SEC data.</p>
            </div>
            <div className="bg-slate-700/50 p-6 rounded-lg shadow-lg border border-slate-600/50">
              <Sparkles className="h-10 w-10 text-purple-400 mx-auto mb-4" /> {/* Sparkles for AI */}
              <h3 className="text-xl font-semibold mb-2 text-slate-100">Unlock Strategic Matches</h3>
              <p className="text-slate-400 text-sm">Our "Investment Thesis Matcher" will use AI to find RIAs that align with your unique strategies.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-slate-500 border-t border-slate-700/50">
        &copy; {new Date().getFullYear()} jtpnexus.com. All rights reserved. The future of RIA investigation is loading...
      </footer>

      {/* Modals */}
      <BunnyComingSoonModal isOpen={isBunnyModalOpen} onClose={() => setIsBunnyModalOpen(false)} onOpenWaitlist={openWaitlistFromBunny} />
      <WaitlistFormModal isOpen={isWaitlistModalOpen} onClose={() => setIsWaitlistModalOpen(false)} />
    </div>
  );
} 