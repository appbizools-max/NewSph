import React from 'react';
import {
  ClipboardList, Calendar, Users, RefreshCw, Pill, CreditCard,
  UserX, Image, Camera, ChevronRight, ChevronLeft, Lock, Truck, RotateCcw
} from 'lucide-react';

interface ReceptionSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isNavCollapsed?: boolean;
  setIsNavCollapsed?: (collapsed: boolean) => void;
  isCleaningBlocked?: boolean;
}

export const ReceptionSidebar: React.FC<ReceptionSidebarProps> = ({
  activeTab,
  setActiveTab,
  isNavCollapsed = false,
  setIsNavCollapsed,
  isCleaningBlocked = false
}) => {
  try {
    const saved = localStorage.getItem('sph_auth_session');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.role === 'admin' || parsed?.role === 'hr') {
        return null;
      }
    }
  } catch (e) {}

  const menuItems = [
    { id: 'reception_dashboard', label: 'Dashboard', icon: ClipboardList },
    { id: 'reception_book', label: 'Book Appointment', icon: Calendar },
    { id: 'reception_reback', label: 'Reback Appointment', icon: RotateCcw },
    { id: 'reception_patients', label: 'All Patients', icon: Users },
    { id: 'reception_followups', label: 'Follow Ups', icon: RefreshCw },
    { id: 'reception_medicines', label: 'Medicine Requests', icon: Pill },
    { id: 'reception_billing', label: 'Product Billing', icon: CreditCard },
    { id: 'reception_shiprocket', label: 'Shiprocket', icon: Truck },
    { id: 'reception_noshow', label: 'Doctor No Show', icon: UserX },
    { id: 'reception_media', label: 'Media Manager', icon: Image },
    { id: 'reception_cleaning', label: 'Cleaning Photos', icon: Camera },
  ];

  return (
    <aside style={{
      width: isNavCollapsed ? '64px' : '200px',
      minWidth: isNavCollapsed ? '64px' : '200px',
      background: '#ffffff',
      borderRight: '1px solid #e2e8f0',
      position: 'fixed',
      top: '67px',
      bottom: 0,
      left: 0,
      padding: isNavCollapsed ? '14px 6px' : '14px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '3px',
      overflowY: 'auto',
      overflowX: 'hidden',
      zIndex: 40,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: isNavCollapsed ? 'center' : 'space-between',
        padding: '0 4px 8px 4px',
        marginBottom: '6px',
        borderBottom: '1px solid #f1f5f9'
      }}>
        {!isNavCollapsed && (
          <h3 style={{ fontSize: '10px !important', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0 }}>
            Reception Menu
          </h3>
        )}
        {setIsNavCollapsed && (
          <button
            onClick={() => setIsNavCollapsed(!isNavCollapsed)}
            title={isNavCollapsed ? "Expand Sidebar (Open)" : "Collapse Sidebar (Close)"}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#258ec8',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}
          >
            {isNavCollapsed ? <ChevronRight size={16} color="#258ec8" /> : <ChevronLeft size={16} color="#258ec8" />}
          </button>
        )}
      </div>

      {menuItems.map((item) => {
        const Icon = item.icon;
        const isCleaningItem = item.id === 'reception_cleaning';
        const isItemLocked = isCleaningBlocked && !isCleaningItem;
        const isActive = activeTab === item.id || (item.id === 'reception_dashboard' && activeTab === 'reception');

        return (
          <button
            key={item.id}
            onClick={() => {
              if (isItemLocked) {
                setActiveTab('reception_cleaning');
              } else {
                setActiveTab(item.id);
              }
            }}
            title={
              isItemLocked
                ? `${item.label} (Locked: Weekly clinic cleaning photos required)`
                : isNavCollapsed ? item.label : undefined
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isNavCollapsed ? 'center' : 'space-between',
              width: '100%',
              padding: isNavCollapsed ? '9px 0' : '7px 10px',
              borderRadius: '8px',
              border: isCleaningBlocked && isCleaningItem
                ? '1px solid #ef4444'
                : isActive
                ? '1px solid rgba(37, 142, 200, 0.3)'
                : '1px solid transparent',
              background: isCleaningBlocked && isCleaningItem
                ? 'rgba(239, 68, 68, 0.1)'
                : isActive
                ? 'rgba(37, 142, 200, 0.1)'
                : 'transparent',
              color: isItemLocked
                ? '#94a3b8'
                : isCleaningBlocked && isCleaningItem
                ? '#dc2626'
                : isActive
                ? '#258ec8'
                : '#475569',
              fontWeight: (isActive || (isCleaningBlocked && isCleaningItem)) ? 700 : 500,
              fontSize: '11.5px !important',
              cursor: isItemLocked ? 'not-allowed' : 'pointer',
              opacity: isItemLocked ? 0.6 : 1,
              transition: 'all 0.2s ease',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: isNavCollapsed ? 'center' : 'flex-start' }}>
              <Icon
                size={16}
                color={
                  isItemLocked
                    ? '#94a3b8'
                    : isCleaningBlocked && isCleaningItem
                    ? '#dc2626'
                    : isActive
                    ? '#258ec8'
                    : '#64748b'
                }
              />
              {!isNavCollapsed && <span>{item.label}</span>}
            </div>
            {!isNavCollapsed && isItemLocked && (
              <Lock size={12} color="#94a3b8" />
            )}
            {!isNavCollapsed && !isItemLocked && isActive && (
              <ChevronRight size={13} color="#258ec8" />
            )}
          </button>
        );
      })}
    </aside>
  );
};
