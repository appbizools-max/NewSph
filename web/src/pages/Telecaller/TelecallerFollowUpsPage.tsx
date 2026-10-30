import React, { useState, useEffect, useMemo } from 'react';
import {
  Phone, Calendar, Clock, MessageSquare, Search, RefreshCw,
  Building2, User, CheckCircle2, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, X, AlertCircle
} from 'lucide-react';
import { collection, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db, logTelecallerActivity, formatDDMMYYYY } from '@app/shared';

export interface TelecallerFollowUpItem {
  id: string;
  patientName: string;
  phone: string;
  regId: string;
  doctorName: string;
  branchName: string;
  preferredDate: string; // YYYY-MM-DD
  followUpInterval?: string;
  diseases?: string;
  status: string;
  remarks?: string;
  raw?: any;
}

interface TelecallerFollowUpsPageProps {
  telecaller: {
    uid?: string;
    telecallerId: string;
    name: string;
    phone?: string;
  };
  onNavigateToBook: (patientData?: any) => void;
}

const BRANCHES = [
  'All Branches',
  'KPHB Branch',
  'Nallagandla Branch',
  'Dilshuknagar Branch',
  'Chandanagar Branch',
];

const STATUS_OPTIONS = [
  'Interested',
  'Not Interested',
  'Call Back',
  'No Response',
  'Appointment Booked',
  'Completed',
  'Pending'
];

type DateFilterMode = 'this_month' | 'today' | 'yesterday' | 'this_week' | 'last_month' | 'custom_date' | 'all';

