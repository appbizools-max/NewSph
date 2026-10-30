import React, { useState } from 'react';
import { Phone, Calendar, Clock, LogOut, Headset, CheckCircle2 } from 'lucide-react';
import { TelecallerFollowUpsPage } from './TelecallerFollowUpsPage';
import { TelecallerBookAppointmentPage } from './TelecallerBookAppointmentPage';
import { TelecallerUpdatesPage } from './TelecallerUpdatesPage';

interface TelecallerLayoutProps {
  authSession: {
    uid?: string;
    userName?: string;
    staffId?: string;
    branchId?: string;
    branchName?: string;
    branchPhone?: string;
  };
  onSignOut: () => void;
}

type TelecallerTab = 'followups' | 'book' | 'updates';

export const TelecallerLayout: React.FC<TelecallerLayoutProps> = ({
  authSession,
  onSignOut
}) => {
  const [activeTab, setActiveTab] = useState<TelecallerTab>('followups');
  const [patientForBooking, setPatientForBooking] = useState<any>(null);

  const telecaller = {
    uid: authSession.uid,
    telecallerId: authSession.staffId || 'TC01',
    name: authSession.userName || 'Telecaller',
    phone: authSession.branchPhone
  };

  const handleNavigateToBook = (patientData?: any) => {
    if (patientData) {
      setPatientForBooking(patientData);
    }
    setActiveTab('book');
  };

  const handleBookingCompleted = () => {
    setPatientForBooking(null);
    setActiveTab('updates');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', fontFamily: 'inherit' }}>
      {/* Top Main Navbar */}
      <header style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 24px',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        {/* Brand / Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: '#e0f2fe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0284c7'
          }}>
            <Headset size={20} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>
              Spiritual Homeopathy
            </h2>
            <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
              Telecaller Operations Portal
            </span>
          </div>
        </div>

        {/* 3 Main Navigation Tabs */}
        <nav style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('followups')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'followups' ? '#e0f2fe' : 'transparent',
              color: activeTab === 'followups' ? '#0284c7' : '#64748b',
              fontWeight: activeTab === 'followups' ? 700 : 600,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Phone size={15} />
            Follow-ups
          </button>

          <button
            type="button"
            onClick={() => {
              setPatientForBooking(null);
              setActiveTab('book');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'book' ? '#e0f2fe' : 'transparent',
              color: activeTab === 'book' ? '#0284c7' : '#64748b',
              fontWeight: activeTab === 'book' ? 700 : 600,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Calendar size={15} />
            Book Appointment
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('updates')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'updates' ? '#e0f2fe' : 'transparent',
              color: activeTab === 'updates' ? '#0284c7' : '#64748b',
              fontWeight: activeTab === 'updates' ? 700 : 600,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Clock size={15} />
            Updates
          </button>
        </nav>

        {/* User Info & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>{telecaller.name}</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>ID: {telecaller.telecallerId}</div>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            title="Sign Out"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid #fee2e2',
              background: '#fef2f2',
              color: '#dc2626',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>
        {activeTab === 'followups' && (
          <TelecallerFollowUpsPage
            telecaller={telecaller}
            onNavigateToBook={handleNavigateToBook}
          />
        )}
        {activeTab === 'book' && (
          <TelecallerBookAppointmentPage
            telecaller={telecaller}
            initialPatientData={patientForBooking}
            onBookingSuccess={handleBookingCompleted}
          />
        )}
        {activeTab === 'updates' && (
          <TelecallerUpdatesPage telecaller={telecaller} />
        )}
      </main>
    </div>
  );
};

