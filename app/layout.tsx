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
          <AppHeader loadFixture={loadFixture} />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
        </RuntimeProvider>
      </body>
    </html>
  )
}
