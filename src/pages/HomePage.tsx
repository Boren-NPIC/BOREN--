import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Crown, Play, Search, Upload } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MediaCard } from '../components/MediaCard';
import { filterCatalog } from '../utils/media';
import { formatKhr, khrToUsdReference } from '../utils/billing';

export function HomePage() {
  const { catalog, categories, siteSettings, catalogLoading } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categoryNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) map[c.slug] = c.name;
    return map;
  }, [categories]);

  const featuredSeries = useMemo(
    () => catalog.find((s) => s.featured) || catalog[0] || null,
    [catalog]
  );

  const searchResults = useMemo(() => {
    if (!searchQuery.trim() && selectedCategory === 'all') return null;
    return filterCatalog(catalog, {
      search: searchQuery,
      categorySlug: selectedCategory,
      sort: 'popular',
    });
  }, [catalog, searchQuery, selectedCategory]);

  const popularSeries = useMemo(
    () => filterCatalog(catalog, { type: 'series', sort: 'popular' }).slice(0, 5),
    [catalog]
  );

  const latestMovies = useMemo(
    () => filterCatalog(catalog, { type: 'movie', sort: 'latest' }).slice(0, 5),
    [catalog]
  );

  const freeCatalog = useMemo(
    () => filterCatalog(catalog, { access: 'free', sort: 'latest' }).slice(0, 5),
    [catalog]
  );

  const premiumCatalog = useMemo(
    () => filterCatalog(catalog, { access: 'premium', sort: 'popular' }).slice(0, 5),
    [catalog]
  );

  const heroImage =
    siteSettings.heroBannerUrl ||
    featuredSeries?.coverUrl ||
    '/src/assets/images/hero_angkor_twilight_1795154613551.jpg';

  return (
    <div className="space-y-9 pb-12">
      {/* Cinematic Full-Bleed Hero Banner */}
      <section className="relative min-h-[380px] lg:min-h-[430px] flex items-end border-b border-white/10 overflow-hidden">
        <img
          src={heroImage}
          alt={featuredSeries?.title || 'BORINA TV Featured Drama'}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07070b] via-[#07070b]/65 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07070b]/95 via-[#07070b]/55 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-9 lg:py-11">
          <div className="max-w-2xl space-y-3.5">
            <p className="text-xs sm:text-sm font-medium text-cyan-300 tracking-wide">
              Featured Premiere · {featuredSeries ? categoryNameMap[featuredSeries.categorySlug] || 'Khmer Drama' : 'Khmer Drama'} · {featuredSeries?.releaseYear || 2026}
            </p>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.08]">
              {siteSettings.heroTitle || featuredSeries?.title || 'Twilight Over Angkor'}
            </h1>
            {featuredSeries?.khmerTitle && (
              <p className="text-lg sm:text-xl text-purple-200/90 font-normal">
                {featuredSeries.khmerTitle}
              </p>
            )}
            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-xl">
              {siteSettings.heroSubtitle || featuredSeries?.description}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {featuredSeries && (
                <Link
                  to={`/series/${featuredSeries.id}`}
                  className="inline-flex items-center gap-2.5 px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  <Play className="w-4 h-4 fill-white" />
                  Watch Now
                </Link>
              )}
              <Link
                to="/membership"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-zinc-100 text-sm font-medium transition-colors whitespace-nowrap"
              >
                <Crown className="w-4 h-4 text-cyan-300" />
                Premium from {formatKhr(siteSettings.monthlyPriceKhr)}/mo
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Search & Category Discovery Toolbar */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-xl">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <label htmlFor="home-search" className="sr-only">
              Search dramas, movies, or Khmer titles
            </label>
            <input
              id="home-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dramas, movies, studios, or Khmer titles..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#111119] border border-white/10 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div
            role="tablist"
            aria-label="Filter by drama category"
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pr-2 lg:pr-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === 'all'}
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-purple-600 text-white'
                  : 'bg-[#111119] text-zinc-300 hover:text-white border border-white/10'
              }`}
            >
              All Dramas
            </button>
            {categories.map((cat) => (
              <button
                key={cat.slug}
                type="button"
                role="tab"
                aria-selected={selectedCategory === cat.slug}
                onClick={() => setSelectedCategory(cat.slug)}
                className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  selectedCategory === cat.slug
                    ? 'bg-purple-600 text-white'
                    : 'bg-[#111119] text-zinc-300 hover:text-white border border-white/10'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Live Filtered Search Results */}
        {searchResults !== null && (
          <div className="pt-2 space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-xl font-semibold text-white">
                {selectedCategory !== 'all'
                  ? categoryNameMap[selectedCategory] || 'Filtered Dramas'
                  : 'Search Results'}{' '}
                <span className="text-sm font-normal text-zinc-400 font-mono-tabular">
                  ({searchResults.length})
                </span>
              </h2>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="text-xs font-medium text-cyan-300 hover:text-cyan-200"
              >
                Clear filters
              </button>
            </div>

            {searchResults.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-[#111119] p-10 text-center space-y-2">
                <p className="text-base font-medium text-zinc-200">No matching movies or dramas found.</p>
                <p className="text-sm text-zinc-400">
                  Try another keyword or clear your category filter to explore the full catalog.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
                {searchResults.map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    categoryLabel={categoryNameMap[item.categorySlug]}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Curated Rows when not actively filtering */}
      {searchResults === null && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
          {catalogLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="space-y-2.5 animate-pulse">
                  <div className="aspect-[3/4] rounded-xl bg-white/5" />
                  <div className="h-4 w-3/4 rounded bg-white/5" />
                  <div className="h-3 w-1/2 rounded bg-white/5" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Row 1: Popular Series */}
              <CatalogRow
                title="Popular Series"
                subtitle="Most watched Khmer, Korean, Chinese & Thai dramas"
                viewAllTo="/series"
                items={popularSeries}
                categoryNameMap={categoryNameMap}
              />

              {/* Row 2: Free Movies & Dramas */}
              <CatalogRow
                title="Free to Watch"
                subtitle="Instant streaming with zero subscription required"
                viewAllTo="/free"
                items={freeCatalog}
                categoryNameMap={categoryNameMap}
              />

              {/* Row 3: Premium Exclusives */}
              <CatalogRow
                title="Premium Originals"
                subtitle={`Full access from ${formatKhr(siteSettings.monthlyPriceKhr)} / month (${khrToUsdReference(siteSettings.monthlyPriceKhr, siteSettings.exchangeRateKhrPerUsd)})`}
                viewAllTo="/premium"
                items={premiumCatalog}
                categoryNameMap={categoryNameMap}
              />

              {/* Row 4: Latest Movies */}
              <CatalogRow
                title="Latest Movies"
                subtitle="Recently uploaded feature films and cinema specials"
                viewAllTo="/movies"
                items={latestMovies}
                categoryNameMap={categoryNameMap}
              />
            </>
          )}

          {/* Category Showcase Grid */}
          <section className="space-y-5 pt-2">
            <div className="flex items-end justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white">Browse by Region & Culture</h2>
                <p className="text-sm text-zinc-400 mt-0.5">
                  Dedicated collections for Southeast & East Asian storytelling
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {categories.map((cat) => (
                <Link
                  key={cat.slug}
                  to={`/category/${cat.slug}`}
                  className="group rounded-xl border border-white/10 bg-[#111119] hover:border-cyan-400/50 p-5 transition-colors flex flex-col justify-between gap-3"
                >
                  <div>
                    <h3 className="text-base font-semibold text-white group-hover:text-cyan-300 transition-colors">
                      {cat.name}
                    </h3>
                    {cat.khmerName && (
                      <p className="text-sm text-purple-300/90 mt-0.5">{cat.khmerName}</p>
                    )}
                    {cat.description && (
                      <p className="text-xs text-zinc-400 mt-2 line-clamp-2 leading-relaxed">
                        {cat.description}
                      </p>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300">
                    Explore collection
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* Creator Community Banner */}
          <section className="rounded-2xl border border-white/10 bg-[#111119] p-8 sm:p-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs font-medium text-cyan-300 tracking-wide">
                BORINA TV Creator Program
              </p>
              <h2 className="text-2xl sm:text-3xl font-semibold text-white">
                Share your films and dramas with Cambodia
              </h2>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Upload posters, cover art, MP4/HLS episodes, and Khmer/English subtitles through our moderated Creator Studio. Every submission is reviewed for quality and copyright integrity.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Link
                to="/creator/upload"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                Upload Content
              </Link>
              <Link
                to="/creator/dashboard"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-sm font-medium transition-colors whitespace-nowrap"
              >
                Creator Dashboard
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function CatalogRow({
  title,
  subtitle,
  viewAllTo,
  items,
  categoryNameMap,
}: {
  title: string;
  subtitle: string;
  viewAllTo: string;
  items: ReturnType<typeof filterCatalog>;
  categoryNameMap: Record<string, string>;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-white">{title}</h2>
          <p className="text-sm text-zinc-400 mt-0.5">{subtitle}</p>
        </div>
        <Link
          to={viewAllTo}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap shrink-0"
        >
          View all
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
        {items.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            categoryLabel={categoryNameMap[item.categorySlug]}
          />
        ))}
      </div>
    </section>
  );
}
