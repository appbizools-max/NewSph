import React, { useState, useEffect, useRef } from 'react';
import { LogOut, Phone, Building2, Clock, Calendar, User, Pill, Mail, Bell, CheckCheck, Camera, CheckCircle2, XCircle, Fingerprint } from 'lucide-react';
import { signOutUser, db } from '@app/shared';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

import { resolveStrictDoctorName } from '@app/shared';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  userName?: string;
  branchName?: string;
  branchPhone?: string;
  role?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  userName,
  branchName = "KPHB Branch",
  branchPhone = "+91 90301 76176",
  role
}) => {
  const [timeStr, setTimeStr] = useState('');
  const [dayDateStr, setDayDateStr] = useState('');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isNotiOpen, setIsNotiOpen] = useState(false);
  const [readNotiIds, setReadNotiIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('sph_web_read_notis');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const notiDropdownRef = useRef<HTMLDivElement>(null);

  // Branch topic normalizer for accurate reception branch matching
  const normalizeBranchTopic = (raw: string = '') => {
    const s = String(raw || '').toLowerCase().trim();
    if (s.includes('kphb') || s.includes('kukatpally')) return 'kphb';
    if (s.includes('nalla') || s.includes('nallagandla') || s.includes('nlg')) return 'nallagandla';
    if (s.includes('dilshuk') || s.includes('dilsukh') || s.includes('dsnr') || s.includes('dshnr')) return 'dilshuknagar';
    if (s.includes('chanda') || s.includes('chnr') || s.includes('chandanagar') || s.includes('cngr')) return 'chandanagar';
    return '';
  };

  useEffect(() => {
    if (!db) return;
    try {
      // Fetch up to 50 notifications so branch filtering has enough items to display
      const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(50));
      const unsub = onSnapshot(q, (snapshot) => {
        const rawList: any[] = [];
        snapshot.docs.forEach((docSnap) => {
          rawList.push({ id: docSnap.id, ...docSnap.data() });
        });

        const userRole = (role || 'reception').toLowerCase();
        const userBranchKey = normalizeBranchTopic(branchName);

        // Filter notifications based on role and branch
        const filtered = rawList.filter((n) => {
          // 1. Role permission check: if notification specifies targetRoles, check if userRole is included
          if (Array.isArray(n.targetRoles) && n.targetRoles.length > 0) {
            const hasRole = n.targetRoles.some((r: string) => {
              const rLower = String(r).toLowerCase();
              if (rLower === 'all') return true;
              if (userRole === 'admin' && (rLower === 'admin' || rLower === 'hr')) return true;
              if (userRole === 'hr' && (rLower === 'hr' || rLower === 'admin')) return true;
              return rLower === userRole;
            });
            if (!hasRole && userRole !== 'admin' && userRole !== 'hr') {
              return false;
            }
          }

          // 2. Branch check: Admin and HR see notifications across all branches
          if (userRole === 'admin' || userRole === 'hr') {
            return true;
          }

          // 3. For Reception and Staff: ONLY show notifications that belong to their branch!
          const notiBranchKey = normalizeBranchTopic(n.targetBranch || n.branch || n.branchName || n.body || n.title);
          if (notiBranchKey && userBranchKey) {
            return notiBranchKey === userBranchKey;
          }

          // If notification is global/branchless, allow it
          return !notiBranchKey;
        });

        setNotifications(filtered.slice(0, 15));
      });
      return () => unsub();
    } catch (e) {
      console.warn('Web notification listener notice:', e);
    }
  }, [branchName, role]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (notiDropdownRef.current && !notiDropdownRef.current.contains(e.target as Node)) {
        setIsNotiOpen(false);
      }
    };
    if (isNotiOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isNotiOpen]);

  const handleMarkAsRead = (id: string) => {
    setReadNotiIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem('sph_web_read_notis', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const handleMarkAllAsRead = () => {
    const allIds = notifications.map((n) => n.id);
    const next = new Set(allIds);
    setReadNotiIds(next);
    localStorage.setItem('sph_web_read_notis', JSON.stringify(allIds));
  };

  const unreadCount = notifications.filter((n) => !readNotiIds.has(n.id)).length;

  const formatTimeAgo = (iso?: string) => {
    if (!iso) return '';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Live real-time clock and date formatter
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
      setDayDateStr(now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));
    };
    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleBrandClick = () => {
    if (role === 'admin') {
      setActiveTab('admin');
    } else if (role === 'hr') {
      setActiveTab('hr');
    } else if (role === 'doctor') {
      setActiveTab('doctor');
    } else if (role === 'staff') {
      setActiveTab('staff');
    } else {
      setActiveTab('reception_dashboard');
    }
  };

  const handleLogout = async () => {
    if (!window.confirm('Are you sure you want to log out?')) return;
    await signOutUser();
    setActiveTab('auth');
  };

  return (
    <nav style={{
      background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      padding: '8px 24px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>

        {/* LEFT SIDE: Logo + Minimalist Date & Time Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Brand Logo & Title */}
          <div
            onClick={handleBrandClick}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          >
            <img
              src="/Assets/sh_logo.png"
              alt="Spiritual Homeo Logo"
              style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'contain' }}
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
            <div>
              <h2 style={{ fontSize: '15px !important', fontWeight: 800, color: '#258ec8', lineHeight: 1.2 }}>
                Spiritual Homeo
              </h2>
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>
                {role === 'admin' ? 'Admin Control Hub' : role === 'hr' ? 'HR Portal' : role === 'doctor' ? 'Doctor Portal' : role === 'reception' ? 'Reception Portal' : 'Staff Portal'}
              </span>
            </div>
          </div>

          <div style={{ height: '22px', width: '1px', background: '#cbd5e1' }} />

          {/* Minimalist Light Date & Time Pill */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            padding: '4px 12px',
            borderRadius: '20px',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.02)'
          }}>
            {/* Live Green Pulse Indicator */}
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#a8ce3a', boxShadow: '0 0 6px #a8ce3a' }} />

            <Clock size={13} color="#258ec8" />
            <span style={{ fontSize: '11.5px !important', fontWeight: 800, color: '#258ec8', letterSpacing: '0.2px' }}>
              {timeStr}
            </span>

            <span style={{ color: '#cbd5e1', fontSize: '11px' }}>•</span>

            <Calendar size={12} color="#64748b" />
            <span style={{ fontSize: '11px !important', fontWeight: 600, color: '#475569' }}>
              {dayDateStr}
            </span>
          </div>
        </div>

        {/* RIGHT SIDE: Quick Links + User / Doctor / Branch Info Pill + Log Out Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

          {/* Quick Reception Medicine Requests Button */}
          {(!role || role === 'reception' || role === 'staff' || activeTab.startsWith('reception')) && (
            <button
              onClick={() => setActiveTab('reception_medicines')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                background: activeTab === 'reception_medicines' ? '#eff6ff' : '#ffffff',
                border: activeTab === 'reception_medicines' ? '1.5px solid #258ec8' : '1px solid #cbd5e1',
                color: activeTab === 'reception_medicines' ? '#258ec8' : '#334155',
                padding: '6px 14px',
                borderRadius: '20px',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: activeTab === 'reception_medicines' ? '0 2px 6px rgba(37, 142, 200, 0.2)' : '0 1px 2px rgba(0,0,0,0.04)'
              }}
              title="Medicine Requests & Letterhead PDF Generator"
            >
              <Pill size={15} color={activeTab === 'reception_medicines' ? '#258ec8' : '#64748b'} />
              <span>Medicine Requests</span>
            </button>
          )}

          {/* User / Doctor / Branch / Email Pill */}
          {role === 'admin' || role === 'hr' ? (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(37, 142, 200, 0.06)',
              border: '1px solid rgba(37, 142, 200, 0.25)',
              padding: '6px 14px',
              borderRadius: '20px'
            }}>
              <Mail size={14} color="#258ec8" />
              <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '12px !important' }}>
                {userName && userName.includes('@') ? userName : (role === 'hr' ? 'hr@sph.com' : 'admin@sph.com')}
              </span>
            </div>
          ) : (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(37, 142, 200, 0.06)',
              border: '1px solid rgba(37, 142, 200, 0.25)',
              padding: '6px 14px',
              borderRadius: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {role === 'doctor' || role === 'staff' ? <User size={14} color="#258ec8" /> : <Building2 size={14} color="#258ec8" />}
                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '12px !important' }}>
                  {role === 'doctor' ? resolveStrictDoctorName(userName || branchPhone, userName) : role === 'staff' ? `${userName || 'Staff Member'} (${branchName})` : `${branchName} Reception`}
                </span>
              </div>

              {branchPhone ? (
                <>
                  <span style={{ color: '#cbd5e1', fontSize: '11px' }}>•</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Phone size={12} color="#a8ce3a" />
                    <span style={{ fontWeight: 700, color: '#258ec8', fontSize: '11.5px !important' }}>
                      {branchPhone}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {/* Real-time Notification Bell Popover */}
          <div style={{ position: 'relative' }} ref={notiDropdownRef}>
            <button
              onClick={() => setIsNotiOpen(!isNotiOpen)}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: isNotiOpen ? '#eff6ff' : '#f8fafc',
                border: isNotiOpen ? '1.5px solid #258ec8' : '1px solid #e2e8f0',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              title="Notifications"
            >
              <Bell size={16} color={isNotiOpen ? '#258ec8' : '#475569'} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-3px',
                  right: '-3px',
                  background: '#ef4444',
                  color: '#ffffff',
                  fontSize: '9.5px',
                  fontWeight: 800,
                  minWidth: '16px',
                  height: '16px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown Menu */}
            {isNotiOpen && (
              <div style={{
                position: 'absolute',
                top: '42px',
                right: 0,
                width: '360px',
                maxHeight: '440px',
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                {/* Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderBottom: '1px solid #f1f5f9',
                  background: '#f8fafc'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>Notifications</span>
                    {unreadCount > 0 && (
                      <span style={{
                        background: '#e0f2fe',
                        color: '#0284c7',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '10px'
                      }}>
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllAsRead}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#258ec8',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <CheckCheck size={12} />
                      Mark all read
                    </button>
                  )}
                </div>

                {/* Notification Items List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const isRead = readNotiIds.has(n.id);
                      const isCleaning = n.type === 'cleaning_submission' || n.type === 'cleaning_approved' || n.type === 'cleaning_rejected';
                      const isApproved = n.type === 'cleaning_approved';
                      const isRejected = n.type === 'cleaning_rejected';
                      const isPunchIn = n.type === 'staff_punch_in';
                      const isPunchOut = n.type === 'staff_punch_out';
                      return (
                        <div
                          key={n.id}
                          onClick={() => {
                            handleMarkAsRead(n.id);
                            if (isCleaning) {
                              if (role === 'admin' || role === 'hr') {
                                setActiveTab('branch_cleaning');
                              } else {
                                setActiveTab('reception_cleaning');
                              }
                              setIsNotiOpen(false);
                            }
                          }}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: isRead ? '#ffffff' : '#f0f9ff',
                            border: isRead ? '1px solid #f1f5f9' : '1px solid #bae6fd',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <div style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '7px',
                              background: isPunchIn ? '#dcfce7' : isPunchOut ? '#fee2e2' : isApproved ? '#dcfce7' : isRejected ? '#fee2e2' : isCleaning ? '#e0f2fe' : n.type === 'payment' ? '#dcfce7' : '#f1f5f9',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              {isPunchIn ? (
                                <Fingerprint size={14} color="#16a34a" />
                              ) : isPunchOut ? (
                                <Clock size={14} color="#dc2626" />
                              ) : isApproved ? (
                                <CheckCircle2 size={14} color="#16a34a" />
                              ) : isRejected ? (
                                <XCircle size={14} color="#dc2626" />
                              ) : isCleaning ? (
                                <Camera size={14} color="#0284c7" />
                              ) : n.type === 'payment' ? (
                                <CheckCircle2 size={14} color="#16a34a" />
                              ) : (
                                <Calendar size={14} color="#0284c7" />
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '2px' }}>
                                <span style={{
                                  fontSize: '12px',
                                  fontWeight: isRead ? 600 : 800,
                                  color: isRejected ? '#b91c1c' : '#0f172a',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {n.title || 'Notification'}
                                </span>
                                <span style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0 }}>
                                  {formatTimeAgo(n.createdAt)}
                                </span>
                              </div>
                              <p style={{
                                fontSize: '11px',
                                color: isRead ? '#64748b' : '#334155',
                                margin: 0,
                                lineHeight: 1.35
                              }}>
                                {n.body || ''}
                              </p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                                {n.branch && (
                                  <span style={{
                                    fontSize: '9.5px',
                                    fontWeight: 700,
                                    color: '#0284c7',
                                    background: '#e0f2fe',
                                    padding: '1px 5px',
                                    borderRadius: '3px'
                                  }}>
                                    {n.branch}
                                  </span>
                                )}
                                {isApproved && (
                                  <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '1px 5px', borderRadius: '3px' }}>
                                    APPROVED
                                  </span>
                                )}
                                {isRejected && (
                                  <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '1px 5px', borderRadius: '3px' }}>
                                    REJECTED
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Log Out Button */}
          <button
            onClick={handleLogout}
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#ef4444',
              padding: '6px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '11.5px !important',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.2s ease'
            }}
          >
            <LogOut size={13} color="#ef4444" />
            Log Out
          </button>
        </div>

      </div>
    </nav>
  );
};
