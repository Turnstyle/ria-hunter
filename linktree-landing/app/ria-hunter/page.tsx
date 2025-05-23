"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Search, UserPlus, LogIn, Mail, Send, Rabbit, Sparkles, Building, Phone, User, Menu, Users, Filter, BarChart3, X } from "lucide-react";

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
          <DialogTitle className="text-2xl font-bold text-center text-blue-600 dark:text-blue-400">
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
            <Rabbit className="absolute -right-6 -bottom-2 h-10 w-10 text-blue-500 transform rotate-12" />
          </div>
        </div>
        <DialogFooter className="sm:justify-center flex-col sm:flex-col sm:space-x-0 space-y-2">
          <Button
            type="button"
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
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
          <DialogTitle className="text-2xl font-bold text-center text-blue-600 dark:text-blue-400">
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
            <Button type="submit" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Request Early Access"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// FeatureCard component (could be in its own file)
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description }) => {
  return (
    <div className="group bg-slate-700/50 p-6 rounded-lg shadow-lg border border-slate-600/50 hover:border-purple-400/70 hover:shadow-purple-500/30 transition-all duration-300 transform hover:-translate-y-1 cursor-pointer">
      <div className="mb-4 flex justify-center items-center h-16 w-16 rounded-full bg-purple-500/20 group-hover:bg-purple-500/40 transition-colors duration-300 mx-auto">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-2 text-center text-purple-100 group-hover:text-white transition-colors duration-300">{title}</h3>
      <p className="text-purple-200/80 text-sm text-center group-hover:text-purple-100 transition-colors duration-300">{description}</p>
    </div>
  );
};

