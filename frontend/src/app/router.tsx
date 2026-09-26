import { LibraryPage } from '../features/library/LibraryPage'
import { SupportHome,SupportNew,SupportDetail,ManagedExhibitors } from '../features/support/SupportPages'
import { GuestSupportPage } from '../features/support/GuestSupportPage'
import { AdminSupportList,AdminSupportDetail } from '../features/support/AdminSupportPages'
import { SupportBoundary } from '../features/support/SupportBoundary'
import { GoodsAdminPage } from '../features/goods/GoodsAdminPage'
import { CatalogAdminPage } from '../features/catalog/CatalogAdminPage'
import { CatalogPublicPage, CatalogPublicDetail } from '../features/catalog/CatalogPublicPage'
import { createBrowserRouter, Navigate } from 'react-router'
import { SubcultureCollectionPage } from '../features/collection/SubcultureCollectionPage'
import { PublicLayout } from '../components/layout/PublicLayout'
import { ConsoleLayout } from '../components/layout/ConsoleLayout'
import { HomePage } from '../pages/HomePage'
import { LoginPage } from '../pages/LoginPage'
import { BoothDetailPage, EventDetailPage, EventsPage, ProductDetailPage } from '../pages/PublicPages'
import { ReservationCreatePage, ReservationDetailPage, ReservationsPage } from '../pages/ReservationPages'
import { CreatorBoothsPage, CreatorEventBoothPage, CreatorEventsPage, CreatorHomePage, CreatorNoticesPage, CreatorPosPage, CreatorProductsPage, CreatorReservationsPage } from '../pages/CreatorPages'
import { AdminApplicationsPage, AdminEventFormPage, AdminEventsPage } from '../pages/AdminPages'
import { EmptyState } from '../components/ui/States'

export const router = createBrowserRouter([
  { path: '/', element: <PublicLayout />, children: [
    { index: true, element: <HomePage /> },
    { path: 'library', element: <SupportBoundary><LibraryPage/></SupportBoundary> },
    { path: 'support', element: <SupportBoundary><SupportHome/></SupportBoundary> },
    { path: 'support/new', element: <SupportBoundary><SupportNew/></SupportBoundary> },
    { path: 'support/guest', element: <SupportBoundary><GuestSupportPage/></SupportBoundary> },
    { path: 'support/tickets/:id', element: <SupportBoundary><SupportDetail/></SupportBoundary> },
    { path: 'login', element: <LoginPage /> },
    { path: 'events', element: <EventsPage /> },
    { path: 'discover', element: <CatalogPublicPage /> },
    { path: 'discover/:eventId', element: <CatalogPublicDetail /> },
    { path: 'events/:eventId', element: <EventDetailPage /> },
    { path: 'booths/:boothId', element: <BoothDetailPage /> },
    { path: 'booths/:boothId/reserve', element: <ReservationCreatePage /> },
    { path: 'products/:productId', element: <ProductDetailPage /> },
    { path: 'reservations', element: <ReservationsPage /> },
    { path: 'reservations/:reservationId', element: <ReservationDetailPage /> },
  ] },
  { path: '/creator', element: <ConsoleLayout role="CREATOR" />, children: [
    { index: true, element: <CreatorHomePage /> },
    { path: 'events', element: <CreatorEventsPage /> },
    { path: 'booths', element: <CreatorBoothsPage /> },
    { path: 'event-booths/:eventBoothId', element: <CreatorEventBoothPage /> },
    { path: 'event-booths/:eventBoothId/products', element: <CreatorProductsPage /> },
    { path: 'reservations', element: <CreatorReservationsPage /> },
    { path: 'pos', element: <CreatorPosPage /> },
    { path: 'managed-exhibitors', element: <SupportBoundary><ManagedExhibitors/></SupportBoundary> },
    { path: 'notices', element: <CreatorNoticesPage /> },
  ] },
  { path: '/admin', element: <ConsoleLayout role="ADMIN" />, children: [
    { index: true, element: <Navigate to="events" replace /> },
    { path: 'events', element: <AdminEventsPage /> },
    { path: 'events/:eventId', element: <AdminEventFormPage /> },
    { path: 'applications', element: <AdminApplicationsPage /> },
    { path: 'reports', element: <SupportBoundary><AdminSupportList kind="REPORT"/></SupportBoundary> },
    { path: 'inquiries', element: <SupportBoundary><AdminSupportList kind="INQUIRY"/></SupportBoundary> },
    { path: 'ownership', element: <SupportBoundary><AdminSupportList kind="CLAIM"/></SupportBoundary> },
    { path: 'support/:id', element: <SupportBoundary><AdminSupportDetail/></SupportBoundary> },
    { path: 'goods-showcase', element: <GoodsAdminPage /> },
    { path: 'subculture', element: <CatalogAdminPage /> },
    { path: 'subculture/legacy', element: <SubcultureCollectionPage /> },
  ] },
  { path: '*', element: <section className="section-pad"><EmptyState title="페이지를 찾을 수 없습니다" description="주소를 확인하거나 팬 홈으로 돌아가 주세요." /></section> },
])
