import "./globals.css";

export const metadata = { title: "Keep Supply Prospector", description: "Industrial refrigeration prospecting" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
