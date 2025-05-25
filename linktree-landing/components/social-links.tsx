"use client"

import { useState } from "react"
import { Github, Linkedin, Mail, X } from "lucide-react"
import { ContactForm } from "./contact-form"
import { Button } from "@/components/ui/button"
import { XLogo } from "./icons/x-logo"

export function SocialLinks() {
  const [showContactForm, setShowContactForm] = useState(false)

  return (
    <>
      <div className="fixed bottom-2 left-0 right-0 z-20 border-t border-white/50 bg-white/80 px-2 pt-2 pb-2 shadow-xl backdrop-blur-sm transition-all duration-300 dark:border-slate-700/50 dark:bg-slate-800/50 md:w-auto md:rounded-2xl md:border md:left-auto md:right-6 md:top-1/2 md:-translate-y-1/2 md:px-4 md:pt-4 md:pb-3 md:hover:shadow-2xl">
        <div className="flex justify-around items-center space-x-1 md:flex-col md:space-x-0 md:space-y-4">
          <a
            href="https://www.linkedin.com/in/j-t-peters/"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-blue-600 p-2 text-white shadow-md transition-all duration-300 hover:shadow-lg md:h-12 md:w-12"
            aria-label="LinkedIn Profile"
          >
            <Linkedin className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
          </a>
          <a
            href="https://x.com/JTPeters_"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-slate-700 to-slate-900 p-2 text-white shadow-md transition-all duration-300 hover:shadow-lg md:h-12 md:w-12"
            aria-label="X (formerly Twitter) Profile"
          >
            <XLogo className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
          </a>
          <a
            href="https://github.com/Turnstyle"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-slate-700 to-slate-900 p-2 text-white shadow-md transition-all duration-300 hover:shadow-lg dark:from-slate-600 dark:to-slate-800 md:h-12 md:w-12"
            aria-label="GitHub Profile"
          >
            <Github className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
          </a>
          <Button
            onClick={() => setShowContactForm(true)}
            variant="outline"
            size="icon"
            className="group flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 p-2 text-white shadow-md transition-all duration-300 hover:shadow-lg md:h-12 md:w-12"
            aria-label="Contact Me"
          >
            <Mail className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
          </Button>
        </div>
      </div>

      {/* Contact Form Modal */}
      {showContactForm && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            // Close if clicking the backdrop
            if (e.target === e.currentTarget) {
              setShowContactForm(false);
            }
          }}
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-sm dark:bg-slate-800/90">
            <div className="absolute -left-20 -top-20 h-40 w-40 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 opacity-20 blur-3xl"></div>
            <div className="absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-gradient-to-br from-blue-400 to-teal-400 opacity-20 blur-3xl"></div>

            <Button
              onClick={() => setShowContactForm(false)}
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 rounded-full hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white z-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Button>
            <ContactForm onClose={() => setShowContactForm(false)} />
          </div>
        </div>
      )}
    </>
  )
}
