import type { Metadata } from "next"
import { PageContent } from "@/components/page-content"

export const metadata: Metadata = {
  title: "My Digital Hub",
  description: "A collection of tools and resources I've built",
}

export default function Page() {
  return <PageContent />
}
