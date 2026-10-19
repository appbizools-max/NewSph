import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/Home/HomePage';
import { RemediesPage } from './pages/Remedies/RemediesPage';
import { ConsultationPage } from './pages/Consultation/ConsultationPage';
import { ProfilePage } from './pages/Profile/ProfilePage';
import { AuthPage, WebLoginSuccessData } from './pages/Auth/AuthPage';
import { signOutUser, CanonicalBranchId, resolveCanonicalBranchId, AuthUserSession, db } from '@app/shared';

// Lazy Loaded Role Portals (Loaded on-demand to optimize initial loading)
const AdminDashboardPage = lazy(() => import('./pages/Admin/AdminDashboardPage').then(m => ({ default: m.AdminDashboardPage })));
const HRDashboardPage = lazy(() => import('./pages/HR/HRDashboardPage').then(m => ({ default: m.HRDashboardPage })));
const DoctorLayout = lazy(() => import('./pages/Doctor/DoctorLayout').then(m => ({ default: m.DoctorLayout })));
const StaffDashboardPage = lazy(() => import('./pages/Staff/StaffDashboardPage').then(m => ({ default: m.StaffDashboardPage })));
const PatientFilePage = lazy(() => import('./pages/PatientFile/PatientFilePage').then(m => ({ default: m.PatientFilePage })));
// Lazy Loaded Reception Sub-Pages
const ReceptionLayout = lazy(() => import('./pages/Reception/ReceptionLayout').then(m => ({ default: m.ReceptionLayout })));
const ReceptionDashboardPage = lazy(() => import('./pages/Reception/Dashboard/ReceptionDashboardPage').then(m => ({ default: m.ReceptionDashboardPage })));
const BookAppointmentPage = lazy(() => import('./pages/Reception/BookAppointment/BookAppointmentPage').then(m => ({ default: m.BookAppointmentPage })));
const AllPatientsPage = lazy(() => import('./pages/Reception/AllPatients/AllPatientsPage').then(m => ({ default: m.AllPatientsPage })));
const FollowUpsPage = lazy(() => import('./pages/Reception/FollowUps/FollowUpsPage').then(m => ({ default: m.FollowUpsPage })));
const MedicineRequestsPage = lazy(() => import('./pages/Reception/MedicineRequests/MedicineRequestsPage').then(m => ({ default: m.MedicineRequestsPage })));
const ProductBillingPage = lazy(() => import('./pages/Reception/ProductBilling/ProductBillingPage').then(m => ({ default: m.ProductBillingPage })));
const DoctorNoShowPage = lazy(() => import('./pages/Reception/DoctorNoShow/DoctorNoShowPage').then(m => ({ default: m.DoctorNoShowPage })));
const MediaManagerPage = lazy(() => import('./pages/Reception/MediaManager/MediaManagerPage').then(m => ({ default: m.MediaManagerPage })));
const CleaningPhotosPage = lazy(() => import('./pages/Reception/CleaningPhotos/CleaningPhotosPage').then(m => ({ default: m.CleaningPhotosPage })));
const ShiprocketPage = lazy(() => import('./pages/Reception/Shiprocket/ShiprocketPage').then(m => ({ default: m.ShiprocketPage })));
const PortalLoadingFallback = () => (
  <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
    <div style={{
      width: '36px',
      height: '36px',
      border: '3px solid #e2e8f0',
      borderTop: '3px solid #258ec8',
      borderRadius: '50%',
      animation: 'sphSpin 0.8s linear infinite'
    }} />
    <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Loading portal...</span>
    <style>{`
      @keyframes sphSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `}</style>
  </div>
);
const AUTH_STORAGE_KEY = 'sph_auth_session';
export default function App() {
  // Read persistent auth session on initial load
  const [authSession, setAuthSession] = useState<{ role: string; userName?: string; branchId: CanonicalBranchId; branchName: string; branchPhone: string; staffId?: string } | null>(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          branchId: resolveCanonicalBranchId(parsed?.branchId || parsed?.branchName) || 'kphb'
        };
      }
    } catch (e) { }
    return null;
  });
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.role === 'admin') return 'admin';
        if (parsed?.role === 'hr') return 'hr';
        if (parsed?.role === 'doctor') return 'doctor';
        if (parsed?.role === 'staff') return 'staff';
        return 'reception_dashboard';
      }
    } catch (e) { }
    return 'auth';
  });

  const [userName, setUserName] = useState(authSession?.userName || '');
  const [branchId, setBranchId] = useState<CanonicalBranchId>(authSession?.branchId || 'kphb');
  const [branchName, setBranchName] = useState(authSession?.branchName || 'KPHB Branch');
  const [branchPhone, setBranchPhone] = useState(authSession?.branchPhone || '+91 90301 76176');
  const [staffId, setStaffId] = useState(authSession?.staffId || '1');


  // Normalized currentUser Context available to all features
  const currentUser = useMemo(() => ({
    role: (authSession?.role || 'reception') as any,
    userName,
    branchId,
    branchName,
    branchPhone,
    staffId
  }), [authSession?.role, userName, branchId, branchName, branchPhone, staffId]);

  const handleLoginSuccess = (data: WebLoginSuccessData) => {
    const resolvedBranchId = data.branchId || resolveCanonicalBranchId(data.branchName) || 'kphb';
    const sessionData = {
      role: data.role,
      userName: data.userName || '',
      branchId: resolvedBranchId,
      branchName: data.branchName,
      branchPhone: data.branchPhone,
      staffId: data.staffId || '1',
    };
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (e) { }

    setAuthSession(sessionData);
    setUserName(data.userName || '');
    setBranchId(resolvedBranchId);
    setBranchName(data.branchName);
    setBranchPhone(data.branchPhone);
    setStaffId(data.staffId || '1');

    if (data.role === 'admin') {
      setActiveTab('admin');
      const curPath = window.location.pathname.toLowerCase();
      if (curPath === '/login' || curPath === '/' || curPath === '/auth') {
        window.history.pushState({}, '', '/dashboard');
      }
    } else if (data.role === 'hr') {
      setActiveTab('hr');
      window.history.pushState({}, '', '/hr');
    } else if (data.role === 'doctor') {
      setActiveTab('doctor');
      window.history.pushState({}, '', '/doctor');
    } else if (data.role === 'staff') {
      setActiveTab('staff');
      window.history.pushState({}, '', '/staff');
    } else {
      setActiveTab('reception_dashboard');
      window.history.pushState({}, '', '/reception');
    }
  };

  const handleLogout = async () => {
    if (!window.confirm('Are you sure you want to log out?')) return;
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (e) { }
    await signOutUser();
    setAuthSession(null);
    setActiveTab('auth');
    if (window.location.pathname !== '/login') {
      window.history.pushState({}, '', '/login');
    }
  };

  // Sync tab navigation with logout
  useEffect(() => {
    if (activeTab === 'auth' && authSession) {
      handleLogout();
    }
  }, [activeTab]);

  const isAuthPage = activeTab === 'auth';
  const isReceptionRoute = activeTab.startsWith('reception');

  const [selectedPatientForFile, setSelectedPatientForFile] = useState<any>(null);
  const [fileReturnTab, setFileReturnTab] = useState<string>('reception_dashboard');
  const [checkoutPatientForReception, setCheckoutPatientForReception] = useState<any>(null);

  // Keep-Alive Tab State Preservation for Web Reception
  const [visitedReceptionTabs, setVisitedReceptionTabs] = useState<Set<string>>(() => new Set(['reception_dashboard']));

  useEffect(() => {
    if (activeTab && (activeTab.startsWith('reception') || activeTab === 'patient_file')) {
      setVisitedReceptionTabs(prev => {
        const next = new Set(prev);
        next.add(activeTab);
        return next;
      });
    }
  }, [activeTab]);

  const handleNavigateWithData = (tab: string, data?: any) => {
    if (data) {
      setSelectedPatientForFile(data);
    }
    if (tab === 'reception_patient_file') {
      setFileReturnTab(activeTab);
    }
    setActiveTab(tab);
  };

  const renderReceptionSubPage = () => {
    const isDashboard = activeTab === 'reception' || activeTab === 'reception_dashboard';

    return (
      <div style={{ position: 'relative', width: '100%', minHeight: '100%' }}>
        <div style={{ display: isDashboard ? 'block' : 'none' }}>
          <ReceptionDashboardPage
            currentBranch={branchName}
            onNavigate={handleNavigateWithData}
            initialPatientForCheckout={checkoutPatientForReception}
            onClearInitialCheckout={() => setCheckoutPatientForReception(null)}
          />
        </div>

        {visitedReceptionTabs.has('reception_book') && (
          <div style={{ display: activeTab === 'reception_book' ? 'block' : 'none' }}>
            <BookAppointmentPage currentBranch={branchName} userRole={userRole} onNavigate={setActiveTab} />
          </div>
        )}

        {visitedReceptionTabs.has('reception_patients') && (
          <div style={{ display: activeTab === 'reception_patients' ? 'block' : 'none' }}>
            <AllPatientsPage currentBranch={branchName} onNavigate={handleNavigateWithData} />
          </div>
        )}

        {visitedReceptionTabs.has('reception_followups') && (
          <div style={{ display: activeTab === 'reception_followups' ? 'block' : 'none' }}>
            <FollowUpsPage onNavigate={handleNavigateWithData} currentBranch={branchName} branchId={branchId} />
          </div>
        )}

        {visitedReceptionTabs.has('reception_medicines') && (
          <div style={{ display: activeTab === 'reception_medicines' ? 'block' : 'none' }}>
            <MedicineRequestsPage currentBranch={branchName} userRole={userRole} onNavigate={setActiveTab} />
          </div>
        )}

        {visitedReceptionTabs.has('reception_billing') && (
          <div style={{ display: activeTab === 'reception_billing' ? 'block' : 'none' }}>
            <ProductBillingPage />
          </div>
        )}

        {visitedReceptionTabs.has('reception_noshow') && (
          <div style={{ display: activeTab === 'reception_noshow' ? 'block' : 'none' }}>
            <DoctorNoShowPage currentBranch={branchName} />
          </div>
        )}

        {visitedReceptionTabs.has('reception_media') && (
          <div style={{ display: activeTab === 'reception_media' ? 'block' : 'none' }}>
            <MediaManagerPage />
          </div>
        )}

        {visitedReceptionTabs.has('reception_cleaning') && (
          <div style={{ display: activeTab === 'reception_cleaning' ? 'block' : 'none' }}>
            <CleaningPhotosPage />
          </div>
        )}

        {visitedReceptionTabs.has('reception_shiprocket') && (
          <div style={{ display: activeTab === 'reception_shiprocket' ? 'block' : 'none' }}>
            <ShiprocketPage />
          </div>
        )}

        {(visitedReceptionTabs.has('reception_patient_file') || activeTab === 'reception_patient_file') && selectedPatientForFile && (
          <div style={{ display: activeTab === 'reception_patient_file' ? 'block' : 'none' }}>
            <PatientFilePage
              initialPatient={selectedPatientForFile}
              onBack={() => setActiveTab(fileReturnTab || 'reception_dashboard')}
              onSubmitConsultation={(savedPatient) => {
                setCheckoutPatientForReception({ ...selectedPatientForFile, ...savedPatient });
                setActiveTab('reception_dashboard');
              }}
            />
          </div>
        )}
      </div>
    );
  };

  const userRole = authSession?.role;

  // Route guard to ensure Admin, HR, Doctor and Staff stay inside their dedicated portals
  useEffect(() => {
    if (userRole === 'admin' && activeTab !== 'admin') {
      setActiveTab('admin');
    } else if (userRole === 'hr' && activeTab !== 'hr') {
      setActiveTab('hr');
    } else if (userRole === 'doctor' && activeTab !== 'doctor') {
      setActiveTab('doctor');
    } else if (userRole === 'staff' && activeTab !== 'staff') {
      setActiveTab('staff');
    }
  }, [userRole, activeTab]);

  const renderCurrentPage = () => {
    if (userRole === 'admin') {
      return <AdminDashboardPage role={userRole} />;
    }

    if (userRole === 'hr') {
      return <HRDashboardPage currentBranch={branchName} />;
    }

    if (userRole === 'doctor') {
      const isEmployee = (userName || '').toLowerCase().includes('padma');
      return (
        <DoctorLayout
          doctorName={userName}
          doctorCategory={isEmployee ? 'Employee Doctor' : 'Head Doctor'}
          onLogout={handleLogout}
        />
      );
    }

    if (userRole === 'staff') {
      return (
        <StaffDashboardPage
          currentStaffId={staffId || ''}
          currentStaffName={userName || 'Staff Member'}
          currentBranch={branchName ? branchName.replace(' Branch', '') : ''}
        />
      );
    }

    if (isReceptionRoute) {
      return (
        <ReceptionLayout activeTab={activeTab} setActiveTab={setActiveTab}>
          {renderReceptionSubPage()}
        </ReceptionLayout>
      );
    }

    switch (activeTab) {
      case 'auth':
        return <AuthPage onLoginSuccess={handleLoginSuccess} />;
      case 'home':
        return <HomePage onNavigate={setActiveTab} />;
      case 'remedies':
        return <RemediesPage />;
      case 'consultation':
        return <ConsultationPage />;
      case 'profile':
        return <ProfilePage />;
      default:
        return <AuthPage onLoginSuccess={handleLoginSuccess} />;
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      {/* Hide navbar on Login page */}
      {!isAuthPage && (
        <Navbar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            if (tab === 'auth') {
              handleLogout();
            } else {
              setActiveTab(tab);
            }
          }}
          userName={userName || authSession?.userName}
          branchName={branchName}
          branchPhone={branchPhone}
          role={authSession?.role}
        />
      )}
      <main style={{ flex: 1 }}>
        <Suspense fallback={<PortalLoadingFallback />}>
          {renderCurrentPage()}
        </Suspense>
      </main>

      {/* Hide footer on Login page */}
      {!isAuthPage && (
        <footer style={{
          background: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          padding: '20px',
          textAlign: 'center',
          color: '#64748b',
          fontSize: '13px'
        }}>
          <p>© 2026 Spiritual Homeo Staff & Patient Portal</p>
        </footer>
      )}
    </div>
  );
}
