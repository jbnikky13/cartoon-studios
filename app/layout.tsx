import "./globals.css";
import type { Metadata } from "next";
export const metadata:Metadata={title:"Cartoon Studio — Anime Music Video Director",description:"Create original anime storyboards, generate scene artwork, animate characters and produce music videos in your browser."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
