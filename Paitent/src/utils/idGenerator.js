import { db } from '../firebase';
import { doc, runTransaction } from 'firebase/firestore';

export const getStandardBranchName = (name) => {
  if (!name) return '';
  const normalized = String(name).toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.includes('kphb')) return 'Kphb';
  if (normalized.includes('chandnagar') || normalized.includes('chandanagar') || normalized.includes('chanda nagar') || normalized.includes('chnr')) return 'Chandanagar';
  if (normalized.includes('dilsukhnagar') || normalized.includes('dilshuknagar') || normalized.includes('dsnr')) return 'Dilshuknagar';
  if (normalized.includes('nallagandla')) return 'Nallagandla';
  if (normalized.includes('madhapur')) return 'Madhapur';
  if (normalized.includes('kukatpally')) return 'Kukatpally';
  
  const clean = String(name).replace(/\s*branch\s*/i, '').trim();
  return clean.replace(/\b[a-z]/g, (char) => char.toUpperCase()).replace(/\s+/g, ' ').trim();
};

/**
 * Returns a consistent 3-letter branch code used in registration IDs.
 * IMPORTANT: These codes must be identical across all platforms (Admin/Staff/Patient)
 * and must never change — they form part of permanent patient IDs.
 *
 * Format: SPH-{CODE}-{NNNN}
 *   Chandanagar  → CHN  e.g. SPH-CHN-0001
 *   KPHB         → KPB  e.g. SPH-KPB-0001
 *   Dilshuknagar → DIL  e.g. SPH-DIL-0001
 *   Nallagandla  → NGL  e.g. SPH-NGL-0001
 */
export const getBranchShortcut = (branchNameOrId) => {
  const normalized = (branchNameOrId || 'UNKNOWN').toUpperCase();
  // KPHB / KPHP → KPB
  if (normalized.includes('KPHB') || normalized.includes('KPHP') || normalized === 'KPB') return 'KPB';
  // Chandanagar → CHN
  if (normalized.includes('CHANDANAGAR') || normalized.includes('CHANDNAGAR') || normalized.includes('CHANDA') || normalized === 'CHN') return 'CHN';
  // Nallagandla → NGL
  if (normalized.includes('NALLAGANDLA') || normalized === 'NGL' || normalized === 'NLG') return 'NGL';
  // Dilshuknagar / Dilsukhnagar → DIL
  if (normalized.includes('DILSHUKNAGAR') || normalized.includes('DILSUKHNAGAR') || normalized === 'DIL' || normalized === 'DSN') return 'DIL';
  // Madhapur → MDP
  if (normalized.includes('MADHAPUR') || normalized === 'MDP') return 'MDP';
  // Kukatpally → KKP
  if (normalized.includes('KUKATPALLY') || normalized === 'KKP') return 'KKP';
  
  // Fallback: take first 3 alphabetic characters
  const fallback = normalized.replace(/[^A-Z]/g, '').substring(0, 3);
  return fallback || 'GEN';
};

/**
 * Generates the next registration ID for a branch using an atomic Firestore transaction.
 * This ensures no two patients — regardless of which platform they book from — get the same ID.
 *
 * Counter document: counters/registration_{CODE}
 * Returns: "SPH-{CODE}-{NNNN}" e.g. "SPH-CHN-0042"
 */
export const generateRegistrationId = async (branchNameOrId) => {
  const shortcut = getBranchShortcut(branchNameOrId);
  const counterRef = doc(db, 'counters', `registration_${shortcut}`);

  try {
    const newId = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let newCount = 1;

      if (counterDoc.exists()) {
        newCount = (counterDoc.data().count || 0) + 1;
        transaction.update(counterRef, { count: newCount });
      } else {
        transaction.set(counterRef, { count: newCount });
      }

      return newCount;
    });

    // 4-digit zero-padded counter: 0001, 0002, ..., 9999
    const formattedCount = String(newId).padStart(4, '0');
    return `SPH-${shortcut}-${formattedCount}`;
  } catch (error) {
    console.error('Error generating registration ID: ', error);
    // Fallback: timestamp-based to avoid collisions on transaction failure
    const ts = Date.now().toString().slice(-5);
    return `SPH-${shortcut}-T${ts}`;
  }
};
