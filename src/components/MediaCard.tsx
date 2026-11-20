import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, Play, Star } from 'lucide-react';
import type { Series } from '../types';

interface MediaCardProps {
  item: Series;
  categoryLabel?: string;
}

export function MediaCard({ item, categoryLabel }: MediaCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <Link
      to={`/series/${item.id}`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-xl"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-[#12121c] border border-white/10 transition-transform duration-200 ease-out group-hover:-translate-y-1">
        {!imgFailed && item.posterUrl ? (
          <img
            src={item.posterUrl}
            alt={item.title}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#19162b] via-[#111119] to-[#0b1822] flex flex-col items-center justify-center p-4 text-center">
            <Film className="w-8 h-8 text-zinc-500 mb-3" />
            <span className="text-sm font-medium text-zinc-200 line-clamp-2">{item.title}</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />

        <div className="absolute inset-x-0 bottom-0 p-3.5 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-wide text-zinc-300 flex items-center gap-1.5">
              <span className={item.isPremium ? 'text-purple-300' : 'text-cyan-300'}>
                {item.isPremium ? 'Premium' : 'Free'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">{item.releaseYear}</span>
              {item.ratingAvg > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-0.5 font-mono-tabular text-zinc-200">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    {item.ratingAvg.toFixed(1)}
                  </span>
                </>
              )}
            </p>
          </div>

          <span
            aria-hidden="true"
            className="w-9 h-9 rounded-full bg-purple-600/90 text-white flex items-center justify-center opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 shrink-0"
          >
            <Play className="w-4 h-4 fill-white ml-0.5" />
          </span>
        </div>
      </div>

      <div className="mt-2.5 space-y-0.5 px-0.5">
        <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-cyan-300 transition-colors truncate">
          {item.title}
        </h3>
        {item.khmerTitle && (
          <p className="text-xs text-zinc-400 truncate">{item.khmerTitle}</p>
        )}
        <p className="text-xs text-zinc-500 truncate">
          {categoryLabel || item.categorySlug.replace('-', ' ')} · {item.type === 'movie' ? 'Movie' : 'Series'}
        </p>
      </div>
    </Link>
  );
}
