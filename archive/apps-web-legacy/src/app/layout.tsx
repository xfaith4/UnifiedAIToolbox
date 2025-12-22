import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Unified AI Toolbox",
  description: "A comprehensive suite of AI-powered tools to streamline your workflow.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans">
        <header className="bg-gray-800 text-white p-4">
          <nav className="container mx-auto flex justify-between">
            <Link href="/" className="text-xl font-bold">
              Unified AI Toolbox
            </Link>
            <div>
              <Link href="/prompts" className="mr-4">
                Prompts
              </Link>
              <Link href="/agents" className="mr-4">
                Agents
              </Link>
              <Link href="/orchestration" className="mr-4">
                Orchestration
              </Link>
              <Link href="/code-review">
                Code Review
              </Link>
            </div>
          </nav>
        </header>
        <main className="container mx-auto p-4">
          {children}
        </main>
      </body>
    </html>
  );
}
