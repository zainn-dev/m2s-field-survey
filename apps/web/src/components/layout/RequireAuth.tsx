import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import type { Role } from '../../types/survey';

const ADMIN_CONSOLE_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'];

/** Full-screen loader shown while the session is being restored. */
export const SessionLoader: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#FAF8F2]">
    <div className="flex flex-col items-center gap-3 text-[#5C5547] text-sm">
      <span className="w-9 h-9 rounded-full border-[3px] border-[#D9AE00]/25 border-t-[#FDC513] animate-spin" />
      Loading M2S Field Survey…
    </div>
  </div>
);

/**
 * Route guard.
 *  - area "admin": SUPER_ADMIN / ADMIN / SUPERVISOR (optionally narrowed with `roles`)
 *  - area "volunteer": any signed-in role (admins can also run surveys in the field app)
 */
export const RequireAuth: React.FC<{ area: 'admin' | 'volunteer'; roles?: Role[]; children: React.ReactNode }> = ({ area, roles, children }) => {
  const { authStatus, currentUser } = useAppStore();
  const location = useLocation();
  if (authStatus === 'loading') return <SessionLoader />;
  if (authStatus === 'signedOut') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/${area}/login?next=${next}`} replace />;
  }
  if (area === 'admin' && !ADMIN_CONSOLE_ROLES.includes(currentUser.role)) return <Navigate to="/volunteer" replace />;
  if (roles && !roles.includes(currentUser.role)) return <Navigate to={area === 'admin' ? '/admin' : '/volunteer'} replace />;
  return <>{children}</>;
};

/** Where to land after sign-in (honours ?next= when it stays inside the same area). */
export function postLoginPath(search: string, area: 'admin' | 'volunteer', role: Role) {
  const next = new URLSearchParams(search).get('next');
  if (next && next.startsWith(`/${area}`) && !next.startsWith(`/${area}/login`)) return next;
  if (area === 'admin' && !ADMIN_CONSOLE_ROLES.includes(role)) return '/volunteer';
  return area === 'admin' ? '/admin' : '/volunteer';
}
