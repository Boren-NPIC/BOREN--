import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { AppProvider } from './context/AppContext';
import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { SeriesDetailPage } from './pages/SeriesDetailPage';
import { WatchPage } from './pages/WatchPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { ProfilePage } from './pages/ProfilePage';
import { MembershipPage } from './pages/MembershipPage';
import { PaymentPage } from './pages/PaymentPage';
import {
  CreatorDashboardPage,
  CreatorMyContentPage,
  CreatorUploadPage,
} from './pages/CreatorPages';
import { AdminPage } from './pages/AdminPage';

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/movies" element={<CatalogPage mode="movies" />} />
              <Route path="/series" element={<CatalogPage mode="series" />} />
              <Route path="/free" element={<CatalogPage mode="free" />} />
              <Route path="/premium" element={<CatalogPage mode="premium" />} />
              <Route path="/category/:slug" element={<CatalogPage mode="category" />} />
              <Route path="/series/:id" element={<SeriesDetailPage />} />
              <Route path="/watch/:episodeId" element={<WatchPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/creator/dashboard" element={<CreatorDashboardPage />} />
              <Route path="/creator/upload" element={<CreatorUploadPage />} />
              <Route path="/creator/my-content" element={<CreatorMyContentPage />} />
              <Route path="/membership" element={<MembershipPage />} />
              <Route path="/payment" element={<PaymentPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}
