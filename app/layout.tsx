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
  const socialImage = new URL("/og-hikary-continuity.png", origin).href;
  const title = "HIKARY — 5단계 쇼핑 쇼츠 제작·운영 스튜디오";
  const description = "상품 정체성과 이전 장면을 잠그는 이어 만들기 프롬프트로, 추천부터 Flow 영상·자막·SNS 게시 관리까지 5단계로 완성하세요.";

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
      images: [{ url: socialImage, width: 1659, height: 948, alt: "동일 상품과 동일 장면을 유지해 8초 영상을 15초로 이어 만드는 HIKARY" }],
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
