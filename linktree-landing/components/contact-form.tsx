"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CheckCircle } from "lucide-react"

interface ContactFormProps {
  onClose: () => void
}

export function ContactForm({ onClose }: ContactFormProps) {
  const [formState, setFormState] = useState<"idle" | "submitting" | "success">("idle")
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormState("submitting")

    // Simulate form submission
    setTimeout(() => {
      console.log("Form submitted:", formData)
      setFormState("success")
    }, 1500)
  }

  if (formState === "success") {
    return (
      <div className="relative flex flex-col items-center justify-center py-8 text-center">
        <div className="animate-pulse">
          <CheckCircle className="mb-4 h-20 w-20 text-green-500" />
        </div>
        <h3 className="mb-2 text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-500 to-teal-500">
          Message Sent!
        </h3>
        <p className="mb-6 text-slate-600 dark:text-slate-400">Thanks for reaching out. I'll get back to you soon!</p>
        <Button
          onClick={onClose}
          className="bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600"
        >
          Close
        </Button>
      </div>
    )
  }

  return (
    <div className="relative py-2">
      <h2 className="mb-4 text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400">
        Get in Touch
      </h2>
      <p className="mb-6 text-slate-600 dark:text-slate-400">
        Have a question or want to collaborate? Send me a message and I'll get back to you as soon as possible.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Name
          </label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Your name"
            required
            className="border-slate-300 bg-white/50 backdrop-blur-sm focus:border-purple-500 focus:ring-purple-500 dark:border-slate-600 dark:bg-slate-700/50"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="your.email@example.com"
            required
            className="border-slate-300 bg-white/50 backdrop-blur-sm focus:border-purple-500 focus:ring-purple-500 dark:border-slate-600 dark:bg-slate-700/50"
          />
        </div>

        <div>
          <label htmlFor="phone" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Phone (optional)
          </label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
            placeholder="(123) 456-7890"
            className="border-slate-300 bg-white/50 backdrop-blur-sm focus:border-purple-500 focus:ring-purple-500 dark:border-slate-600 dark:bg-slate-700/50"
          />
        </div>

        <div>
          <label htmlFor="message" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Message
          </label>
          <Textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleChange}
            placeholder="How can I help you?"
            rows={4}
            required
            className="border-slate-300 bg-white/50 backdrop-blur-sm focus:border-purple-500 focus:ring-purple-500 dark:border-slate-600 dark:bg-slate-700/50"
          />
        </div>

        <div className="flex justify-end space-x-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={formState === "submitting"}
            className="border-slate-300 bg-white/50 backdrop-blur-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/50 dark:hover:bg-slate-700"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={formState === "submitting"}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            {formState === "submitting" ? "Sending..." : "Send Message"}
          </Button>
        </div>
      </form>
    </div>
  )
}
