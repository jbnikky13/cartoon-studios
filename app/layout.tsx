import "./globals.css";
import type { Metadata } from "next";
export const metadata:Metadata={title:"Cartoon Studio — Song to Story",description:"Turn songs into animated stories, character actions and visualizer videos."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
