import React from 'react';
import { LayoutDashboard, Users, Package, TrendingUp, LogOut, FileText } from 'lucide-react';
import { signOutUser } from '@app/shared';

interface DoctorSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isHeadDoctor: boolean;
  onLogout?: () => void;
  doctorName?: string;
}

export const DoctorSidebar: React.FC<DoctorSidebarProps> = ({
  activeTab,
  setActiveTab,
  isHeadDoctor,
  onLogout,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'patient_list', label: 'Patient List', icon: Users },
    ...(isHeadDoctor ? [
      { id: 'packages', label: 'Packages', icon: Package },
      { id: 'total_revenue', label: 'Total Revenue', icon: TrendingUp },
    ] : []),
  ];

  const handleLogout = async () => {
    if (!window.confirm('Are you sure you want to log out?')) return;
    await signOutUser();
    if (onLogout) {
      onLogout();
    } else {
      setActiveTab('auth');
    }
  };
  return (
    <aside style={{
      width: '240px',
      background: '#ffffff',
      borderRight: '1px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '20px 16px',
      minHeight: 'calc(100vh - 60px)'
    }}>
      <div>
        <div style={{ padding: '0 8px 16px', borderBottom: '1px solid #f1f5f9', marginBottom: '16px' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.8px' }}>
            DOCTOR NAVIGATION
          </span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id ||
              (activeTab === 'doctor' && item.id === 'dashboard') ||
              ((activeTab === 'revenue' || activeTab === 'total_revenue') && item.id === 'total_revenue');
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  background: isActive ? '#eef5fc' : 'transparent',
                  color: isActive ? '#258ec8' : '#475569',
                  fontWeight: isActive ? 800 : 600,
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textAlign: 'left',
                  width: '100%'
                }}
              >
                <Icon size={18} color={isActive ? '#258ec8' : '#64748b'} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
      <div style={{ paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
        <button
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#ef4444',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            width: '100%'
          }}
        >
          <LogOut size={16} color="#ef4444" />
          Sign Out
        </button>
      </div>
    </aside>
  );
};