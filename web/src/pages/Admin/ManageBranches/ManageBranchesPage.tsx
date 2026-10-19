import React, { useState, useEffect } from 'react';
import { Building2, Edit3, Lock, Unlock, Calendar, CheckCircle2, ArrowLeft } from 'lucide-react';
import { doc, onSnapshot, setDoc, collection } from 'firebase/firestore';
import { db } from '@app/shared';
import { TargetProgressWebUI } from '../../../components/TargetProgressWebUI';

const DEFAULT_BRANCHES = [
  { id: 'kphb', name: 'KPHB Branch', phone: '+91 90301 76176', monthlyTarget: 725000, targetReached: 0, nextMonthTarget: 0 },
  { id: 'nallagandla', name: 'Nallagandla Branch', phone: '+91 91321 76176', monthlyTarget: 325000, targetReached: 0, nextMonthTarget: 0 },
  { id: 'dilshuknagar', name: 'Dilshuknagar Branch', phone: '+91 98041 76176', monthlyTarget: 225000, targetReached: 0, nextMonthTarget: 0 },
  { id: 'chandanagar', name: 'Chandanagar Branch', phone: '+91 95531 76176', monthlyTarget: 550000, targetReached: 0, nextMonthTarget: 0 },
];

interface ManageBranchesPageProps {
  onBack?: () => void;
  role?: string;
  currentBranch?: string;
}

