import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView, Platform, Modal, FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { SH_LOGO_BASE64 } from '../../../utils/logoBase64';
import { getBranchPhone } from '@app/shared';

const DOSAGE_TIMING_OPTIONS = [
  { value: '', label: 'Select Pill Timing' },
  { value: 'M - A - N', label: 'M - A - N (Morning - Afternoon - Night)' },
  { value: 'M - - E', label: 'M - - E (Morning - Evening)' },
  { value: 'M - - N', label: 'M - - N (Morning - Night)' },
  { value: 'M - A -', label: 'M - A - (Morning - Afternoon)' },
  { value: '- A - N', label: '- A - N (Afternoon - Night)' },
  { value: 'M - - -', label: 'M - - - (Morning Only)' },
  { value: '- A -', label: '- A - (Afternoon Only)' },
  { value: '- - E', label: '- - E (Evening Only)' },
  { value: '- - N', label: '- - N (Night Only)' },
  { value: '1-0-1', label: '1-0-1 (Morning & Night)' },
  { value: '1-1-1', label: '1-1-1 (Morning, Afternoon, Night)' },
  { value: '1-0-0', label: '1-0-0 (Morning Only)' },
  { value: '0-0-1', label: '0-0-1 (Night Only)' },
  { value: 'SOS', label: 'SOS (As Needed)' },
];

export const MEDICINE_TYPE_OPTIONS = [
  { value: 'Pills', label: 'Pills / Globules' },
  { value: 'Tablet', label: 'Tablet' },
  { value: 'Syrup', label: 'Syrup' },
  { value: 'Powder', label: 'Powder' },
  { value: 'Drops', label: 'Drops / Liquid Dilution' },
  { value: 'Mother Tincture', label: 'Mother Tincture (Q)' },
  { value: 'Ointment', label: 'Ointment / Cream' },
  { value: 'Other', label: 'Other' },
];

export const DURATION_OPTIONS = [
  '1 Month',
  '2 Months',
  '3 Months',
  '4 Months',
  '5 Months',
  '6 Months'
];
export interface MedicineItem {
  name: string;
  timing: string;
  type?: string;
  amount?: number | string;
}
const BRANCH_OPTIONS = [
  'KPHB Branch',
  'Nallagandla Branch',
  'Dilshuknagar Branch',
  'Chandanagar Branch',
];

