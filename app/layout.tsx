import type { Metadata } from "next"
import "./globals.css"

import { loadFixture } from "@/app/actions/fixtures"
import { interpretUtterance, modelInterpreterAvailable } from "@/app/actions/interpret"
import { AppHeader } from "@/components/shared/AppHeader"
import { RuntimeProvider } from "@/components/shared/RuntimeProvider"

export const metadata: Metadata = {
  title: "Acme · Governance Agent",
  description: "A project governance agent: state an outcome, the system owns the complexity.",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const modelAvailable = await modelInterpreterAvailable()
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex h-full min-h-full flex-col">
        <RuntimeProvider
          loadFixture={loadFixture}
          interpret={interpretUtterance}
          modelAvailable={modelAvailable}
        >
          <svg aria-hidden width="0" height="0" className="absolute">
            <defs>
              <linearGradient id="vibe-gradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#7b68ee" />
                <stop offset="0.45" stopColor="#ff6ec7" />
                <stop offset="0.75" stopColor="#ffb955" />
                <stop offset="1" stopColor="#49ccf9" />
              </linearGradient>
            </defs>
          </svg>
          <AppHeader />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
        </RuntimeProvider>
      </body>
    </html>
  )
}
