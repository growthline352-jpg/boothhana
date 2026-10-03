import { AdminEventComments } from '../features/catalog/AdminEventComments'
import { OwnershipManagement } from '../features/support/OwnershipManagement'
import { AdminSeries } from '../features/support/AdminSeries'
import { LibraryPage } from '../features/library/LibraryPage'
import { OnboardingPage } from '../features/interests/OnboardingPage'
import { AccountPage } from '../pages/AccountPage'
import { SupportHome,SupportNew,SupportDetail,ManagedExhibitors } from '../features/support/SupportPages'
import { GuestSupportPage } from '../features/support/GuestSupportPage'
import { AdminSupportList,AdminSupportDetail } from '../features/support/AdminSupportPages'
import { SupportBoundary } from '../features/support/SupportBoundary'
import { GoodsAdminPage } from '../features/goods/GoodsAdminPage'
import { CatalogAdminPage } from '../features/catalog/CatalogAdminPage'
import { CatalogPublicPage, CatalogPublicDetail, CatalogPublicBoothDetail } from '../features/catalog/CatalogPublicPage'
import { createBrowserRouter, Navigate } from 'react-router'
import { SubcultureCollectionPage } from '../features/collection/SubcultureCollectionPage'
import { PublicLayout } from '../components/layout/PublicLayout'
import { ConsoleLayout } from '../components/layout/ConsoleLayout'
import { HomePage } from '../pages/HomePage'
import { LoginPage } from '../pages/LoginPage'
import { AdminLoginPage } from '../pages/AdminLoginPage'
import { BoothDetailPage, EventDetailPage, EventsPage, ProductDetailPage } from '../pages/PublicPages'
import { ReservationCreatePage, ReservationDetailPage, ReservationsPage } from '../pages/ReservationPages'
import { CreatorCatalogBoothPage } from '../features/creator/CreatorCatalogBoothPage'
import { CreatorPublicEventsPage } from '../features/creator/CreatorPublicEventsPage'
import { CreatorBoothsPage, CreatorEventBoothPage, CreatorEventsPage, CreatorHomePage, CreatorNoticesPage, CreatorPosPage, CreatorProductsPage, CreatorReservationsPage } from '../pages/CreatorPages'
import { AdminApplicationsPage, AdminEventFormPage, AdminEventsPage } from '../pages/AdminPages'
import { EmptyState } from '../components/ui/States'

export const router = createBrowserRouter([
  { path: '/', element: <PublicLayout />, children: [
    { index: true, element: <HomePage /> },
    { path: 'library', element: <SupportBoundary><LibraryPage/></SupportBoundary> },
    { path: 'onboarding', element: <SupportBoundary><OnboardingPage/></SupportBoundary> },
    { path: 'account', element: <SupportBoundary><AccountPage/></SupportBoundary> },
    { path: 'support', element: <SupportBoundary><SupportHome/></SupportBoundary> },
    { path: 'support/new', element: <SupportBoundary><SupportNew/></SupportBoundary> },
    { path: 'support/guest', element: <SupportBoundary><GuestSupportPage/></SupportBoundary> },
    { path: 'support/tickets/:id', element: <SupportBoundary><SupportDetail/></SupportBoundary> },
    { path: 'login', element: <LoginPage /> },
    { path: 'events', element: <EventsPage /> },
    { path: 'discover', element: <CatalogPublicPage /> },
    { path: 'discover/:eventId/booths/:participantId', element: <CatalogPublicBoothDetail /> },
    { path: 'discover/:eventId', element: <CatalogPublicDetail /> },
    { path: 'events/:eventId', element: <EventDetailPage /> },
    { path: 'booths/:boothId', element: <BoothDetailPage /> },
    { path: 'booths/:boothId/reserve', element: <ReservationCreatePage /> },
    { path: 'products/:productId', element: <ProductDetailPage /> },
    { path: 'reservations', element: <ReservationsPage /> },
    { path: 'reservations/:reservationId', element: <ReservationDetailPage /> },
  ] },
  { path: '/admin/login', element: <AdminLoginPage /> },
  { element: <ConsoleLayout role="CREATOR" access="ownership" />, children: [
    { path: '/support/management', element: <SupportBoundary><OwnershipManagement/></SupportBoundary> },
  ] },
  { path: '/creator', element: <ConsoleLayout role="CREATOR" />, children: [
    { index: true, element: <CreatorHomePage /> },
    { path: 'events', element: <CreatorEventsPage /> },
    { path: 'booths', element: <CreatorBoothsPage /> },
    { path: 'catalog/events', element: <CreatorPublicEventsPage /> },
    { path: 'catalog/events/:eventId/booths/new', element: <CreatorCatalogBoothPage /> },
    { path: 'catalog/events/:eventId/booths/:participantId', element: <CreatorCatalogBoothPage /> },
    { path: 'event-booths/:eventBoothId', element: <CreatorEventBoothPage /> },
    { path: 'event-booths/:eventBoothId/products', element: <CreatorProductsPage /> },
    { path: 'reservations', element: <CreatorReservationsPage /> },
    { path: 'pos', element: <CreatorPosPage /> },
    { path: 'managed-exhibitors', element: <SupportBoundary><ManagedExhibitors/></SupportBoundary> },
    { path: 'notices', element: <CreatorNoticesPage /> },
  ] },
  { path: '/admin', element: <ConsoleLayout role="ADMIN" />, children: [
    { index: true, element: <Navigate to="subculture" replace /> },
    { path: 'events', element: <AdminEventsPage /> },
    { path: 'events/:eventId', element: <AdminEventFormPage /> },
    { path: 'applications', element: <AdminApplicationsPage /> },
    { path: 'comments', element: <AdminEventComments/> },
    { path: 'reports', element: <SupportBoundary><AdminSupportList kind="REPORT"/></SupportBoundary> },
    { path: 'inquiries', element: <SupportBoundary><AdminSupportList kind="INQUIRY"/></SupportBoundary> },
    { path: 'event-series', element: <SupportBoundary><AdminSeries/></SupportBoundary> },
    { path: 'ownership', element: <SupportBoundary><AdminSupportList kind="CLAIM"/></SupportBoundary> },
    { path: 'support/:id', element: <SupportBoundary><AdminSupportDetail/></SupportBoundary> },
    { path: 'goods-showcase', element: <GoodsAdminPage /> },
    { path: 'subculture', element: <CatalogAdminPage /> },
    { path: 'subculture/legacy', element: <SubcultureCollectionPage /> },
  ] },
  { path: '*', element: <section className="section-pad"><EmptyState title="페이지를 찾을 수 없습니다" description="주소를 확인하거나 팬 홈으로 돌아가 주세요." /></section> },
])