export interface MobileMedicineRequestsScreenProps {
  branchName?: string;
  currentBranch?: string;
  userRole?: string;
}
const PREFIX_OPTIONS = ['Mr.', 'Mrs.', 'Ms.', 'Master', 'Dr.'];
export const MobileMedicineRequestsScreen: React.FC<MobileMedicineRequestsScreenProps> = ({
  branchName,
  currentBranch,
  userRole
}) => {
  const initialBranch = branchName || currentBranch || '';
  const [selectedBranch, setSelectedBranch] = useState(initialBranch);
  const isAdmin = userRole === 'admin' || userRole === 'hr';
  useEffect(() => {
    const active = branchName || currentBranch;
    if (active && active !== 'All Branches') {
      setSelectedBranch(active);
    } else {
      AsyncStorage.getItem('@sph_clinic_mobile_auth_session').then(saved => {
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed?.branchName && parsed.branchName !== 'All Branches') {
              setSelectedBranch(parsed.branchName);
            } else if (!selectedBranch) {
              setSelectedBranch('KPHB Branch');
            }
          } catch (_) {
            if (!selectedBranch) setSelectedBranch('KPHB Branch');
          }
        } else if (!selectedBranch) {
          setSelectedBranch('KPHB Branch');
        }
      });
    }
  }, [branchName, currentBranch]);
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [gender, setGender] = useState('Mr.');
  const [phone, setPhone] = useState('');
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [duration, setDuration] = useState('1 Month');
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [medicines, setMedicines] = useState<MedicineItem[]>([
    { name: '', timing: '', type: 'Pills' }
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showTimingPicker, setShowTimingPicker] = useState(false);
  const [activeTimingIndex, setActiveTimingIndex] = useState(-1);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [activeTypeIndex, setActiveTypeIndex] = useState(-1);
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  // Persistent Draft State
  const MEDICINE_REQUEST_DRAFT_KEY = '@sph_medicine_request_draft';
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);

  // Restore draft on screen mount
  useEffect(() => {
    const restoreDraft = async () => {
      try {
        const savedDraft = await AsyncStorage.getItem(MEDICINE_REQUEST_DRAFT_KEY);
        if (savedDraft) {
          const d = JSON.parse(savedDraft);
          if (d && (d.patientName || d.phone || d.patientAge || d.duration || Number(d.totalAmount) > 0 || (d.medicines && d.medicines.some((m: any) => m.name)))) {
            if (d.patientName !== undefined) setPatientName(d.patientName);
            if (d.patientAge !== undefined) setPatientAge(d.patientAge);
            if (d.gender !== undefined) setGender(d.gender);
            if (d.phone !== undefined) setPhone(d.phone);
            if (d.totalAmount !== undefined) setTotalAmount(Number(d.totalAmount) || 0);
            if (d.duration !== undefined) setDuration(d.duration);
            if (Array.isArray(d.medicines) && d.medicines.length > 0) setMedicines(d.medicines);
            if (d.selectedBranch && (!branchName || branchName === 'All Branches')) {
              setSelectedBranch(d.selectedBranch);
            }
            setHasRestoredDraft(true);
          }
        }
      } catch (e) {
        console.warn('Error restoring medicine request draft:', e);
      } finally {
        setIsDraftLoaded(true);
      }
    };
    restoreDraft();
  }, []);

  // Auto-save draft on every change
  useEffect(() => {
    if (!isDraftLoaded) return;
    const hasData = Boolean(
      patientName.trim() ||
      phone.trim() ||
      patientAge.trim() ||
      duration.trim() ||
      totalAmount > 0 ||
      medicines.some(m => m.name && m.name.trim().length > 0)
    );

    if (hasData) {
      const payload = {
        patientName,
        patientAge,
        gender,
        phone,
        totalAmount,
        duration,
        medicines,
        selectedBranch,
        savedAt: new Date().toISOString()
      };
      AsyncStorage.setItem(MEDICINE_REQUEST_DRAFT_KEY, JSON.stringify(payload)).catch(() => { });
    } else {
      AsyncStorage.removeItem(MEDICINE_REQUEST_DRAFT_KEY).catch(() => { });
    }
  }, [isDraftLoaded, patientName, patientAge, gender, phone, totalAmount, duration, medicines, selectedBranch]);

  const hasAnyData = Boolean(
    patientName.trim() ||
    phone.trim() ||
    patientAge.trim() ||
    duration.trim() ||
    totalAmount > 0 ||
    medicines.some(m => m.name && m.name.trim().length > 0)
  );

  const addMedicine = () => {
    setMedicines(prev => [...prev, { name: '', timing: '', type: 'Pills' }]);
  };

  const removeMedicine = (index: number) => {
    if (medicines.length <= 1) return;
    setMedicines(prev => prev.filter((_, i) => i !== index));
  };

  const updateMedicine = (index: number, field: keyof MedicineItem, value: string) => {
    setMedicines(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleClear = async () => {
    setPatientName('');
    setPatientAge('');
    setGender('Mr.');
    setPhone('');
    setSelectedBranch(branchName || currentBranch || selectedBranch || 'KPHB Branch');
    setTotalAmount(0);
    setDuration('');
    setMedicines([{ name: '', timing: '', type: 'Pills' }]);
    setHasRestoredDraft(false);
    try {
      await AsyncStorage.removeItem(MEDICINE_REQUEST_DRAFT_KEY);
    } catch (_) { }
  };

  // --- PDF HTML Generator matching Official Clinic Letterhead ---
  const generatePDF = async () => {
    if (!patientName.trim()) {
      Alert.alert('Required Field', 'Please enter the patient name before generating the certificate.');
      return;
    }

    setIsGenerating(true);

    const resolveTitle = (gOrT?: string) => {
      const g = (gOrT || '').trim();
      if (g.toLowerCase().startsWith('mr.')) return 'MR.';
      if (g.toLowerCase().startsWith('mrs.')) return 'MRS.';
      if (g.toLowerCase().startsWith('ms.')) return 'MS.';
      if (g.toLowerCase().startsWith('master')) return 'MASTER';
      if (g.toLowerCase().startsWith('dr.')) return 'DR.';
      return g.toUpperCase() || 'MR.';
    };

    const resolvePronoun = (gOrT?: string) => {
      const g = (gOrT || '').toLowerCase().trim();
      if (g.includes('mr') || g.includes('male') || g.includes('master') || g.includes('boy')) return 'HE';
      if (g.includes('mrs') || g.includes('ms') || g.includes('female') || g.includes('miss') || g.includes('girl')) return 'SHE';
      return 'HE/SHE';
    };

    const title = resolveTitle(gender);
    const pronoun = resolvePronoun(gender);
    const patNameUpper = (patientName || 'PATIENT').toUpperCase();
    const durationClean = (duration || '').replace(/months?/gi, '').trim();
    const durationDisplay = durationClean ? (durationClean === '1' ? '1 MONTH' : `${durationClean} MONTHS`) : '';
    const formattedDate = new Date().toLocaleDateString('en-GB');
    const displayBranch = (selectedBranch || initialBranch).toUpperCase();

    const validMedicines = medicines.filter(m => m.name && m.name.trim().length > 0);
    const displayMedicines = validMedicines.length > 0 ? validMedicines : medicines;

    const rowsHtml = displayMedicines.map((m, idx) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #1e293b; text-align: center;">${idx + 1}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0;">
          <div style="font-weight: bold; color: #1e293b; font-size: 13.5px;">${m.name || '-'}</div>
          ${m.amount && Number(m.amount) > 0 ? `<div style="font-size: 11px; color: #166534; font-weight: 700; margin-top: 3px;">Amount: ₹${Number(m.amount).toFixed(2)}</div>` : ''}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: center;">
          <span style="background: #e0f2fe; color: #0284c7; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 11.5px; display: inline-block; border: 1px solid #bae6fd;">
            ${m.type || 'Pills'}
          </span>
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 13px; font-weight: 600;">${m.timing || '-'}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Medical Certificate - ${patNameUpper}</title>
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            min-height: 100vh;
            font-family: Arial, 'Helvetica Neue', sans-serif;
            background: #ffffff;
            color: #0f172a;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }

          /* TOP BLUE BANNER */
          .top-banner {
            background: #1d8ecd;
            height: 60px;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 32px 0 0;
            position: relative;
          }

          .logo-container {
            background: #ffffff;
            height: 72px;
            padding: 8px 24px 8px 20px;
            display: flex;
            align-items: center;
            box-shadow: 2px 3px 10px rgba(0,0,0,0.12);
            border-bottom-right-radius: 4px;
          }

          .logo-img {
            height: 52px;
            object-fit: contain;
          }

          .top-web-link {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #ffffff;
            font-weight: 800;
            font-size: 13px;
            letter-spacing: 0.8px;
            text-transform: uppercase;
          }

          .globe-circle {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            border: 1.5px solid #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          /* MAIN CERTIFICATE CONTENT */
          .cert-content {
            padding: 36px 50px;
            flex: 1;
          }

          .date-row {
            text-align: right;
            font-size: 13px;
            font-weight: 800;
            color: #0f172a;
            margin-bottom: 24px;
            letter-spacing: 0.3px;
          }

          .cert-title {
            text-align: center;
            font-size: 16px;
            font-weight: 800;
            letter-spacing: 1.2px;
            text-decoration: underline;
            text-underline-offset: 4px;
            margin: 20px 0 28px 0;
            color: #0f172a;
            text-transform: uppercase;
          }

          .cert-para {
            font-size: 14.5px;
            line-height: 1.9;
            color: #1e293b;
            text-align: justify;
            margin-bottom: 20px;
          }

          .med-heading {
            margin-top: 28px;
            margin-bottom: 12px;
            font-weight: 800;
            font-size: 13.5px;
            letter-spacing: 1px;
            color: #1d8ecd;
            text-transform: uppercase;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 6px;
          }

          table.med-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            margin-top: 6px;
          }

          table.med-table th {
            background: #f8fafc;
            padding: 9px 12px;
            text-align: left;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: #64748b;
            border-top: 1px solid #e2e8f0;
            border-bottom: 1.5px solid #cbd5e1;
          }

          table.med-table td {
            padding: 10px 12px;
            border-bottom: 1px solid #e2e8f0;
            color: #334155;
          }

          /* BOTTOM GREEN FOOTER BANNER */
          .bottom-banner {
            background: #a3cf3b;
            height: 48px;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-around;
            padding: 0 16px;
          }

          .footer-item {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #ffffff;
            font-weight: 800;
            font-size: 12px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }

          .icon-circle {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            border: 1.5px solid #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .footer-v-divider {
            width: 1.5px;
            height: 24px;
            background: rgba(255, 255, 255, 0.8);
          }
        </style>
      </head>
      <body>
        <!-- TOP BLUE BANNER WITH LOGO BADGE & WEB LINK -->
        <div class="top-banner">
          <div class="logo-container">
            <img class="logo-img" src="data:image/png;base64,${SH_LOGO_BASE64}" alt="Spiritual Homeopathy" />
          </div>
          <div class="top-web-link">
            <div class="globe-circle">
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="white" stroke-width="2.5" fill="none">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
            </div>
            <span>spiritualhomeoclinic.com</span>
          </div>
        </div>

        <!-- MAIN CERTIFICATE CONTENT -->
        <div class="cert-content">
          <div class="date-row">
            DATE: ${formattedDate}
          </div>

          <div class="cert-title">
            TO WHOM SO EVER IT MAY CONCERN
          </div>

          <div class="cert-para">
            THIS IS TO CERTIFY THAT <strong>${title} ${patNameUpper}</strong>${patientAge ? ` AGED ABOUT <strong>${patientAge} YEARS</strong>,` : ''} HAS BEEN UNDER OUR TREATMENT AT SPIRITUAL HOMEOPATHY.
          </div>

          <div class="cert-para">
            ${durationDisplay ? `<strong>${pronoun}</strong> NEEDED TO TAKE HOMEOPATHY MEDICINE FOR <strong>${durationDisplay}</strong>. ` : ''}WE RECOMMENDED THAT <strong>${title} ${patNameUpper}</strong> CONTINUES TO FOLLOW THE PRESCRIBED MEDICATIONS.
          </div>

          <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; margin-bottom: 8px;">
            <div class="med-heading" style="margin: 0; padding-bottom: 4px; border: none;">PRESCRIBED MEDICINES</div>
            ${totalAmount > 0 ? `
            <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 8px; padding: 5px 12px; display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 11px; font-weight: 700; color: #166534; text-transform: uppercase;">Total Medicine Fee:</span>
              <span style="font-size: 14.5px; font-weight: 900; color: #15803d;">₹${Number(totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            ` : ''}
          </div>

          <table class="med-table">
            <thead>
              <tr>
                <th style="width: 6%; text-align: center;">#</th>
                <th style="width: 44%;">Remedy / Medicine Name</th>
                <th style="width: 20%; text-align: center;">Type</th>
                <th style="width: 30%;">Dosage & Timing</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            ${totalAmount > 0 ? `
            <tfoot>
              <tr style="background-color: #f8fafc; border-top: 2px solid #1d8ecd;">
                <td colspan="3" style="padding: 11px 12px; text-align: right; font-weight: 800; font-size: 12.5px; color: #0f172a; text-transform: uppercase;">
                  Total Medicine Amount:
                </td>
                <td style="padding: 11px 12px; text-align: right; font-weight: 900; font-size: 14.5px; color: #166534;">
                  ₹${Number(totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
            ` : ''}
          </table>



          <div style="margin-top: 50px; text-align: center; font-size: 11.5px; color: #64748b; font-style: italic; border-top: 1px dashed #cbd5e1; padding-top: 14px;">
            This is a computer-generated document. No signature required.
          </div>
        </div>

        <!-- BOTTOM GREEN FOOTER BANNER -->
        <div class="bottom-banner">
          <div class="footer-item">
            <div class="icon-circle">
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="white" stroke-width="2.5" fill="none">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
            </div>
            <span>${getBranchPhone(selectedBranch || initialBranch)}</span>
          </div>

          <div class="footer-v-divider"></div>

          <div class="footer-item">
            <div class="icon-circle">
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="white" stroke-width="2.5" fill="none">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </div>
            <span>support@spiritualhomeoclinic.com</span>
          </div>

          <div class="footer-v-divider"></div>

          <div class="footer-item">
            <div class="icon-circle">
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="white" stroke-width="2.5" fill="none">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            </div>
            <span>${displayBranch}</span>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri);
    } catch (error) {
      Alert.alert('Error', 'Failed to generate prescription PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>

      {/* Draft Restored Banner */}
      {hasRestoredDraft && (
        <View style={{
          backgroundColor: '#eff6ff',
          borderColor: '#bfdbfe',
          borderWidth: 1,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 9,
          marginBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Feather name="file-text" size={14} color="#0284c7" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#0369a1' }}>
              Draft Restored — your entered patient progress is preserved.
            </Text>
          </View>
          <TouchableOpacity onPress={() => setHasRestoredDraft(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={14} color="#64748b" />
          </TouchableOpacity>
        </View>
      )}

      {/* Prefix Selection Chips & Action Header */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.fieldSectionTitle}>Patient Title / Prefix</Text>
            {hasAnyData && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f0fdf4', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#bbf7d0' }}>
                <Feather name="check" size={10} color="#16a34a" />
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#15803d' }}>Draft Saved</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.clearBtn} onPress={handleClear} activeOpacity={0.7}>
            <Feather name="rotate-ccw" size={12} color="#64748b" />
            <Text style={styles.clearBtnText}>Clear Form</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.chipsRow}>
          {PREFIX_OPTIONS.map((item) => {
            const isSelected = gender === item;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => setGender(item)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Patient Information Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderIcon}>
            <Feather name="user" size={16} color="#1d8ecd" />
          </View>
          <Text style={styles.cardTitle}>Patient & Certificate Details</Text>
        </View>

        {/* Patient Full Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Patient Full Name *</Text>
          <View style={styles.inputWrapper}>
            <Feather name="user-check" size={16} color="#94a3b8" style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="Enter patient full name"
              placeholderTextColor="#94a3b8"
              value={patientName}
              onChangeText={setPatientName}
            />
          </View>
        </View>

        {/* Phone Number */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Phone Number *</Text>
          <View style={styles.inputWrapper}>
            <Feather name="phone" size={16} color="#94a3b8" style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 9849012345"
              placeholderTextColor="#94a3b8"
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
              keyboardType="phone-pad"
              maxLength={10}
            />
          </View>
        </View>

        {/* Age & Branch */}
        <View style={styles.twoColRow}>
          <View style={[styles.inputGroup, { flex: 0.9, marginRight: 8 }]}>
            <Text style={styles.inputLabel}>Age (Years)</Text>
            <View style={styles.inputWrapper}>
              <Feather name="calendar" size={16} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Age"
                placeholderTextColor="#94a3b8"
                value={patientAge}
                onChangeText={setPatientAge}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={[styles.inputGroup, { flex: 1.4 }]}>
            <Text style={styles.inputLabel}>Branch Name {isAdmin ? '(Select Branch)' : '(Locked)'}</Text>
            {isAdmin ? (
              <TouchableOpacity
                onPress={() => setShowBranchPicker(true)}
                style={[styles.inputWrapper, { justifyContent: 'space-between', backgroundColor: '#ffffff' }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Feather name="map-pin" size={16} color="#258ec8" style={styles.inputIcon} />
                  <Text style={{ fontSize: 13, color: '#0f172a', fontWeight: '800' }}>{selectedBranch || 'Select Branch'}</Text>
                </View>
                <Feather name="chevron-down" size={15} color="#64748b" />
              </TouchableOpacity>
            ) : (
              <View
                style={[styles.inputWrapper, { justifyContent: 'space-between', backgroundColor: '#f1f5f9' }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Feather name="map-pin" size={16} color="#258ec8" style={styles.inputIcon} />
                  <Text style={{ fontSize: 13, color: '#0f172a', fontWeight: '800' }}>{selectedBranch || 'Branch'}</Text>
                </View>
                <Feather name="lock" size={13} color="#64748b" />
              </View>
            )}
          </View>
        </View>

        {/* Total Amount & Duration */}
        <View style={styles.twoColRow}>
          <View style={[styles.inputGroup, { flex: 1.4, marginRight: 8 }]}>
            <Text style={styles.inputLabel}>Total Amount (₹)</Text>
            <View style={styles.inputWrapper}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#16a34a', marginLeft: 12, marginRight: 4 }}>₹</Text>
              <TextInput
                style={[styles.textInput, { paddingLeft: 0 }]}
                placeholder="Total Amount"
                placeholderTextColor="#94a3b8"
                value={totalAmount === 0 ? '' : String(totalAmount)}
                onChangeText={(t) => setTotalAmount(t === '' ? 0 : Number(t.replace(/\D/g, '')) || 0)}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.inputLabel}>Duration</Text>
            <TouchableOpacity
              style={[styles.inputWrapper, { justifyContent: 'space-between', paddingRight: 12 }]}
              onPress={() => setShowDurationPicker(true)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Feather name="clock" size={16} color="#94a3b8" style={styles.inputIcon} />
                <Text style={{ fontSize: 13, color: duration ? '#0f172a' : '#94a3b8', fontWeight: '700' }}>
                  {duration || '1 Month'}
                </Text>
              </View>
              <Feather name="chevron-down" size={16} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

      </View>

      {/* Prescribed Remedies Card */}
      <View style={styles.card}>
        <View style={styles.cardHeaderWithAction}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.cardHeaderIcon, { backgroundColor: '#f0fdf4' }]}>
              <MaterialCommunityIcons name="pill" size={16} color="#16a34a" />
            </View>
            <View>
              <Text style={styles.cardTitle}>Prescribed Remedies</Text>
              <Text style={styles.cardSubtitle}>{medicines.length} item(s) listed</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.addRemedyBtn} onPress={addMedicine} activeOpacity={0.7}>
            <Feather name="plus" size={15} color="#ffffff" />
            <Text style={styles.addRemedyBtnText}>Add Remedy</Text>
          </TouchableOpacity>
        </View>

        {medicines.map((m, idx) => (
          <View key={idx} style={styles.remedyBox}>
            <View style={styles.remedyTopRow}>
              <View style={styles.remedyBadge}>
                <Text style={styles.remedyBadgeText}>#{idx + 1} Remedy</Text>
              </View>

              {medicines.length > 1 && (
                <TouchableOpacity
                  onPress={() => removeMedicine(idx)}
                  style={styles.deleteRemedyBtn}
                  activeOpacity={0.6}
                >
                  <Feather name="trash-2" size={14} color="#ef4444" />
                  <Text style={styles.deleteRemedyText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.subInputLabel}>Remedy / Medicine Name</Text>
              <TextInput
                style={styles.remedyInput}
                placeholder="e.g. Arnica 200C Liquid"
                placeholderTextColor="#94a3b8"
                value={m.name}
                onChangeText={(text) => updateMedicine(idx, 'name', text)}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.subInputLabel}>Type (Tablet, Syrup...)</Text>
                <TouchableOpacity
                  style={[styles.remedyInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }]}
                  onPress={() => { setActiveTypeIndex(idx); setShowTypePicker(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, color: '#0f172a', fontWeight: '700' }}>
                    {m.type || 'Pills'}
                  </Text>
                  <Feather name="chevron-down" size={14} color="#64748b" />
                </TouchableOpacity>
              </View>

              <View style={[styles.inputGroup, { flex: 1.2 }]}>
                <Text style={styles.subInputLabel}>Dosage & Timing</Text>
                <TouchableOpacity
                  style={[styles.remedyInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }]}
                  onPress={() => { setActiveTimingIndex(idx); setShowTimingPicker(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, color: m.timing ? '#0f172a' : '#94a3b8' }}>
                    {m.timing || 'Select Timing'}
                  </Text>
                  <Feather name="chevron-down" size={14} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Info Tag */}
      <View style={styles.infoBanner}>
        <Ionicons name="document-text-outline" size={18} color="#0284c7" />
        <Text style={styles.infoBannerText}>
          Generates official clinic letterhead with cyan-blue header, lime-green footer, and verified computer-generated notice.
        </Text>
      </View>

      {/* Print PDF Primary Action Button */}
      <TouchableOpacity
        style={styles.printActionBtn}
        onPress={generatePDF}
        activeOpacity={0.85}
        disabled={isGenerating}
      >
        <Feather name="printer" size={19} color="#ffffff" style={{ marginRight: 8 }} />
        <Text style={styles.printActionBtnText}>
          {isGenerating ? 'Generating PDF...' : 'Generate & Print Letterhead PDF'}
        </Text>
      </TouchableOpacity>

      {/* Duration Picker Modal */}
      <Modal visible={showDurationPicker} transparent animationType="slide" onRequestClose={() => setShowDurationPicker(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowDurationPicker(false)}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '50%', paddingBottom: 30 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>Select Medicine Duration</Text>
              <TouchableOpacity onPress={() => setShowDurationPicker(false)}>
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={DURATION_OPTIONS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const isSelected = duration === item || duration === item.replace(' Months', '').replace(' Month', '');
                return (
                  <TouchableOpacity
                    style={{ paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: isSelected ? '#e0f2fe' : '#fff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                    onPress={() => {
                      setDuration(item);
                      setShowDurationPicker(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 14, fontWeight: isSelected ? '800' : '600', color: isSelected ? '#0284c7' : '#334155' }}>
                      {item}
                    </Text>
                    {isSelected && <Feather name="check" size={18} color="#0284c7" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Medicine Type Picker Modal */}
      <Modal visible={showTypePicker} transparent animationType="slide" onRequestClose={() => setShowTypePicker(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowTypePicker(false)}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', paddingBottom: 30 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>Select Medicine Type</Text>
              <TouchableOpacity onPress={() => setShowTypePicker(false)}>
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={MEDICINE_TYPE_OPTIONS}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => {
                const isSelected = activeTypeIndex >= 0 && (medicines[activeTypeIndex]?.type || 'Pills') === item.value;
                return (
                  <TouchableOpacity
                    style={{ paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: isSelected ? '#e0f2fe' : '#fff' }}
                    onPress={() => {
                      if (activeTypeIndex >= 0) updateMedicine(activeTypeIndex, 'type', item.value);
                      setShowTypePicker(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 13.5, fontWeight: isSelected ? '800' : '600', color: isSelected ? '#0284c7' : '#334155' }}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Dosage Timing Picker Modal */}
      <Modal visible={showTimingPicker} transparent animationType="slide" onRequestClose={() => setShowTimingPicker(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowTimingPicker(false)}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', paddingBottom: 30 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>Select Pill Timing</Text>
              <TouchableOpacity onPress={() => setShowTimingPicker(false)}>
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={DOSAGE_TIMING_OPTIONS.filter(o => o.value !== '')}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => {
                const isSelected = activeTimingIndex >= 0 && medicines[activeTimingIndex]?.timing === item.value;
                return (
                  <TouchableOpacity
                    style={{ paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: isSelected ? '#e0f2fe' : '#fff' }}
                    onPress={() => { if (activeTimingIndex >= 0) updateMedicine(activeTimingIndex, 'timing', item.value); setShowTimingPicker(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 13.5, fontWeight: isSelected ? '800' : '600', color: isSelected ? '#0284c7' : '#334155' }}>{item.label}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Branch Selection Modal for Admin */}
      <Modal visible={showBranchPicker} transparent animationType="slide" onRequestClose={() => setShowBranchPicker(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowBranchPicker(false)}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: 380 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>Select Clinic Branch</Text>
              <TouchableOpacity onPress={() => setShowBranchPicker(false)}>
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={BRANCH_OPTIONS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const isSelected = selectedBranch === item;
                return (
                  <TouchableOpacity
                    style={{
                      paddingVertical: 14,
                      paddingHorizontal: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: '#f1f5f9',
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: isSelected ? '#f0f9ff' : 'transparent',
                      borderRadius: 8
                    }}
                    onPress={() => {
                      setSelectedBranch(item);
                      setShowBranchPicker(false);
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: isSelected ? '800' : '600', color: isSelected ? '#0284c7' : '#1e293b' }}>
                      {item}
                    </Text>
                    {isSelected && <Feather name="check" size={16} color="#0284c7" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

    </ScrollView>
  );
};

export const MedicineRequestsScreen = MobileMedicineRequestsScreen;
export default MobileMedicineRequestsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9'
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 140
  },

  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569'
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 }
    })
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8
  },
  cardHeaderWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8
  },
  cardHeaderIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center'
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0f172a'
  },
  cardSubtitle: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1
  },
  fieldSectionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 10
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  chipActive: {
    backgroundColor: '#1d8ecd',
    borderColor: '#1d8ecd',
    ...Platform.select({
      ios: { shadowColor: '#1d8ecd', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
      android: { elevation: 2 }
    })
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569'
  },
  chipTextActive: {
    color: '#ffffff'
  },
  inputGroup: {
    marginBottom: 12
  },
  inputLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 5
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10
  },
  inputIcon: {
    marginRight: 8
  },
  textInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a'
  },
  twoColRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  addRemedyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1d8ecd',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    ...Platform.select({
      ios: { shadowColor: '#1d8ecd', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3 },
      android: { elevation: 2 }
    })
  },
  addRemedyBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  remedyBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 10
  },
  remedyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  remedyBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  remedyBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0369a1'
  },
  deleteRemedyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  deleteRemedyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626'
  },
  subInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4
  },
  remedyInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12.5,
    color: '#0f172a'
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 12,
    padding: 12,
    marginBottom: 18
  },
  infoBannerText: {
    flex: 1,
    fontSize: 11.5,
    color: '#0369a1',
    lineHeight: 16
  },
  printActionBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1d8ecd',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginBottom: 20,
    ...Platform.select({
      ios: { shadowColor: '#1d8ecd', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
      android: { elevation: 4 }
    })
  },
  printActionBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.3,
    textAlign: 'center',
    flexShrink: 1
  }
});