export const TelecallerFollowUpsPage: React.FC<TelecallerFollowUpsPageProps> = ({
  telecaller,
  onNavigateToBook
}) => {
  const [selectedBranch, setSelectedBranch] = useState<string>('All Branches');
  const [dateFilter, setDateFilter] = useState<DateFilterMode>('this_month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBranch, dateFilter, customStart, customEnd, searchQuery, pageSize]);

  const [followups, setFollowups] = useState<TelecallerFollowUpItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Status Modal
  const [statusItem, setStatusItem] = useState<TelecallerFollowUpItem | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('Interested');
  const [statusRemarks, setStatusRemarks] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Reschedule Modal
  const [rescheduleItem, setRescheduleItem] = useState<TelecallerFollowUpItem | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleReason, setRescheduleReason] = useState<string>('Patient requested date change');
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);

  // 1. Fetch Followups
  useEffect(() => {
    if (!db) return;
    setIsLoading(true);

    const unsub = onSnapshot(collection(db, 'followups'), (snapshot) => {
      const list: TelecallerFollowUpItem[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          patientName: data.patientName || data.name || data.fullName || 'Unnamed Patient',
          phone: String(data.phone || data.mobile || data.phoneNumber || ''),
          regId: data.registrationId || data.regId || data.patientId || '',
          doctorName: data.doctorName || data.doctor || '',
          branchName: data.branchName || data.branch || '',
          preferredDate: data.preferredFollowUpDate || data.followUpDate || data.preferredDate || data.scheduledDate || '',
          followUpInterval: data.followUpInterval || data.interval || '',
          diseases: data.diseases || data.disease || '',
          status: data.callOutcome || data.followUpStatus || data.status || 'Pending',
          remarks: data.remarks || data.rescheduleReason || '',
          raw: data
        });
      });
      setFollowups(list);
      setIsLoading(false);
    }, (error) => {
      console.warn('Error fetching follow-ups for telecaller:', error);
      setIsLoading(false);
    });

    return () => unsub();
  }, []);

  // 2. Filter list
  const filteredList = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const getWeekRange = () => {
      const d = new Date(now);
      const day = d.getDay();
      const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diffToMonday));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        start: monday.toISOString().slice(0, 10),
        end: sunday.toISOString().slice(0, 10)
      };
    };

    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const thisMonthPrefix = `${currentYear}-${currentMonth}`;

    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthPrefix = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    const weekRange = getWeekRange();

    return followups.filter((item) => {
      // Branch filter
      if (selectedBranch !== 'All Branches') {
        const itemBranch = (item.branchName || '').toLowerCase();
        const target = selectedBranch.toLowerCase().replace('branch', '').trim();
        if (!itemBranch.includes(target)) return false;
      }

      // Date filter
      const pDate = (item.preferredDate || '').slice(0, 10);
      if (dateFilter === 'today') {
        if (pDate !== todayStr) return false;
      } else if (dateFilter === 'yesterday') {
        if (pDate !== yesterdayStr) return false;
      } else if (dateFilter === 'this_week') {
        if (!pDate || pDate < weekRange.start || pDate > weekRange.end) return false;
      } else if (dateFilter === 'this_month') {
        if (!pDate || !pDate.startsWith(thisMonthPrefix)) return false;
      } else if (dateFilter === 'last_month') {
        if (!pDate || !pDate.startsWith(lastMonthPrefix)) return false;
      } else if (dateFilter === 'custom_date') {
        if (customStart && pDate < customStart) return false;
        if (customEnd && pDate > customEnd) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.patientName.toLowerCase().includes(q);
        const matchPhone = item.phone.includes(q.replace(/\D/g, ''));
        const matchReg = item.regId.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchReg) return false;
      }

      return true;
    });
  }, [followups, selectedBranch, dateFilter, customStart, customEnd, searchQuery]);

  // Page calculations
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredList.length / pageSize));
  }, [filteredList.length, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredList.length);
  const paginatedList = useMemo(() => {
    return filteredList.slice(startIndex, endIndex);
  }, [filteredList, startIndex, endIndex]);

  // 3. Actions
  const handleCallPatient = (item: TelecallerFollowUpItem) => {
    if (!item.phone) {
      alert('No phone number recorded for this patient.');
      return;
    }
    const cleanPhone = item.phone.replace(/\D/g, '');
    window.open(`tel:${cleanPhone}`);

    // Log call activity
    logTelecallerActivity({
      telecallerUid: telecaller.uid,
      telecallerId: telecaller.telecallerId,
      telecallerName: telecaller.name,
      patientId: item.regId || item.id,
      patientName: item.patientName,
      patientMobile: item.phone,
      branchId: item.branchName || 'kphb',
      branchName: item.branchName || 'KPHB Branch',
      activityType: 'call_logged',
      callOutcome: 'Dialed patient',
      remarks: 'Initiated call from Web Follow-ups',
      followUpId: item.id
    });
  };

  const handleOpenStatusModal = (item: TelecallerFollowUpItem) => {
    setStatusItem(item);
    setSelectedStatus(item.status && STATUS_OPTIONS.includes(item.status) ? item.status : 'Interested');
    setStatusRemarks(item.remarks || '');
  };

  const handleSaveStatus = async () => {
    if (!statusItem || !db) return;
    setIsUpdatingStatus(true);

    try {
      const updateData = {
        callOutcome: selectedStatus,
        followUpStatus: selectedStatus,
        status: selectedStatus,
        remarks: statusRemarks,
        lastContactedBy: telecaller.name,
        lastContactedDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'followups', statusItem.id), updateData).catch(async () => {
        await setDoc(doc(db, 'followups', statusItem.id), updateData, { merge: true });
      });

      // Update state
      setFollowups((prev) =>
        prev.map((f) => (f.id === statusItem.id ? { ...f, status: selectedStatus, remarks: statusRemarks } : f))
      );

      // Audit Log
      await logTelecallerActivity({
        telecallerUid: telecaller.uid,
        telecallerId: telecaller.telecallerId,
        telecallerName: telecaller.name,
        patientId: statusItem.regId || statusItem.id,
        patientName: statusItem.patientName,
        patientMobile: statusItem.phone,
        branchId: statusItem.branchName || 'kphb',
        branchName: statusItem.branchName || 'KPHB Branch',
        activityType: 'status_updated',
        previousStatus: statusItem.status,
        newStatus: selectedStatus,
        callOutcome: selectedStatus,
        remarks: statusRemarks,
        followUpId: statusItem.id
      });

      setIsUpdatingStatus(false);
      setStatusItem(null);
    } catch (err: any) {
      setIsUpdatingStatus(false);
      alert('Failed to update status: ' + err?.message);
    }
  };

  const handleOpenRescheduleModal = (item: TelecallerFollowUpItem) => {
    setRescheduleItem(item);
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setRescheduleDate(d.toISOString().slice(0, 10));
    setRescheduleReason('Patient requested date change');
  };

  const handleQuickShiftDays = (days: number) => {
    const base = rescheduleDate ? new Date(rescheduleDate) : new Date();
    base.setDate(base.getDate() + days);
    setRescheduleDate(base.toISOString().slice(0, 10));
  };

  const handleSaveReschedule = async () => {
    if (!rescheduleItem || !rescheduleDate || !db) return;
    setIsRescheduling(true);

    try {
      const payload = {
        preferredFollowUpDate: rescheduleDate,
        followUpDate: rescheduleDate,
        scheduledDate: rescheduleDate,
        rescheduledAt: new Date().toISOString(),
        rescheduledBy: telecaller.name,
        rescheduledFromDate: rescheduleItem.preferredDate,
        rescheduleReason: rescheduleReason,
        status: 'Rescheduled',
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'followups', rescheduleItem.id), payload).catch(async () => {
        await setDoc(doc(db, 'followups', rescheduleItem.id), payload, { merge: true });
      });

      setFollowups((prev) =>
        prev.map((f) => (f.id === rescheduleItem.id ? { ...f, preferredDate: rescheduleDate, remarks: rescheduleReason, status: 'Rescheduled' } : f))
      );

      // Audit Log
      await logTelecallerActivity({
        telecallerUid: telecaller.uid,
        telecallerId: telecaller.telecallerId,
        telecallerName: telecaller.name,
        patientId: rescheduleItem.regId || rescheduleItem.id,
        patientName: rescheduleItem.patientName,
        patientMobile: rescheduleItem.phone,
        branchId: rescheduleItem.branchName || 'kphb',
        branchName: rescheduleItem.branchName || 'KPHB Branch',
        activityType: 'rescheduled',
        previousStatus: rescheduleItem.status,
        newStatus: 'Rescheduled',
        nextFollowUpDate: rescheduleDate,
        remarks: rescheduleReason,
        followUpId: rescheduleItem.id
      });

      setIsRescheduling(false);
      setRescheduleItem(null);
    } catch (err: any) {
      setIsRescheduling(false);
      alert('Failed to reschedule: ' + err?.message);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'inherit' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Patient Follow-ups</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
            Review, call, update statuses, and reschedule patient follow-ups across all clinic branches.
          </p>
        </div>
      </div>

      {/* Control Filters Bar */}
      <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Branch Dropdown */}
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

          {/* Date Range Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <Calendar size={16} color="#0284c7" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginRight: '4px' }}>Range:</span>
            {[
              { id: 'this_month', label: 'This Month' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'this_week', label: 'This Week' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'custom_date', label: 'Custom' },
              { id: 'all', label: 'All' }
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setDateFilter(d.id as DateFilterMode);
                  if (d.id === 'custom_date') setShowCustomModal(true);
                }}
                style={{
                  padding: '5px 11px',
                  borderRadius: '7px',
                  border: '1px solid',
                  borderColor: dateFilter === d.id ? '#0284c7' : '#e2e8f0',
                  background: dateFilter === d.id ? '#e0f2fe' : '#ffffff',
                  color: dateFilter === d.id ? '#0284c7' : '#64748b',
                  fontSize: '12px',
                  fontWeight: dateFilter === d.id ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 12px', minWidth: '260px' }}>
            <Search size={15} color="#94a3b8" style={{ marginRight: '8px' }} />
            <input
              type="text"
              placeholder="Search Name, Phone, ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12.5px', color: '#0f172a', width: '100%' }}
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                <X size={14} color="#94a3b8" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div style={{ marginBottom: '12px', fontSize: '13px', color: '#64748b' }}>
        Found <strong style={{ color: '#0284c7' }}>{filteredList.length}</strong> follow-up{filteredList.length === 1 ? '' : 's'}
      </div>

      {/* Main Table */}
      {isLoading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
          <RefreshCw size={28} className="animate-spin" color="#0284c7" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '14px', fontWeight: 600 }}>Loading follow-ups from clinic database...</p>
        </div>
      ) : filteredList.length === 0 ? (
        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
          <AlertCircle size={40} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#334155', margin: 0 }}>No Follow-ups Found</h3>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '6px 0 0' }}>Try selecting a different branch or date range.</p>
        </div>
      ) : (
        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700, fontSize: '12px' }}>
                <th style={{ padding: '12px 16px' }}>Patient</th>
                <th style={{ padding: '12px 16px' }}>Branch & Doctor</th>
                <th style={{ padding: '12px 16px' }}>Follow-up Date (DD-MM-YYYY)</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedList.map((item, idx) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: idx === filteredList.length - 1 ? 'none' : '1px solid #f1f5f9',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; }}
                >
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.patientName}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      <a href={`tel:${item.phone}`} style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600 }}>{item.phone}</a>
                      {item.regId ? ` • ID: ${item.regId}` : ''}
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#334155' }}>{item.branchName || 'SPH Clinic'}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{item.doctorName || 'Assigned Doctor'}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{formatDDMMYYYY(item.preferredDate)}</div>
                    {item.followUpInterval ? (
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Interval: {item.followUpInterval}</span>
                    ) : null}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      background: item.status === 'Completed' || item.status === 'Appointment Booked' ? '#dcfce7' : '#e0f2fe',
                      color: item.status === 'Completed' || item.status === 'Appointment Booked' ? '#15803d' : '#0284c7'
                    }}>
                      {item.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleCallPatient(item)}
                        title="Call Patient"
                        style={{
                          background: '#0284c7',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Phone size={13} />
                        Call
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenStatusModal(item)}
                        style={{
                          background: '#f0f9ff',
                          color: '#0284c7',
                          border: '1px solid #bae6fd',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Status
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenRescheduleModal(item)}
                        style={{
                          background: '#fffbeb',
                          color: '#d97706',
                          border: '1px solid #fde68a',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Reschedule
                      </button>

                      <button
                        type="button"
                        onClick={() => onNavigateToBook({
                          patientName: item.patientName,
                          phone: item.phone,
                          regId: item.regId,
                          branchName: item.branchName,
                          doctorName: item.doctorName,
                          diseases: item.diseases
                        })}
                        style={{
                          background: '#f0fdf4',
                          color: '#16a34a',
                          border: '1px solid #bbf7d0',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Book Appt
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination Controls Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 18px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                Showing <strong style={{ color: '#0f172a' }}>{filteredList.length === 0 ? 0 : startIndex + 1}–{endIndex}</strong> of <strong style={{ color: '#0f172a' }}>{filteredList.length}</strong> follow-ups
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b' }}>
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#0f172a',
                    cursor: 'pointer'
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                title="First Page"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: currentPage === 1 ? '#94a3b8' : '#0f172a',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage === 1 ? 0.5 : 1
                }}
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                title="Previous Page"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: currentPage === 1 ? '#94a3b8' : '#0f172a',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage === 1 ? 0.5 : 1
                }}
              >
                <ChevronLeft size={14} />
              </button>

              <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', padding: '0 8px' }}>
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                title="Next Page"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: currentPage >= totalPages ? '#94a3b8' : '#0f172a',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage >= totalPages ? 0.5 : 1
                }}
              >
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                title="Last Page"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: currentPage >= totalPages ? '#94a3b8' : '#0f172a',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage >= totalPages ? 0.5 : 1
                }}
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Modal */}
      {statusItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '460px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>Update Follow-up Status</h3>
              <button type="button" onClick={() => setStatusItem(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <X size={18} color="#64748b" />
              </button>
            </div>

            <div style={{ marginBottom: '14px', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{statusItem.patientName}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Phone: {statusItem.phone} • {statusItem.branchName}</div>
            </div>

            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Call Outcome / Status:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
              {STATUS_OPTIONS.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSelectedStatus(st)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '7px',
                    border: '1px solid',
                    borderColor: selectedStatus === st ? '#0284c7' : '#cbd5e1',
                    background: selectedStatus === st ? '#0284c7' : '#f8fafc',
                    color: selectedStatus === st ? '#ffffff' : '#334155',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {st}
                </button>
              ))}
            </div>

            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Remarks & Discussion Notes:
            </label>
            <textarea
              rows={3}
              value={statusRemarks}
              onChange={(e) => setStatusRemarks(e.target.value)}
              placeholder="Enter patient feedback or notes from the conversation..."
              style={{
                width: '100%',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                padding: '10px',
                fontSize: '13px',
                color: '#0f172a',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button
                type="button"
                onClick={() => setStatusItem(null)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveStatus}
                disabled={isUpdatingStatus}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#0284c7',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                {isUpdatingStatus ? 'Saving...' : 'Save Status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '460px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>Reschedule Follow-up</h3>
              <button type="button" onClick={() => setRescheduleItem(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <X size={18} color="#64748b" />
              </button>
            </div>

            <div style={{ marginBottom: '14px', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{rescheduleItem.patientName}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Current Follow-up: {formatDDMMYYYY(rescheduleItem.preferredDate)}</div>
            </div>

            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Next Follow-up Date (YYYY-MM-DD):
            </label>
            <input
              type="date"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
              style={{
                width: '100%',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                padding: '9px 12px',
                fontSize: '13px',
                color: '#0f172a',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: '8px'
              }}
            />

            {/* Quick Shift Days */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
              {[
                { label: '+1 Day', days: 1 },
                { label: '+3 Days', days: 3 },
                { label: '+1 Week', days: 7 },
                { label: '+15 Days', days: 15 },
                { label: '+1 Month', days: 30 },
              ].map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => handleQuickShiftDays(s.days)}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    borderRadius: '6px',
                    border: '1px solid #fde68a',
                    background: '#fef3c7',
                    color: '#b45309',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Reason for Rescheduling:
            </label>
            <textarea
              rows={2}
              value={rescheduleReason}
              onChange={(e) => setRescheduleReason(e.target.value)}
              placeholder="e.g. Patient traveling out of station..."
              style={{
                width: '100%',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                padding: '10px',
                fontSize: '13px',
                color: '#0f172a',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button
                type="button"
                onClick={() => setRescheduleItem(null)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReschedule}
                disabled={isRescheduling}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#d97706',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                {isRescheduling ? 'Rescheduling...' : 'Confirm Reschedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Date Modal */}
      {showCustomModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '380px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Custom Date Filter</h3>
            
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Start Date:</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              style={{ width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '8px', fontSize: '13px', marginBottom: '12px', boxSizing: 'border-box' }}
            />

            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>End Date:</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              style={{ width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '8px', fontSize: '13px', marginBottom: '16px', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setCustomStart('');
                  setCustomEnd('');
                  setShowCustomModal(false);
                }}
                style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '12.5px', cursor: 'pointer' }}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#0284c7', color: '#fff', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

