import React, { useState, useEffect } from 'react';
import { Target, Edit3, Lock, Unlock, X, Calendar } from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@app/shared';
import { TargetProgressWebUI } from '../../../components/TargetProgressWebUI';
import { reconcileBranchTargetData, calculateRealBranchRevenue, getCurrentMonthYMD, getNextMonthYMD } from '../../../utils/branchRevenueCalculator';
import { receptionDataStore } from '../../../utils/receptionDataStore';

const DEFAULT_BRANCH_TARGETS = [
  { id: 'kphb', name: 'KPHB Branch', monthlyTarget: 725000, targetReached: 0, nextMonthTarget: 0 },
  { id: 'nallagandla', name: 'Nallagandla Branch', monthlyTarget: 325000, targetReached: 0, nextMonthTarget: 0 },
  { id: 'dilshuknagar', name: 'Dilshuknagar Branch', monthlyTarget: 225000, targetReached: 0, nextMonthTarget: 0 },
  { id: 'chandanagar', name: 'Chandanagar Branch', monthlyTarget: 550000, targetReached: 0, nextMonthTarget: 0 },
];

export const BranchTargetHRPage: React.FC = () => {
  const [branchTargets, setBranchTargets] = useState(DEFAULT_BRANCH_TARGETS);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [editingTargetType, setEditingTargetType] = useState<'current' | 'next'>('next');
  const [targetInput, setTargetInput] = useState('');
  const [activeTabMonth, setActiveTabMonth] = useState<'current' | 'next'>('current');

  const [appointmentsPool, setAppointmentsPool] = useState<any[]>(() => {
    try {
      const pool = receptionDataStore.getAllCollectionsPool();
      if (pool && pool.length > 0) return pool;
      return receptionDataStore.getAppointments() || [];
    } catch (_) {
      return [];
    }
  });

  const [packageMembersList, setPackageMembersList] = useState<any[]>(() => {
    try {
      return receptionDataStore.getPackageMembers() || [];
    } catch (_) {
      return [];
    }
  });

  // Date Logic for HR 2-day month-end unlock
  const now = new Date();
  const currentMonthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthName = nextMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const unlockDay = totalDaysInMonth - 2;
  const currentDay = now.getDate();
  const isMonthEndUnlocked = currentDay >= unlockDay;

  useEffect(() => {
    try {
      receptionDataStore.startListeners();
    } catch (_) {}

    const unsubStore = receptionDataStore.subscribe((state) => {
      if (state.allCollectionsPool && state.allCollectionsPool.length > 0) {
        setAppointmentsPool(state.allCollectionsPool);
      } else if (state.appointments && state.appointments.length > 0) {
        setAppointmentsPool(state.appointments);
      }
      if (state.packageMembersList) {
        setPackageMembersList(state.packageMembersList);
      }
    });

    return () => unsubStore();
  }, []);

  useEffect(() => {
    try {
      const colRef = collection(db, 'branchTargets');
      const unsubscribe = onSnapshot(colRef, (snapshot) => {
        if (!snapshot.empty) {
          const liveMap: Record<string, any> = {};
          snapshot.forEach((docSnap) => {
            liveMap[docSnap.id.toLowerCase()] = docSnap.data();
          });

          setBranchTargets((prev: any[]) => {
            const updated = prev.map((b) => {
              const live = liveMap[b.id.toLowerCase()] || liveMap[b.name.toLowerCase().replace(/\s*branch(\s*target)?$/i, '')];
              if (live) {
                const reconciled = reconcileBranchTargetData(live, b.id);
                const directRev = calculateRealBranchRevenue(b.id, appointmentsPool, packageMembersList, reconciled.monthlyTarget);
                const effectiveReached = Math.max(reconciled.targetReached || 0, directRev.targetReached || 0);

                return {
                  ...b,
                  monthlyTarget: reconciled.monthlyTarget,
                  targetReached: effectiveReached,
                  nextMonthTarget: reconciled.nextMonthTarget,
                };
              }
              return b;
            });
            return updated;
          });
        }
      });
      return () => unsubscribe();
    } catch (err) {
      console.error('Error listening to branch targets:', err);
    }
  }, [appointmentsPool, packageMembersList]);

  const handleOpenEdit = (b: any, targetType: 'current' | 'next') => {
    if (targetType === 'current') {
      alert(`🔒 Target Setting Locked: HR cannot change the active month's target once the month has begun. Only Admin can edit the current month target. HR can configure the upcoming month's target starting 2 days before month end.`);
      return;
    }
    if (targetType === 'next' && !isMonthEndUnlocked) {
      alert(`🔒 Target Setting Locked: HR can set or update branch targets ONLY 2 days before month end (unlocks on ${now.toLocaleString('default', { month: 'short' })} ${unlockDay}th). Admin can edit at any time.`);
      return;
    }
    setEditingBranch(b);
    setEditingTargetType(targetType);
    setTargetInput(String(b.nextMonthTarget || ''));
  };

  const handleSaveTarget = async () => {
    if (!editingBranch || !targetInput) return;
    const num = Number(targetInput.replace(/[^0-9]/g, ''));
    if (isNaN(num) || num <= 0) {
      alert('Please enter a valid numeric target amount.');
      return;
    }

    const currentMonthKey = getCurrentMonthYMD(now);
    const nextMonthKey = getNextMonthYMD(now);

    try {
      const docRef = doc(db, 'branchTargets', editingBranch.id);
      const updatePayload: any = {
        branchId: editingBranch.id,
        branchName: editingBranch.name,
        updatedAt: new Date().toISOString(),
        currentMonth: currentMonthKey,
        nextMonth: nextMonthKey,
      };

      if (editingTargetType === 'current') {
        const currentDocSnap = await getDoc(docRef).catch(() => null);
        const liveReached = Number(currentDocSnap?.data()?.targetReached ?? editingBranch.targetReached ?? 0);
        updatePayload.monthlyTarget = num;
        updatePayload.targetReached = liveReached;
        updatePayload.remaining = Math.max(0, num - liveReached);
        updatePayload.percentage = num > 0 ? Math.min(Math.round((liveReached / num) * 100), 100) : 0;
        updatePayload.isReached = liveReached >= num;
        updatePayload[`monthlyTargets.${currentMonthKey}`] = num;
      } else {
        updatePayload.nextMonthTarget = num;
        updatePayload[`monthlyTargets.${nextMonthKey}`] = num;
      }

      await setDoc(docRef, updatePayload, { merge: true });

      setBranchTargets((prev: any[]) => prev.map((b: any) => {
        if (b.id === editingBranch.id) {
          return editingTargetType === 'current'
            ? { ...b, monthlyTarget: num }
            : { ...b, nextMonthTarget: num };
        }
        return b;
      }));
      setEditingBranch(null);
    } catch (err) {
      console.error('Error updating target:', err);
      alert('Failed to update target.');
    }
  };

  const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN')}`;

  return (
    <div style={{ padding: '24px 20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Target size={24} color="#258ec8" />
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Branch Target Management (HR)
            </h1>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>
              Track current achievement and configure next month branch targets 2 days before month end.
            </p>
          </div>
        </div>

        {/* Month Selector Tabs */}
        <div style={{ display: 'flex', background: '#ffffff', borderRadius: '10px', padding: '4px', border: '1px solid #cbd5e1', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setActiveTabMonth('current')}
            style={{
              border: 'none',
              padding: '6px 14px',
              borderRadius: '7px',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              background: activeTabMonth === 'current' ? '#258ec8' : 'transparent',
              color: activeTabMonth === 'current' ? '#ffffff' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Calendar size={14} />
            {currentMonthName} Target
          </button>
          <button
            type="button"
            onClick={() => setActiveTabMonth('next')}
            style={{
              border: 'none',
              padding: '6px 14px',
              borderRadius: '7px',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              background: activeTabMonth === 'next' ? '#258ec8' : 'transparent',
              color: activeTabMonth === 'next' ? '#ffffff' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isMonthEndUnlocked ? <Unlock size={14} color={activeTabMonth === 'next' ? '#ffffff' : '#16a34a'} /> : <Lock size={14} color={activeTabMonth === 'next' ? '#ffffff' : '#64748b'} />}
            {nextMonthName} Target
          </button>
        </div>
      </div>

      {/* Lock Notification Banner */}
      {!isMonthEndUnlocked ? (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#475569' }}>
          <Lock size={16} color="#64748b" />
          <span>
            Current month target is locked. Target configuration for <strong>{nextMonthName}</strong> unlocks for HR on <strong>{now.toLocaleString('default', { month: 'short' })} {unlockDay}th</strong> (2 days before month end).
          </span>
        </div>
      ) : (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#166534' }}>
          <Unlock size={16} color="#16a34a" />
          <span>
            HR Target Setting Window is <strong>OPEN</strong>. You can configure branch targets for <strong>{nextMonthName}</strong>.
          </span>
        </div>
      )}

      {/* Branch Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))', gap: '20px', width: '100%', boxSizing: 'border-box' }}>
        {branchTargets.map((b: any) => {
          return (
            <div key={b.id} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 6px rgba(15,23,42,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{b.name}</span>
                {activeTabMonth === 'current' ? (
                  <button
                    type="button"
                    disabled={true}
                    onClick={() => handleOpenEdit(b, 'current')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#94a3b8',
                      cursor: 'not-allowed'
                    }}
                  >
                    <Lock size={13} /> Active Target (Locked)
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!isMonthEndUnlocked}
                    onClick={() => handleOpenEdit(b, 'next')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: isMonthEndUnlocked ? '#16a34a' : '#f1f5f9',
                      border: `1px solid ${isMonthEndUnlocked ? '#16a34a' : '#cbd5e1'}`,
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: isMonthEndUnlocked ? '#ffffff' : '#94a3b8',
                      cursor: isMonthEndUnlocked ? 'pointer' : 'not-allowed'
                    }}
                  >
                    {isMonthEndUnlocked ? <><Edit3 size={13} /> Set {nextMonthDate.toLocaleString('default', { month: 'short' })} Target</> : <><Lock size={13} /> Unlocks {now.toLocaleString('default', { month: 'short' })} {unlockDay}th</>}
                  </button>
                )}
              </div>

              {/* Progress UI for Current Month vs Next Month Goal Box */}
              {activeTabMonth === 'current' ? (
                (() => {
                  const directRev = calculateRealBranchRevenue(b.id, appointmentsPool, packageMembersList, b.monthlyTarget);
                  const effectiveReached = Math.max(b.targetReached || 0, directRev.targetReached || 0);
                  return (
                    <TargetProgressWebUI
                      branchName={b.name}
                      monthlyTarget={b.monthlyTarget}
                      targetReached={effectiveReached}
                    />
                  );
                })()
              ) : (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>
                      📅 {nextMonthName} Planned Goal
                    </span>
                    {isMonthEndUnlocked ? (
                      <span style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, color: '#16a34a' }}>
                        🔓 Unlocked
                      </span>
                    ) : (
                      <span style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, color: '#64748b' }}>
                        🔒 Unlocks {now.toLocaleString('default', { month: 'short' })} {unlockDay}th
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                      Configured Target ({nextMonthDate.toLocaleString('default', { month: 'short' })}):
                    </span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                      {b.nextMonthTarget > 0 ? formatCurrency(b.nextMonthTarget) : 'Not Configured Yet'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* EDIT MODAL */}
      {editingBranch && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '420px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Set {editingTargetType === 'current' ? currentMonthName : nextMonthName} Target
              </h2>
              <button type="button" onClick={() => setEditingBranch(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px' }}>{editingBranch.name}</p>

            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              Monthly Revenue Goal (₹)
            </label>
            <input
              type="number"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="Enter target amount (e.g. 725000)"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '14px',
                fontWeight: 700,
                color: '#0f172a',
                marginBottom: '18px'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setEditingBranch(null)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontWeight: 700,
                  fontSize: '13px',
                  color: '#64748b',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTarget}
                style={{
                  background: '#258ec8',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontWeight: 700,
                  fontSize: '13px',
                  color: '#ffffff',
                  cursor: 'pointer'
                }}
              >
                Save Target
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
