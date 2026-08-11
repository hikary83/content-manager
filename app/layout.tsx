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
  const socialImage = new URL("/og-hikary.png", origin).href;
  const title = "HIKARY — 4단계 쇼핑 쇼츠 제작 플래너";
  const description = "상품 선택부터 콘셉트, 참고 이미지, 자막 없는 Google Flow 프롬프트까지 단계별로 완성하는 쇼핑 쇼츠 기획 도구";

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
      images: [{ url: socialImage, width: 1731, height: 909, alt: "상품 선택부터 Flow 프롬프트까지 완성하는 HIKARY" }],
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
