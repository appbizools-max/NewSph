import React, { useState, useEffect } from 'react';
import { Target, Edit3, Lock, Unlock, X } from 'lucide-react';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '@app/shared';

import { receptionDataStore } from '../../../utils/receptionDataStore';
import { calculateRealBranchRevenue, syncBranchTargetToFirestore } from '../../../utils/branchRevenueCalculator';

const DEFAULT_BRANCH_TARGETS = [
  { id: 'kphb', name: 'KPHB Branch Target', monthlyTarget: 725000, targetReached: 0 },
  { id: 'nallagandla', name: 'Nallagandla Branch Target', monthlyTarget: 325000, targetReached: 0 },
  { id: 'dilshuknagar', name: 'Dilshuknagar Branch Target', monthlyTarget: 225000, targetReached: 0 },
  { id: 'chandanagar', name: 'Chandanagar Branch Target', monthlyTarget: 550000, targetReached: 0 },
];

export const BranchTargetHRPage: React.FC = () => {
  const [branchTargets, setBranchTargets] = useState(DEFAULT_BRANCH_TARGETS);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [targetInput, setTargetInput] = useState('');

  // Date Logic for HR 2-day month-end unlock
  const now = new Date();
  const currentMonthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const unlockDay = totalDaysInMonth - 2;
  const currentDay = now.getDate();
  const isMonthEndUnlocked = currentDay >= unlockDay;

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
              const live = liveMap[b.id.toLowerCase()] || liveMap[b.name.toLowerCase().replace(/\s*branch\s*target$/i, '')];
              if (live) {
                return {
                  ...b,
                  monthlyTarget: Number(live.monthlyTarget) || b.monthlyTarget,
                  targetReached: live.targetReached !== undefined ? Number(live.targetReached) : 0,
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
  }, []);

  const handleOpenEdit = (b: any) => {
    if (!isMonthEndUnlocked) {
      alert(`🔒 Target Setting Locked: HR can set or update branch targets ONLY 2 days before the month end (unlocks on ${now.toLocaleString('default', { month: 'short' })} ${unlockDay}th). Admin can edit at any time.`);
      return;
    }
    setEditingBranch(b);
    setTargetInput(b.monthlyTarget > 0 ? String(b.monthlyTarget) : '');
  };

  const handleSaveTarget = async () => {
    if (!editingBranch || !targetInput) return;
    const num = Number(targetInput.replace(/[^0-9]/g, ''));
    if (isNaN(num) || num <= 0) {
      alert('Please enter a valid numeric target amount.');
      return;
    }

    try {
      const docRef = doc(db, 'branchTargets', editingBranch.id);
      await setDoc(docRef, {
        id: editingBranch.id,
        branchName: editingBranch.name,
        monthlyTarget: num,
        targetReached: editingBranch.targetReached || 0,
        remaining: Math.max(0, num - (editingBranch.targetReached || 0)),
        percentage: num > 0 ? Math.round(((editingBranch.targetReached || 0) / num) * 100) : 0,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setBranchTargets((prev: any[]) => prev.map((b: any) => b.id === editingBranch.id ? { ...b, monthlyTarget: num } : b));
      setEditingBranch(null);
    } catch (err) {
      console.error('Error updating target:', err);
      alert('Failed to update target.');
    }
  };

  const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN')}`;

  return (
    <div style={{ padding: '24px 20px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Target size={24} color="#258ec8" />
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Branch Target Progress (HR)
            </h1>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>
              Monitor performance and set branch targets 2 days before month end.
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: isMonthEndUnlocked ? '#dcfce7' : '#f1f5f9',
          color: isMonthEndUnlocked ? '#166534' : '#64748b',
          border: `1px solid ${isMonthEndUnlocked ? '#bbf7d0' : '#e2e8f0'}`,
          padding: '6px 12px',
          borderRadius: '8px',
          fontSize: '0.8rem',
          fontWeight: 700
        }}>
          {isMonthEndUnlocked ? <Unlock size={14} color="#16a34a" /> : <Lock size={14} color="#64748b" />}
          {isMonthEndUnlocked ? 'HR Window: Unlocked' : `HR Window: Opens ${now.toLocaleString('default', { month: 'short' })} ${unlockDay}th`}
        </div>
      </div>

      {/* Status Notice */}
      {!isMonthEndUnlocked ? (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#475569' }}>
          <Lock size={16} color="#64748b" />
          <span>
            HR target editing is locked. Target editing window unlocks on <strong>{now.toLocaleString('default', { month: 'short' })} {unlockDay}th</strong> (2 days before month end).
          </span>
        </div>
      ) : (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#166534' }}>
          <Unlock size={16} color="#16a34a" />
          <span>
            HR Target Setting Window is <strong>OPEN</strong>. You can enter or adjust branch targets for the upcoming period.
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
        {branchTargets.map((b: any) => {
          const pct = b.monthlyTarget > 0 ? Math.round((b.targetReached / b.monthlyTarget) * 100) : 0;
          return (
            <div key={b.name} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 6px rgba(15,23,42,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a' }}>{b.name}</span>
                <button
                  type="button"
                  disabled={!isMonthEndUnlocked}
                  onClick={() => handleOpenEdit(b)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: isMonthEndUnlocked ? '#f1f5f9' : '#f8fafc',
                    border: `1px solid ${isMonthEndUnlocked ? '#cbd5e1' : '#e2e8f0'}`,
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: isMonthEndUnlocked ? '#258ec8' : '#94a3b8',
                    cursor: isMonthEndUnlocked ? 'pointer' : 'not-allowed'
                  }}
                >
                  {isMonthEndUnlocked ? <Edit3 size={12} /> : <Lock size={12} />}
                  {isMonthEndUnlocked ? (b.monthlyTarget > 0 ? 'Edit' : 'Set') : 'Locked'}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748b', marginBottom: '8px' }}>
                <span>Target: <b style={{ color: b.monthlyTarget > 0 ? '#258ec8' : '#94a3b8' }}>{b.monthlyTarget > 0 ? formatCurrency(b.monthlyTarget) : 'Not Set'}</b></span>
                <span>Current: <b style={{ color: '#16a34a' }}>{formatCurrency(b.targetReached)}</b></span>
              </div>

              {b.monthlyTarget > 0 ? (
                <div>
                  <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: '#258ec8' }} />
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#258ec8', marginTop: '4px', display: 'block', textAlign: 'right' }}>
                    {pct}% Reached
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'block', marginTop: '6px' }}>
                  Target not set
                </span>
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
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Set Branch Target (HR)</h2>
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
              placeholder="e.g. 1500000"
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
