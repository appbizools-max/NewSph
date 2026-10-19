import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, Alert, Share
} from 'react-native';
import { Text, Surface, ActivityIndicator, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft, Download, FileText, User, Phone, Calendar,
  Pill, CheckCircle2, AlertCircle, Clock
} from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const APP_ICON_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAARkAAAEZCAIAAAAscsZAAAAACXBIWXMAABJ0AAASdAHeZh94AAAFXGlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSfvu78nIGlkPSdXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQnPz4KPHg6eG1wbWV0YSB4bWxuczp4PSdhZG9iZTpuczptZXRhLyc+CjxyZGY6UkRGIHhtbG5zOnJkZj0naHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyc+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczpBdHRyaWI9J2h0dHA6Ly9ucy5hdHRyaWJ1dGlvbi5jb20vYWRzLzEuMC8nPgogIDxBdHRyaWI6QWRzPgogICA8cmRmOlNlcT4KICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0nUmVzb3VyY2UnPgogICAgIDxBdHRyaWI6Q3JlYXRlZD4yMDI2LTA1LTMxPC9BdHRyaWI6Q3JlYXRlZD4KICAgICA8QXR0cmliOkRhdGE+eyZxdW90O2RvYyZxdW90OzomcXVvdDtEQUhGYUk0MkVhcyZxdW90OywmcXVvdDt1c2VyJnF1b3Q7OiZxdW90O1VBRkhvNTkwX0xVJnF1b3Q7LCZxdW90O2JyYW5kJnF1b3Q7OiZxdW90O0plZXZhbiBSZWRkeSZxdW90O308L0F0dHJpYjpEYXRhPgogICAgIDxBdHRyaWI6RXh0SWQ+ZDg4ZDIxNGUtOWFlYi00YWQ0LWI2ZGQtYjVhMTE5YWVkNmUwPC9BdHRyaWI6RXh0SWQ+CiAgICAgPEF0dHJpYjpGYklkPjUyNTI2NTkxNDE3OTU4MDwvQXR0cmliOkZiSWQ+CiAgICAgPEF0dHJpYjpUb3VjaFR5cGU+MjwvQXR0cmliOlRvdWNoVHlwZT4KICAgIDwvcmRmOmxpPgogICA8L3JkZjpTZXE+CiAgPC9BdHRyaWI6QWRzPgogPC9yZGY6RGVzY3JpcHRpb24+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczpkYz0naHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8nPgogIDxkYzp0aXRsZT4KICAgPHJkZjpBbHQ+CiAgICA8cmRmOmxpIHhtbDpsYW5nPSd4LWRlZmF1bHQnPkxvY2FsTmVlZHMgJmFtcDtKb2JzIC0gMTA8L3JkZjpsaT4KICAgPC9yZGY6QWx0PgogIDwvZGM6dGl0bGU+CiA8L3JkZjpEZXNjcmlwdGlvbj4KCiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0nJwogIHhtbG5zOnBkZj0naHR0cDovL25zLmFkb2JlLmNvbS9wZGYvMS4zLyc+CiAgPHBkZjpBdXRob3I+UHJlZXRoYW0gcmFtIEF2YWxhPC9wZGY6QXV0aG9yPgogPC9yZGY6RGVzY3JpcHRpb24+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczp4bXA9J2h0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8nPgogIDx4bXA6Q3JlYXRvclRvb2w+Q2FudmEgKFJlbmRlcmVyKSBkb2M9REFIRmFJNDJFYXMgdXNlcj1VQUZIbzU5MF9MVSBicmFuZD1KZWV2YW4gUmVkZHk8L3htcDpDcmVhdG9yVG9vbD4KIDwvcmRmOkRlc2NyaXB0aW9uPgo8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSdyJz8+WkY3+QAAAE5lWElmTU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAAITAAMAAAABAAEAAAAAAAAAAAB4AAAAAQAAAHgAAAAByZF2EwAAI0FJREFUeJzt3Xl8FPX9P/DPzOx9Z3dzbO47IYQI4UY5FDxQOby1B62VVq3fb+vXtvpr1fqVeqDWVmtti7RaChUpXhSUinILcsmRkJBArs197ZG9d2dn5vsH/CiFQDKzn83uzr6fD/6APPjMvAN57cx85nMQHMchAEDEyFyXgIBIQJYAwAOyBAAekCUA8IAsAYAHZAkAPCBLAOABWQIAD8gSAHhAlgDAA7IEAB6QJQDwgCwBgAdkCQA8IEsA4AFZAgAPyBIAeECWAMADsgQAHpAlAPCALAGAB2QJADwgSwDgAVkCAA/IEgB4QJYAwAOyBAAekCUA8IAsAYAHZAkAPCBLAOABWQIAD8gSAHhAlgDAA7IEAB6QJQDwgCwBgAdkCQA8IEsA4AFZAgAPyBIAeECWAMADsgQAHpAlAPCALAGAB2QJADwgSwDgAVkCAA/IEgB4QJYAwAOyBAAekCUA8IAsAYAHZAkAPCBLAOABWQIAD8gSAHhAlgDAA7IEAB6QJQDwgCwBgAdkCQA8IEsA4AFZAgAPyBIAeECWAMADsgQAHpAlAPCALAGAB2QJADwgSwDgAVkCAA/IEgB4QJYAwAOyBAAekCUA8IAsAYAHZAkAPCBLAOABWQIAj/8Dby64yJO0J5oAAAAASUVORK5CYII=';

