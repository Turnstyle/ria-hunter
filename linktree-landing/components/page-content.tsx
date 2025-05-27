'use client'

import { useState } from "react"
import { SocialLinks } from "@/components/social-links"
import { LinkCard } from "@/components/link-card"
import { BackgroundAnimation } from "@/components/background-animation"
import { JobSparcComingSoonModal } from "@/components/jobsparc-coming-soon-modal"
import { ProduceSectionComingSoonModal } from "@/components/produce-section-coming-soon-modal"

export function PageContent() {
  const [isJobSparcModalOpen, setIsJobSparcModalOpen] = useState(false)
  const [isProduceModalOpen, setIsProduceModalOpen] = useState(false)

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-slate-900 dark:via-purple-950 dark:to-slate-900">
      <BackgroundAnimation />

      <main className="container relative z-10 mx-auto px-4 pt-8 sm:px-6 lg:px-8 pb-28">
        <div className="mx-auto max-w-4xl">
          {/* Description Box */}
          <div className="mb-10 p-6 text-center">
            <h1 className="relative mb-6 text-center text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400">
              Welcome to My Digital Hub
            </h1>
            <p className="relative text-lg text-slate-700 dark:text-slate-300 text-center">
              Hey there! 👋 Welcome to my little corner of the internet where you'll find a bunch of tools I've built.
              Feel free to explore for free! To keep things running smoothly (and the bots away!), you may need to
              create an account. Dive&nbsp;in&nbsp;and&nbsp;have&nbsp;fun!&nbsp;✨
            </p>
          </div>

          {/* Links Section */}
          <div className="grid gap-6 md:grid-cols-2">
            <LinkCard
              title="AppFoundation Test"
              description="A breeding ground for my earliest vibe coding projects"
              href="/app-foundation"
              ctaText="Give It A Try"
              gradient="from-emerald-500 to-teal-500"
              icon="layers"
            />
            <LinkCard
              title="RIA Hunter"
              description="Find out who's who in private investments"
              href="/ria-hunter"
              ctaText="Give It A Try"
              gradient="from-custom-purple-start to-custom-purple-end"
              icon="search"
            />
            <LinkCard
              title="JobSparc"
              description="Spark the flame that ignites your job hunt"
              href="#"
              ctaText="Give It A Try"
              gradient="from-orange-500 to-pink-500"
              icon="flame"
              onClick={() => setIsJobSparcModalOpen(true)}
            />
            <LinkCard
              title="The Produce Section"
              description="A whimsical GenAI Image maker for people who love their fruits & veggies"
              href="#"
              ctaText="Give It A Try"
              gradient="from-green-500 to-lime-500"
              icon="apple"
              onClick={() => setIsProduceModalOpen(true)}
            />
          </div>
        </div>

        {/* Social Links Floating Box */}
        <SocialLinks />

        {/* Modals */}
        <JobSparcComingSoonModal isOpen={isJobSparcModalOpen} onClose={() => setIsJobSparcModalOpen(false)} />
        <ProduceSectionComingSoonModal isOpen={isProduceModalOpen} onClose={() => setIsProduceModalOpen(false)} />

        {/* Decorative elements */}
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-purple-300 opacity-20 blur-3xl dark:bg-purple-900"></div>
        <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-blue-300 opacity-20 blur-3xl dark:bg-blue-900"></div>
      </main>
    </div>
  )
} 