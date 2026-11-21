import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProvider } from './store/appStore';
import { RequireAuth } from './components/layout/RequireAuth';
import { ToastContainer } from './components/ui/ToastContainer';

// Mobile Volunteer App Screens
import { SplashScreen } from './pages/mobile/SplashScreen';
import { VolunteerLogin } from './pages/mobile/VolunteerLogin';
import { VolunteerDashboard } from './pages/mobile/VolunteerDashboard';
import { VolunteerSurveys } from './pages/mobile/VolunteerSurveys';
import { VolunteerSurveyWizard } from './pages/mobile/VolunteerSurveyWizard';
import { VolunteerDocuments } from './pages/mobile/VolunteerDocuments';
import { VolunteerSync } from './pages/mobile/VolunteerSync';
import { VolunteerProfile } from './pages/mobile/VolunteerProfile';

// Web Admin Dashboard Screens
import { AdminLogin } from './pages/admin/AdminLogin';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminSurveys } from './pages/admin/AdminSurveys';
import { AdminDocuments } from './pages/admin/AdminDocuments';
import { AdminVolunteers } from './pages/admin/AdminVolunteers';
import { AdminReviews } from './pages/admin/AdminReviews';
import { AdminAnalytics } from './pages/admin/AdminAnalytics';
import { AdminExports } from './pages/admin/AdminExports';
import { AdminClusters } from './pages/admin/AdminClusters';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminAuditLog } from './pages/admin/AdminAuditLog';

const queryClient = new QueryClient();

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            {/* Landing / Splash */}
            <Route path="/" element={<SplashScreen />} />

            {/* Mobile Volunteer Application */}
            <Route path="/volunteer/splash" element={<SplashScreen />} />
            <Route path="/volunteer/login" element={<VolunteerLogin />} />
            <Route path="/volunteer" element={<RequireAuth area="volunteer"><VolunteerDashboard /></RequireAuth>} />
            <Route path="/volunteer/surveys" element={<RequireAuth area="volunteer"><VolunteerSurveys /></RequireAuth>} />
            <Route path="/volunteer/surveys/new" element={<RequireAuth area="volunteer"><VolunteerSurveyWizard /></RequireAuth>} />
            <Route path="/volunteer/surveys/:id" element={<RequireAuth area="volunteer"><VolunteerSurveyWizard /></RequireAuth>} />
            <Route path="/volunteer/documents" element={<RequireAuth area="volunteer"><VolunteerDocuments /></RequireAuth>} />
            <Route path="/volunteer/documents/:householdId" element={<RequireAuth area="volunteer"><VolunteerDocuments /></RequireAuth>} />
            <Route path="/volunteer/sync" element={<RequireAuth area="volunteer"><VolunteerSync /></RequireAuth>} />
            <Route path="/volunteer/profile" element={<RequireAuth area="volunteer"><VolunteerProfile /></RequireAuth>} />

            {/* Web Admin Dashboard */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<RequireAuth area="admin"><AdminDashboard /></RequireAuth>} />
            <Route path="/admin/surveys" element={<RequireAuth area="admin"><AdminSurveys /></RequireAuth>} />
            <Route path="/admin/documents" element={<RequireAuth area="admin"><AdminDocuments /></RequireAuth>} />
            <Route path="/admin/volunteers" element={<RequireAuth area="admin"><AdminVolunteers /></RequireAuth>} />
            <Route path="/admin/reviews" element={<RequireAuth area="admin"><AdminReviews /></RequireAuth>} />
            <Route path="/admin/analytics" element={<RequireAuth area="admin"><AdminAnalytics /></RequireAuth>} />
            <Route path="/admin/exports" element={<RequireAuth area="admin"><AdminExports /></RequireAuth>} />
            <Route path="/admin/clusters" element={<RequireAuth area="admin"><AdminClusters /></RequireAuth>} />
            <Route path="/admin/users" element={<RequireAuth area="admin" roles={['SUPER_ADMIN', 'ADMIN']}><AdminUsers /></RequireAuth>} />
            <Route path="/admin/settings" element={<RequireAuth area="admin"><AdminSettings /></RequireAuth>} />
            <Route path="/admin/audit" element={<RequireAuth area="admin"><AdminAuditLog /></RequireAuth>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <ToastContainer />
        </BrowserRouter>
      </AppProvider>
    </QueryClientProvider>
  );
};

export default App;

