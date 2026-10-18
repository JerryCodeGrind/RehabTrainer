import type { Metadata, Viewport } from "next";
import { Comfortaa } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./components/auth/AuthProvider";
import { Ripples } from "./components/motion/Ripples";
import "./globals.css";

// next/font self-hosts Comfortaa at build time; globals.css falls back to
// rounded system faces if it ever fails to load.
const comfortaa = Comfortaa({
  variable: "--font-comfortaa",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "rupert",
  description: "home rehab exercises with live pose tracking.",
};

export const viewport: Viewport = {
  themeColor: "#f8faf7",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${comfortaa.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Ripples />
        </AuthProvider>
      </body>
    </html>
  );
}
