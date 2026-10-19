import React, { useState } from 'react';
import { DoctorSidebar } from './DoctorSidebar';
import { DoctorDashboardPage } from './Dashboard/DoctorDashboardPage';
import { DoctorPatientListPage } from './PatientList/DoctorPatientListPage';
import { DoctorPackagesPage } from './Packages/DoctorPackagesPage';
import { DoctorTotalRevenuePage } from './TotalRevenue/DoctorTotalRevenuePage';
import { PatientFilePage } from '../PatientFile/PatientFilePage';

interface DoctorLayoutProps {
  doctorCategory?: string; // 'Head Doctor' | 'Employee Doctor'
  doctorName?: string;
  onLogout?: () => void;
}

export const DoctorLayout: React.FC<DoctorLayoutProps> = ({
  doctorCategory = 'Head Doctor',
  doctorName = 'Dr. Prashanth K Vaidya',
  onLogout,
}) => {
  const getTabFromUrl = () => {
    const path = window.location.pathname.toLowerCase().replace(/^\//, '');
    if (path === 'revenue' || path === 'total_revenue' || path === 'total-revenue' || path === 'finance') return 'total_revenue';
    if (path === 'packages') return 'packages';
    if (path === 'patient_list' || path === 'patients') return 'patient_list';
    if (path === 'patient_file') return 'patient_file';
    return 'dashboard';
  };

  const [activeTab, setActiveTab] = useState<string>(getTabFromUrl);
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);

  const isHeadDoctor = doctorCategory === 'Head Doctor' || doctorName.includes('Prashanth') || doctorName.includes('Rama') || doctorName.includes('Jobedah');

  const handleNavigate = (tab: string, data?: any) => {
    if (data) {
      setSelectedPatient(data);
    }
    setActiveTab(tab);

    let targetPath = '/doctor';
    if (tab === 'total_revenue' || tab === 'revenue') targetPath = '/revenue';
    else if (tab === 'packages') targetPath = '/packages';
    else if (tab === 'patient_list') targetPath = '/patients';
    else if (tab === 'patient_file') targetPath = '/patient_file';
    else targetPath = '/doctor';

    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  };

  React.useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
      case 'doctor':
        return (
          <DoctorDashboardPage
            doctorCategory={isHeadDoctor ? 'Head Doctor' : 'Employee Doctor'}
            doctorName={doctorName}
            onNavigateTab={handleNavigate}
          />
        );
      case 'patient_file':
        if (!selectedPatient) {
          return (
            <DoctorDashboardPage
              doctorCategory={isHeadDoctor ? 'Head Doctor' : 'Employee Doctor'}
              doctorName={doctorName}
              onNavigateTab={handleNavigate}
            />
          );
        }
        return (
          <PatientFilePage
            initialPatient={selectedPatient}
            isDoctor={true}
            onBack={() => setActiveTab('dashboard')}
            onSubmitConsultation={() => setActiveTab('dashboard')}
          />
        );
      case 'patient_list':
        return (
          <DoctorPatientListPage
            doctorName={doctorName}
            doctorCategory={isHeadDoctor ? 'Head Doctor' : 'Employee Doctor'}
            onNavigateTab={handleNavigate}
          />
        );
      case 'packages':
        return isHeadDoctor ? <DoctorPackagesPage doctorName={doctorName} /> : <DoctorDashboardPage doctorCategory="Employee Doctor" doctorName={doctorName} />;
      case 'total_revenue':
      case 'revenue':
        return isHeadDoctor ? <DoctorTotalRevenuePage /> : <DoctorDashboardPage doctorCategory="Employee Doctor" doctorName={doctorName} />;
      default:
        return (
          <DoctorDashboardPage
            doctorCategory={isHeadDoctor ? 'Head Doctor' : 'Employee Doctor'}
            doctorName={doctorName}
            onNavigateTab={setActiveTab}
          />
        );
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)', background: '#f8fafc' }}>
      <DoctorSidebar
        activeTab={activeTab}
        setActiveTab={handleNavigate}
        isHeadDoctor={isHeadDoctor}
        onLogout={onLogout}
        doctorName={doctorName}
      />
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {renderContent()}
      </main>
    </div>
  );
};
