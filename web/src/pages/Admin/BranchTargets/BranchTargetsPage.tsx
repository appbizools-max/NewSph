import React, { useState, useEffect } from 'react';
import { Target, Edit3, Shield, CheckCircle2, X } from 'lucide-react';
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

export const BranchTargetsPage: React.FC = () => {
  const [branchTargets, setBranchTargets] = useState(DEFAULT_BRANCH_TARGETS);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [targetInput, setTargetInput] = useState('');

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
                  targetReached: live.targetReached !== undefined ? Number(live.targetReached) : b.targetReached,
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
    // Admin can edit at ANY time
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Target size={24} color="#258ec8" />
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Branch Target Management
            </h1>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>
              Set and monitor monthly revenue goals for all branches.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#dcfce7', color: '#166534', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700 }}>
          <Shield size={14} /> Admin Access: Edit Anytime
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
        {branchTargets.map((b: any) => {
          const pct = b.monthlyTarget > 0 ? Math.round((b.targetReached / b.monthlyTarget) * 100) : 0;
          return (
            <div key={b.name} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 6px rgba(15,23,42,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', margin: 0 }}>{b.name}</h3>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(b)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#258ec8',
                    cursor: 'pointer'
                  }}
                >
                  <Edit3 size={12} /> {b.monthlyTarget > 0 ? 'Edit' : 'Set'}
                </button>
              </div>

              <p style={{ fontSize: '12.5px', color: '#64748b', margin: '4px 0' }}>
                Target: <b style={{ color: b.monthlyTarget > 0 ? '#258ec8' : '#94a3b8' }}>{b.monthlyTarget > 0 ? formatCurrency(b.monthlyTarget) : 'Not Set'}</b>
              </p>
              <p style={{ fontSize: '12.5px', color: '#64748b', margin: '4px 0' }}>
                Achieved: <b style={{ color: '#16a34a' }}>{formatCurrency(b.targetReached)}</b>
              </p>

              {b.monthlyTarget > 0 ? (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: '#258ec8' }} />
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#258ec8', marginTop: '4px', display: 'block', textAlign: 'right' }}>
                    {pct}% Achieved
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginTop: '8px', display: 'block' }}>
                  No target defined for this month
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
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Set Monthly Target</h2>
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
