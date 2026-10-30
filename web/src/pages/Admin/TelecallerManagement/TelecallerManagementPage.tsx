import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Phone, Calendar, Clock, CheckCircle2, AlertCircle,
  Plus, Search, Edit2, Key, Power, UserCheck, Building2,
  X, Filter, FileText, ArrowUpDown, Download
} from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import { db, TelecallerProfile, TelecallerActivity } from '@app/shared';

const BRANCH_OPTIONS = [
  'All Branches',
  'KPHB Branch',
  'Nallagandla Branch',
  'Dilshuknagar Branch',
  'Chandanagar Branch',
];

interface TelecallerManagementPageProps {
  role?: string;
  initialTab?: 'accounts' | 'activities';
}

export const TelecallerManagementPage: React.FC<TelecallerManagementPageProps> = ({ role = 'admin', initialTab = 'accounts' }) => {
  const [activeSubTab, setActiveSubTab] = useState<'accounts' | 'activities'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveSubTab(initialTab);
    }
  }, [initialTab]);

  // Accounts state
  const [telecallers, setTelecallers] = useState<TelecallerProfile[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState<boolean>(true);
  const [searchAccountQuery, setSearchAccountQuery] = useState<string>('');

  // Add / Edit Modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
  const [selectedTelecaller, setSelectedTelecaller] = useState<TelecallerProfile | null>(null);

  // Form Fields
  const [formName, setFormName] = useState<string>('');
  const [formId, setFormId] = useState<string>('');
  const [formEmail, setFormEmail] = useState<string>('');
  const [formPhone, setFormPhone] = useState<string>('');
  const [formBranch, setFormBranch] = useState<string>('All Branches');
  const [formPassword, setFormPassword] = useState<string>('email123');
  const [newPassword, setNewPassword] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Activities state
  const [activities, setActivities] = useState<TelecallerActivity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState<boolean>(true);
  const [filterTelecaller, setFilterTelecaller] = useState<string>('all');
  const [filterBranch, setFilterBranch] = useState<string>('All Branches');
  const [filterActivityType, setFilterActivityType] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'this_month' | 'today' | 'this_week' | 'all'>('this_month');
  const [searchActivityQuery, setSearchActivityQuery] = useState<string>('');

  // 1. Listen to Telecallers collection
  useEffect(() => {
    if (!db) return;
    setIsLoadingAccounts(true);

    const unsub = onSnapshot(collection(db, 'telecallers'), (snap) => {
      const list: TelecallerProfile[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as any) });
      });
      setTelecallers(list);
      setIsLoadingAccounts(false);
    }, (err) => {
      console.warn('Error fetching telecallers:', err);
      setIsLoadingAccounts(false);
    });

    return () => unsub();
  }, []);

  // 2. Listen to Activities collection
  useEffect(() => {
    if (!db) return;
    setIsLoadingActivities(true);

    const q = query(
      collection(db, 'telecallerActivities'),
      orderBy('createdAtMs', 'desc'),
      limit(500)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: TelecallerActivity[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as any) });
      });
      setActivities(list);
      setIsLoadingActivities(false);
    }, (err) => {
      console.warn('Falling back query for telecaller activities:', err);
      const fallbackQ = query(collection(db, 'telecallerActivities'), limit(200));
      onSnapshot(fallbackQ, (fallbackSnap) => {
        const list: TelecallerActivity[] = [];
        fallbackSnap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as any) });
        });
        list.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
        setActivities(list);
        setIsLoadingActivities(false);
      }, () => setIsLoadingActivities(false));
    });

    return () => unsub();
  }, []);

  // 3. Performance Metrics
  const metrics = useMemo(() => {
    const totalTelecallers = telecallers.length;
    const activeTelecallers = telecallers.filter((t) => t.isActive !== false).length;

    let totalCalls = 0;
    let followupsCompleted = 0;
    let followupsRescheduled = 0;
    let appointmentsBooked = 0;

    activities.forEach((act) => {
      if (act.activityType === 'call_logged') totalCalls++;
      if (act.activityType === 'status_updated' && (act.newStatus === 'Completed' || act.callOutcome === 'Completed')) {
        followupsCompleted++;
      }
      if (act.activityType === 'rescheduled') followupsRescheduled++;
      if (act.activityType === 'appointment_booked') appointmentsBooked++;
    });

    return {
      totalTelecallers,
      activeTelecallers,
      totalCalls,
      followupsCompleted,
      followupsRescheduled,
      appointmentsBooked,
      totalActivities: activities.length
    };
  }, [telecallers, activities]);

  // 4. Filtered Accounts
  const filteredTelecallers = useMemo(() => {
    if (!searchAccountQuery.trim()) return telecallers;
    const q = searchAccountQuery.toLowerCase().trim();
    return telecallers.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.telecallerId.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        t.phone.includes(q)
    );
  }, [telecallers, searchAccountQuery]);

  // 5. Filtered Activities
  const handleDownloadCSV = () => {
    if (filteredActivities.length === 0) {
      alert('No telecaller activity records found to download.');
      return;
    }

    const headers = [
      'Date & Time',
      'Telecaller Name',
      'Telecaller ID',
      'Branch',
      'Patient Name',
      'Patient Mobile',
      'Action Type',
      'Outcome / Details',
      'Remarks / Notes'
    ];

    const rows = filteredActivities.map((act) => {
      const dt = act.createdAt ? new Date(act.createdAt).toLocaleString('en-IN') : '';
      return [
        dt,
        act.telecallerName || '',
        act.telecallerId || '',
        act.branchName || '',
        act.patientName || '',
        act.patientMobile || '',
        (act.activityType || '').replace('_', ' ').toUpperCase(),
        act.newStatus || act.callOutcome || '',
        act.remarks || ''
      ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`);
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `Telecaller_Updates_Report_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredActivities = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return activities.filter((act) => {
      if (filterTelecaller !== 'all') {
        if (act.telecallerId !== filterTelecaller && act.telecallerUid !== filterTelecaller) return false;
      }

      if (filterBranch !== 'All Branches') {
        const itemBranch = (act.branchName || act.branchId || '').toLowerCase();
        const target = filterBranch.toLowerCase().replace('branch', '').trim();
        if (!itemBranch.includes(target)) return false;
      }

      if (filterActivityType !== 'all') {
        if (act.activityType !== filterActivityType) return false;
      }

      const actDate = (act.createdAt || '').slice(0, 10);
      if (dateRange === 'today') {
        if (actDate !== todayStr) return false;
      } else if (dateRange === 'this_month') {
        if (!actDate.startsWith(thisMonthPrefix)) return false;
      }

      if (searchActivityQuery.trim()) {
        const q = searchActivityQuery.toLowerCase().trim();
        const mPatient = (act.patientName || '').toLowerCase().includes(q);
        const mPhone = (act.patientMobile || '').includes(q);
        const mTelecaller = (act.telecallerName || '').toLowerCase().includes(q);
        const mRemarks = (act.remarks || '').toLowerCase().includes(q);
        if (!mPatient && !mPhone && !mTelecaller && !mRemarks) return false;
      }

      return true;
    });
  }, [activities, filterTelecaller, filterBranch, filterActivityType, dateRange, searchActivityQuery]);

  // Account Handlers
  const handleOpenAddModal = () => {
    setFormName('');
    setFormId(`TC0${telecallers.length + 1}`);
    setFormEmail('');
    setFormPhone('');
    setFormBranch('All Branches');
    setFormPassword('email123');
    setShowAddModal(true);
  };

  const handleCreateTelecaller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formId.trim() || !formPhone.trim()) {
      alert('Please fill out Name, Telecaller ID, and Contact Phone.');
      return;
    }

    setIsSaving(true);
    try {
      if (!db) throw new Error('Database is offline');

      const docId = `telecaller_${formId.trim().toUpperCase()}`;
      const payload = {
        telecallerId: formId.trim().toUpperCase(),
        name: formName.trim(),
        email: formEmail.trim().toLowerCase() || `${formId.trim().toLowerCase()}@sph.com`,
        phone: formPhone.trim().replace(/\D/g, '').slice(-10),
        role: 'telecaller',
        isActive: true,
        assignedBranch: formBranch,
        password: formPassword.trim() || 'email123',
        createdBy: role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'telecallers', docId), payload);

      setIsSaving(false);
      setShowAddModal(false);
      alert(`Telecaller account ${formName} (${formId}) created successfully!`);
    } catch (err: any) {
      setIsSaving(false);
      alert('Failed to create telecaller: ' + err?.message);
    }
  };

  const handleOpenEditModal = (t: TelecallerProfile) => {
    setSelectedTelecaller(t);
    setFormName(t.name);
    setFormId(t.telecallerId);
    setFormEmail(t.email);
    setFormPhone(t.phone);
    setFormBranch(t.assignedBranch || 'All Branches');
    setShowEditModal(true);
  };

  const handleSaveEditTelecaller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTelecaller || !selectedTelecaller.id || !db) return;

    setIsSaving(true);
    try {
      const updateData = {
        name: formName.trim(),
        email: formEmail.trim().toLowerCase(),
        phone: formPhone.trim().replace(/\D/g, '').slice(-10),
        assignedBranch: formBranch,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'telecallers', selectedTelecaller.id), updateData);
      setIsSaving(false);
      setShowEditModal(false);
      alert('Telecaller details updated successfully!');
    } catch (err: any) {
      setIsSaving(false);
      alert('Update failed: ' + err?.message);
    }
  };

  const handleToggleActive = async (t: TelecallerProfile) => {
    if (!t.id || !db) return;
    const newStatus = !t.isActive;
    const confirmMsg = newStatus
      ? `Are you sure you want to activate ${t.name}?`
      : `Are you sure you want to deactivate ${t.name}? They will not be able to log in.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await updateDoc(doc(db, 'telecallers', t.id), {
        isActive: newStatus,
        status: newStatus ? 'active' : 'deactivated',
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      alert('Failed to toggle status: ' + err?.message);
    }
  };

  const handleOpenPasswordModal = (t: TelecallerProfile) => {
    setSelectedTelecaller(t);
    setNewPassword('');
    setShowPasswordModal(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTelecaller || !selectedTelecaller.id || !newPassword.trim() || !db) return;

    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'telecallers', selectedTelecaller.id), {
        password: newPassword.trim(),
        updatedAt: new Date().toISOString()
      });
      setIsSaving(false);
      setShowPasswordModal(false);
      alert(`Password updated successfully for ${selectedTelecaller.name}!`);
    } catch (err: any) {
      setIsSaving(false);
      alert('Password reset failed: ' + err?.message);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'inherit' }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Telecaller Management & Activity Monitoring
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
            Manage telecaller accounts, credentials, and monitor live follow-up & appointment performance.
          </p>
        </div>

        {activeSubTab === 'accounts' && (
          <button
            type="button"
            onClick={handleOpenAddModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              borderRadius: '10px',
              border: 'none',
              background: '#0284c7',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)'
            }}
          >
            <Plus size={16} />
            Create Telecaller
          </button>
        )}
      </div>

      {/* Real-time Summary Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div style={{ background: '#ffffff', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Active Telecallers</span>
            <Users size={16} color="#0284c7" />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
            {metrics.activeTelecallers} <span style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>/ {metrics.totalTelecallers}</span>
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Total Calls Logged</span>
            <Phone size={16} color="#0369a1" />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#0369a1' }}>
            {metrics.totalCalls}
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Follow-ups Completed</span>
            <CheckCircle2 size={16} color="#15803d" />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#15803d' }}>
            {metrics.followupsCompleted}
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Follow-ups Rescheduled</span>
            <Clock size={16} color="#b45309" />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#b45309' }}>
            {metrics.followupsRescheduled}
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Appointments Booked</span>
            <Calendar size={16} color="#7e22ce" />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#7e22ce' }}>
            {metrics.appointmentsBooked}
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('accounts')}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderBottom: activeSubTab === 'accounts' ? '2px solid #0284c7' : '2px solid transparent',
            background: 'transparent',
            color: activeSubTab === 'accounts' ? '#0284c7' : '#64748b',
            fontWeight: activeSubTab === 'accounts' ? 800 : 600,
            fontSize: '13.5px',
            cursor: 'pointer'
          }}
        >
          Telecaller Accounts ({telecallers.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('activities')}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderBottom: activeSubTab === 'activities' ? '2px solid #0284c7' : '2px solid transparent',
            background: 'transparent',
            color: activeSubTab === 'activities' ? '#0284c7' : '#64748b',
            fontWeight: activeSubTab === 'activities' ? 800 : 600,
            fontSize: '13.5px',
            cursor: 'pointer'
          }}
        >
          Live Activity Monitoring ({activities.length})
        </button>
      </div>

      {/* TAB 1: ACCOUNTS */}
      {activeSubTab === 'accounts' && (
        <div>
          {/* Search Bar */}
          <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Search size={16} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search telecallers by name, ID, email, or phone..."
              value={searchAccountQuery}
              onChange={(e) => setSearchAccountQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', width: '100%', color: '#0f172a' }}
            />
          </div>

          {isLoadingAccounts ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>Loading telecallers...</div>
          ) : filteredTelecallers.length === 0 ? (
            <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '50px 20px', textAlign: 'center', color: '#64748b' }}>
              <Users size={36} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
              <p style={{ margin: 0, fontWeight: 600 }}>No telecallers found.</p>
              <button
                type="button"
                onClick={handleOpenAddModal}
                style={{ marginTop: '12px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#0284c7', color: '#fff', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer' }}
              >
                Create First Telecaller Account
              </button>
            </div>
          ) : (
            <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700, fontSize: '12px' }}>
                    <th style={{ padding: '12px 16px' }}>Telecaller</th>
                    <th style={{ padding: '12px 16px' }}>Contact</th>
                    <th style={{ padding: '12px 16px' }}>Assigned Branch</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTelecallers.map((t) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{t.name}</div>
                        <div style={{ fontSize: '11.5px', color: '#0284c7', fontWeight: 600 }}>ID: {t.telecallerId}</div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ color: '#334155', fontWeight: 500 }}>{t.phone}</div>
                        <div style={{ fontSize: '11.5px', color: '#64748b' }}>{t.email}</div>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#475569', fontWeight: 600 }}>
                        {t.assignedBranch || 'All Branches'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          background: t.isActive !== false ? '#dcfce7' : '#fee2e2',
                          color: t.isActive !== false ? '#15803d' : '#dc2626'
                        }}>
                          {t.isActive !== false ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(t)}
                            title="Edit Details"
                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer' }}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenPasswordModal(t)}
                            title="Reset Password"
                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #fde68a', background: '#fffbeb', color: '#b45309', cursor: 'pointer' }}
                          >
                            <Key size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(t)}
                            title={t.isActive !== false ? 'Deactivate' : 'Activate'}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              border: '1px solid',
                              borderColor: t.isActive !== false ? '#fecaca' : '#bbf7d0',
                              background: t.isActive !== false ? '#fef2f2' : '#f0fdf4',
                              color: t.isActive !== false ? '#dc2626' : '#16a34a',
                              cursor: 'pointer'
                            }}
                          >
                            <Power size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ACTIVITIES MONITORING */}
      {activeSubTab === 'activities' && (
        <div>
          {/* Activity Filters */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Telecaller Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Telecaller:</span>
                <select
                  value={filterTelecaller}
                  onChange={(e) => setFilterTelecaller(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '12.5px', background: '#f8fafc' }}
                >
                  <option value="all">All Telecallers</option>
                  {telecallers.map((t) => (
                    <option key={t.telecallerId} value={t.telecallerId}>
                      {t.name} ({t.telecallerId})
                    </option>
                  ))}
                </select>
              </div>

              {/* Branch */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Branch:</span>
                <select
                  value={filterBranch}
                  onChange={(e) => setFilterBranch(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '12.5px', background: '#f8fafc' }}
                >
                  {BRANCH_OPTIONS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              {/* Action Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Type:</span>
                <select
                  value={filterActivityType}
                  onChange={(e) => setFilterActivityType(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '12.5px', background: '#f8fafc' }}
                >
                  <option value="all">All Types</option>
                  <option value="manual_update">Entered Updates</option>
                  <option value="call_logged">Calls</option>
                  <option value="status_updated">Status Updates</option>
                  <option value="rescheduled">Rescheduled</option>
                  <option value="appointment_booked">Appointments Booked</option>
                </select>
              </div>

              {/* Date */}
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['this_month', 'today', 'all'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setDateRange(r)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: dateRange === r ? '#0284c7' : '#cbd5e1',
                      background: dateRange === r ? '#0284c7' : '#ffffff',
                      color: dateRange === r ? '#ffffff' : '#475569',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {r === 'this_month' ? 'This Month' : r === 'today' ? 'Today' : 'All'}
                  </button>
                ))}
              </div>

              {/* Download CSV / Excel Report */}
              <button
                type="button"
                onClick={handleDownloadCSV}
                title="Download Telecaller Updates as CSV / Excel"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginLeft: 'auto',
                  boxShadow: '0 1px 2px rgba(22, 163, 74, 0.25)'
                }}
              >
                <Download size={14} />
                Download Report (Excel / CSV)
              </button>
            </div>
          </div>

          {/* Table */}
          {isLoadingActivities ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>Loading activity logs...</div>
          ) : filteredActivities.length === 0 ? (
            <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '50px 20px', textAlign: 'center', color: '#64748b' }}>
              No activities found for the selected filters.
            </div>
          ) : (
            <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                    <th style={{ padding: '12px 14px' }}>Date & Time</th>
                    <th style={{ padding: '12px 14px' }}>Telecaller</th>
                    <th style={{ padding: '12px 14px' }}>Branch</th>
                    <th style={{ padding: '12px 14px' }}>Patient</th>
                    <th style={{ padding: '12px 14px' }}>Action</th>
                    <th style={{ padding: '12px 14px' }}>Outcome / Details</th>
                    <th style={{ padding: '12px 14px' }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivities.map((act, idx) => (
                    <tr key={act.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {act.createdAt ? new Date(act.createdAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{act.telecallerName}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>ID: {act.telecallerId}</div>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#334155' }}>
                        {act.branchName || 'SPH Clinic'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{act.patientName}</div>
                        <div style={{ fontSize: '11.5px', color: '#0284c7' }}>{act.patientMobile}</div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 7px',
                          borderRadius: '5px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: act.activityType === 'appointment_booked' ? '#dcfce7' : act.activityType === 'rescheduled' ? '#fef3c7' : '#e0f2fe',
                          color: act.activityType === 'appointment_booked' ? '#15803d' : act.activityType === 'rescheduled' ? '#b45309' : '#0369a1'
                        }}>
                          {act.activityType.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{act.newStatus || act.callOutcome || '—'}</div>
                        {act.nextFollowUpDate && <div style={{ fontSize: '11px', color: '#b45309' }}>Next: {act.nextFollowUpDate}</div>}
                        {act.appointmentDate && <div style={{ fontSize: '11px', color: '#15803d' }}>Appt: {act.appointmentDate}</div>}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#475569', maxWidth: '240px' }}>
                        {act.remarks || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Telecaller Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '440px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>Create Telecaller Account</h3>
              <button type="button" onClick={() => setShowAddModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <X size={18} color="#64748b" />
              </button>
            </div>

            <form onSubmit={handleCreateTelecaller} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Telecaller Full Name: *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Srikanth Reddy"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Unique Telecaller ID: *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TC01"
                  value={formId}
                  onChange={(e) => setFormId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Contact Phone Number: *</label>
                <input
                  type="tel"
                  required
                  placeholder="10-digit Mobile Number"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Email Address (optional):</label>
                <input
                  type="email"
                  placeholder="e.g. srikanth@sph.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Assigned Hospital Branch:</label>
                <select
                  value={formBranch}
                  onChange={(e) => setFormBranch(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                >
                  {BRANCH_OPTIONS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Initial Password:</label>
                <input
                  type="text"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: '#0284c7', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                >
                  {isSaving ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedTelecaller && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '440px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>Edit Telecaller Account</h3>
              <button type="button" onClick={() => setShowEditModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <X size={18} color="#64748b" />
              </button>
            </div>

            <form onSubmit={handleSaveEditTelecaller} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Name:</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Phone:</label>
                <input
                  type="tel"
                  required
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Email:</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Assigned Branch:</label>
                <select
                  value={formBranch}
                  onChange={(e) => setFormBranch(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                >
                  {BRANCH_OPTIONS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: '#0284c7', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordModal && selectedTelecaller && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '380px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>Reset Password</h3>
            <p style={{ margin: '0 0 16px', fontSize: '12.5px', color: '#64748b' }}>
              Set a new login password for <strong>{selectedTelecaller.name}</strong> ({selectedTelecaller.telecallerId}).
            </p>

            <form onSubmit={handleResetPassword}>
              <input
                type="text"
                required
                placeholder="Enter new password (e.g. sph123)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', marginBottom: '16px' }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '12.5px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#b45309', color: '#fff', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
                >
                  {isSaving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

