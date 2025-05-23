"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"; // May not be needed if no forms
// import { Textarea } from "@/components/ui/textarea"; // May not be needed
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"; // May not be needed
import { Brain, Layers, Share2, Github, Menu, X, Package, FastForward, Type, Blocks, Palette, Database } from "lucide-react"; // Rocket removed
import TechCard from "@/components/ui/tech-card";
import GenesisBlockAnimation from "@/components/ui/genesis-block-animation";
import StackingAnimation from "@/components/ui/stacking-animation";

export default function AppFoundationPage() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-app-foundation-start via-app-foundation-end to-app-foundation-end text-app-foundation-text-dark font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 py-4 px-6 md:px-10 flex justify-between items-center border-b border-app-foundation-accent-dark/30 backdrop-blur-md bg-app-foundation-start/80">
        <div className="flex items-center space-x-3">
          <a href="/" className="text-2xl font-bold tracking-tighter flex items-center text-white">
            JTP <span className="text-app-foundation-accent-light">Nexus</span>
            <span className="text-app-foundation-text-dark/80 ml-2 self-end">/ App Foundation</span>
          </a>
        </div>
        <nav className="hidden md:flex items-center space-x-3">
          <Button 
            variant="outline" 
            className="group text-app-foundation-github-button-text border-app-foundation-github-button-text/70 hover:bg-app-foundation-accent-light/30 hover:text-app-foundation-accent-dark hover:scale-[1.03] hover:shadow-lg hover:shadow-app-foundation-accent-light/30 transition-all duration-200"
            asChild
          >
            <a href="https://github.com/JTPeters" target="_blank" rel="noopener noreferrer">
              <Github className="mr-2 h-4 w-4 text-app-foundation-github-button-text group-hover:scale-110 transition-transform duration-200" /> My GitHub
            </a>
          </Button>
          {/* Add other relevant links here if needed */}
        </nav>
        <div className="md:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="text-app-foundation-text-dark hover:bg-app-foundation-accent-light/20 hover:text-white"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            <span className="sr-only">Toggle Menu</span>
          </Button>
        </div>
      </header>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-16 right-0 left-0 z-40 bg-app-foundation-start/95 backdrop-blur-sm p-4 border-b border-app-foundation-accent-dark/30">
          <nav className="flex flex-col space-y-3">
            <Button 
                variant="ghost" 
                className="text-app-foundation-github-button-text justify-start hover:bg-app-foundation-accent-light/20 hover:text-app-foundation-accent-dark"
                asChild
            >
              <a href="https://github.com/JTPeters" target="_blank" rel="noopener noreferrer">
                <Github className="mr-2 h-4 w-4" /> My GitHub
              </a>
            </Button>
            {/* Add other relevant links here if needed */}
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-4xl w-full">
          {/* Hero Section */}
          <section className="py-16 md:py-24">
            <GenesisBlockAnimation /> 
            {/* <Rocket className="h-20 w-20 text-app-foundation-accent-light mx-auto mb-8 animate-pulse [filter:drop-shadow(0_0_8px_theme(colors.app-foundation-accent-light))_drop-shadow(0_0_16px_theme(colors.app-foundation-end))]" /> */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-6 leading-tight text-white">
              Building Awesome Apps, <span className="block text-app-foundation-accent-light">Supercharged by AI!</span>
            </h1>
            <p className="text-xl text-app-foundation-text-dark/90 mb-10 max-w-2xl mx-auto">
              Ever wonder how cool new apps get made? I&apos;m working on a special toolbox called <strong className="text-app-foundation-accent-dark font-semibold">App Foundation</strong>.
              It&apos;s like a super-smart LEGO set that helps me build amazing things with the help of AI, right here in Cursor!
            </p>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                <Button 
                    size="lg" 
                    className="bg-gradient-to-r from-app-foundation-start to-app-foundation-end hover:from-app-foundation-end hover:to-app-foundation-start text-white font-semibold text-lg py-3 px-8 rounded-lg shadow-lg hover:shadow-app-foundation-accent-light/40 transition-all duration-300 transform hover:scale-105 border-2 border-app-foundation-accent-dark/50 hover:border-app-foundation-accent-light"
                    asChild
                >
                  <a href="https://github.com/JTPeters" target="_blank" rel="noopener noreferrer">
                    <Github className="mr-2 h-5 w-5" /> Check out my GitHub
                  </a>
                </Button>
                <Button 
                    size="lg" 
                    variant="outline"
                    className="text-app-foundation-text-dark border-app-foundation-accent-dark hover:bg-app-foundation-accent-light/20 hover:text-app-foundation-accent-dark hover:border-app-foundation-accent-light text-lg py-3 px-8 rounded-lg shadow-lg hover:shadow-app-foundation-accent-light/30 transition-all duration-300 transform hover:scale-105"
                    onClick={() => document.getElementById('learn-more-section')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  <Layers className="mr-2 h-5 w-5" /> Learn More Below
                </Button>
            </div>
          </section>

          {/* Content Sections - Placeholder */}
          <div id="learn-more-section" className="space-y-16 md:space-y-24 py-16 md:py-24">
            
            {/* What's This App Gizmo? */}
            <section className="bg-app-foundation-start/30 p-8 rounded-xl shadow-2xl border border-app-foundation-accent-dark/30 backdrop-blur-sm">
              <div className="flex flex-col md:flex-row items-center justify-between mb-6">
                <div className="flex-1 md:pr-8">
                  <Layers className="h-16 w-16 text-app-foundation-accent-light mx-auto md:mx-0 mb-4 md:mb-0" />
                  <h2 className="text-3xl font-bold mb-4 text-white text-center md:text-left">What&apos;s This &quot;App Foundation&quot; Gizmo?</h2>
                </div>
                <div className="md:w-1/3 flex-shrink-0">
                  <StackingAnimation />
                </div>
              </div>
              <p className="text-lg text-app-foundation-text-dark/90 leading-relaxed">
                Imagine you want to build the COOLEST treehouse ever. You wouldn&apos;t just start nailing random pieces of wood together, right? You&apos;d want a plan, some good tools, and maybe some pre-built parts like a sturdy ladder or strong walls.
                <br/><br/>
                <strong className="text-app-foundation-accent-dark font-semibold">App Foundation</strong> is kind of like that, but for making computer and phone apps! It&apos;s a special starter kit I&apos;m building. It has:
              </p>
              <ul className="list-disc list-inside text-left text-lg text-app-foundation-text-dark/90 mt-4 space-y-2 pl-4">
                <li><span className="text-app-foundation-accent-dark font-semibold">Strong Base:</span> Like a solid floor for your treehouse, so apps are stable and don&apos;t crash.</li>
                <li><span className="text-app-foundation-accent-dark font-semibold">Reusable Parts:</span> Think of ready-made windows or doors. These are bits of code I can use again and again, so I don&apos;t have to build everything from scratch each time. This means I can make apps FASTER!</li>
                <li><span className="text-app-foundation-accent-dark font-semibold">Smart Plans:</span> It helps organize everything so the apps are easy to fix or add new cool features to later on.</li>
              </ul>
              <p className="text-lg text-app-foundation-text-dark/90 leading-relaxed mt-4">
                It&apos;s all about making it easier and quicker to build really good, powerful apps that people will love to use.
              </p>
            </section>

            {/* AI Superpowers! */}
            <section className="bg-app-foundation-start/30 p-8 rounded-xl shadow-2xl border border-app-foundation-accent-dark/30 backdrop-blur-sm">
              <Brain className="h-16 w-16 text-app-foundation-accent-light mx-auto mb-6" />
              <h2 className="text-3xl font-bold mb-4 text-white">AI Superpowers with Cursor!</h2>
              <p className="text-lg text-app-foundation-text-dark/90 leading-relaxed">
                Now, here&apos;s the super exciting part! I&apos;m not building this App Foundation all by myself. I have a coding buddy: <strong className="text-app-foundation-accent-dark font-semibold">an AI in a tool called Cursor</strong>!
                <br/><br/>
                Think of it like having a super-smart assistant that can:
              </p>
              <ul className="list-disc list-inside text-left text-lg text-app-foundation-text-dark/90 mt-4 space-y-2 pl-4">
                <li><span className="text-app-foundation-accent-dark font-semibold">Write Code Snippets:</span> If I need a specific piece of code, the AI can help write it super fast.</li>
                <li><span className="text-app-foundation-accent-dark font-semibold">Explain Tricky Stuff:</span> If there&apos;s something complicated, the AI can explain it in a way that&apos;s easier to understand.</li>
                <li><span className="text-app-foundation-accent-dark font-semibold">Spot Mistakes:</span> Like a helpful friend, it can help find tiny errors in the code that I might miss.</li>
                <li><span className="text-app-foundation-accent-dark font-semibold">Brainstorm Ideas:</span> Sometimes, the AI even helps me come up with new ideas for how to make things better!</li>
              </ul>
              <p className="text-lg text-app-foundation-text-dark/90 leading-relaxed mt-4">
                Using AI with Cursor is like having a turbo-boost for my brain, helping me build cooler things, faster, and even learn new coding tricks along the way. It&apos;s all about making this App Foundation the best it can be!
              </p>
            </section>

            {/* The Cool Tools Inside (Tech Stack) */}
            <section className="bg-app-foundation-start/30 p-8 rounded-xl shadow-2xl border border-app-foundation-accent-dark/30 backdrop-blur-sm">
              <Share2 className="h-16 w-16 text-app-foundation-accent-light mx-auto mb-6" />
              <h2 className="text-3xl font-bold mb-4 text-white">The Cool Tools Inside My Kit</h2>
              <p className="text-lg text-app-foundation-text-dark/90 leading-relaxed mb-10">
                To build this App Foundation, I&apos;m using some of the latest and greatest technologies. You don&apos;t need to be a tech whiz to get the idea – think of them as specialized power tools that each do something awesome:
              </p>
              <div className="grid md:grid-cols-2 gap-8 text-left">
                <TechCard 
                  icon={<Package />} 
                  title="Next.js - The Speedy Delivery Van" 
                  description="Makes websites and apps load super quickly, like a van that delivers what you want instantly!" 
                  techName="nextjs"
                />
                <TechCard 
                  icon={<Package />} 
                  title="TypeScript - The Smart Blueprint" 
                  description="It&apos;s like a super-detailed instruction manual for my code, helping to catch mistakes before they happen and making sure everything fits together perfectly." 
                  techName="typescript"
                />
                <TechCard 
                  icon={<Package />} 
                  title="Nx - The Giant Organizer" 
                  description="When projects get big, Nx helps keep all the different parts neat and tidy, so it&apos;s easy to work on them without getting mixed up." 
                  techName="nx"
                />
                <TechCard 
                  icon={<Package />} 
                  title="Tailwind CSS - The Magic Paintbox" 
                  description="Lets me style apps and make them look cool really fast, like having every color and brush ready to go!" 
                  techName="tailwindcss"
                />
                <div className="md:col-span-2">
                  <TechCard 
                    icon={<Package />} 
                    title="Supabase - The All-in-One Helper" 
                    description="This is like a friendly robot that handles a lot of the backend stuff for apps – like remembering user logins, storing information, and sending updates in real-time. Super handy!" 
                    techName="supabase"
                  />
                </div>
              </div>
              <p className="text-lg text-app-foundation-text-dark/90 leading-relaxed mt-10">
                These tools help me build strong, fast, and good-looking applications, and App Foundation brings them all together in a smart way!
              </p>
            </section>

            {/* Call to Action - View GitHub */}
            <section className="py-12 text-center">
                <h2 className="text-3xl font-bold mb-4 text-white">Want to See More of My Coding Adventures?</h2>
                <p className="text-xl text-app-foundation-text-dark/90 mb-8 max-w-xl mx-auto">
                    While App Foundation itself is my special project, you can see other cool things I&apos;m working on over at my GitHub profile. It&apos;s like my public workshop!
                </p>
                <Button 
                    size="lg" 
                    className="bg-gradient-to-r from-app-foundation-start to-app-foundation-end hover:from-app-foundation-end hover:to-app-foundation-start text-white font-semibold text-lg py-3 px-8 rounded-lg shadow-lg hover:shadow-app-foundation-accent-light/40 transition-all duration-300 transform hover:scale-105 border-2 border-app-foundation-accent-dark/50 hover:border-app-foundation-accent-light"
                    asChild
                >
                  <a href="https://github.com/JTPeters" target="_blank" rel="noopener noreferrer">
                    <Github className="mr-2 h-5 w-5" /> Visit My GitHub Profile
                  </a>
                </Button>
            </section>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 px-6 md:px-10 text-center border-t border-app-foundation-accent-dark/30">
        <p className="text-app-foundation-text-dark/80 text-sm">
          &copy; {new Date().getFullYear()} JTP Nexus. Exploring the future, one line of code at a time.
        </p>
        <p className="text-xs text-app-foundation-text-dark/70 mt-1">
           This page explains the "App Foundation" project by JT Peters.
        </p>
      </footer>
    </div>
  );
} 