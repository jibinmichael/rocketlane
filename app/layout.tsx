import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Rocketlane Governance Agent",
  description: "A project governance agent: state an outcome, the system owns the complexity.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
