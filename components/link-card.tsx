import Link from "next/link"
import { ArrowRight, Layers, Search, Flame, Apple } from "lucide-react"

interface LinkCardProps {
  title: string
  description: string
  href: string
  ctaText: string
  gradient: string
  icon: "layers" | "search" | "flame" | "apple"
  onClick?: () => void
}

export function LinkCard({ title, description, href, ctaText, gradient, icon, onClick }: LinkCardProps) {
  const iconMap = {
    layers: Layers,
    search: Search,
    flame: Flame,
    apple: Apple,
  } as const

  const IconComponent = iconMap[icon] || Layers

  const buttonClasses = `group/button inline-flex items-center rounded-lg bg-gradient-to-r ${gradient} px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:shadow-lg`

  const ButtonContent = () => (
    <>
      {ctaText}
      <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover/button:translate-x-1" />
    </>
  )

  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/50 bg-white/80 backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl dark:border-slate-700/50 dark:bg-slate-800/50">
      <div
        className="absolute inset-0 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-10"
        style={{ backgroundImage: `linear-gradient(to right, var(--tw-gradient-stops))` }}
      ></div>
      <div
        className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-gradient-to-br opacity-30 blur-3xl transition-all duration-500 group-hover:opacity-40 group-hover:blur-2xl"
        style={{ backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-stops))` }}
      ></div>

      <div className="relative z-10 p-6">
        <div className="mb-4 flex items-center">
          <div className={`mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-r ${gradient} text-white`}>
            <IconComponent className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
        </div>

        <p className="mb-4 text-slate-600 dark:text-slate-400">{description}</p>

        {onClick ? (
          <button onClick={onClick} className={buttonClasses}>
            <ButtonContent />
          </button>
        ) : (
          <Link href={href} className={buttonClasses}>
            <ButtonContent />
          </Link>
        )}
      </div>

      <div
        className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r opacity-70 transition-all duration-300 group-hover:opacity-100"
        style={{ backgroundImage: `linear-gradient(to right, var(--tw-gradient-stops))` }}
      ></div>
    </div>
  )
}