export const ManageBranchesPage: React.FC<ManageBranchesPageProps> = ({ onBack, role = 'admin' }) => {
  const isAdmin = role !== 'hr';
  const [branches, setBranches] = useState(DEFAULT_BRANCHES);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [editingTargetType, setEditingTargetType] = useState<'current' | 'next'>('current');
  const [targetInput, setTargetInput] = useState('');
  const [activeTabMonth, setActiveTabMonth] = useState<'current' | 'next'>('current');

  // Date Logic for Next Month Target Unlock (Unlocked ONLY 2 days before next month for HR)
  const now = new Date();
  const currentMonthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthName = nextMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const unlockDay = totalDaysInMonth - 2;
  const currentDay = now.getDate();
  const isNextMonthUnlocked = currentDay >= unlockDay;

  // Live Firestore Listener for Branch Targets
  useEffect(() => {
    try {
      const colRef = collection(db, 'branchTargets');
      const unsubscribe = onSnapshot(colRef, (snapshot) => {
        if (!snapshot.empty) {
          const liveMap: Record<string, any> = {};
          snapshot.forEach((docSnap) => {
            liveMap[docSnap.id.toLowerCase()] = docSnap.data();
          });

          setBranches((prev) =>
            prev.map((b) => {
              const live = liveMap[b.id.toLowerCase()] || liveMap[b.name.toLowerCase()];
              if (live) {
                return {
                  ...b,
                  monthlyTarget: Number(live.monthlyTarget) || b.monthlyTarget,
                  targetReached: live.targetReached !== undefined ? Number(live.targetReached) : b.targetReached,
                  nextMonthTarget: live.nextMonthTarget !== undefined ? Number(live.nextMonthTarget) : 0,
                };
              }
              return b;
            })
          );
        }
      });
      return () => unsubscribe();
    } catch (err) {
      console.error('Error listening to branch targets:', err);
    }
  }, []);

  const handleEditClick = (b: any, targetType: 'current' | 'next') => {
    // Admin can edit at ANY time (both current and next month)
    // HR can only enter or change targets 2 days before month end
    if (!isAdmin && !isNextMonthUnlocked) {
      alert(`🔒 HR Target Setting Locked: HR can enter or change targets only 2 days before month end (starts on ${now.toLocaleString('default', { month: 'short' })} ${unlockDay}th). Admin can edit targets anytime.`);
      return;
    }
    setEditingBranch(b);
    setEditingTargetType(targetType);
    setTargetInput(String(targetType === 'current' ? (b.monthlyTarget || '') : (b.nextMonthTarget || '')));
  };

  const handleSaveTarget = async () => {
    if (!editingBranch || !targetInput) return;
    const num = Number(targetInput.replace(/[^0-9]/g, ''));
    if (isNaN(num) || num <= 0) {
      alert('Please enter a valid numeric target amount.');
      return;
    }

    try {
      const updateData: any = {
        branchId: editingBranch.id,
        branchName: editingBranch.name,
        updatedAt: new Date().toISOString(),
      };

      if (editingTargetType === 'current') {
        updateData.monthlyTarget = num;
        updateData.targetReached = editingBranch.targetReached || 0;
        updateData.remaining = Math.max(0, num - (editingBranch.targetReached || 0));
        updateData.percentage = num > 0 ? Math.round(((editingBranch.targetReached || 0) / num) * 100) : 0;
      } else {
        updateData.nextMonthTarget = num;
      }

      await setDoc(doc(db, 'branchTargets', editingBranch.id), updateData, { merge: true });

      setBranches((prev) =>
        prev.map((b) => {
          if (b.id === editingBranch.id) {
            return editingTargetType === 'current'
              ? { ...b, monthlyTarget: num }
              : { ...b, nextMonthTarget: num };
          }
          return b;
        })
      );
      setEditingBranch(null);
    } catch (err) {
      console.error('Error updating target:', err);
      alert('Failed to update target in Firestore.');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* MONTH SELECTOR BAR & TARGET LOCK STATUS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px', backgroundColor: '#ffffff', padding: '14px 20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '6px 12px',
                fontWeight: 700,
                fontSize: '0.82rem',
                color: '#334155',
                cursor: 'pointer',
                marginRight: '6px'
              }}
            >
              <ArrowLeft size={16} color="#0f172a" /> Back
            </button>
          )}
          <Building2 size={22} color="#258ec8" />
          <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
            Branch Target Period: <strong style={{ color: '#258ec8' }}>{activeTabMonth === 'current' ? currentMonthName : nextMonthName}</strong>
          </span>
        </div>

        {/* Month Selector Pills */}
        <div style={{ display: 'flex', background: '#f8fafc', padding: '4px', borderRadius: '10px', gap: '4px', border: '1px solid #e2e8f0' }}>
          <button
            type="button"
            onClick={() => setActiveTabMonth('current')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'pointer',
              background: activeTabMonth === 'current' ? '#258ec8' : 'transparent',
              color: activeTabMonth === 'current' ? '#ffffff' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Calendar size={14} /> {currentMonthName}
          </button>
          <button
            type="button"
            onClick={() => setActiveTabMonth('next')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'pointer',
              background: activeTabMonth === 'next' ? '#258ec8' : 'transparent',
              color: activeTabMonth === 'next' ? '#ffffff' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isAdmin || isNextMonthUnlocked ? <Unlock size={14} color={activeTabMonth === 'next' ? '#ffffff' : '#16a34a'} /> : <Lock size={14} color={activeTabMonth === 'next' ? '#ffffff' : '#64748b'} />}
            {nextMonthName}
          </button>
        </div>
      </div>

      {/* Lock Notification Banner / Admin Access Badge */}
      {!isAdmin && !isNextMonthUnlocked && (
        <div style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '12px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '0.85rem',
          color: '#475569'
        }}>
          <div style={{ background: '#f1f5f9', padding: '8px', borderRadius: '8px' }}>
            <Lock size={18} color="#64748b" />
          </div>
          <div>
            <h4 style={{ margin: '0 0 2px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>HR Target Entry Window</h4>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
              Setting targets for <strong>{nextMonthName}</strong> unlocks for HR on <strong>{now.toLocaleString('default', { month: 'short' })} {unlockDay}th</strong> (2 days before month end).
            </p>
          </div>
        </div>
      )}

      {isAdmin && (
        <div style={{
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '12px',
          padding: '12px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '0.85rem',
          color: '#166534'
        }}>
          <div style={{ background: '#dcfce7', padding: '8px', borderRadius: '8px' }}>
            <Unlock size={18} color="#16a34a" />
          </div>
          <div>
            <h4 style={{ margin: '0 0 2px', fontSize: '0.88rem', fontWeight: 800, color: '#166534' }}>Admin Unrestricted Access</h4>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#15803d' }}>
              You can enter, edit, and update branch targets for both current and upcoming months at <strong>any time</strong>.
            </p>
          </div>
        </div>
      )}

      {/* BRANCH TARGET CARDS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))', gap: '20px', width: '100%', boxSizing: 'border-box' }}>
        {branches.map((b) => {
          const isLockedForRole = !isAdmin && !isNextMonthUnlocked;
          return (
          <div
            key={b.id}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
              position: 'relative',
              boxSizing: 'border-box',
              width: '100%',
              overflow: 'hidden'
            }}
          >
            {/* Top Accent Line */}
            <div style={{
              height: '3px',
              width: '100%',
              backgroundColor: '#258ec8',
              borderRadius: '3px 3px 0 0',
              position: 'absolute',
              top: 0,
              left: 0
            }} />

            {/* Card Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#f8fafc', padding: '8px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <Building2 size={20} color="#258ec8" />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{b.name}</h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0', fontWeight: 600 }}>📞 {b.phone}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div>
                {activeTabMonth === 'current' ? (
                  <button
                    type="button"
                    onClick={() => handleEditClick(b, 'current')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: '#258ec8',
                      color: '#ffffff',
                      border: 'none',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    <Edit3 size={14} /> Set {now.toLocaleString('default', { month: 'short' })} Target
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isLockedForRole}
                    onClick={() => handleEditClick(b, 'next')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: !isLockedForRole ? '#258ec8' : '#f1f5f9',
                      color: !isLockedForRole ? '#ffffff' : '#94a3b8',
                      border: `1px solid ${!isLockedForRole ? '#258ec8' : '#cbd5e1'}`,
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: !isLockedForRole ? 'pointer' : 'not-allowed'
                    }}
                  >
                    {!isLockedForRole ? <Edit3 size={14} /> : <Lock size={14} />}
                    {!isLockedForRole ? `Set ${nextMonthDate.toLocaleString('default', { month: 'short' })} Target` : 'Locked'}
                  </button>
                )}
              </div>
            </div>

            {/* Current Month Target Progress View */}
            {activeTabMonth === 'current' && (
              <TargetProgressWebUI
                branchName={b.name}
                monthlyTarget={b.monthlyTarget}
                targetReached={b.targetReached}
              />
            )}

            {/* Next Month Planned Target Card View */}
            {activeTabMonth === 'next' && (
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
                marginTop: '10px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🗓️ {nextMonthName} Planned Goal
                  </span>
                  {!isNextMonthUnlocked ? (
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', background: '#e2e8f0', padding: '3px 8px', borderRadius: '6px' }}>
                      🔒 Opens {now.toLocaleString('default', { month: 'short' })} {unlockDay}th
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '3px 8px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                      🔓 Entry Unlocked
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Target Amount ({nextMonthName})</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>₹{(b.nextMonthTarget ?? 0).toLocaleString('en-IN')}</div>
                  </div>

                  <button
                    type="button"
                    disabled={!isNextMonthUnlocked}
                    onClick={() => handleEditClick(b, 'next')}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: isNextMonthUnlocked ? '#258ec8' : '#e2e8f0',
                      color: isNextMonthUnlocked ? '#ffffff' : '#64748b',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      cursor: isNextMonthUnlocked ? 'pointer' : 'not-allowed'
                    }}
                  >
                    {isNextMonthUnlocked ? 'Edit Target' : 'Locked'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      </div>

      {/* EDIT TARGET MODAL */}
      {editingBranch && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '420px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Edit3 size={18} color="#258ec8" />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                Set {editingTargetType === 'current' ? currentMonthName : nextMonthName} Target
              </h3>
            </div>
            <p style={{ margin: '0 0 18px', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>{editingBranch.name}</p>

            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              Monthly Revenue Target Amount (₹)
            </label>
            <input
              type="number"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="e.g. 1200000"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '1rem',
                fontWeight: 700,
                color: '#0f172a',
                marginBottom: '20px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setEditingBranch(null)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTarget}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#258ec8',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.85rem',
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
