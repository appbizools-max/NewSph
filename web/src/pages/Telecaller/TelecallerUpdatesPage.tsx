import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, Clock, Phone, Search, Building2, User,
  CheckCircle2, RefreshCw, X, AlertCircle, FileText, Plus
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit, addDoc } from 'firebase/firestore';
import { db, TelecallerActivity } from '@app/shared';

interface TelecallerUpdatesPageProps {
  telecaller: {
    uid?: string;
    telecallerId: string;
    name: string;
    phone?: string;
  };
}

const BRANCHES = [
  'All Branches',
  'KPHB Branch',
  'Nallagandla Branch',
  'Dilshuknagar Branch',
  'Chandanagar Branch',
];

const ACTION_FILTERS = [
  { id: 'all', label: 'All Activities' },
  { id: 'manual_update', label: 'Entered Updates' },
  { id: 'call_logged', label: 'Calls' },
  { id: 'status_updated', label: 'Status Updates' },
  { id: 'rescheduled', label: 'Rescheduled' },
  { id: 'appointment_booked', label: 'Appointments Booked' },
];

export const TelecallerUpdatesPage: React.FC<TelecallerUpdatesPageProps> = ({ telecaller }) => {
  const [activities, setActivities] = useState<TelecallerActivity[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedBranch, setSelectedBranch] = useState<string>('All Branches');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'this_month' | 'today' | 'all'>('this_month');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Add Update Form State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [patientName, setPatientName] = useState<string>('');
  const [patientMobile, setPatientMobile] = useState<string>('');
  const [branchName, setBranchName] = useState<string>('KPHB Branch');
  const [dateTime, setDateTime] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [outcome, setOutcome] = useState<string>('Interested');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleCreateUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim()) {
      alert('Please enter patient name.');
      return;
    }
    const cleanPhone = patientMobile.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      alert('Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (!db) throw new Error('Database connection not available');

      const dt = dateTime ? new Date(dateTime) : new Date();
      const activityData = {
        telecallerUid: telecaller.uid || '',
        telecallerId: telecaller.telecallerId,
        telecallerName: telecaller.name,
        patientName: patientName.trim(),
        patientMobile: cleanPhone.slice(-10),
        branchId: branchName.toLowerCase().replace('branch', '').trim(),
        branchName: branchName,
        activityType: 'manual_update',
        callOutcome: outcome,
        remarks: notes.trim(),
        createdAt: dt.toISOString(),
        createdAtMs: dt.getTime()
      };

      await addDoc(collection(db, 'telecallerActivities'), activityData);

      setIsSubmitting(false);
      setShowAddModal(false);
      setPatientName('');
      setPatientMobile('');
      setNotes('');
    } catch (err: any) {
      setIsSubmitting(false);
      alert('Failed to save update: ' + err?.message);
    }
  };

  useEffect(() => {
    if (!db) return;
    setIsLoading(true);

    const q = query(
      collection(db, 'telecallerActivities'),
      orderBy('createdAtMs', 'desc'),
      limit(300)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: TelecallerActivity[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as any) });
      });
      setActivities(list);
      setIsLoading(false);
    }, (err) => {
      console.warn('Error listening to telecaller activities, trying fallback:', err);
      // Fallback without orderBy
      const fallbackQuery = query(collection(db, 'telecallerActivities'), limit(150));
      onSnapshot(fallbackQuery, (fallbackSnap) => {
        const list: TelecallerActivity[] = [];
        fallbackSnap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as any) });
        });
        list.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
        setActivities(list);
        setIsLoading(false);
      }, () => setIsLoading(false));
    });

    return () => unsub();
  }, []);

  const filteredActivities = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return activities.filter((act) => {
      // Branch filter
      if (selectedBranch !== 'All Branches') {
        const itemBranch = (act.branchName || act.branchId || '').toLowerCase();
        const target = selectedBranch.toLowerCase().replace('branch', '').trim();
        if (!itemBranch.includes(target)) return false;
      }

      // Action type filter
      if (selectedAction !== 'all') {
        if (act.activityType !== selectedAction) return false;
      }

      // Date filter
      const actDate = (act.createdAt || '').slice(0, 10);
      if (dateRange === 'today') {
        if (actDate !== todayStr) return false;
      } else if (dateRange === 'this_month') {
        if (!actDate.startsWith(thisMonthPrefix)) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchPatient = (act.patientName || '').toLowerCase().includes(q);
        const matchPhone = (act.patientMobile || '').includes(q);
        const matchRemarks = (act.remarks || '').toLowerCase().includes(q);
        const matchTelecaller = (act.telecallerName || '').toLowerCase().includes(q);
        if (!matchPatient && !matchPhone && !matchRemarks && !matchTelecaller) return false;
      }

      return true;
    });
  }, [activities, selectedBranch, selectedAction, dateRange, searchQuery]);

  const getBadgeInfo = (type: string) => {
    switch (type) {
      case 'manual_update':
        return { label: 'Telecaller Update', bg: '#e0f2fe', text: '#0284c7' };
      case 'appointment_booked':
        return { label: 'Appointment Booked', bg: '#dcfce7', text: '#15803d' };
      case 'rescheduled':
        return { label: 'Rescheduled', bg: '#fef3c7', text: '#b45309' };
      case 'call_logged':
        return { label: 'Call Logged', bg: '#e0f2fe', text: '#0369a1' };
      case 'status_updated':
      default:
        return { label: 'Status Update', bg: '#f3e8ff', text: '#7e22ce' };
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Telecaller Updates & Audit Log</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
            Complete audit trail of every patient call, follow-up status update, reschedule, and appointment booked.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPatientName('');
            setPatientMobile('');
            setNotes('');
            const d = new Date();
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            setDateTime(d.toISOString().slice(0, 16));
            setShowAddModal(true);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#0284c7',
            color: '#ffffff',
            border: 'none',
            borderRadius: '9px',
            padding: '9px 18px',
            fontSize: '13.5px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)'
          }}
        >
          <Plus size={16} />
          Enter Telecaller Update
        </button>
      </div>

      {/* Filter Bar */}
      <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Branch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={16} color="#0284c7" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Branch:</span>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              style={{
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                color: '#0f172a',
                background: '#f8fafc',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {BRANCHES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Action Filter */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {ACTION_FILTERS.map((act) => (
              <button
                key={act.id}
                type="button"
                onClick={() => setSelectedAction(act.id)}
                style={{
                  padding: '5px 11px',
                  borderRadius: '7px',
                  border: '1px solid',
                  borderColor: selectedAction === act.id ? '#0284c7' : '#e2e8f0',
                  background: selectedAction === act.id ? '#e0f2fe' : '#ffffff',
                  color: selectedAction === act.id ? '#0284c7' : '#64748b',
                  fontSize: '12px',
                  fontWeight: selectedAction === act.id ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                {act.label}
              </button>
            ))}
          </div>

          {/* Date & Search */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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

            <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 12px', minWidth: '220px' }}>
              <Search size={14} color="#94a3b8" style={{ marginRight: '6px' }} />
              <input
                type="text"
                placeholder="Search patient, phone, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px', color: '#0f172a', width: '100%' }}
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                  <X size={13} color="#94a3b8" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Count */}
      <div style={{ marginBottom: '12px', fontSize: '13px', color: '#64748b' }}>
        Total Updates: <strong style={{ color: '#0284c7' }}>{filteredActivities.length}</strong>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
          <RefreshCw size={28} className="animate-spin" color="#0284c7" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '14px', fontWeight: 600 }}>Loading activity logs...</p>
        </div>
      ) : filteredActivities.length === 0 ? (
        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
          <FileText size={40} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#334155', margin: 0 }}>No Activity Logs Found</h3>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '6px 0 0' }}>No updates match your selected filters.</p>
        </div>
      ) : (
        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700, fontSize: '12px' }}>
                <th style={{ padding: '12px 16px' }}>Date & Time</th>
                <th style={{ padding: '12px 16px' }}>Action</th>
                <th style={{ padding: '12px 16px' }}>Patient</th>
                <th style={{ padding: '12px 16px' }}>Branch</th>
                <th style={{ padding: '12px 16px' }}>Outcome / Details</th>
                <th style={{ padding: '12px 16px' }}>Remarks</th>
                <th style={{ padding: '12px 16px' }}>Telecaller</th>
              </tr>
            </thead>
            <tbody>
              {filteredActivities.map((act, idx) => {
                const badge = getBadgeInfo(act.activityType);
                const dateStr = act.createdAt ? new Date(act.createdAt).toLocaleString('en-IN', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                }) : 'Just now';

                return (
                  <tr
                    key={act.id || idx}
                    style={{
                      borderBottom: idx === filteredActivities.length - 1 ? 'none' : '1px solid #f1f5f9',
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; }}
                  >
                    <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {dateStr}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: badge.bg,
                        color: badge.text
                      }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{act.patientName || 'Patient'}</div>
                      <div style={{ fontSize: '12px' }}>
                        <a href={`tel:${act.patientMobile}`} style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600 }}>{act.patientMobile}</a>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#334155', fontWeight: 600 }}>
                      {act.branchName || 'SPH Clinic'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{act.newStatus || act.callOutcome || '—'}</div>
                      {act.nextFollowUpDate && (
                        <div style={{ fontSize: '11.5px', color: '#b45309' }}>Next Date: {act.nextFollowUpDate}</div>
                      )}
                      {act.appointmentDate && (
                        <div style={{ fontSize: '11.5px', color: '#15803d' }}>Appt Date: {act.appointmentDate}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569', fontSize: '12px', maxWidth: '240px' }}>
                      {act.remarks || '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#334155' }}>{act.telecallerName}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>ID: {act.telecallerId}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Enter Update Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '480px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Enter Telecaller Update</h3>
                <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#64748b' }}>Log a patient call, conversation notes, and outcome</p>
              </div>
              <button type="button" onClick={() => setShowAddModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <X size={20} color="#64748b" />
              </button>
            </div>

            <form onSubmit={handleCreateUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Patient Name: *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Mobile Number: *</label>
                <input
                  type="tel"
                  required
                  placeholder="10-digit mobile number"
                  value={patientMobile}
                  onChange={(e) => setPatientMobile(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Hospital Branch: *</label>
                  <select
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', background: '#fff' }}
                  >
                    <option value="KPHB Branch">KPHB Branch</option>
                    <option value="Nallagandla Branch">Nallagandla Branch</option>
                    <option value="Dilshuknagar Branch">Dilshuknagar Branch</option>
                    <option value="Chandanagar Branch">Chandanagar Branch</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Date & Time: *</label>
                  <input
                    type="datetime-local"
                    value={dateTime}
                    onChange={(e) => setDateTime(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Call Outcome / Status:</label>
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', background: '#fff' }}
                >
                  <option value="Interested">Interested</option>
                  <option value="Call Back">Call Back</option>
                  <option value="Appointment Booked">Appointment Booked</option>
                  <option value="Not Interested">Not Interested</option>
                  <option value="No Response">No Response</option>
                  <option value="General Update">General Update</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Notes & Remarks: *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Enter details of what patient discussed, questions asked, or remarks..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: '#0284c7', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {isSubmitting ? 'Saving Update...' : 'Save Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

