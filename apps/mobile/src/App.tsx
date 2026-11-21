import React, { useEffect } from 'react';
import { BrowserRouter, HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { SplashScreen as CapSplash } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { isNativeCapacitor } from './api/http';
import { MobileProvider, useMobileStore } from './store/mobileStore';
import { SplashScreen } from './pages/SplashScreen';
import { VolunteerLogin } from './pages/VolunteerLogin';
import { VolunteerDashboard } from './pages/VolunteerDashboard';
import { AssignedClusters } from './pages/AssignedClusters';
import { VolunteerSurveys } from './pages/VolunteerSurveys';
import { VolunteerSurveyWizard } from './pages/VolunteerSurveyWizard';
import { VolunteerDocuments } from './pages/VolunteerDocuments';
import { VolunteerSync } from './pages/VolunteerSync';
import { VolunteerProfile } from './pages/VolunteerProfile';

const RequireVolunteerAuth: React.FC = () => {
  const { authStatus } = useMobileStore();
  if (authStatus === 'loading') return <SplashScreen />;
  if (authStatus === 'signedOut') return <Navigate to="/login" replace />;
  return <Outlet />;
};

const NativeSplashHider: React.FC = () => {
  const { authStatus } = useMobileStore();
  useEffect(() => {
    if (!isNativeCapacitor()) return;
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);
    StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
    StatusBar.setBackgroundColor({ color: '#FDC513' }).catch(() => undefined);

    // Safeguard timer: unconditionally hide the native splash screen after 500ms
    // so the app never freezes on a blank yellow splash, even on slow networks or cold start.
    const timer = setTimeout(() => {
      CapSplash.hide().catch(() => undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (authStatus !== 'loading' && isNativeCapacitor()) {
      CapSplash.hide().catch(() => undefined);
    }
  }, [authStatus]);
  return null;
};

export const MobileAppRoutes: React.FC = () => (
  <>
    <NativeSplashHider />
    <Routes>
      <Route path="/" element={<SplashScreen />} />
      <Route path="/login" element={<VolunteerLogin />} />

      <Route element={<RequireVolunteerAuth />}>
        <Route path="/dashboard" element={<VolunteerDashboard />} />
        <Route path="/clusters" element={<AssignedClusters />} />
        <Route path="/surveys" element={<VolunteerSurveys />} />
        <Route path="/surveys/new" element={<VolunteerSurveyWizard />} />
        <Route path="/surveys/:id" element={<VolunteerSurveyWizard />} />
        <Route path="/documents" element={<VolunteerDocuments />} />
        <Route path="/documents/:householdId" element={<VolunteerDocuments />} />
        <Route path="/sync" element={<VolunteerSync />} />
        <Route path="/profile" element={<VolunteerProfile />} />
      </Route>

      {/* Volunteer-only app: never expose Admin routes; redirect unknown paths cleanly */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  </>
);

export const App: React.FC = () => {
  const Router = isNativeCapacitor() ? HashRouter : BrowserRouter;
  return (
    <MobileProvider>
      <Router>
        <MobileAppRoutes />
      </Router>
    </MobileProvider>
  );
};

export default App;

