import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  const forwardedHost = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
  const safeHost = /^[a-z0-9.-]+(?::\d+)?$/i.test(forwardedHost) ? forwardedHost : "";
  const forwardedProtocol = headerStore.get("x-forwarded-proto");
  const protocol = forwardedProtocol === "http" || safeHost.startsWith("localhost") ? "http" : "https";
  const origin = safeHost
    ? `${protocol}://${safeHost}`
    : "https://hooc-shopping-shorts.ltd-korea-in-5392.chatgpt.site";
  const socialImage = new URL("/og-veo.png", origin).href;
  const title = "HOOC — 사진 한 장이 15초 쇼츠로";
  const description = "쿠팡 상품 이미지와 Google Veo 3.1로 실제 움직이는 15초 쇼핑 쇼츠를 만드는 AI 스튜디오";

  return {
    title,
    description,
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: socialImage, width: 1732, height: 907, alt: "사진 한 장을 15초 쇼츠로 만드는 HOOC" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
