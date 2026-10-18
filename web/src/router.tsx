import { createBrowserRouter, type RouteObject } from 'react-router';
import { BillDetailPage } from './pages/BillDetailPage';
import { BillFormPage } from './pages/BillFormPage';
import { BillsTab } from './pages/BillsTab';
import { BillTypesTab } from './pages/BillTypesTab';
import { ErrorPage } from './pages/ErrorPage';
import { HomeLayout } from './pages/HomeLayout';
import { HomesPage } from './pages/HomesPage';
import { PeopleTab } from './pages/PeopleTab';
import { SettingsTab } from './pages/SettingsTab';
import { SummaryTab } from './pages/SummaryTab';
import { AppShell } from './components/AppShell';

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    errorElement: <ErrorPage />,
    children: [
      { path: '/', element: <HomesPage /> },
      {
        path: '/homes/:homeId',
        element: <HomeLayout />,
        children: [
          { index: true, element: <BillsTab /> },
          { path: 'bills/new', element: <BillFormPage /> },
          { path: 'bills/:billId', element: <BillDetailPage /> },
          { path: 'bills/:billId/edit', element: <BillFormPage /> },
          { path: 'people', element: <PeopleTab /> },
          { path: 'bill-types', element: <BillTypesTab /> },
          { path: 'summary', element: <SummaryTab /> },
          { path: 'settings', element: <SettingsTab /> },
        ],
      },
      { path: '*', element: <ErrorPage notFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
