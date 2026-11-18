import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Layout } from "../Layout";
import { MemeResult } from "../MemeResult";
import { api, type Meme } from "../lib/api";

declare global {
  interface Window { __MEME__?: { id: string } }
}

export default function Share() {
  const { id = "" } = useParams();
  const [meme, setMeme] = useState<Meme | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api.get(id).then(setMeme).catch(() => setMissing(true));
  }, [id]);

  return (
    <Layout>
      {missing && <p className="text-lg">This meme isn't available. <Link to="/" className="font-semibold underline">Make your own</Link>.</p>}
      {meme && (
        <>
          <MemeResult meme={meme} onChange={setMeme} />
          <div className="mt-10 rounded-2xl bg-red px-6 py-8 text-white">
            <p className="meme-caption text-3xl sm:text-4xl">Your turn.</p>
            <Link to="/" className="btn mt-4 bg-white text-ink hover:bg-wash">Make your own meme</Link>
          </div>
        </>
      )}
    </Layout>
  );
}