const MedicineFormView = ({ navigation, route }) => {
  const { user, userData } = useAuth();
  const { appointmentId, patientPhone } = route.params || {};

  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [selectedForm, setSelectedForm] = useState(null);

  useEffect(() => {
    if (user?.uid) {
      fetchForms();
    }
  }, [user?.uid, userData?.phone, patientPhone]);

  const fetchForms = async () => {
    setLoading(true);
    try {
      // Query by patientId (user.uid) OR appointmentId
      let results = [];

      if (user?.uid) {
        const q1 = query(
          collection(db, 'medicine_forms'),
          where('patientId', '==', user.uid)
        );
        const snap1 = await getDocs(q1);
        snap1.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
      }

      // Also try by appointmentId if provided
      if (appointmentId) {
        const q2 = query(
          collection(db, 'medicine_forms'),
          where('appointmentId', '==', appointmentId)
        );
        const snap2 = await getDocs(q2);
        snap2.forEach(doc => {
          if (!results.find(r => r.id === doc.id)) {
            results.push({ id: doc.id, ...doc.data() });
          }
        });
      }

      // Also try by phone if available
      const phone = userData?.phone || patientPhone || user?.phoneNumber;
      if (phone) {
        const cleanPhoneVal = phone.replace(/\D/g, '').slice(-10);
        const possiblePhones = [
          phone,
          cleanPhoneVal,
          `+91${cleanPhoneVal}`,
          `+91 ${cleanPhoneVal}`
        ].filter(Boolean);
        const uniquePhones = Array.from(new Set(possiblePhones));

        const q3 = query(
          collection(db, 'medicine_forms'),
          where('phone', 'in', uniquePhones)
        );
        const snap3 = await getDocs(q3);
        snap3.forEach(doc => {
          if (!results.find(r => r.id === doc.id)) {
            results.push({ id: doc.id, ...doc.data() });
          }
        });
      }

      // Sort by newest first
      results.sort((a, b) => {
        const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime()
          : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime()
          : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return tB - tA;
      });

      setForms(results);
      if (results.length > 0) setSelectedForm(results[0]);
    } catch (err) {
      console.error('Error fetching medicine forms:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateHtml = (data) => {
    const medicineRows = data.hideMedicines ? '' : (data.medicines || [])
      .map(m => `
        <tr>
          <td style="padding:6px 10px; border-bottom:1px solid #f0f0f0; font-size:13px; color:#1a1a1a; font-weight:700;">
            ${m.name}
          </td>
          <td style="padding:6px 10px; border-bottom:1px solid #f0f0f0; font-size:13px; color:#444;">
            --- ${m.timing}
          </td>
        </tr>`)
      .join('');

    const genderTitle = data.gender || 'Mr.';
    const heShe = (genderTitle === 'Mrs.' || genderTitle === 'Ms.') ? 'SHE' : 'HE';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; background:#fff; }
    .page {
      width:595px;
      min-height:842px;
      margin:0 auto;
      padding: 0 0 140px 0;
      border:2px solid #298FCA;
      position: relative;
    }
    .header-bar {
      background:linear-gradient(135deg,#298FCA 0%,#1a6fa0 100%);
      padding:18px 40px 14px;
      display:flex;
      justify-content:space-between;
      align-items:center;
    }
    .clinic-name { font-size:26px; font-weight:900; color:#fff; letter-spacing:2px; }
    .clinic-tagline { font-size:10px; color:#d0eeff; margin-top:2px; letter-spacing:1px; }
    .green-bar { background:#ACCF37; height:6px; }
    .doc-meta {
      padding:14px 40px 8px;
      display:flex;
      justify-content:space-between;
    }
    .doc-date { font-size:12px; color:#333; font-weight:700; }
    .divider { height:1px; background:#e0e0e0; margin:0 40px; }
    .subject-heading {
      text-align:center;
      font-size:16px;
      font-weight:900;
      color:#1a1a1a;
      letter-spacing:2px;
      padding:18px 40px 30px;
    }
    .body-text { padding:0 40px; font-size:13px; color:#222; line-height:1.8; }
    .patient-name-inline { font-weight:900; color:#298FCA; }
    .subject-inline { font-weight:900; color:#1a1a1a; text-transform:uppercase; }
    .medicine-section { margin:18px 40px; border:1px solid #e0e0e0; border-radius:8px; overflow:hidden; }
    .medicine-header { background:#f8fafc; padding:8px 12px; font-size:11px; font-weight:800; color:#298FCA; text-transform:uppercase; letter-spacing:1px; border-bottom:1px solid #e0e0e0; }
    .medicine-table { width:100%; border-collapse:collapse; }
    .payment-text { padding:6px 40px 0; font-size:12.5px; color:#222; line-height:1.7; }
    .footer-bar {
      background:linear-gradient(135deg,#298FCA 0%,#1a6fa0 100%);
      padding:12px 40px;
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      display:flex;
      justify-content:space-between;
      align-items:center;
    }
    .footer-text { font-size:10px; color:#d0eeff; }
    .footer-phone { font-size:11px; color:#fff; font-weight:800; }
    .seal-area { text-align:center; padding:30px 40px 0; font-size:10px; color:#555; }
    .note { padding:4px 40px 0; font-size:12px; color:#555; font-style:italic; }
  </style>
</head>
<body>
<div class="page">
  <div class="header-bar">
    <div>
      <div class="clinic-name">SPIRITUAL</div>
      <div class="clinic-tagline">WWW.SPIRITUALHOMEO.COM</div>
    </div>
    <div style="display: flex; align-items: center; justify-content: center;">
      <img src="data:image/png;base64,${APP_ICON_BASE64}" style="height: 45px; width: 45px; border-radius: 8px;" />
    </div>
  </div>
  <div class="green-bar"></div>
  <div class="doc-meta">
    <div class="doc-date">DATE: ${data.formDate || new Date().toLocaleDateString('en-GB')}</div>
    <div style="font-size:11px; color:#298FCA; font-weight:700;">support@spiritualhomeo.com</div>
  </div>
  <div class="divider"></div>
  <div class="subject-heading">TO WHOM SO EVER IT MAY CONCERN</div>
  <div class="body-text">
    <p>
      THIS IS TO CERTIFY THAT <span class="patient-name-inline">${genderTitle} ${(data.patientName || '').toUpperCase()}</span>
      AGED ABOUT <strong>${data.age || '__'} YEARS</strong>, HAS BEEN UNDER OUR TREATMENT AT
      <strong>SPIRITUAL HOMEOPATHY</strong> FOR THE MANAGEMENT OF
      <span class="subject-inline">${data.subject || '_______________'}</span>
    </p>
    <br/>
    <p>
      ${heShe} NEEDED TO TAKE HOMEOPATHY MEDICINE FOR <strong>${data.duration || '3'} MONTHS</strong>.
      WE RECOMMENDED THAT ${genderTitle} ${(data.patientName || '').toUpperCase()} CONTINUES TO FOLLOW THE PRESCRIBED MEDICATIONS.
    </p>
  </div>
  ${!data.hideMedicines && data.medicines && data.medicines.length > 0 ? `
  <div class="medicine-section">
    <div class="medicine-header">Prescribed Medicines</div>
    <table class="medicine-table">${medicineRows}</table>
  </div>` : ''}
  ${data.amountPaid ? `<div class="payment-text">
    <p>${genderTitle} ${(data.patientName || '').toUpperCase()} HAS PAID <strong>RS.${data.amountPaid}/-</strong> FOR <strong>${data.duration || '3'} MONTHS</strong> CONSULTATION AND MEDICATIONS.</p>
  </div>` : ''}
  ${data.additionalNote ? `<div class="note"><em>Note: ${data.additionalNote}</em></div>` : ''}
  <div class="seal-area"><br/><br/>
    <p style="font-size:11px; color:#555; font-style:italic; text-align:center;">This is a computer-generated document and does not require a physical signature.</p>
    <p style="margin-top:4px; font-size:9px; text-align:center;">Spiritual Homeopathy · ${data.branchName || ''}</p>
  </div>
  <div class="footer-bar">
    <div>
      <div class="footer-phone">☎ 9030 176 176</div>
      <div class="footer-text">support@spiritualhomeo.com</div>
    </div>
    <div style="text-align:right;">
      <div style="color:#ACCF37; font-weight:800; font-size:10px;">KPHB, Hyderabad, TS</div>
      <div class="footer-text">www.spiritualhomeo.com</div>
    </div>
  </div>
</div>
</body>
</html>`;
  };

  const handleDownload = async (form) => {
    setDownloading(true);
    try {
      const html = generateHtml(form);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Medicine Form – ${form.patientName}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Saved', `PDF saved to: ${uri}`);
      }
    } catch (err) {
      console.error('Download error:', err);
      const errMsg = err?.message || String(err);
      if (
        errMsg.toLowerCase().includes('cancel') ||
        errMsg.toLowerCase().includes('reject') ||
        errMsg.toLowerCase().includes('dismiss') ||
        errMsg.toLowerCase().includes('processing')
      ) {
        return;
      }
      Alert.alert('Error', 'Could not generate PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={24} color="#1e293b" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Medicine Form</Text>
          <View style={{ width: 40 }} />
        </View>
        <ActivityIndicator color={COLORS.secondary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (forms.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={24} color="#1e293b" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Medicine Form</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconBg}>
            <AlertCircle size={40} color="#94a3b8" />
          </View>
          <Text style={styles.emptyTitle}>No Forms Ready Yet</Text>
          <Text style={styles.emptySub}>
            Your medicine form is being prepared by our reception team.
            You'll receive a notification once it's ready.
          </Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={fetchForms}>
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const form = selectedForm || forms[0];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Medicine Form</Text>
        <TouchableOpacity
          style={styles.downloadHeaderBtn}
          onPress={() => handleDownload(form)}
          disabled={downloading}
        >
          {downloading ? (
            <ActivityIndicator size={18} color={COLORS.secondary} />
          ) : (
            <Download size={20} color={COLORS.secondary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Form selector tabs if multiple */}
      {forms.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.formTabsRow}>
          {forms.map((f, i) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.formTab, selectedForm?.id === f.id && styles.formTabActive]}
              onPress={() => setSelectedForm(f)}
            >
              <Text style={[styles.formTabText, selectedForm?.id === f.id && styles.formTabTextActive]}>
                Form {i + 1} · {formatDate(f.createdAt)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* LETTERHEAD CARD */}
        <Surface style={styles.letterCard}>
          {/* Clinic header */}
          <View style={styles.clinicHeader}>
            <View>
              <Text style={styles.clinicName}>SPIRITUAL</Text>
              <Text style={styles.clinicWeb}>www.spiritualhomeo.com</Text>
            </View>
            <Text style={styles.clinicSub}>HOMEOPATHY</Text>
          </View>
          <View style={styles.greenStripe} />

          <View style={styles.letterMeta}>
            <Text style={styles.letterDate}>DATE: {form.formDate || formatDate(form.createdAt)}</Text>
          </View>
          <View style={styles.divider} />

          <Text style={styles.toWhom}>TO WHOM SO EVER IT MAY CONCERN</Text>
          <View style={styles.divider} />

          {/* Certificate text */}
          <View style={styles.certBody}>
            <Text style={styles.certText}>
              THIS IS TO CERTIFY THAT{' '}
              <Text style={styles.certHighlight}>
                {form.gender || 'Mr.'} {(form.patientName || '').toUpperCase()}
              </Text>
              {' '}AGED ABOUT{' '}
              <Text style={styles.certBold}>{form.age || '__'} YEARS</Text>
              , HAS BEEN UNDER OUR TREATMENT AT SPIRITUAL HOMEOPATHY FOR THE MANAGEMENT OF{' '}
              <Text style={styles.certBold}>{(form.subject || '_______________').toUpperCase()}</Text>
            </Text>

            <Text style={[styles.certText, { marginTop: 10 }]}>
              {(form.gender === 'Mrs.' || form.gender === 'Ms.') ? 'SHE' : 'HE'} NEEDED TO TAKE
              HOMEOPATHY MEDICINE FOR{' '}
              <Text style={styles.certBold}>{form.duration || '3'} MONTHS</Text>
              . WE RECOMMENDED THAT {form.gender || 'Mr.'}{' '}
              {(form.patientName || '').toUpperCase()} CONTINUES TO FOLLOW THE PRESCRIBED MEDICATIONS.
            </Text>
          </View>
        </Surface>

        {/* MEDICINES TABLE */}
        {!form.hideMedicines && form.medicines && form.medicines.length > 0 ? (
          <Surface style={styles.medicineCard}>
            <View style={styles.medCardHeader}>
              <Pill size={16} color={COLORS.secondary} />
              <Text style={styles.medCardTitle}>Prescribed Medicines</Text>
            </View>
            {(form.medicines || []).map((med, idx) => (
              <View key={idx} style={styles.medRow}>
                <View style={styles.medNumBadge}>
                  <Text style={styles.medNumText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.medName}>{med.name}</Text>
                  <Text style={styles.medTiming}>— {med.timing}</Text>
                </View>
              </View>
            ))}
          </Surface>
        ) : null}

        {/* PAYMENT SECTION */}
        {form.amountPaid ? (
          <Surface style={styles.paymentCard}>
            <Text style={styles.paymentText}>
              <Text style={styles.certHighlight}>{form.gender || 'Mr.'} {(form.patientName || '').toUpperCase()}</Text>
              {' '}HAS PAID{' '}
              <Text style={styles.certBold}>RS. {form.amountPaid}/-</Text>
              {' '}FOR{' '}
              <Text style={styles.certBold}>{form.duration || '3'} MONTHS</Text>
              {' '}CONSULTATION AND MEDICATIONS.
            </Text>
          </Surface>
        ) : null}

        {/* ADDITIONAL NOTE */}
        {form.additionalNote ? (
          <Surface style={styles.noteCard}>
            <Text style={styles.noteLabel}>Additional Note</Text>
            <Text style={styles.noteText}>{form.additionalNote}</Text>
          </Surface>
        ) : null}

        {/* PREPARED BY */}
        <Surface style={styles.preparedCard}>
          <View style={styles.prepRow}>
            <CheckCircle2 size={16} color={COLORS.success} />
            <Text style={styles.prepText}>
              Prepared by <Text style={{ fontWeight: '800' }}>{form.preparedBy || 'Reception'}</Text>
              {form.branchName ? ` · ${form.branchName}` : ''}
            </Text>
          </View>
          <View style={styles.prepRow}>
            <Clock size={14} color={COLORS.muted} />
            <Text style={styles.prepDate}>{formatDate(form.createdAt)}</Text>
          </View>
        </Surface>

        {/* FOOTER STRIP */}
        <View style={styles.clinicFooter}>
          <Text style={styles.footerPhone}>☎ 9030 176 176</Text>
          <Text style={styles.footerEmail}>support@spiritualhomeo.com</Text>
          <Text style={styles.footerAddr}>KPHB, Hyderabad, TS</Text>
        </View>

        {/* Download Button */}
        <TouchableOpacity
          style={styles.downloadBtn}
          onPress={() => handleDownload(form)}
          disabled={downloading}
        >
          {downloading ? (
            <ActivityIndicator size={20} color="#fff" />
          ) : (
            <Download size={20} color="#fff" />
          )}
          <Text style={styles.downloadBtnText}>
            {downloading ? 'Generating PDF...' : 'Download as PDF'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  downloadHeaderBtn: { padding: 8 },

  formTabsRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  formTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  formTabActive: { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  formTabText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  formTabTextActive: { color: '#fff' },

  scroll: { padding: 14 },

  // Letterhead card
  letterCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#298FCA',
  },
  clinicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#298FCA',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  clinicName: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: 2 },
  clinicWeb: { fontSize: 9, color: '#c8e8ff', marginTop: 2 },
  clinicSub: { fontSize: 16, fontWeight: '900', color: '#ACCF37', letterSpacing: 2 },
  greenStripe: { height: 5, backgroundColor: '#ACCF37' },
  letterMeta: { padding: 12, paddingBottom: 8 },
  letterDate: { fontSize: 12, fontWeight: '700', color: '#333' },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginHorizontal: 14 },
  toWhom: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '900',
    color: '#1a1a1a',
    letterSpacing: 1.5,
    paddingVertical: 14,
  },
  certBody: { padding: 14, paddingTop: 12 },
  certText: { fontSize: 13, color: '#333', lineHeight: 20 },
  certHighlight: { fontWeight: '900', color: '#298FCA' },
  certBold: { fontWeight: '800', color: '#1a1a1a' },

  // Medicine card
  medicineCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    borderLeftWidth: 3,
    borderLeftColor: '#298FCA',
  },
  medCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  medCardTitle: { fontSize: 13, fontWeight: '800', color: '#1e293b' },
  medRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  medNumBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  medNumText: { fontSize: 11, fontWeight: '800', color: COLORS.secondary },
  medName: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  medTiming: { fontSize: 12, color: '#64748b', fontWeight: '500', marginTop: 2 },

  // Payment card
  paymentCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    borderLeftWidth: 3,
    borderLeftColor: '#ACCF37',
  },
  paymentText: { fontSize: 13, color: '#333', lineHeight: 20 },

  // Note card
  noteCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  noteLabel: { fontSize: 10, fontWeight: '800', color: '#d97706', textTransform: 'uppercase', marginBottom: 4 },
  noteText: { fontSize: 13, color: '#92400e', fontStyle: 'italic', lineHeight: 18 },

  // Prepared by card
  preparedCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    gap: 4,
  },
  prepRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prepText: { fontSize: 12, color: '#15803d', fontWeight: '500' },
  prepDate: { fontSize: 11, color: '#64748b', fontWeight: '500' },

  // Clinic footer
  clinicFooter: {
    backgroundColor: '#298FCA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    alignItems: 'center',
    gap: 4,
  },
  footerPhone: { fontSize: 14, fontWeight: '900', color: '#fff' },
  footerEmail: { fontSize: 11, color: '#d0eeff' },
  footerAddr: { fontSize: 11, color: '#ACCF37', fontWeight: '700' },

  // Download button
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.secondary,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 6,
    elevation: 3,
  },
  downloadBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  emptySub: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  refreshBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
  },
  refreshBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

export default MedicineFormView;