export default function RiaHunterPage() {
  const [isBunnyModalOpen, setIsBunnyModalOpen] = useState(false);
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);
  const [chatInputValue, setChatInputValue] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-ria-hunter-gradient-start via-ria-hunter-gradient-mid to-ria-hunter-gradient-end text-white font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 py-4 px-6 md:px-10 flex justify-between items-center border-b border-purple-400/30 backdrop-blur-md bg-ria-hunter-gradient-start/80">
        <div className="flex items-center space-x-3">
          <a href="/" className="text-2xl font-bold tracking-tighter flex items-center">
            RIA <span className="text-header-hunter-text">Hunter</span>
          </a>
        </div>
        <nav className="hidden md:flex items-center space-x-3">
          <Button variant="ghost" className="text-white hover:bg-purple-500/30 hover:text-white" asChild>
            <a href="#features">Features</a>
          </Button>
          <Button variant="ghost" className="text-white hover:bg-purple-500/30 hover:text-white" asChild>
            <a href="#about">About</a>
          </Button>
          <Button variant="ghost" className="text-white hover:bg-purple-500/30 hover:text-white" asChild>
            <a href="#contact">Contact</a>
          </Button>
        </nav>
        <div className="md:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-purple-500/30 hover:text-white"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            <span className="sr-only">Toggle Menu</span>
          </Button>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-16 right-0 left-0 z-40 bg-ria-hunter-gradient-start/95 backdrop-blur-sm p-4 border-b border-purple-400/30">
          <nav className="flex flex-col space-y-3">
            <Button variant="ghost" className="text-white justify-start hover:bg-purple-500/30 hover:text-white" onClick={() => {setIsMobileMenuOpen(false); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });}} >
              Features
            </Button>
            <Button variant="ghost" className="text-white justify-start hover:bg-purple-500/30 hover:text-white" onClick={() => {setIsMobileMenuOpen(false); document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' });}} >
              About
            </Button>
            <Button variant="ghost" className="text-white justify-start hover:bg-purple-500/30 hover:text-white" onClick={() => {setIsMobileMenuOpen(false); document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });}} >
              Contact
            </Button>
             <Button variant="outline" className="text-signup-cta-gold border-signup-cta-gold hover:bg-signup-cta-gold/10 hover:text-yellow-300 justify-start" onClick={() => { setIsMobileMenuOpen(false); setIsWaitlistModalOpen(true);}}>
              <UserPlus className="mr-2 h-4 w-4 text-signup-cta-gold" /> Sign Up
            </Button>
            <Button variant="ghost" className="text-white justify-start hover:bg-purple-500/30 hover:text-white" onClick={() => { setIsMobileMenuOpen(false); setIsBunnyModalOpen(true);}}>
              <LogIn className="mr-2 h-4 w-4" /> Sign In (Dev)
            </Button>
          </nav>
        </div>
      )}

      {/* Hero Section */}
      <main className="flex-grow flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-4xl w-full">
          <section className="py-16 md:py-24">
            <div className="mb-8">
              <Sparkles className="h-20 w-20 text-yellow-400 mx-auto [filter:drop-shadow(0_0_8px_theme(colors.yellow.400))_drop-shadow(0_0_16px_theme(colors.purple.500))] animate-shimmer" />
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-4 leading-tight">
              Uncover Who Invests <span className="block text-purple-300">Privately</span>.
            </h1>
            <h2
              className="text-3xl sm:text-4xl md:text-5xl font-bold text-yellow-400 mb-10"
              style={{
                textShadow:
                  "0 0 3px theme(colors.yellow.700), 0 0 5px theme(colors.yellow.700), 0 0 7px theme(colors.purple.500), 0 0 10px theme(colors.purple.500)",
              }}
            >
              System Booting... Standby!
            </h2>
            <p className="text-xl text-purple-200/90 mb-12 max-w-2xl mx-auto">
              Ask your toughest questions of SEC Form ADV data,
              <br />
              get illuminating answers.
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center space-y-4 md:space-y-0 md:space-x-4">
              <Input
                type="text"
                placeholder="Type your query here, detective... (coming soon!)"
                className="flex-grow bg-slate-700/80 border-purple-400/50 text-purple-100 placeholder-purple-300/70 focus:ring-purple-500 focus:border-purple-500 rounded-lg"
                value={chatInputValue}
                onChange={(e) => setChatInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleChatAttempt()}
              />
              <Button 
                type="button"
                onClick={handleChatAttempt}
                variant="default" 
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-pink-500/50 transition-all duration-300 transform hover:scale-105 glow-button"
                // This button will glow similarly to the "System Booting" text due to the glow-button class (defined in globals.css or here if needed)
              >
                <Send className="mr-2 h-5 w-5" /> Be an Investigator (Join Waitlist)
              </Button>
            </div>
          </section>

          {/* Special Features Section */}
          <section id="features" className="py-16 md:py-24 bg-gradient-to-b from-ria-hunter-features-bg-start to-ria-hunter-features-bg-end rounded-xl shadow-2xl border border-purple-400/30 backdrop-blur-sm">
            <h2 className="text-3xl font-bold mb-12 text-center text-purple-200">Special Features</h2>
            <div className="grid md:grid-cols-3 gap-8 px-4 md:px-8">
              <FeatureCard
                icon={<Search className="h-10 w-10 text-ria-hunter-icon-purple-contrast group-hover:text-yellow-300 transition-colors" />}
                title="Deep Dive Search"
                description="Uncover hidden connections and patterns in SEC Form ADV data with our powerful semantic search."
              />
              <FeatureCard
                icon={<Filter className="h-10 w-10 text-ria-hunter-icon-purple-contrast group-hover:text-yellow-300 transition-colors" />}
                title="Advanced Filtering"
                description="Narrow down your search with precision using advanced filters for AUM, location, and more."
              />
              <FeatureCard
                icon={<BarChart3 className="h-10 w-10 text-ria-hunter-icon-purple-contrast group-hover:text-yellow-300 transition-colors" />}
                title="Insightful Analytics"
                description="Visualize trends and gain actionable insights with our integrated data analytics tools."
              />
            </div>
          </section>

          {/* Call to Action Section */}
          <section className="py-20 text-center">
            <h2 className="text-4xl font-bold mb-6 text-purple-200">Ready to Start Investigating?</h2>
            <p className="text-xl text-purple-300/80 mb-10 max-w-xl mx-auto">
              Join the waitlist and be among the first to experience the power of RIA Hunter.
            </p>
            <Button
              size="lg"
              onClick={() => setIsWaitlistModalOpen(true)}
              className="bg-signup-cta-gold text-header-hunter-text hover:bg-yellow-500 font-bold text-lg py-4 px-8 rounded-lg shadow-xl hover:shadow-yellow-400/60 transition-all duration-300 transform hover:scale-105 glow-button"
              // Glow effect should be subtle here, or match the primary CTA glow
            >
              <Users className="mr-2 h-6 w-6" /> Be an Investigator (Join Waitlist)
            </Button>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer id="contact" className="py-8 px-6 md:px-10 text-center border-t border-purple-400/30 bg-ria-hunter-footer-bg">
        <p className="text-ria-hunter-footer-text text-sm">
          &copy; {new Date().getFullYear()} JTP Nexus. All rights reserved. RIA Hunter is a project by JT Peters.
        </p>
      </footer>

      {/* Modals */}
      <BunnyComingSoonModal isOpen={isBunnyModalOpen} onClose={() => setIsBunnyModalOpen(false)} onOpenWaitlist={openWaitlistFromBunny} />
      <WaitlistFormModal isOpen={isWaitlistModalOpen} onClose={() => setIsWaitlistModalOpen(false)} />
    </div>
  );
}