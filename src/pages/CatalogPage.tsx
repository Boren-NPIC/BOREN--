import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MediaCard } from '../components/MediaCard';
import { filterCatalog } from '../utils/media';
import type { ContentType } from '../types';

interface CatalogPageProps {
  mode: 'movies' | 'series' | 'free' | 'premium' | 'category';
}

export function CatalogPage({ mode }: CatalogPageProps) {
  const { slug } = useParams<{ slug: string }>();
  const { catalog, categories, catalogLoading } = useApp();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'latest' | 'popular' | 'rating'>('latest');
  const [categoryFilter, setCategoryFilter] = useState<string>(
    mode === 'category' && slug ? slug : 'all'
  );
  const [accessFilter, setAccessFilter] = useState<'all' | 'free' | 'premium'>(
    mode === 'free' ? 'free' : mode === 'premium' ? 'premium' : 'all'
  );
  const [typeFilter, setTypeFilter] = useState<ContentType | 'all'>(
    mode === 'movies' ? 'movie' : mode === 'series' ? 'series' : 'all'
  );

  const activeCategorySlug = mode === 'category' && slug ? slug : categoryFilter;
  const activeAccess = mode === 'free' ? 'free' : mode === 'premium' ? 'premium' : accessFilter;
  const activeType = mode === 'movies' ? 'movie' : mode === 'series' ? 'series' : typeFilter;

  const activeCategoryObj = categories.find((c) => c.slug === activeCategorySlug);

  const heading = useMemo(() => {
    if (mode === 'movies') return { title: 'Movies', subtitle: 'Feature films and community cinema releases' };
    if (mode === 'series') return { title: 'TV Series & Dramas', subtitle: 'Multi-episode dramas across Khmer, Chinese, Korean & Thai catalogs' };
    if (mode === 'free') return { title: 'Free Movies & Series', subtitle: 'Watch instantly with zero membership fees' };
    if (mode === 'premium') return { title: 'Premium Exclusives', subtitle: 'Members-only dramas, early finales, and ad-free cinema' };
    return {
      title: activeCategoryObj ? activeCategoryObj.name : 'Category Collection',
      subtitle: activeCategoryObj?.khmerName
        ? `${activeCategoryObj.khmerName} — ${activeCategoryObj.description || ''}`
        : 'Explore curated dramas in this category',
    };
  }, [mode, activeCategoryObj]);

  const categoryNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) map[c.slug] = c.name;
    return map;
  }, [categories]);

  const filtered = useMemo(
    () =>
      filterCatalog(catalog, {
        search,
        categorySlug: activeCategorySlug,
        type: activeType,
        access: activeAccess,
        sort,
      }),
    [catalog, search, activeCategorySlug, activeType, activeAccess, sort]
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="border-b border-white/10 pb-6 space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold text-white">{heading.title}</h1>
        <p className="text-sm sm:text-base text-zinc-400">{heading.subtitle}</p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <label htmlFor="catalog-search" className="sr-only">
            Search catalog
          </label>
          <input
            id="catalog-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by title, Khmer name, or studio..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#111119] border border-white/10 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {mode !== 'category' && (
            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3.5 py-2.5 rounded-lg bg-[#111119] border border-white/10 text-sm text-zinc-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {mode !== 'free' && mode !== 'premium' && (
            <select
              aria-label="Filter by access tier"
              value={accessFilter}
              onChange={(e) => setAccessFilter(e.target.value as 'all' | 'free' | 'premium')}
              className="px-3.5 py-2.5 rounded-lg bg-[#111119] border border-white/10 text-sm text-zinc-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="all">Free & Premium</option>
              <option value="free">Free Only</option>
              <option value="premium">Premium Only</option>
            </select>
          )}

          {mode !== 'movies' && mode !== 'series' && (
            <select
              aria-label="Filter by format"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as ContentType | 'all')}
              className="px-3.5 py-2.5 rounded-lg bg-[#111119] border border-white/10 text-sm text-zinc-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="all">Movies & Series</option>
              <option value="series">TV Series</option>
              <option value="movie">Movies</option>
            </select>
          )}

          <select
            aria-label="Sort results"
            value={sort}
            onChange={(e) => setSort(e.target.value as 'latest' | 'popular' | 'rating')}
            className="px-3.5 py-2.5 rounded-lg bg-[#111119] border border-white/10 text-sm text-zinc-200 focus:outline-none focus:border-cyan-400"
          >
            <option value="latest">Latest Uploads</option>
            <option value="popular">Most Popular</option>
            <option value="rating">Highest Rated</option>
          </select>
        </div>
      </div>

      {/* Results Grid */}
      {catalogLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#111119] p-12 text-center space-y-3">
          <p className="text-base font-medium text-white">No titles match your current filters.</p>
          <p className="text-sm text-zinc-400">Adjust your search query or reset filters to view all published titles.</p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCategoryFilter('all');
              setAccessFilter('all');
              setTypeFilter('all');
            }}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-medium text-white"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
          {filtered.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              categoryLabel={categoryNameMap[item.categorySlug]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
