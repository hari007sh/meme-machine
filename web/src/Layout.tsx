import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";

export function Layout({ children, hero }: { children: ReactNode; hero?: ReactNode }) {
  const nav = ({ isActive }: { isActive: boolean }) => `rounded-lg px-2.5 py-1.5 ${isActive ? "bg-black/15" : "hover:bg-black/10"}`;
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="bg-red text-white">
        <header className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="font-meme text-2xl tracking-wide uppercase">Meme Machine</Link>
          <nav className="flex gap-1 text-sm font-semibold" aria-label="Main">
            <NavLink to="/stats" className={nav}>Stats</NavLink>
            <NavLink to="/log" className={nav}>Build log</NavLink>
          </nav>
        </header>
        {hero}
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:justify-between">
          <p>Templates from Imgflip. Matched by Amazon Titan + OpenSearch, captioned by Qwen3 running on a dedicated GPU.</p>
          <p className="flex gap-4">
            <a href="https://github.com/hari007sh/meme-machine" className="hover:text-ink">GitHub</a>
            <a href="https://hookboard.net" className="hover:text-ink">Hookboard</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
