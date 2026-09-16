import type { Metadata } from "next"
import "./globals.css"

import { modelInterpreterAvailable } from "@/app/actions/interpret"
import { AppShellNav } from "@/components/shared/AppShellNav"
import { RuntimeProvider } from "@/components/shared/RuntimeProvider"

export const metadata: Metadata = {
  title: "Rocketlane Governance Agent",
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
        <RuntimeProvider modelAvailable={modelAvailable}>
          <div className="flex min-h-0 flex-1">
            <AppShellNav />
            <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
          </div>
        </RuntimeProvider>
      </body>
    </html>
  )
}
