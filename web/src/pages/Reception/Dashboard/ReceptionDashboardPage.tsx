import React, { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList, Clock, CreditCard, Search, Calendar, CheckCircle,
  ArrowRightLeft, UserX, Activity, CheckCircle2, Play, AlertCircle, Trash2,
  ArrowUp, ArrowDown, Phone, CalendarClock, X, Save, MoreVertical, MessageCircle, FileText, RotateCcw
} from 'lucide-react';
import { db, sendRescheduleWhatsAppNotification, sendCancellationWhatsAppNotification, sendInvoiceReceiptWhatsAppNotification, sendExperienceWhatsAppNotification, sendInvoiceWhatsAppNotification, CanonicalBranchId, sanitizeDoctorName, resolveCanonicalBranchId } from '@app/shared';
import { collection, onSnapshot, updateDoc, deleteDoc, doc, query, where, getDocs, increment, getDoc, setDoc } from 'firebase/firestore';
import { TargetProgressWebUI } from '../../../components/TargetProgressWebUI';
import { PatientFileUI } from '../../../components/PatientFileUI';
import { CollectFeeCheckoutModal } from '../../../components/CollectFeeCheckoutModal';
import { getPatientVisitState } from '../../../utils/patientVisitState';
import { receptionDataStore } from '../../../utils/receptionDataStore';
import { calculateRealBranchRevenue, syncBranchTargetToFirestore, reconcileBranchTargetData, normalizeBranchKey, getCanonicalBranchName } from '../../../utils/branchRevenueCalculator';
interface ReceptionDashboardPageProps {
  currentBranch?: string;
  branchId?: CanonicalBranchId;
  onNavigate?: (tab: string, data?: any) => void;
  initialPatientForCheckout?: any;
  onClearInitialCheckout?: () => void;
}
export const ReceptionDashboardPage: React.FC<ReceptionDashboardPageProps> = ({
  currentBranch,
  branchId,
  onNavigate,
  initialPatientForCheckout,
  onClearInitialCheckout
}) => {
  const [appointments, setAppointments] = useState<any[]>(() => receptionDataStore.getAppointments());
  const [activeTab, setActiveTab] = useState<'upcoming' | 'active' | 'completed'>('upcoming');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  // 3-Dots Dropdown Menu State
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  // Reschedule Modal States
  const [rescheduleModalApp, setRescheduleModalApp] = useState<any | null>(null);
  const [newRescheduleDate, setNewRescheduleDate] = useState<string>('');
  const [newRescheduleTime, setNewRescheduleTime] = useState<string>('10:00 AM');

  // Checkout & Invoice Modal States
  const [checkoutModalApp, setCheckoutModalApp] = useState<any | null>(null);
  const [invoiceApp, setInvoiceApp] = useState<any | null>(null);
  const [patientFileApp, setPatientFileApp] = useState<any | null>(null);
  const [consultFeeInput, setConsultFeeInput] = useState<number>(500);
  const [medicineFeeInput, setMedicineFeeInput] = useState<number>(1200);
  const [dietFeeInput, setDietFeeInput] = useState<number>(300);
  const [otherChargesInput, setOtherChargesInput] = useState<number>(0);
  const [discountInput, setDiscountInput] = useState<number>(100);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<string>('Cash');
  const [splitCash, setSplitCash] = useState<number | string>('');
  const [splitUpi, setSplitUpi] = useState<number | string>('');
  const [followupModalType, setFollowupModalType] = useState<'payment_pending' | 'opted' | 'not_opted' | null>(null);
  const [followupSearchTerm, setFollowupSearchTerm] = useState('');
  const [packageMembersList, setPackageMembersList] = useState<any[]>(() => receptionDataStore.getPackageMembers());
  const [allCollectionsRecords, setAllCollectionsRecords] = useState<any[]>(() => receptionDataStore.getAllCollectionsPool());

  // Delete Confirmation Modal & 24h Restore States
  const [deleteConfirmApp, setDeleteConfirmApp] = useState<any | null>(null);
  const [isDeletingApp, setIsDeletingApp] = useState<boolean>(false);
  const [restoreModalOpen, setRestoreModalOpen] = useState<boolean>(false);
  const [isRestoringId, setIsRestoringId] = useState<string | null>(null);

  // Subscribe to persistent receptionDataStore singleton (zero-lag static cache across navigation)
  useEffect(() => {
    receptionDataStore.startListeners();
    const unsub = receptionDataStore.subscribe((state) => {
      setAppointments(state.appointments);
      setPackageMembersList(state.packageMembersList);
      setAllCollectionsRecords(state.allCollectionsPool);
    });
    return () => unsub();
  }, []);

  const checkIsPackageMember = (app: any): boolean => {
    if (!app) return false;
    if (app.isPackageMember === true || app.hasPackage === true || app.hasActivePackage === true) return true;
    if (!packageMembersList || packageMembersList.length === 0) return false;

    const targetDocId = String(app.patientDocId || app.patient_id || app.patientId || app.id || '').trim();
    const cleanReg = String(app.regId || app.registrationId || app.patientId || '').trim().toLowerCase();
    const cleanPhone = String(app.phone || app.phoneNumber || '').replace(/\D/g, '').slice(-10);
    const patName = String(app.patientName || app.name || '').trim().toLowerCase();

    return packageMembersList.some(m => {
      // Expiry verification
      const expTime = m.expiryDate ? new Date(m.expiryDate).getTime() : Infinity;
      if (!isNaN(expTime) && expTime < Date.now()) return false;

      // Strict profile matching
      if (targetDocId && (m.patientDocId === targetDocId || m.id === targetDocId || m.patientDocId === app.id)) return true;
      if (cleanReg && m.patientId && String(m.patientId).trim().toLowerCase() === cleanReg) return true;
      if (cleanPhone && m.phone && String(m.phone).replace(/\D/g, '').slice(-10) === cleanPhone) {
        const mName = String(m.patientName || m.name || '').trim().toLowerCase();
        if (patName && (mName === patName || mName.includes(patName) || patName.includes(mName))) {
          return true;
        }
      }
      return false;
    });
  };

  const handleOpenCheckout = (app: any) => {
    setCheckoutModalApp(app);
    const mFee = Number(app.pharmacyFee || app.medicineFeeRequested || app.medicineFee) || 0;
    setConsultFeeInput(Number(app.consultationFee) || 0);
    setMedicineFeeInput(mFee > 0 ? mFee : 1200);
    setDietFeeInput(Number(app.dietFee || app.dietFeeAmount || app.dietPlan?.dietFeeAmount || app.dietPlan?.dietFee) || 0);
    setOtherChargesInput(Number(app.otherCharges) || 0);
    setDiscountInput(Number(app.discount) || 0);
    setSelectedPaymentMode(app.paymentMode || 'Cash');
  };

  useEffect(() => {
    if (initialPatientForCheckout) {
      handleOpenCheckout(initialPatientForCheckout);
      if (onClearInitialCheckout) {
        onClearInitialCheckout();
      }
    }
  }, [initialPatientForCheckout]);

  const handleStartConsultationWithFile = async (app: any) => {
    await handleUpdateStatus(app.id, 'in_consultation');
    setActiveTab('active');
    if (onNavigate) {
      onNavigate('reception_patient_file', app);
    } else {
      setPatientFileApp({ ...app, status: 'in_consultation' });
    }
  };

  const handleConfirmCheckout = async () => {
    if (!checkoutModalApp) return;
    setActionLoadingId(checkoutModalApp.id);
    const totalDue = Math.max(0, consultFeeInput + medicineFeeInput + dietFeeInput + otherChargesInput - discountInput);

    try {
      const payload = {
        status: 'completed',
        paymentStatus: 'paid',
        paymentPending: false,
        feeCollectionNeeded: false,
        paymentCollectedAt: new Date().toISOString(),
        consultationFee: consultFeeInput,
        medicineFee: medicineFeeInput,
        dietFee: dietFeeInput,
        otherCharges: otherChargesInput,
        discount: discountInput,
        totalPaid: totalDue,
        paymentMode: selectedPaymentMode === 'Split' ? `Split (Cash ₹${Number(splitCash) || 0} + UPI ₹${Number(splitUpi) || 0})` : selectedPaymentMode,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'appointments', checkoutModalApp.id), payload).catch(() => { });
      await updateDoc(doc(db, 'allpatients', checkoutModalApp.id), payload).catch(() => { });

      const invoiceData = { ...checkoutModalApp, ...payload };
      setCheckoutModalApp(null);
      setInvoiceApp(invoiceData);
    } catch (err) {
      console.error('Error completing checkout:', err);
    } finally {
      setActionLoadingId(null);
    }
  };


  // Close dropdown menu when clicking outside
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.action-menu-container')) {
        setActiveMenuId(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const activeBranchKey = normalizeBranchKey(currentBranch || 'KPHB Branch');
  const activeBranchName = getCanonicalBranchName(activeBranchKey);

  // Authoritative live subscription to Firestore branchTargets
  const [branchTarget, setBranchTarget] = useState({
    monthlyTarget: 0,
    targetReached: 0,
    branchName: activeBranchName
  });

  useEffect(() => {
    try {
      const colRef = collection(db, 'branchTargets');
      const unsubscribe = onSnapshot(colRef, (snapshot) => {
        const curBranchKey = normalizeBranchKey(currentBranch || 'KPHB Branch');
        const canonName = getCanonicalBranchName(curBranchKey);

        if (!snapshot.empty) {
          const liveMap: Record<string, any> = {};
          snapshot.forEach((docSnap) => {
            liveMap[docSnap.id.toLowerCase()] = docSnap.data();
          });

          const targetData = liveMap[curBranchKey] || liveMap[`${curBranchKey} branch`];
          const reconciled = reconcileBranchTargetData(targetData, curBranchKey);

          setBranchTarget({
            monthlyTarget: reconciled.monthlyTarget,
            targetReached: reconciled.targetReached,
            branchName: canonName
          });
        } else {
          setBranchTarget({
            monthlyTarget: 0,
            targetReached: 0,
            branchName: canonName
          });
        }
      });
      return () => unsubscribe();
    } catch (err) {
      console.error('Error listening to branch target:', err);
    }
  }, [currentBranch]);

  // Real-time Dynamic Branch Target Calculation from live collections this month
  const realBranchResult = useMemo(() => {
    const curBranch = currentBranch || 'KPHB Branch';
    return calculateRealBranchRevenue(curBranch, appointments, packageMembersList, branchTarget.monthlyTarget);
  }, [currentBranch, appointments, packageMembersList, branchTarget.monthlyTarget]);



  // Status update handler (updates both appointments and allpatients)
  const handleUpdateStatus = async (appId: string, newStatus: string) => {
    setActionLoadingId(appId);
    try {
      const payload = {
        status: newStatus,
        updatedAt: new Date().toISOString()
      };
      await updateDoc(doc(db, 'appointments', appId), payload).catch(() => { });
      await updateDoc(doc(db, 'allpatients', appId), payload).catch(() => { });
      await updateDoc(doc(db, 'patients', appId), payload).catch(() => { });

      if (newStatus === 'cancelled') {
        const appObj = appointments.find(a => a.id === appId);
        if (appObj) {
          sendCancellationWhatsAppNotification({
            patientName: appObj.patientName || appObj.fullName || appObj.name || 'Patient',
            phone: appObj.phoneNumber || appObj.phone || '',
            date: appObj.appointmentDate || appObj.date || '',
            time: appObj.appointmentTime || appObj.time || '10:00 AM',
            doctorName: sanitizeDoctorName(appObj.doctorName || appObj.doctor, appObj.branch || currentBranch),
            branch: appObj.branch || currentBranch
          }).catch(err => console.error('Cancellation WhatsApp notification error:', err));
        }
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Reschedule Appointment handler
  const handleSaveReschedule = async () => {
    if (!rescheduleModalApp || !newRescheduleDate) return;
    setActionLoadingId(rescheduleModalApp.id);
    try {
      const payload = {
        appointmentDate: newRescheduleDate,
        appointmentTime: newRescheduleTime || rescheduleModalApp.appointmentTime || '10:00 AM',
        updatedAt: new Date().toISOString()
      };
      await updateDoc(doc(db, 'appointments', rescheduleModalApp.id), payload).catch(() => { });
      await updateDoc(doc(db, 'allpatients', rescheduleModalApp.id), payload).catch(() => { });

      // Trigger Leonas WhatsApp Reschedule Notification
      sendRescheduleWhatsAppNotification({
        patientName: rescheduleModalApp.patientName || rescheduleModalApp.fullName || rescheduleModalApp.name || 'Patient',
        phone: rescheduleModalApp.phoneNumber || rescheduleModalApp.phone || '',
        date: newRescheduleDate,
        time: newRescheduleTime || rescheduleModalApp.appointmentTime || '10:00 AM',
        doctorName: sanitizeDoctorName(rescheduleModalApp.doctorName || rescheduleModalApp.doctor, rescheduleModalApp.branch || currentBranch),
        branch: rescheduleModalApp.branch || currentBranch
      }).catch(err => console.error('WhatsApp reschedule notification error:', err));

      setRescheduleModalApp(null);
    } catch (err) {
      console.error('Error saving rescheduled appointment:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 1. Move Consultation Status to "completed"
  const handleMoveToCompleted = async (appId: string) => {
    setActionLoadingId(appId);
    try {
      const payload = {
        status: 'completed',
        updatedAt: new Date().toISOString()
      };
      await updateDoc(doc(db, 'appointments', appId), payload).catch(() => { });
      await updateDoc(doc(db, 'allpatients', appId), payload).catch(() => { });
      await updateDoc(doc(db, 'patients', appId), payload).catch(() => { });

      const targetApp = appointments.find(a => a.id === appId);
      if (targetApp) {
        const phone = targetApp.phoneNumber || targetApp.phone || '';
        const patientName = targetApp.patientName || targetApp.fullName || targetApp.name || 'Patient';
        const totalPaid = Number(targetApp.totalPaid || targetApp.targetAmount || targetApp.amount || 0);

        // Atomically increment branch target reached in real-time
        if (totalPaid > 0 && db) {
          const rawBranch = String(targetApp.branch || targetApp.branchName || currentBranch || 'kphb').toLowerCase();
          const bKey = rawBranch.includes('nalla') ? 'nallagandla'
            : rawBranch.includes('dilshuk') ? 'dilshuknagar'
              : rawBranch.includes('chanda') ? 'chandanagar'
                : 'kphb';

          updateDoc(doc(db, 'branchTargets', bKey), {
            targetReached: increment(totalPaid),
            updatedAt: new Date().toISOString()
          }).catch(() => { });
        }

        // Trigger Full 3-Step WhatsApp Flow (Payment Receipt -> Invoice with PDF -> 5s -> Experience Feedback Survey)
        sendInvoiceWhatsAppNotification({
          patientName,
          phone,
          invoiceId: targetApp.id,
          totalPaid,
          paymentMode: targetApp.paymentMode || 'UPI',
          branch: targetApp.branch || targetApp.branchName || currentBranch || 'KPHB',
          doctorName: sanitizeDoctorName(targetApp.doctorName || targetApp.doctor, targetApp.branch || targetApp.branchName || currentBranch)
        }).then(res => {
          const generatedPdfUrl = (res as any)?.pdfUrl;
          if (generatedPdfUrl && db) {
            updateDoc(doc(db, 'appointments', appId), { invoicePdfUrl: generatedPdfUrl }).catch(() => { });
            updateDoc(doc(db, 'allpatients', appId), { invoicePdfUrl: generatedPdfUrl }).catch(() => { });
          }
        }).catch(err => console.error('WhatsApp invoice flow error:', err));
      }
    } catch (err) {
      console.error('Failed to update status to completed:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 2. Toggle Payment Status (Paid <-> Pending/Unpaid)
  const handleTogglePaymentStatus = async (appId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'paid' ? 'pending' : 'paid';
    setActionLoadingId(appId);
    try {
      const payload = {
        paymentStatus: nextStatus,
        paymentPending: nextStatus === 'pending',
        updatedAt: new Date().toISOString()
      };
      await updateDoc(doc(db, 'appointments', appId), payload).catch(() => { });
      await updateDoc(doc(db, 'allpatients', appId), payload).catch(() => { });
      await updateDoc(doc(db, 'patients', appId), payload).catch(() => { });

      if (nextStatus === 'paid') {
        const targetApp = appointments.find(a => a.id === appId);
        if (targetApp) {
          const phone = targetApp.phoneNumber || targetApp.phone || '';
          const patientName = targetApp.patientName || targetApp.fullName || targetApp.name || 'Patient';
          const totalPaid = Number(targetApp.totalPaid || targetApp.targetAmount || targetApp.amount || 1000);

          // Trigger Full 3-Step WhatsApp Flow on Mark as Paid
          sendInvoiceWhatsAppNotification({
            patientName,
            phone,
            invoiceId: targetApp.id,
            totalPaid,
            paymentMode: targetApp.paymentMode || 'UPI',
            branch: targetApp.branch || targetApp.branchName || currentBranch || 'KPHB',
            doctorName: sanitizeDoctorName(targetApp.doctorName || targetApp.doctor, targetApp.branch || targetApp.branchName || currentBranch)
          }).then(res => {
            const generatedPdfUrl = (res as any)?.pdfUrl;
            if (generatedPdfUrl && db) {
              updateDoc(doc(db, 'appointments', appId), { invoicePdfUrl: generatedPdfUrl }).catch(() => { });
              updateDoc(doc(db, 'allpatients', appId), { invoicePdfUrl: generatedPdfUrl }).catch(() => { });
            }
          }).catch(err => console.error('WhatsApp invoice error on mark as paid:', err));
        }
      }
    } catch (err) {
      console.error('Failed to toggle payment status:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Delete appointment handler: Opens confirmation modal (No direct deletion!)
  const handleDeleteAppointment = (appId: string, pName: string) => {
    const targetApp = appointments.find(a => a.id === appId) || { id: appId, patientName: pName };
    setDeleteConfirmApp(targetApp);
  };

  // Confirmed Soft-Delete (Kept in 24h Recycle Bin)
  const handleConfirmDelete = async () => {
    if (!deleteConfirmApp) return;
    const appId = deleteConfirmApp.id;
    setIsDeletingApp(true);
    try {
      const targetBranch = deleteConfirmApp.branch || deleteConfirmApp.branchName || currentBranch || 'KPHB Branch';
      const prevStatus = deleteConfirmApp.status || 'waiting';
      const payload = {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedByBranch: targetBranch,
        previousStatus: prevStatus,
        status: 'deleted',
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'appointments', appId), payload).catch(() => { });
      await updateDoc(doc(db, 'allpatients', appId), payload).catch(() => { });
      await updateDoc(doc(db, 'patients', appId), payload).catch(() => { });

      const pPhone = deleteConfirmApp.phoneNumber || deleteConfirmApp.phone || '';
      const pName = deleteConfirmApp.patientName || deleteConfirmApp.fullName || deleteConfirmApp.name || 'Patient';
      if (pPhone) {
        sendCancellationWhatsAppNotification({
          patientName: pName,
          phone: pPhone,
          date: deleteConfirmApp.appointmentDate || deleteConfirmApp.date || '',
          time: deleteConfirmApp.appointmentTime || deleteConfirmApp.time || '10:00 AM',
          doctorName: sanitizeDoctorName(deleteConfirmApp.doctorName || deleteConfirmApp.doctor, targetBranch),
          branch: targetBranch
        }).catch(err => console.error('Cancellation WhatsApp error:', err));
      }

      setDeleteConfirmApp(null);
    } catch (err) {
      console.error('Failed to soft delete appointment:', err);
    } finally {
      setIsDeletingApp(false);
    }
  };

  // Restore appointment from 24h Recycle Bin back to active queue
  const handleRestoreAppointment = async (app: any) => {
    setIsRestoringId(app.id);
    try {
      const prevStatus = app.previousStatus && app.previousStatus !== 'deleted' ? app.previousStatus : 'waiting';
      const payload = {
        isDeleted: false,
        deletedAt: null,
        status: prevStatus,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'appointments', app.id), payload).catch(() => { });
      await updateDoc(doc(db, 'allpatients', app.id), payload).catch(() => { });
      await updateDoc(doc(db, 'patients', app.id), payload).catch(() => { });
    } catch (err) {
      console.error('Failed to restore appointment:', err);
    } finally {
      setIsRestoringId(null);
    }
  };

  const getTodayISO = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getTodayISO());

  const isMatchingDate = (a: any) => {
    const rawDate = a.appointmentDate || a.date || a.bookingDate || a.dateString;
    if (!rawDate) {
      return selectedDate === getTodayISO();
    }
    const clean = String(rawDate).trim();
    if (!clean) {
      return selectedDate === getTodayISO();
    }

    if (clean === selectedDate || clean.startsWith(selectedDate)) return true;

    // Support DD-MM-YYYY and DD/MM/YYYY format matching YYYY-MM-DD (including timestamps like 23-09-2026 10:00 AM)
    const partsISO = selectedDate.split('-'); // [YYYY, MM, DD]
    if (partsISO.length === 3) {
      const [y, m, d] = partsISO;
      const ddmmyyyyHyphen = `${d}-${m}-${y}`;
      const ddmmyyyySlash = `${d}/${m}/${y}`;
      const dmySlash = `${parseInt(d, 10)}/${parseInt(m, 10)}/${y}`;
      const dmyHyphen = `${parseInt(d, 10)}-${parseInt(m, 10)}-${y}`;
      if (
        clean === ddmmyyyyHyphen || clean === ddmmyyyySlash || clean === dmySlash || clean === dmyHyphen ||
        clean.startsWith(ddmmyyyyHyphen) || clean.startsWith(ddmmyyyySlash) || clean.startsWith(dmySlash) || clean.startsWith(dmyHyphen)
      ) {
        return true;
      }
    }

    // Direct ISO string match e.g. 2026-09-23T...
    if (clean.length >= 10 && clean[4] === '-' && clean[7] === '-') {
      if (clean.substring(0, 10) === selectedDate) return true;
    }

    try {
      const parsed = new Date(clean);
      if (!isNaN(parsed.getTime())) {
        const py = parsed.getFullYear();
        const pm = String(parsed.getMonth() + 1).padStart(2, '0');
        const pd = String(parsed.getDate()).padStart(2, '0');
        if (`${py}-${pm}-${pd}` === selectedDate) return true;
      }
    } catch (_) { }

    return false;
  };

  const isMatchingBranch = (a: any) => {
    if (!currentBranch || currentBranch === 'All Branches' || currentBranch === 'all' || currentBranch.toLowerCase().trim() === 'all branches') {
      return true;
    }
    const canonicalCurrent = resolveCanonicalBranchId(currentBranch);
    if (!canonicalCurrent) return true;

    const rawApp = a.branch || a.targetBranch || a.branchName || a.branchId || a.assignedBranch;
    const canonicalApp = resolveCanonicalBranchId(rawApp) || resolveCanonicalBranchId(a.registrationId || a.regId);

    if (canonicalApp) {
      return canonicalApp === canonicalCurrent;
    }
    if (!rawApp) return false;
    const normAppBranch = String(rawApp).toLowerCase().replace(/\s*branch\s*/i, '').trim();
    const normCurrentBranch = String(currentBranch).toLowerCase().replace(/\s*branch\s*/i, '').trim();
    return normAppBranch === normCurrentBranch || normAppBranch.includes(normCurrentBranch) || normCurrentBranch.includes(normAppBranch);
  };

  // Deleted appointments in the last 24h for current branch (Restorable)
  const deleted24hList = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return appointments.filter(a => {
      if (!isMatchingBranch(a)) return false;
      const isDel = a.isDeleted === true || (a.status || '').toLowerCase() === 'deleted';
      if (!isDel) return false;
      const delTime = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
      return delTime >= oneDayAgo;
    }).sort((a, b) => {
      const timeA = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
      const timeB = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [appointments, currentBranch]);

  // Filter ONLY active (non-deleted) appointments for the selected date AND current branch
  const filteredBranchDateAppointments = appointments.filter(a => {
    const isDel = a.isDeleted === true || (a.status || '').toLowerCase() === 'deleted';
    if (isDel) return false;
    return isMatchingDate(a) && isMatchingBranch(a);
  });

  // Filter lists for 3 sections (Selected Date & Branch ONLY)
  const upcomingList = filteredBranchDateAppointments.filter(a => {
    // Reback appointments represent past historical visits and must NEVER appear in Upcoming Appointments
    if (a.isReback === true || a.rebackVisit === true) return false;
    const st = (a.status || 'scheduled').toLowerCase().trim();
    const p = (a.paymentStatus || '').toLowerCase().trim();
    const isFeeNeeded = st === 'collect_fee' || a.feeCollectionNeeded === true;
    const isCompleted = !isFeeNeeded && (st === 'completed' || st === 'concluded' || st === 'finished' || st === 'done' || st === 'paid' || p === 'paid');
    const isActive = st === 'in-consultation' || st === 'active' || st === 'consulting' || st === 'in_consultation' || isFeeNeeded;
    return !isCompleted && !isActive && st !== 'cancelled';
  }).sort((a, b) => {
    if (a.queueOrder !== undefined && b.queueOrder !== undefined) {
      return a.queueOrder - b.queueOrder;
    }
    return 0;
  });

  // Handler for shifting patient queue position (Up / Down) in Firestore
  const handleShiftQueueOrder = async (patient: any, direction: 'up' | 'down') => {
    const listIndex = upcomingList.findIndex(item => item.id === patient.id);
    if (listIndex === -1) return;
    const targetIndex = direction === 'up' ? listIndex - 1 : listIndex + 1;
    if (targetIndex < 0 || targetIndex >= upcomingList.length) return;
    const currentApp = upcomingList[listIndex];
    const targetApp = upcomingList[targetIndex];
    try {
      const currentOrder = currentApp.queueOrder ?? (listIndex + 1);
      const targetOrder = targetApp.queueOrder ?? (targetIndex + 1);
      try {
        await updateDoc(doc(db, 'appointments', currentApp.id), { queueOrder: targetOrder, updatedAt: new Date().toISOString() });
      } catch (e) {
        await updateDoc(doc(db, 'allpatients', currentApp.id), { queueOrder: targetOrder, updatedAt: new Date().toISOString() });
      }
      try {
        await updateDoc(doc(db, 'appointments', targetApp.id), { queueOrder: currentOrder, updatedAt: new Date().toISOString() });
      } catch (e) {
        await updateDoc(doc(db, 'allpatients', targetApp.id), { queueOrder: currentOrder, updatedAt: new Date().toISOString() });
      }
    } catch (err) {
      console.error('Error shifting queue order:', err);
    }
  };

  const activeList = filteredBranchDateAppointments.filter(a => {
    const st = (a.status || '').toLowerCase().trim();
    const p = (a.paymentStatus || '').toLowerCase().trim();
    const isFeeNeeded = st === 'collect_fee' || a.feeCollectionNeeded === true;
    if (isFeeNeeded && st !== 'completed') return true;
    return (st === 'in-consultation' || st === 'active' || st === 'consulting' || st === 'in_consultation') && p !== 'paid' && st !== 'completed';
  });
  const completedList = filteredBranchDateAppointments.filter(a => {
    const st = (a.status || '').toLowerCase().trim();
    const p = (a.paymentStatus || '').toLowerCase().trim();
    const isFeeNeeded = st === 'collect_fee' || a.feeCollectionNeeded === true;
    if (isFeeNeeded && st !== 'completed') return false;
    return st === 'completed' || st === 'concluded' || st === 'finished' || st === 'done' || (p === 'paid' && !isFeeNeeded);
  });

  // Dynamic statistics for selected date & branch
  const totalBookings = filteredBranchDateAppointments.length;
  const waitingCount = filteredBranchDateAppointments.filter(a => (a.status || '').toLowerCase() === 'waiting' || (a.status || '').toLowerCase() === 'scheduled').length;

  const isPaymentPending = (a: any) => {
    const st = (a.status || '').toLowerCase().trim();
    const p = (a.paymentStatus || '').toLowerCase().trim();
    if (st === 'completed' || st === 'concluded' || st === 'finished' || st === 'done') return false;
    if (st === 'collect_fee' || a.feeCollectionNeeded === true) return true;
    const isPaid = p === 'paid';
    if (isPaid) return false;
    return (p === 'pending' || a.paymentPending) && st !== 'in_consultation' && st !== 'in-consultation' && st !== 'active' && st !== 'consulting';
  };
  const paymentPendingList = filteredBranchDateAppointments.filter(isPaymentPending);
  const paymentPendingCount = paymentPendingList.length;
  const activeConsultationCount = activeList.length;
  const completedCount = completedList.length;

  const isFollowUpOpted = (a: any) => {
    if (a.followUpOpted === true || a.followup === true) return true;
    if (a.followUpInterval && a.followUpInterval !== 'No Follow-up' && a.followUpInterval !== 'None') return true;
    if (a.preferredFollowUpDate || a.followUpDate) return true;
    return false;
  };

  const followupOptedList = filteredBranchDateAppointments.filter(isFollowUpOpted);
  const followupNotOptedList = filteredBranchDateAppointments.filter(a => !isFollowUpOpted(a));
  const followupOptedCount = followupOptedList.length;
  const followupNotOptedCount = followupNotOptedList.length;

  // Active list based on selected section tab
  const getTabAppointments = () => {
    switch (activeTab) {
      case 'active':
        return activeList;
      case 'completed':
        return completedList;
      case 'upcoming':
      default:
        return upcomingList;
    }
  };

  const currentTabAppointments = getTabAppointments().filter(app => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const pName = (app.patientName || app.name || '').toLowerCase();
    const pPhone = (app.phoneNumber || app.phone || '').toLowerCase();
    const docName = sanitizeDoctorName(app.doctorName || app.doctor, app.branch || currentBranch).toLowerCase();
    const dis = (app.diseases || '').toLowerCase();
    return pName.includes(term) || pPhone.includes(term) || docName.includes(term) || dis.includes(term);
  });

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1600px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* HEADER BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>
            Reception Operations Dashboard
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '13.5px', color: '#64748b' }}>
            Queue tracking, active doctor consultations & instant fee collection • Branch: <strong style={{ color: '#258ec8' }}>{currentBranch || 'KPHB'}</strong>
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Quick Date Picker */}
          <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '6px 12px', gap: '8px' }}>
            <Calendar size={16} color="#64748b" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{ border: 'none', outline: 'none', fontSize: '13px', fontWeight: 600, color: '#0f172a', cursor: 'pointer', background: 'transparent' }}
            />
          </div>

          {selectedDate !== new Date().toISOString().split('T')[0] && (
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              style={{
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                color: '#258ec8',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Reset Today
            </button>
          )}
        </div>
      </div>

      {/* Dynamic Real-Time Target Progress Card */}
      <div style={{ marginBottom: '20px' }}>
        <TargetProgressWebUI
          branchName={branchTarget.branchName || (currentBranch || 'KPHB Branch')}
          monthlyTarget={branchTarget.monthlyTarget || 0}
          targetReached={Math.max(branchTarget.targetReached || 0, realBranchResult.targetReached || 0)}
        />
      </div>

      {/* 7 Metric Cards (CLICKABLE TO TABS OR POPUPS) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {/* 1. Total Bookings */}
        <div
          onClick={() => {
            setActiveTab('upcoming');
            document.getElementById('appointments-table-container')?.scrollIntoView({ behavior: 'smooth' });
          }}
          style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', cursor: 'pointer', transition: 'all 0.2s ease' }}
          title="Click to view all upcoming bookings"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748b' }}>Total Bookings</span>
            <Calendar color="#258ec8" size={16} />
          </div>
          <span style={{ fontSize: '20px', fontWeight: 800, color: '#258ec8' }}>{totalBookings}</span>
          <p style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '4px', margin: 0 }}>Bookings Today</p>
        </div>

        {/* 2. Waiting - CLICKABLE REDIRECT TO UPCOMING APPOINTMENTS TAB */}
        <div
          onClick={() => {
            setActiveTab('upcoming');
            document.getElementById('appointments-table-container')?.scrollIntoView({ behavior: 'smooth' });
          }}
          style={{
            background: activeTab === 'upcoming' ? '#eff6ff' : '#ffffff',
            border: activeTab === 'upcoming' ? '2px solid #258ec8' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '14px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          title="Click to view Upcoming Appointments"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: activeTab === 'upcoming' ? '#0284c7' : '#64748b' }}>Waiting</span>
            <Clock color={activeTab === 'upcoming' ? '#0284c7' : '#d97706'} size={16} />
          </div>
          <span style={{ fontSize: '20px', fontWeight: 800, color: activeTab === 'upcoming' ? '#0284c7' : '#d97706' }}>{waitingCount}</span>
          <p style={{ fontSize: '10.5px', color: activeTab === 'upcoming' ? '#0284c7' : '#258ec8', marginTop: '4px', margin: 0, fontWeight: 700 }}>
            {activeTab === 'upcoming' ? '● Upcoming Tab Open' : 'Click to view Upcoming ➔'}
          </p>
        </div>

        {/* 3. Active Consultations - CLICKABLE REDIRECT TO ACTIVE TAB */}
        <div
          onClick={() => {
            setActiveTab('active');
            document.getElementById('appointments-table-container')?.scrollIntoView({ behavior: 'smooth' });
          }}
          style={{
            background: activeTab === 'active' ? '#fffbeb' : '#ffffff',
            border: activeTab === 'active' ? '2px solid #d97706' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '14px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          title="Click to switch to Active Consultation tab"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: activeTab === 'active' ? '#b45309' : '#64748b' }}>Active Consultations</span>
            <Activity color="#d97706" size={16} />
          </div>
          <span style={{ fontSize: '20px', fontWeight: 800, color: '#d97706' }}>{activeConsultationCount}</span>
          <p style={{ fontSize: '10.5px', color: activeTab === 'active' ? '#b45309' : '#d97706', marginTop: '4px', margin: 0, fontWeight: 700 }}>
            {activeTab === 'active' ? '● Active Tab Open' : 'Click to view tab ➔'}
          </p>
        </div>

        {/* 4. Payment Pending - CLICKABLE OPEN POPUP */}
        <div
          onClick={() => {
            setFollowupModalType('payment_pending');
            setFollowupSearchTerm('');
          }}
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '14px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          title="Click to view Payment Pending Patients popup"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#ef4444' }}>Payment Pending</span>
            <CreditCard color="#ef4444" size={16} />
          </div>
          <span style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444' }}>{paymentPendingCount}</span>
          <p style={{ fontSize: '10.5px', color: '#ef4444', marginTop: '4px', margin: 0, fontWeight: 700 }}>
            Click to view popup ➔
          </p>
        </div>

        {/* 5. Completed - CLICKABLE REDIRECT TO COMPLETED TAB */}
        <div
          onClick={() => {
            setActiveTab('completed');
            document.getElementById('appointments-table-container')?.scrollIntoView({ behavior: 'smooth' });
          }}
          style={{
            background: activeTab === 'completed' ? '#f0fdf4' : '#ffffff',
            border: activeTab === 'completed' ? '2px solid #16a34a' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '14px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          title="Click to switch to Completed Appointments tab"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: activeTab === 'completed' ? '#15803d' : '#64748b' }}>Completed</span>
            <CheckCircle color="#16a34a" size={16} />
          </div>
          <span style={{ fontSize: '20px', fontWeight: 800, color: '#16a34a' }}>{completedCount}</span>
          <p style={{ fontSize: '10.5px', color: activeTab === 'completed' ? '#15803d' : '#16a34a', marginTop: '4px', margin: 0, fontWeight: 700 }}>
            {activeTab === 'completed' ? '● Active Tab Open' : 'Click to view tab ➔'}
          </p>
        </div>

        {/* 6. Follow-up Opted - CLICKABLE OPEN POPUP */}
        <div
          onClick={() => {
            setFollowupModalType('opted');
            setFollowupSearchTerm('');
          }}
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '14px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          title="Click to view Follow-up Opted Patients popup"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#258ec8' }}>Follow-up Opted</span>
            <ArrowRightLeft color="#258ec8" size={16} />
          </div>
          <span style={{ fontSize: '20px', fontWeight: 800, color: '#258ec8' }}>{followupOptedCount}</span>
          <p style={{ fontSize: '10.5px', color: '#258ec8', marginTop: '4px', margin: 0, fontWeight: 700 }}>
            Click to view popup ➔
          </p>
        </div>

        {/* 7. Follow-up Not Opted - CLICKABLE OPEN POPUP */}
        <div
          onClick={() => {
            setFollowupModalType('not_opted');
            setFollowupSearchTerm('');
          }}
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '14px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          title="Click to view Follow-up Not Opted Patients popup"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b' }}>Follow-up Not Opted</span>
            <UserX color="#64748b" size={16} />
          </div>
          <span style={{ fontSize: '20px', fontWeight: 800, color: '#64748b' }}>{followupNotOptedCount}</span>
          <p style={{ fontSize: '10.5px', color: '#64748b', marginTop: '4px', margin: 0, fontWeight: 700 }}>
            Click to view popup ➔
          </p>
        </div>
      </div>

      {/* 3 SECTION TAB BUTTONS & APPOINTMENTS TABLE */}
      <div id="appointments-table-container" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>

        {/* Section Tabs Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '20px', borderBottom: '2px solid #f1f5f9', paddingBottom: '16px' }}>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {/* 1. Upcoming Appointments Tab Button */}
            <button
              type="button"
              onClick={() => setActiveTab('upcoming')}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                border: activeTab === 'upcoming' ? '2px solid #258ec8' : '1px solid #cbd5e1',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: activeTab === 'upcoming' ? '#258ec8' : '#ffffff',
                color: activeTab === 'upcoming' ? '#ffffff' : '#475569',
                boxShadow: activeTab === 'upcoming' ? '0 4px 12px rgba(37, 142, 200, 0.25)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <Calendar size={16} /> Upcoming Appointments
              <span style={{
                background: activeTab === 'upcoming' ? 'rgba(255, 255, 255, 0.25)' : '#f1f5f9',
                color: activeTab === 'upcoming' ? '#ffffff' : '#0284c7',
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 800
              }}>
                {upcomingList.length}
              </span>
            </button>

            {/* 2. Active Consultation Tab Button */}
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                border: activeTab === 'active' ? '2px solid #d97706' : '1px solid #cbd5e1',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: activeTab === 'active' ? '#d97706' : '#ffffff',
                color: activeTab === 'active' ? '#ffffff' : '#475569',
                boxShadow: activeTab === 'active' ? '0 4px 12px rgba(217, 119, 6, 0.25)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <Activity size={16} /> Active Consultation
              <span style={{
                background: activeTab === 'active' ? 'rgba(255, 255, 255, 0.25)' : '#fef3c7',
                color: activeTab === 'active' ? '#ffffff' : '#b45309',
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 800
              }}>
                {activeList.length}
              </span>
            </button>

            {/* 3. Completed Appointments Tab Button */}
            <button
              type="button"
              onClick={() => setActiveTab('completed')}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                border: activeTab === 'completed' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: activeTab === 'completed' ? '#16a34a' : '#ffffff',
                color: activeTab === 'completed' ? '#ffffff' : '#475569',
                boxShadow: activeTab === 'completed' ? '0 4px 12px rgba(22, 163, 74, 0.25)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <CheckCircle size={16} /> Completed Appointments
              <span style={{
                background: activeTab === 'completed' ? 'rgba(255, 255, 255, 0.25)' : '#dcfce7',
                color: activeTab === 'completed' ? '#ffffff' : '#15803d',
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 800
              }}>
                {completedList.length}
              </span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Restore (24h) Recycle Bin Button */}
            <button
              type="button"
              onClick={() => setRestoreModalOpen(true)}
              title="View and restore appointments deleted within the last 24 hours"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1.5px solid #bae6fd',
                background: '#f0f9ff',
                color: '#0284c7',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <RotateCcw size={14} color="#0284c7" />
              <span>Restore (24h)</span>
              {deleted24hList.length > 0 && (
                <span style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: '10px'
                }}>
                  {deleted24hList.length}
                </span>
              )}
            </button>

            {/* Search Field */}
            <div style={{ position: 'relative', width: '260px' }}>
              <Search size={15} color="#64748b" style={{ position: 'absolute', left: '12px', top: '10px' }} />
              <input
                type="text"
                placeholder="Search by patient, phone, doctor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12px',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        </div>

        {/* Dynamic Appointments Table */}
        {currentTabAppointments.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
            <AlertCircle size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>
              No {activeTab === 'upcoming' ? 'upcoming appointments' : activeTab === 'active' ? 'active consultations' : 'completed appointments'} found.
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', color: '#64748b', fontSize: '11px', fontWeight: 800 }}>
                <th style={{ padding: '12px 8px' }}>PATIENT DETAILS</th>
                <th style={{ padding: '12px 8px' }}>DOCTOR & BRANCH</th>
                <th style={{ padding: '12px 8px' }}>STATUS</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {currentTabAppointments.map((app, index) => {
                const isLoading = actionLoadingId === app.id;
                const status = (app.status || 'scheduled').toLowerCase().trim();
                const isPaid = app.paymentStatus === 'paid';
                const isCompleted = status === 'completed' || status === 'done' || status === 'finished' || status === 'paid' || isPaid;
                const isFeeReady = status === 'collect_fee' || app.feeCollectionNeeded === true;
                const isConsulting = (status === 'in-consultation' || status === 'active' || status === 'in_consultation' || status === 'consulting') && !isFeeReady;

                const rawReg = app.registrationId || app.registration_id || app.regId || app.regID || app.patientId || app.uhid;
                let cleanRegId = '';
                if (rawReg && typeof rawReg === 'string' && rawReg.trim().length > 0 && rawReg.trim().length <= 18 && !/^[a-zA-Z0-9]{19,32}$/.test(rawReg.trim())) {
                  cleanRegId = rawReg.trim().toUpperCase();
                } else {
                  const branchStr = (app.branch || app.branchName || 'KPHB').toUpperCase();
                  let shortcut = 'KPB';
                  if (branchStr.includes('KPHB') || branchStr === 'KPB') shortcut = 'KPB';
                  else if (branchStr.includes('CHANDANAGAR') || branchStr === 'CHN') shortcut = 'CHN';
                  else if (branchStr.includes('NALLAGANDLA') || branchStr === 'NGL') shortcut = 'NGL';
                  else if (branchStr.includes('DILSHUKNAGAR') || branchStr === 'DIL') shortcut = 'DIL';
                  else shortcut = branchStr.replace(/[^A-Z]/g, '').substring(0, 3) || 'GEN';

                  cleanRegId = `SPH-${shortcut}-${String(index + 1).padStart(4, '0')}`;
                }

                const patientPhone = app.phoneNumber || app.phone || '';
                const cleanPhoneNum = patientPhone.replace(/\D/g, '').slice(-10);
                const isMenuOpen = activeMenuId === app.id;
                const visitState = getPatientVisitState(app, allCollectionsRecords.length > 0 ? allCollectionsRecords : appointments, packageMembersList);

                return (
                  <tr key={app.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 8px' }}>
                      <div
                        onClick={() => {
                          if (isFeeReady) {
                            handleOpenCheckout(app);
                          } else {
                            if (onNavigate) {
                              onNavigate('reception_patient_file', app);
                            } else {
                              setPatientFileApp(app);
                            }
                          }
                        }}
                        style={{ fontWeight: 800, color: '#258ec8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}
                        title={isFeeReady ? "Click to open Billing Checkout & Fee Collection" : "Click to view Patient File & Clinical History"}
                      >
                        <span>{app.patientName || app.name || 'Unnamed Patient'}</span>
                        <span
                          title={visitState.tooltip}
                          style={{
                            fontSize: '9.5px',
                            background: visitState.badgeBg,
                            color: visitState.badgeColor,
                            border: `1px solid ${visitState.badgeBorder}`,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            fontWeight: 900,
                            letterSpacing: '0.4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}
                        >
                          {visitState.badgeText}
                        </span>
                        {visitState.isApp && (
                          <span
                            title="Booked from Patient App"
                            style={{
                              fontSize: '9.5px',
                              background: '#f3e8ff',
                              color: '#7e22ce',
                              border: '1px solid #d8b4fe',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              fontWeight: 900,
                              letterSpacing: '0.4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px'
                            }}
                          >
                            APP
                          </span>
                        )}
                        {!isCompleted && activeTab !== 'completed' && (
                          <span style={{ fontSize: '10px', background: '#e0f2fe', color: '#0284c7', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                            📄 File
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#258ec8', fontWeight: 800 }}>{cleanRegId}</span>
                        {patientPhone ? (
                          <a
                            href={`tel:${patientPhone}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#0284c7', textDecoration: 'none', fontWeight: 700 }}
                            title="Call Patient"
                          >
                            <Phone size={12} /> +91 {patientPhone}
                          </a>
                        ) : (
                          <span>• No phone</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ fontWeight: 700, color: '#1e293b' }}>{sanitizeDoctorName(app.doctorName || app.doctor, app.branch || currentBranch)}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{app.branch || 'Main Branch'}</span>
                        <span>•</span>
                        <span style={{ color: '#0284c7', fontWeight: 700 }}>{app.appointmentTime || app.time || '10:00 AM'}</span>
                      </div>
                    </td>

                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isCompleted ? (
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 800,
                            backgroundColor: '#d1fae5',
                            color: '#047857',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            PAID ✓
                          </span>
                        ) : isFeeReady ? (
                          <button
                            type="button"
                            onClick={() => handleOpenCheckout(app)}
                            style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
                            title="Doctor finished consultation & sent to Reception for Fee Collection"
                          >
                            🔔 Sent to Reception
                          </button>
                        ) : isConsulting ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (onNavigate) {
                                onNavigate('reception_patient_file', app);
                              } else {
                                setPatientFileApp(app);
                              }
                            }}
                            style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
                            title="Consultation currently in progress with doctor"
                          >
                            ⚡ In Consultation
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleStartConsultationWithFile(app)}
                            style={{
                              background: '#258ec8',
                              color: '#ffffff',
                              border: 'none',
                              padding: '6px 12px',
                              borderRadius: '10px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: '0 2px 6px rgba(37, 142, 200, 0.2)'
                            }}
                          >
                            <Play size={12} /> Start Consultation
                          </button>
                        )}

                        {/* Unpaid / Pending Badge -> ONLY when doctor sent to reception (isFeeReady) and payment not completed */}
                        {isFeeReady && !isCompleted && !isPaid && (
                          <button
                            type="button"
                            onClick={() => handleOpenCheckout(app)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 800,
                              border: 'none',
                              cursor: 'pointer',
                              backgroundColor: '#fee2e2',
                              color: '#b91c1c'
                            }}
                            title="Click to open Billing Checkout & Fee Collection"
                          >
                            UNPAID / PENDING ⏳
                          </button>
                        )}
                      </div>
                    </td>

                    {/* ACTION COLUMN WITH CLEAN DROPDOWN MENU */}
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {/* Upcoming Queue Re-ordering Buttons */}
                        {activeTab === 'upcoming' && (
                          <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => handleShiftQueueOrder(app, 'up')}
                              title="Move Up in Queue"
                              style={{
                                background: '#258ec8',
                                border: '1px solid #1d709e',
                                borderRadius: '6px',
                                padding: '5px 7px',
                                cursor: index === 0 ? 'not-allowed' : 'pointer',
                                opacity: index === 0 ? 0.3 : 1,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <ArrowUp size={14} color="#ffffff" />
                            </button>
                            <button
                              type="button"
                              disabled={index === upcomingList.length - 1}
                              onClick={() => handleShiftQueueOrder(app, 'down')}
                              title="Move Down in Queue"
                              style={{
                                background: '#258ec8',
                                border: '1px solid #1d709e',
                                borderRadius: '6px',
                                padding: '5px 7px',
                                cursor: index === upcomingList.length - 1 ? 'not-allowed' : 'pointer',
                                opacity: index === upcomingList.length - 1 ? 0.3 : 1,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <ArrowDown size={14} color="#ffffff" />
                            </button>
                          </div>
                        )}

                        {activeTab === 'active' && (
                          isFeeReady ? (
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={() => handleOpenCheckout(app)}
                              style={{
                                background: '#16a34a',
                                color: '#ffffff',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)'
                              }}
                            >
                              <CreditCard size={12} /> Collect Fee & Billing
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (onNavigate) {
                                  onNavigate('reception_patient_file', app);
                                } else {
                                  setPatientFileApp(app);
                                }
                              }}
                              style={{
                                background: '#0284c7',
                                color: '#ffffff',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)'
                              }}
                              title="Resume ongoing consultation"
                            >
                              <Play size={11} /> Continue Consultation
                            </button>
                          )
                        )}

                        {(activeTab === 'completed' || isCompleted) && (
                          <button
                            type="button"
                            onClick={() => handleOpenCheckout(app)}
                            style={{
                              background: '#e0f2fe',
                              color: '#0284c7',
                              border: '1px solid #bae6fd',
                              padding: '5px 12px',
                              borderRadius: '8px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: '0 2px 6px rgba(2, 132, 199, 0.15)'
                            }}
                            title="Click to view/print/share Paid Digital Invoice"
                          >
                            <FileText size={13} /> Invoice 🧾
                          </button>
                        )}

                        {/* 3-DOTS ACTION DROPDOWN MENU */}
                        <div className="action-menu-container" style={{ position: 'relative', display: 'inline-block' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(isMenuOpen ? null : app.id);
                            }}
                            title="More Actions"
                            style={{
                              background: isMenuOpen ? '#e2e8f0' : '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '5px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#334155'
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>

                          {/* Dropdown Popup */}
                          {isMenuOpen && (
                            <div style={{
                              position: 'absolute',
                              right: 0,
                              top: '100%',
                              marginTop: '4px',
                              backgroundColor: '#ffffff',
                              borderRadius: '10px',
                              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15)',
                              border: '1px solid #e2e8f0',
                              zIndex: 1000,
                              minWidth: '160px',
                              padding: '6px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              textAlign: 'left'
                            }}>
                              {/* 1. Call Option */}
                              {cleanPhoneNum ? (
                                <a
                                  href={`tel:${cleanPhoneNum}`}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: '#0284c7',
                                    textDecoration: 'none',
                                    backgroundColor: 'transparent'
                                  }}
                                >
                                  <Phone size={14} color="#0284c7" /> Call Patient
                                </a>
                              ) : null}

                              {/* 2. WhatsApp Option */}
                              {cleanPhoneNum ? (
                                <a
                                  href={`https://wa.me/91${cleanPhoneNum}?text=${encodeURIComponent(`Hello ${app.patientName || app.name || 'Patient'}, this is regarding your appointment at Spiritual Homeopathy (${app.branch || 'KPHB'}).`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: '#16a34a',
                                    textDecoration: 'none',
                                    backgroundColor: 'transparent'
                                  }}
                                >
                                  <MessageCircle size={14} color="#16a34a" /> WhatsApp Chat
                                </a>
                              ) : null}

                              {/* 3. Reschedule Option (EXCLUDED IN COMPLETED TAB AS REQUESTED!) */}
                              {activeTab !== 'completed' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(null);
                                    setRescheduleModalApp(app);
                                    setNewRescheduleDate(app.appointmentDate || selectedDate);
                                    setNewRescheduleTime(app.appointmentTime || '10:00 AM');
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: '#334155',
                                    border: 'none',
                                    background: 'none',
                                    cursor: 'pointer',
                                    width: '100%'
                                  }}
                                >
                                  <CalendarClock size={14} color="#258ec8" /> Reschedule
                                </button>
                              )}

                              {/* Collect Fee / Billing Checkout Option (Only when doctor has sent to reception or completed) */}
                              {(isFeeReady || isCompleted) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(null);
                                    handleOpenCheckout(app);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: '#16a34a',
                                    border: 'none',
                                    background: 'none',
                                    cursor: 'pointer',
                                    width: '100%'
                                  }}
                                >
                                  <CreditCard size={14} color="#16a34a" /> Collect Fee & Checkout
                                </button>
                              )}

                              {/* 4. Delete Option (Hidden on Completed Tab) */}
                              {!isCompleted && activeTab !== 'completed' && (
                                <>
                                  <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '3px 0' }} />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuId(null);
                                      handleDeleteAppointment(app.id, app.patientName || app.name);
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      padding: '8px 10px',
                                      borderRadius: '6px',
                                      fontSize: '12px',
                                      fontWeight: 700,
                                      color: '#ef4444',
                                      border: 'none',
                                      background: 'none',
                                      cursor: 'pointer',
                                      width: '100%'
                                    }}
                                  >
                                    <Trash2 size={14} color="#ef4444" /> Delete Appointment
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* RESCHEDULE MODAL */}
      {rescheduleModalApp && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '420px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CalendarClock size={20} color="#258ec8" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  Reschedule Appointment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleModalApp(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', marginBottom: '16px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                {rescheduleModalApp.patientName || rescheduleModalApp.name}
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                Doctor: {sanitizeDoctorName(rescheduleModalApp.doctorName || rescheduleModalApp.doctor, rescheduleModalApp.branch || currentBranch)} • Phone: +91 {rescheduleModalApp.phone || rescheduleModalApp.phoneNumber || 'N/A'}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  New Appointment Date:
                </label>
                <input
                  type="date"
                  value={newRescheduleDate}
                  onChange={(e) => setNewRescheduleDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  New Time Slot:
                </label>
                <select
                  value={newRescheduleTime}
                  onChange={(e) => setNewRescheduleTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: 700,
                    outline: 'none',
                    backgroundColor: '#ffffff',
                    boxSizing: 'border-box'
                  }}
                >
                  {['09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM', '07:00 PM'].map((slot) => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setRescheduleModalApp(null)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReschedule}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#258ec8',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Save size={14} /> Save Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Collect Fee & Printable Digital Invoice Modal */}
      <CollectFeeCheckoutModal
        appointment={checkoutModalApp}
        onClose={() => setCheckoutModalApp(null)}
        onSuccess={() => {
          setCheckoutModalApp(null);
        }}
      />

      {/* RECEPTIONIST PATIENT FILE & CLINICAL DETAILS MODAL */}
      {patientFileApp && (
        <PatientFileUI
          patient={patientFileApp}
          doctorName={sanitizeDoctorName(patientFileApp.doctorName || patientFileApp.doctor, patientFileApp.branch || currentBranch)}
          onClose={() => setPatientFileApp(null)}
          onSubmitConsultation={async (consultPayload) => {
            const nextApp = { ...patientFileApp, ...consultPayload };
            setPatientFileApp(null);
            handleOpenCheckout(nextApp);
          }}
        />
      )}

      {/* ---------------- FOLLOW-UP MODAL POPUP (OPTED / NOT OPTED) ---------------- */}
      {followupModalType && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(5px)',
          zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '780px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: followupModalType === 'payment_pending'
                ? 'linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)'
                : followupModalType === 'opted'
                  ? 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)'
                  : 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: followupModalType === 'payment_pending'
                    ? '#fee2e2'
                    : followupModalType === 'opted' ? '#dcfce7' : '#f1f5f9',
                  color: followupModalType === 'payment_pending'
                    ? '#ef4444'
                    : followupModalType === 'opted' ? '#16a34a' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {followupModalType === 'payment_pending'
                    ? <CreditCard size={22} />
                    : (followupModalType === 'opted' ? <ArrowRightLeft size={22} /> : <UserX size={22} />)}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {followupModalType === 'payment_pending'
                      ? 'Payment Pending Patients'
                      : (followupModalType === 'opted' ? 'Follow-up Opted Patients' : 'Follow-up Not Opted Patients')}
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 800,
                      padding: '2px 10px',
                      borderRadius: '12px',
                      background: followupModalType === 'payment_pending'
                        ? '#ef4444'
                        : (followupModalType === 'opted' ? '#258ec8' : '#64748b'),
                      color: '#ffffff'
                    }}>
                      {followupModalType === 'payment_pending'
                        ? paymentPendingList.length
                        : (followupModalType === 'opted' ? followupOptedList.length : followupNotOptedList.length)}
                    </span>
                  </h3>
                  <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>
                    {followupModalType === 'payment_pending'
                      ? `Patients sent to Reception for Fee Collection & Billing on ${selectedDate}`
                      : (followupModalType === 'opted'
                        ? `Patients booked for ${selectedDate} who have a follow-up scheduled or recommended`
                        : `Patients booked for ${selectedDate} with no follow-up scheduled`)}
                  </div>
                </div>
              </div>

              <button
                onClick={() => { setFollowupModalType(null); setFollowupSearchTerm(''); }}
                style={{
                  width: '34px', height: '34px', borderRadius: '50%', background: '#f1f5f9',
                  border: 'none', color: '#475569', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Filter Inside Modal */}
            <div style={{ padding: '14px 24px', borderBottom: '1px solid #f1f5f9', background: '#ffffff', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{
                position: 'relative', flex: 1, display: 'flex', alignItems: 'center'
              }}>
                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px' }} />
                <input
                  type="text"
                  placeholder="Search by patient name, phone, reg id, or doctor..."
                  value={followupSearchTerm}
                  onChange={e => setFollowupSearchTerm(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px 9px 36px',
                    borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Scrollable Patient List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {(() => {
                const baseList = followupModalType === 'payment_pending'
                  ? paymentPendingList
                  : (followupModalType === 'opted' ? followupOptedList : followupNotOptedList);

                const targetList = baseList.filter(app => {
                  if (!followupSearchTerm.trim()) return true;
                  const q = followupSearchTerm.toLowerCase();
                  const name = (app.patientName || app.name || '').toLowerCase();
                  const phone = (app.phone || app.phoneNumber || '').toLowerCase();
                  const regId = (app.regId || '').toLowerCase();
                  const doc = (app.doctor || app.doctorName || '').toLowerCase();
                  return name.includes(q) || phone.includes(q) || regId.includes(q) || doc.includes(q);
                });

                if (targetList.length === 0) {
                  return (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
                      <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto', color: '#94a3b8' }}>
                        {followupModalType === 'payment_pending'
                          ? <CreditCard size={28} color="#ef4444" />
                          : (followupModalType === 'opted' ? <ArrowRightLeft size={28} /> : <UserX size={28} />)}
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>No Patients Found</div>
                      <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                        {followupSearchTerm ? 'No matching patients found for your search query.' : (
                          followupModalType === 'payment_pending'
                            ? `No pending fee collection patients found for ${selectedDate}.`
                            : (followupModalType === 'opted'
                              ? `None of today's booked patients have a follow-up registered yet.`
                              : `All of today's booked patients have opted for follow-up.`)
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {targetList.map((app, idx) => {
                      const pName = app.patientName || app.name || 'Patient';
                      const pPhone = app.phone || app.phoneNumber || 'N/A';
                      const pRegId = app.regId || 'N/A';
                      const pDoc = sanitizeDoctorName(app.doctor || app.doctorName, app.branch || currentBranch);
                      const pBranch = app.branch || 'Branch';
                      const pTime = app.timeSlot || app.time || 'Scheduled';
                      const pStatus = app.status || 'waiting';
                      const followDate = app.preferredFollowUpDate || app.followUpDate;
                      const followInterval = app.followUpInterval;

                      const numPharm = Number(app.pharmacyFee) || 0;
                      const numDiet = Number(app.dietFee || app.dietFeeAmount || app.dietPlan?.dietFeeAmount || app.dietPlan?.dietFee) || 0;
                      const totalDue = app.totalAmount || (numPharm + numDiet > 0 ? (numPharm + numDiet) : null);

                      return (
                        <div
                          key={app.id || idx}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '12px',
                            padding: '14px 18px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '12px',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '220px' }}>
                            <div style={{
                              width: '32px', height: '32px', borderRadius: '50%',
                              background: '#ffffff', border: '1px solid #cbd5e1',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '12px', fontWeight: 800, color: '#475569'
                            }}>
                              {idx + 1}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a' }}>{pName}</span>
                                {checkIsPackageMember(app) && (
                                  <span style={{ fontSize: '10px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: '4px', fontWeight: 900 }}>
                                    [PKG]
                                  </span>
                                )}
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#258ec8', background: '#eff6ff', padding: '1px 7px', borderRadius: '6px' }}>{pRegId}</span>
                              </div>
                              <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span>📱 +91 {pPhone}</span>
                                <span>• 👨‍⚕️ {pDoc} ({pBranch})</span>
                              </div>
                            </div>
                          </div>

                          {/* Info Badge & Action Buttons */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            {followupModalType === 'payment_pending' ? (
                              <div style={{
                                background: '#fef2f2', border: '1px solid #fecaca',
                                borderRadius: '8px', padding: '6px 12px', textAlign: 'right'
                              }}>
                                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#dc2626' }}>
                                  {totalDue ? `Fee Due: ₹${totalDue}` : 'Fee Pending ⏳'}
                                </div>
                                <div style={{ fontSize: '11px', color: '#7f1d1d', marginTop: '1px', fontWeight: 600 }}>
                                  {numPharm > 0 && numDiet > 0
                                    ? `Rx: ₹${numPharm} + Diet: ₹${numDiet}`
                                    : (numPharm > 0 ? `Prescription: ₹${numPharm}` : (numDiet > 0 ? `Diet Fee: ₹${numDiet}` : 'Awaiting Reception Collection'))}
                                </div>
                              </div>
                            ) : followupModalType === 'opted' ? (
                              <div style={{
                                background: '#eff6ff', border: '1px solid #bfdbfe',
                                borderRadius: '8px', padding: '6px 12px', textAlign: 'right'
                              }}>
                                <div style={{ fontSize: '12px', fontWeight: 800, color: '#1d4ed8' }}>
                                  📅 {followDate ? `Follow-up: ${followDate}` : (followInterval || 'Follow-up Opted')}
                                </div>
                                {followInterval && followDate && (
                                  <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '1px' }}>
                                    Interval: {followInterval}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div style={{
                                background: '#fef2f2', border: '1px solid #fecaca',
                                borderRadius: '8px', padding: '6px 12px', textAlign: 'right'
                              }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626' }}>
                                  No Follow-up Added
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
                                  Time: {pTime} ({pStatus})
                                </div>
                              </div>
                            )}

                            {/* Collect Fee & Billing Direct Button (Payment Pending Only) */}
                            {followupModalType === 'payment_pending' && (
                              <button
                                onClick={() => {
                                  setFollowupModalType(null);
                                  handleOpenCheckout(app);
                                }}
                                style={{
                                  padding: '7px 14px',
                                  borderRadius: '8px',
                                  background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                                  color: '#ffffff',
                                  border: 'none',
                                  fontWeight: 800,
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)'
                                }}
                                title="Open Fee Collection and Digital Billing Invoice"
                              >
                                <CreditCard size={14} /> Collect Fee & Billing
                              </button>
                            )}

                            {/* WhatsApp Button */}
                            {pPhone && pPhone !== 'N/A' && (
                              <a
                                href={`https://wa.me/91${pPhone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  padding: '7px 12px',
                                  borderRadius: '8px',
                                  background: '#22c55e',
                                  color: '#ffffff',
                                  fontWeight: 700,
                                  fontSize: '12px',
                                  textDecoration: 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <MessageCircle size={14} /> WhatsApp
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setFollowupModalType(null); setFollowupSearchTerm(''); }}
                style={{
                  padding: '9px 20px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Delete Appointment Confirmation Modal (Popup Before Delete!) */}
      {deleteConfirmApp && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '18px',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#fef2f2'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#dc2626'
                }}>
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#991b1b' }}>
                    Confirm Appointment Deletion
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#b91c1c' }}>
                    No direct permanent loss • 24-hour restore available
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirmApp(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px' }}>
              <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#334155', lineHeight: 1.5 }}>
                Are you sure you want to delete the appointment for <strong style={{ color: '#0f172a' }}>{deleteConfirmApp.patientName || deleteConfirmApp.fullName || deleteConfirmApp.name || 'this patient'}</strong>?
              </p>

              {/* Patient Card Preview */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                fontSize: '12.5px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Doctor:</span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{sanitizeDoctorName(deleteConfirmApp.doctorName || deleteConfirmApp.doctor, deleteConfirmApp.branch || currentBranch)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Date & Time:</span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>
                    {deleteConfirmApp.appointmentDate || deleteConfirmApp.date || selectedDate} • {deleteConfirmApp.appointmentTime || deleteConfirmApp.time || '10:00 AM'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Branch:</span>
                  <span style={{ fontWeight: 600, color: '#334155' }}>{deleteConfirmApp.branch || deleteConfirmApp.branchName || currentBranch || 'KPHB Branch'}</span>
                </div>
              </div>

              {/* 24-Hour Recovery Notice Box */}
              <div style={{
                background: '#f0f9ff',
                border: '1.5px solid #bae6fd',
                borderRadius: '12px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
              }}>
                <RotateCcw size={18} color="#0284c7" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: '#0369a1', lineHeight: 1.5 }}>
                  <strong style={{ display: 'block', color: '#0284c7', marginBottom: '2px' }}>
                    Restorable for Up to 24 Hours
                  </strong>
                  This appointment will be moved to the <strong>Restore (24h)</strong> recycle bin for {deleteConfirmApp.branch || currentBranch || 'this branch'}. You or the mobile app can restore it back to the queue anytime within 24 hours.
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #f1f5f9',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                type="button"
                onClick={() => setDeleteConfirmApp(null)}
                disabled={isDeletingApp}
                style={{
                  padding: '9px 18px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingApp}
                style={{
                  padding: '9px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: isDeletingApp ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(220, 38, 38, 0.3)'
                }}
              >
                <Trash2 size={15} />
                <span>{isDeletingApp ? 'Deleting...' : 'Delete Appointment'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Restore Appointments Modal (24h Retention) */}
      {restoreModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '85vh',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: '#e0f2fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0284c7'
                }}>
                  <RotateCcw size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                    Restore Appointments (Last 24 Hours)
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                    Appointments deleted for <strong style={{ color: '#0284c7' }}>{currentBranch || 'KPHB Branch'}</strong> within the last 24h
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRestoreModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '8px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content / List */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {deleted24hList.length === 0 ? (
                <div style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '28px',
                    background: '#f0fdf4',
                    border: '1.5px solid #bbf7d0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#16a34a'
                  }}>
                    <CheckCircle2 size={28} />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>
                    Recycle Bin is Empty
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b', maxWidth: '360px', lineHeight: 1.5 }}>
                    No appointments have been deleted in the last 24 hours for {currentBranch || 'this branch'}.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                    Found <strong>{deleted24hList.length}</strong> deleted appointment{deleted24hList.length !== 1 ? 's' : ''} restorable back to active queue:
                  </div>

                  {deleted24hList.map((delApp) => {
                    const dTime = delApp.deletedAt ? new Date(delApp.deletedAt).getTime() : 0;
                    const diffMs = Date.now() - dTime;
                    const elapsedMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
                    const elapsedHours = Math.floor(elapsedMins / 60);
                    const elapsedStr = elapsedHours > 0 ? `${elapsedHours}h ${elapsedMins % 60}m ago` : `${elapsedMins}m ago`;

                    const remainingMs = Math.max(0, 24 * 60 * 60 * 1000 - diffMs);
                    const remHours = Math.floor(remainingMs / (1000 * 60 * 60));
                    const remMins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
                    const remainingStr = remHours > 0 ? `${remHours}h ${remMins}m left` : `${remMins}m left`;

                    const isRestoring = isRestoringId === delApp.id;

                    return (
                      <div
                        key={delApp.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '14px',
                          padding: '14px 18px',
                          gap: '16px',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {/* Patient & Doctor Info */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                              {delApp.patientName || delApp.fullName || delApp.name || 'Patient'}
                            </span>
                            <span style={{
                              fontSize: '10.5px',
                              fontWeight: 800,
                              padding: '2px 7px',
                              borderRadius: '6px',
                              background: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fecaca'
                            }}>
                              DELETED
                            </span>
                          </div>

                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                            {delApp.phoneNumber || delApp.phone || 'No phone'} • <span style={{ color: '#0284c7', fontWeight: 700 }}>{delApp.registrationId || delApp.regId || 'N/A'}</span>
                          </div>

                          <div style={{ fontSize: '12px', color: '#334155', marginTop: '2px' }}>
                            👨‍⚕️ {sanitizeDoctorName(delApp.doctorName || delApp.doctor, delApp.branch || currentBranch)} • 📅 {delApp.appointmentDate || delApp.date || 'N/A'} at {delApp.appointmentTime || delApp.time || '10:00 AM'}
                          </div>

                          {/* Deletion & Retention badges */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              Deleted: <strong style={{ color: '#475569' }}>{elapsedStr}</strong>
                            </span>
                            <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 700, background: '#fffbeb', padding: '1px 6px', borderRadius: '4px' }}>
                              ⏳ {remainingStr}
                            </span>
                          </div>
                        </div>

                        {/* Action: Restore Button */}
                        <button
                          type="button"
                          onClick={() => handleRestoreAppointment(delApp)}
                          disabled={isRestoring}
                          style={{
                            padding: '9px 18px',
                            borderRadius: '10px',
                            border: 'none',
                            background: isRestoring ? '#94a3b8' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                            color: '#ffffff',
                            fontWeight: 800,
                            fontSize: '12.5px',
                            cursor: isRestoring ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)',
                            flexShrink: 0
                          }}
                        >
                          <RotateCcw size={14} />
                          <span>{isRestoring ? 'Restoring...' : 'Restore'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 24px',
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Restored appointments automatically return to their previous queue order.
              </span>
              <button
                type="button"
                onClick={() => setRestoreModalOpen(false)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

