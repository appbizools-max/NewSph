import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, StyleSheet, FlatList, TouchableOpacity, Image, Modal, ScrollView, RefreshControl, Clipboard, Alert, NativeModules } from 'react-native';
import { Text, Surface, ActivityIndicator, Badge, Avatar, Button } from 'react-native-paper';
import { COLORS } from '../constants/theme';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, increment, addDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import * as LucideIcons from 'lucide-react-native';
const CalendarIcon = LucideIcons.Calendar || LucideIcons.CalendarClock;
const MapPin = LucideIcons.MapPin;
const ChevronRight = LucideIcons.ChevronRight;
const Clock = LucideIcons.Clock;
const Filter = LucideIcons.Filter;
const ArrowLeft = LucideIcons.ArrowLeft;
const CalendarDays = LucideIcons.CalendarDays || LucideIcons.Calendar;
const User = LucideIcons.User;
const X = LucideIcons.X;
const FileText = LucideIcons.FileText;
const CheckCircle2 = LucideIcons.CheckCircle2 || LucideIcons.CheckCircle;
const DollarSign = LucideIcons.DollarSign || LucideIcons.Coins;
const AlertCircle = LucideIcons.AlertCircle;
const Eye = LucideIcons.Eye;
const ShieldCheck = LucideIcons.ShieldCheck || LucideIcons.Check;
const Download = LucideIcons.Download;
const Phone = LucideIcons.Phone;
const Pill = LucideIcons.Pill || LucideIcons.Activity || LucideIcons.FileText;
import { SafeAreaView } from 'react-native-safe-area-context';
import RazorpayCheckout from 'react-native-razorpay';
import { schedulePaymentSuccessNotification, scheduleSplitPaymentSuccessNotification, notifyReceptionistsOfPayment } from '../utils/notificationHelper';
import { isPaymentRequestWithin24Hours } from '../utils/paymentHelper';
import { sendCancellationSMS, sendPaymentReceiptSMS } from '../utils/smsHelper';
import { sendCancellationWhatsAppNotification, sendPaymentReceiptWhatsAppNotification } from '../utils/whatsappHelper';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
const APP_ICON_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAARkAAAEZCAIAAAAscsZAAAAACXBIWXMAABJ0AAASdAHeZh94AAAFXGlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSfvu78nIGlkPSdXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQnPz4KPHg6eG1wbWV0YSB4bWxuczp4PSdhZG9iZTpuczptZXRhLyc+CjxyZGY6UkRGIHhtbG5zOnJkZj0naHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyc+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczpBdHRyaWI9J2h0dHA6Ly9ucy5hdHRyaWJ1dGlvbi5jb20vYWRzLzEuMC8nPgogIDxBdHRyaWI6QWRzPgogICA8cmRmOlNlcT4KICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0nUmVzb3VyY2UnPgogICAgIDxBdHRyaWI6Q3JlYXRlZD4yMDI2LTA1LTMxPC9BdHRyaWI6Q3JlYXRlZD4KICAgICA8QXR0cmliOkRhdGE+eyZxdW90O2RvYyZxdW90OzomcXVvdDtEQUhGYUk0MkVhcyZxdW90OywmcXVvdDt1c2VyJnF1b3Q7OiZxdW90O1VBRkhvNTkwX0xVJnF1b3Q7LCZxdW90O2JyYW5kJnF1b3Q7OiZxdW90O0plZXZhbiBSZWRkeSZxdW90O308L0F0dHJpYjpEYXRhPgogICAgIDxBdHRyaWI6RXh0SWQ+ZDg4ZDIxNGUtOWFlYi00YWQ0LWI2ZGQtYjVhMTE5YWVkNmUwPC9BdHRyaWI6RXh0SWQ+CiAgICAgPEF0dHJpYjpGYklkPjUyNTI2NTkxNDE3OTU4MDwvQXR0cmliOkZiSWQ+CiAgICAgPEF0dHJpYjpUb3VjaFR5cGU+MjwvQXR0cmliOlRvdWNoVHlwZT4KICAgIDwvcmRmOmxpPgogICA8L3JkZjpTZXE+CiAgPC9BdHRyaWI6QWRzPgogPC9yZGY6RGVzY3JpcHRpb24+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczpkYz0naHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8nPgogIDxkYzp0aXRsZT4KICAgPHJkZjpBbHQ+CiAgICA8cmRmOmxpIHhtbDpsYW5nPSd4LWRlZmF1bHQnPkxvY2FsTmVlZHMgJmFtcDtKb2JzIC0gMTA8L3JkZjpsaT4KICAgPC9yZGY6QWx0PgogIDwvZGM6dGl0bGU+CiA8L3JkZjpEZXNjcmlwdGlvbj4KCiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0nJwogIHhtbG5zOnBkZj0naHR0cDovL25zLmFkb2JlLmNvbS9wZGYvMS4zLyc+CiAgPHBkZjpBdXRob3I+UHJlZXRoYW0gcmFtIEF2YWxhPC9wZGY6QXV0aG9yPgogPC9yZGY6RGVzY3JpcHRpb24+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczp4bXA9J2h0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8nPgogIDx4bXA6Q3JlYXRvclRvb2w+Q2FudmEgKFJlbmRlcmVyKSBkb2M9REFIRmFJNDJFYXMgdXNlcj1VQUZIbzU5MF9MVSBicmFuZD1KZWV2YW4gUmVkZHk8L3htcDpDcmVhdG9yVG9vbD4KIDwvcmRmOkRlc2NyaXB0aW9uPgo8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSdyJz8+WkY3+QAAAE5lWElmTU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAAITAAMAAAABAAEAAAAAAAAAAAB4AAAAAQAAAHgAAAAByZF2EwAAI0FJREFUeJzt3Xl8FPX9P/DPzOx9Z3dzbO47IYQI4UY5FDxQOby1B62VVq3fb+vXtvpr1fqVeqDWVmtti7RaChUpXhSUinILcsmRkJBArs197ZG9d2dn5vsH/CiFQDKzn83uzr6fD/6APPjMvAN57cx85nMQHMchAEDEyFyXgIBIQJYAwAOyBAAekCUA8IAsAYAHZAkAPCBLAOABWQIAD8gSAHhAlgDAA7IEAB6QJQDwgCwBgAdkCQA8IEsA4AFZAgAPyBIAeECWAMADsgQAHpAlAPCALAGAB2QJADwgSwDgAVkCAA/IEgB4QJYAwAOyBAAekCUA8IAsAYAHZAkAPCBLAOABWQIAD8gSAHhAlgDAA7IEAB6QJQDwgCwBgAdkCQA8IEsA4AFZAgAPyBIAeECWAMADsgQAHpAlAPCALAGAB2QJADwgSwDgAVkCAA/IEgB4QJYAwAOyBAAekCUA8IAsAYAHZAkAPCBLAOABWQIAD8gSAHhAlgDAA7IEAB6QJQDwgCwBgAdkCQA8IEsA4AFZAgAPyBIAeECWAMADsgQAHpAlAPCALAGAB2QJADwgSwDgAVkCAA/IEgB4QJYAwAOyBAAekCUA8IAsAYAHZAkAPCBLAOABWQIAj/8Dby64yJO0J5oAAAAASUVORK5CYII=';
const MyAppointments = ({ navigation, route }) => {
  const { user, userData } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Upcoming');
  const [refreshing, setRefreshing] = useState(false);

  // Medicine request states
  const [medRequestLoading, setMedRequestLoading] = useState({});
  const [medRequestSent, setMedRequestSent] = useState({});
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [apptForPayment, setApptForPayment] = useState(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentSuccessData, setPaymentSuccessData] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [apptToCancel, setApptToCancel] = useState(null);

  const generateReceiptHtml = (appt, payData) => {
    const isSplit = appt.paymentMethod === 'split';
    const splitCounterMethod = appt.splitCounterMethod || 'cash';
    const splitCounterAmount = Number(appt.splitCounterAmount) || 0;
    const requestedAmount = Number(appt.requestedAmount) || Number(payData?.amount) || 600;
    const totalAmount = isSplit ? (requestedAmount + splitCounterAmount) : requestedAmount;

    let paymentBreakdownRows = '';
    if (isSplit) {
      paymentBreakdownRows = `
        <tr>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#475569; font-weight:bold;">Counter Collection (${splitCounterMethod.toUpperCase()})</td>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#1e293b; text-align:right; font-weight:700;">₹${splitCounterAmount.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#475569; font-weight:bold;">App Payment (UPI)</td>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#1e293b; text-align:right; font-weight:700;">₹${requestedAmount.toFixed(2)}</td>
        </tr>
      `;
    } else {
      paymentBreakdownRows = `
        <tr>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#475569; font-weight:bold;">Online Payment (UPI/Card)</td>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#1e293b; text-align:right; font-weight:700;">₹${totalAmount.toFixed(2)}</td>
        </tr>
      `;
    }
    const patientName = userData?.fullName || appt.patientName || appt.fullName || 'Patient';
    const cleanPhone = (userData?.phone || appt.phone || appt.patientPhone || '').replace(/\D/g, '').slice(-10);
    const transactionId = payData?.paymentId || appt.paymentId || 'TXN_MOCK_' + Math.random().toString(36).substring(2, 10).toUpperCase();
    const paidAt = appt.paymentCollectedAt ? new Date(appt.paymentCollectedAt).toLocaleString('en-GB') : new Date().toLocaleString('en-GB');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; background:#fff; padding: 20px; }
    .receipt-container {
      width:520px;
      margin:0 auto;
      border:2px solid #298FCA;
      border-radius:12px;
      padding: 24px;
      position: relative;
    }
    .header {
      display:flex;
      justify-content:space-between;
      align-items:center;
      border-bottom:3px solid #298FCA;
      padding-bottom:14px;
    }
    .clinic-logo-text { font-size:24px; font-weight:900; color:#298FCA; letter-spacing:1px; }
    .clinic-tagline { font-size:9px; color:#64748b; margin-top:2px; letter-spacing:1px; font-weight:700; }
    .receipt-title {
      text-align:center;
      font-size:18px;
      font-weight:900;
      color:#1e293b;
      letter-spacing:2px;
      margin: 15px 0;
      text-transform: uppercase;
    }
    .meta-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
      background: #f8fafc;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .meta-col { flex: 1; }
    .meta-label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 800; }
    .meta-value { font-size: 12px; color: #1e293b; font-weight: 700; margin-top: 2px; }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
    }
    .details-table th {
      background: #298FCA;
      color: #fff;
      text-align: left;
      padding: 10px;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .details-table td {
      padding: 12px 10px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 13px;
    }
    .amount-box {
      background: #f0fdf4;
      border: 1.5px dashed #22c55e;
      border-radius: 8px;
      padding: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 25px;
    }
    .amount-title { font-size: 14px; font-weight: 800; color: #166534; }
    .amount-val { font-size: 18px; font-weight: 900; color: #166534; }
    .paid-stamp {
      border: 3px solid #22c55e;
      color: #22c55e;
      font-size: 14px;
      font-weight: 900;
      padding: 4px 10px;
      border-radius: 4px;
      text-transform: uppercase;
      transform: rotate(-5deg);
      display: inline-block;
    }
    .footer {
      border-top: 2px solid #e2e8f0;
      padding-top: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer-left { font-size: 10px; color: #64748b; line-height: 1.5; }
    .footer-right { text-align: right; font-size: 10px; color: #64748b; line-height: 1.5; }
    .branch-highlight { color: #298FCA; font-weight: 800; }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="header">
      <div style="display: flex; align-items: center; gap: 12px;">
        <img src="data:image/png;base64,${APP_ICON_BASE64}" style="height: 50px; width: auto; border-radius: 6px;" />
        <div class="clinic-logo-text" style="font-size: 20px;">SPIRITUAL HOMEOPATHY</div>
      </div>
      <div style="text-align: right;">
        <div class="clinic-tagline">WWW.SPIRITUALHOMEO.COM</div>
      </div>
    </div>
    <div class="receipt-title">Payment Receipt</div>
    
    <div class="meta-section">
      <div class="meta-col">
        <div class="meta-label">Patient Name</div>
        <div class="meta-value">${patientName}</div>
        <div style="font-size: 11px; color:#475569; margin-top: 2px;">+91 ${cleanPhone}</div>
      </div>
      <div class="meta-col" style="text-align: right;">
        <div class="meta-label">Receipt Date</div>
        <div class="meta-value">${new Date().toLocaleDateString('en-GB')}</div>
        <div style="font-size: 11px; color:#475569; margin-top: 2px;">TXN: ${transactionId}</div>
      </div>
    </div>

    <table class="details-table">
      <thead>
        <tr>
          <th>Consultation Details</th>
          <th style="text-align: right;">Information</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="font-weight: 700; color: #1e293b;">Doctor Name</td>
          <td style="text-align: right; color: #475569;">Dr. ${appt.doctorName}</td>
        </tr>
        <tr>
          <td style="font-weight: 700; color: #1e293b;">Diseases</td>
          <td style="text-align: right; color: #475569;">${appt.specialty || 'General Homeopathy'}</td>
        </tr>
        <tr>
          <td style="font-weight: 700; color: #1e293b;">Appointment Schedule</td>
          <td style="text-align: right; color: #475569;">${appt.formattedDate || appt.date || ''} at ${appt.timeSlot}</td>
        </tr>
        <tr>
          <td style="font-weight: 700; color: #1e293b;">Payment Method</td>
          <td style="text-align: right; color: #475569; text-transform: uppercase;">${appt.paymentMethod || 'online'}</td>
        </tr>
        ${paymentBreakdownRows}
        <tr>
          <td style="font-weight: 700; color: #1e293b;">Transaction Timestamp</td>
          <td style="text-align: right; color: #475569;">${paidAt}</td>
        </tr>
      </tbody>
    </table>

    <div class="amount-box">
      <div>
        <div class="paid-stamp">PAID ✓</div>
      </div>
      <div style="text-align: right;">
        <div class="amount-title">Total Amount Paid</div>
        <div class="amount-val">₹${totalAmount.toFixed(2)}</div>
      </div>
    </div>

    <div class="footer">
      <div class="footer-left">
        <div>☎ <span style="font-weight: 800; color: #1e293b;">9030 176 176</span></div>
        <div>✉ support@spiritualhomeo.com</div>
      </div>
      <div class="footer-right">
        <div>Branch: <span class="branch-highlight">${appt.branchName || 'KPHB'}</span></div>
        <div>www.spiritualhomeo.com</div>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  };

  const handleShareInvoicePDF = async (appt, payData) => {
    try {
      const html = generateReceiptHtml(appt, payData);
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Consultation Receipt – ${userData?.fullName || appt.patientName || 'Patient'}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Saved', `Receipt PDF saved to: ${uri}`);
      }
    } catch (err) {
      console.error('Invoice generation error:', err);
      const errMsg = err?.message || String(err);
      if (
        errMsg.toLowerCase().includes('cancel') ||
        errMsg.toLowerCase().includes('reject') ||
        errMsg.toLowerCase().includes('dismiss') ||
        errMsg.toLowerCase().includes('processing')
      ) {
        return;
      }
      Alert.alert('PDF Error', 'Failed to generate and share payment receipt PDF.');
    }
  };

  const handleOpenAppPaySheet = (appt) => {
    setApptForPayment(appt);
    setPaymentSuccessData(null);
    setPayModalVisible(true);
  };

  const handleSimulatePaymentSuccess = async (appt) => {
    setProcessingPayment(true);
    try {
      const apptId = appt.id;
      const requestedAmount = Number(appt.requestedAmount) || 600;
      const paymentId = 'pay_MOCK' + Math.random().toString(36).substring(2, 12).toUpperCase();
      const isSplit = appt.paymentMethod === 'split';
      const splitCounterMethod = appt.splitCounterMethod || 'cash';
      const splitCounterAmount = Number(appt.splitCounterAmount) || 0;
      const totalPaidAmount = isSplit ? (requestedAmount + splitCounterAmount) : requestedAmount;

      // Calculate reward points (2 points per ₹100)
      const pointsEarned = Math.floor(totalPaidAmount / 100) * 2;
      const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
      const generatedCouponCode = `SPH-${randomHex}`;

      // 1. Update Firestore appointment + clear payment request banner
      const collectionName = 'allpatients';
      const docRef = doc(db, collectionName, apptId);

      const updatePayload = {
        paymentStatus: 'paid',
        amountPaid: totalPaidAmount,
        paymentMethod: isSplit ? 'split' : 'online',
        paymentCollectedAt: new Date().toISOString(),
        paymentId: paymentId,
        paymentRequested: false,
        paymentRequestedAt: null,
        itemsPaid: appt.itemsPaid || {
          consultation: (appt.itemsPaid?.medicine > 0) ? 0 : totalPaidAmount,
          medicine: (appt.itemsPaid?.medicine > 0) ? totalPaidAmount : 0
        },
        ...(isSplit ? {
          paymentSplitDetails: {
            [splitCounterMethod]: splitCounterAmount,
            'upi': requestedAmount
          }
        } : {})
      };
      await updateDoc(docRef, updatePayload);

      // Trigger local notification confirming success
      try {
        if (isSplit) {
          await scheduleSplitPaymentSuccessNotification(appt.doctorName, totalPaidAmount, splitCounterAmount, splitCounterMethod, requestedAmount);
        } else {
          await schedulePaymentSuccessNotification(appt.doctorName, requestedAmount);
        }
      } catch (notifErr) {
        console.warn("Error scheduling payment success notification:", notifErr);
      }

      // Notify receptionists of that branch about the payment
      try {
        const patientName = userData?.fullName || appt.patientName || 'Patient';
        await notifyReceptionistsOfPayment(
          db,
          appt.branchName || 'Clinic Branch',
          patientName,
          totalPaidAmount,
          appt.doctorName || 'General Doctor',
          apptId
        );
      } catch (err) {
        console.error("Error triggering receptionist payment notification:", err);
      }

      // 2. Log transaction in Firestore (alltransactions collection only)
      await addDoc(collection(db, 'alltransactions'), {
        type: (appt.itemsPaid?.medicine > 0) ? 'medicine' : 'consultation',
        patientId: user.uid,
        patientName: userData?.fullName || appt.patientName || 'Patient',
        amount: requestedAmount,
        method: 'online_razorpay',
        paymentId: paymentId,
        appointmentId: apptId,
        doctor: appt.doctorName || 'General Doctor',
        branchId: appt.branchId || '',
        branchName: appt.branchName || 'Clinic Branch',
        recordedBy: 'Patient App (Simulated)',
        itemsPaid: appt.itemsPaid || {
          consultation: (appt.itemsPaid?.medicine > 0) ? 0 : totalPaidAmount,
          medicine: (appt.itemsPaid?.medicine > 0) ? totalPaidAmount : 0
        },
        timestamp: serverTimestamp()
      });

      // 3. Sync completed consultation fee paid visit to global patients collection for Admin Web revenue reports
      try {
        const cleanPhone = (appt.phone || userData?.phone || user.phoneNumber || '').replace(/\D/g, '').slice(-10);
        const apptDate = appt.appointmentDate || (appt.date ? new Date(appt.date).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'));

        await addDoc(collection(db, 'allpatients'), {
          fullName: userData?.fullName || appt.patientName || 'Online Patient',
          phone: cleanPhone,
          email: user.email || userData?.email || appt.email || '',
          registrationId: appt.regId || 'ONLINE',
          doctor: appt.doctorName || 'General Doctor',
          subject: appt.specialty || appt.subject || 'Online Appointment Consultation',
          appointmentDate: apptDate,
          paymentStatus: 'paid',
          paymentAmount: totalPaidAmount,
          paymentMethod: isSplit ? 'split' : 'online',
          paymentCollectedAt: new Date().toISOString(),
          branchId: appt.branchId || 'Unknown',
          branchName: appt.branchName || 'Unknown',
          source: 'UserApp',
          bookingSource: 'Patient App',
          isAppBooking: true,
          _type: 'online',
          createdAt: new Date().toISOString(),
          itemsPaid: appt.itemsPaid || {
            consultation: (appt.itemsPaid?.medicine > 0) ? 0 : totalPaidAmount,
            medicine: (appt.itemsPaid?.medicine > 0) ? totalPaidAmount : 0
          },
          ...(isSplit ? {
            paymentSplitDetails: {
              [splitCounterMethod]: splitCounterAmount,
              'upi': requestedAmount
            }
          } : {})
        });
      } catch (syncErr) {
        console.error("Error syncing paid visit to patients collection:", syncErr);
      }

      // 4. Send permanent receipt notification to patient
      try {
        const splitMsgBody = isSplit
          ? `Your consultation payment of ₹${totalPaidAmount} is complete: Paid ₹${splitCounterAmount} via ${splitCounterMethod.toUpperCase()} at counter and ₹${requestedAmount} via UPI.`
          : `Your consultation fee of ₹${requestedAmount} has been paid successfully via UPI.`;

        await addDoc(collection(db, 'notifications'), {
          userId: user.uid,
          title: '💳 Payment Completed',
          body: splitMsgBody,
          type: 'payment_receipt',
          isRead: false,
          createdAt: serverTimestamp()
        });
      } catch (notifErr) {
        console.error("Error sending permanent payment receipt notification:", notifErr);
      }

      // 4b. Send SMS and WhatsApp payment receipt to patient
      try {
        const cleanPhone = (appt.phone || userData?.phone || user.phoneNumber || '').replace(/\D/g, '').slice(-10);
        const pName = userData?.fullName || appt.patientName || 'Patient';
        const apptDate = appt.appointmentDate || (appt.date ? new Date(appt.date).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'));
        const branchName = appt.branchName || 'KPHB';

        if (cleanPhone) {
          sendPaymentReceiptSMS(
            cleanPhone,
            pName,
            totalPaidAmount,
            paymentId,
            apptDate,
            branchName
          );
          sendPaymentReceiptWhatsAppNotification({
            patientName: pName,
            phone: cleanPhone,
            receiptNo: paymentId,
            totalPaid: totalPaidAmount,
            branch: branchName
          });
        }
      } catch (receiptMsgErr) {
        console.warn("Error sending SMS/WhatsApp payment receipt:", receiptMsgErr);
      }

      // 5. Award Reward Points & Coupon (patient app ONLY)
      if (pointsEarned > 0) {
        const userRef = doc(db, 'patients', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            fullName: userData?.fullName || appt.patientName || 'Patient',
            phone: userData?.phone || appt.phone || '',
            email: user.email || '',
            rewardPoints: pointsEarned,
            createdAt: new Date().toISOString()
          });
        } else {
          await updateDoc(userRef, {
            rewardPoints: increment(pointsEarned)
          });
        }

        await addDoc(collection(db, 'reward_points_transactions'), {
          userId: user.uid,
          patientName: userData?.fullName || appt.patientName || 'Patient',
          type: 'earn',
          points: pointsEarned,
          description: `Earned ${pointsEarned} points for paying consultation fee for Dr. ${appt.doctorName}`,
          createdAt: serverTimestamp()
        });

        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 3);
        const expiryDateStr = expiryDate.toISOString().split('T')[0];

        await addDoc(collection(db, 'coupons'), {
          code: generatedCouponCode,
          userId: user.uid,
          patientName: userData?.fullName || appt.patientName || 'Patient',
          patientPhone: userData?.phone || appt.phone || '',
          pointsValue: pointsEarned,
          discountAmount: pointsEarned,
          status: 'active',
          createdAt: serverTimestamp(),
          expiryDate: expiryDate,
          expiryDateStr: expiryDateStr
        });
      }

      setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, paymentStatus: 'paid', paymentRequested: false, status: 'completed' } : a));

      // Show success screen in modal
      setPaymentSuccessData({
        couponCode: generatedCouponCode,
        points: pointsEarned,
        amount: totalPaidAmount
      });
      setProcessingPayment(false);
    } catch (e) {
      console.error('Error simulating payment completion:', e);
      Alert.alert('Simulation Error', 'Failed to complete mock payment. Please try again.');
      setProcessingPayment(false);
    }
  };

  const handleCompleteAppPayment = async () => {
    if (!apptForPayment) return;
    if (!NativeModules.RNRazorpayCheckout) {
      Alert.alert(
        'Sandbox Payment Fallback',
        'The native Razorpay module is missing (common in Expo Go). Would you like to simulate a successful payment for testing?',
        [
          { text: 'Cancel', onPress: () => setProcessingPayment(false), style: 'cancel' },
          { text: 'Simulate Payment', onPress: () => handleSimulatePaymentSuccess(apptForPayment) }
        ]
      );
      return;
    }
    setProcessingPayment(true);
    try {
      const apptId = apptForPayment.id;
      const requestedAmount = Number(apptForPayment.requestedAmount) || 600;

      const options = {
        description: `Consultation Fee - Dr. ${apptForPayment.doctorName}`,
        image: 'https://i.imgur.com/3g7A6tw.png',
        currency: 'INR',
        key: 'rzp_live_ThkaAZmhaOaMtn',
        amount: requestedAmount * 100, // in paise
        name: 'Spiritual Homeopathy Clinic',
        prefill: {
          email: user?.email || '',
          contact: userData?.phone || '',
          name: userData?.fullName || 'Patient'
        },
        theme: { color: '#0ea5e9' }
      };

      RazorpayCheckout.open(options).then(async (data) => {
        const paymentId = data.razorpay_payment_id;
        const isSplit = apptForPayment.paymentMethod === 'split';
        const splitCounterMethod = apptForPayment.splitCounterMethod || 'cash';
        const splitCounterAmount = Number(apptForPayment.splitCounterAmount) || 0;
        const totalPaidAmount = isSplit ? (requestedAmount + splitCounterAmount) : requestedAmount;

        // Calculate reward points (2 points per ₹100)
        const pointsEarned = Math.floor(totalPaidAmount / 100) * 2;
        const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
        const generatedCouponCode = `SPH-${randomHex}`;

        // 1. Update Firestore appointment + clear payment request banner
        const collectionName = 'allpatients';
        const docRef = doc(db, collectionName, apptId);

        const updatePayload = {
          paymentStatus: 'paid',
          amountPaid: totalPaidAmount,
          paymentMethod: isSplit ? 'split' : 'online',
          paymentCollectedAt: new Date().toISOString(),
          paymentId: paymentId,
          paymentRequested: false,
          paymentRequestedAt: null,
          status: 'done',
          itemsPaid: apptForPayment.itemsPaid || {
            consultation: (apptForPayment.itemsPaid?.medicine > 0) ? 0 : totalPaidAmount,
            medicine: (apptForPayment.itemsPaid?.medicine > 0) ? totalPaidAmount : 0
          },
          ...(isSplit ? {
            paymentSplitDetails: {
              [splitCounterMethod]: splitCounterAmount,
              'upi': requestedAmount
            }
          } : {})
        };
        await updateDoc(docRef, updatePayload);

        // Trigger local notification confirming success
        try {
          if (isSplit) {
            await scheduleSplitPaymentSuccessNotification(apptForPayment.doctorName, totalPaidAmount, splitCounterAmount, splitCounterMethod, requestedAmount);
          } else {
            await schedulePaymentSuccessNotification(apptForPayment.doctorName, requestedAmount);
          }
        } catch (notifErr) {
          console.warn("Error scheduling payment success notification:", notifErr);
        }

        // Notify receptionists of that branch about the payment
        try {
          const patientName = userData?.fullName || apptForPayment.patientName || 'Patient';
          await notifyReceptionistsOfPayment(
            db,
            apptForPayment.branchName || 'Clinic Branch',
            patientName,
            totalPaidAmount,
            apptForPayment.doctorName || 'General Doctor',
            apptId
          );
        } catch (err) {
          console.error("Error triggering receptionist payment notification:", err);
        }

        // 2. Log transaction in Firestore (alltransactions collection only)
        await addDoc(collection(db, 'alltransactions'), {
          type: (apptForPayment.itemsPaid?.medicine > 0) ? 'medicine' : 'consultation',
          patientId: user.uid,
          patientName: userData?.fullName || apptForPayment.patientName || 'Patient',
          amount: requestedAmount,
          method: 'online_razorpay',
          paymentId: paymentId,
          appointmentId: apptId,
          doctor: apptForPayment.doctorName || 'General Doctor',
          branchId: apptForPayment.branchId || '',
          branchName: apptForPayment.branchName || 'Clinic Branch',
          recordedBy: 'Patient App',
          itemsPaid: apptForPayment.itemsPaid || {
            consultation: (apptForPayment.itemsPaid?.medicine > 0) ? 0 : totalPaidAmount,
            medicine: (apptForPayment.itemsPaid?.medicine > 0) ? totalPaidAmount : 0
          },
          timestamp: serverTimestamp()
        });

        // 3. Sync completed consultation fee paid visit to global patients collection for Admin Web revenue reports
        try {
          const cleanPhone = String(apptForPayment.phone || userData?.phone || user.phoneNumber || '').replace(/\D/g, '').slice(-10);
          const apptDate = apptForPayment.appointmentDate || (apptForPayment.date ? new Date(apptForPayment.date).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'));

          await addDoc(collection(db, 'allpatients'), {
            fullName: userData?.fullName || apptForPayment.patientName || 'Online Patient',
            phone: cleanPhone,
            email: user.email || userData?.email || apptForPayment.email || '',
            registrationId: apptForPayment.regId || 'ONLINE',
            doctor: apptForPayment.doctorName || 'General Doctor',
            subject: apptForPayment.subject || 'Online Appointment Consultation',
            appointmentDate: apptDate,
            paymentStatus: 'paid',
            paymentAmount: totalPaidAmount,
            paymentMethod: isSplit ? 'split' : 'online',
            paymentCollectedAt: new Date().toISOString(),
            branchName: apptForPayment.branchName || 'Unknown',
            source: 'UserApp',
            bookingSource: 'Patient App',
            isAppBooking: true,
            _type: 'online',
            status: 'done',
            createdAt: new Date().toISOString(),
            itemsPaid: apptForPayment.itemsPaid || {
              consultation: (apptForPayment.itemsPaid?.medicine > 0) ? 0 : totalPaidAmount,
              medicine: (apptForPayment.itemsPaid?.medicine > 0) ? totalPaidAmount : 0
            },
            ...(isSplit ? {
              paymentSplitDetails: {
                [splitCounterMethod]: splitCounterAmount,
                'upi': requestedAmount
              }
            } : {})
          });
        } catch (syncErr) {
          console.error("Error syncing paid visit to patients collection:", syncErr);
        }

        // 4. Send permanent receipt notification to patient
        try {
          const splitMsgBody = isSplit
            ? `Your consultation payment of ₹${totalPaidAmount} is complete: Paid ₹${splitCounterAmount} via ${splitCounterMethod.toUpperCase()} at counter and ₹${requestedAmount} via UPI.`
            : `Your consultation fee of ₹${requestedAmount} has been paid successfully via UPI.`;

          await addDoc(collection(db, 'notifications'), {
            userId: user.uid,
            title: '💳 Payment Completed',
            body: splitMsgBody,
            type: 'payment_receipt',
            isRead: false,
            createdAt: serverTimestamp()
          });
        } catch (notifErr) {
          console.error("Error sending permanent payment receipt notification:", notifErr);
        }

        // 4b. Send SMS and WhatsApp payment receipt to patient
        try {
          const cleanPhone = String(apptForPayment.phone || userData?.phone || user.phoneNumber || '').replace(/\D/g, '').slice(-10);
          const pName = userData?.fullName || apptForPayment.patientName || 'Patient';
          const apptDate = apptForPayment.appointmentDate || (apptForPayment.date ? new Date(apptForPayment.date).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'));
          const branchName = apptForPayment.branchName || 'KPHB';

          if (cleanPhone) {
            sendPaymentReceiptSMS(
              cleanPhone,
              pName,
              totalPaidAmount,
              paymentId,
              apptDate,
              branchName
            );
            sendPaymentReceiptWhatsAppNotification({
              patientName: pName,
              phone: cleanPhone,
              receiptNo: paymentId,
              totalPaid: totalPaidAmount,
              branch: branchName
            });
          }
        } catch (receiptMsgErr) {
          console.warn("Error sending SMS/WhatsApp payment receipt:", receiptMsgErr);
        }

        // 5. Award Reward Points & Coupon (patient app ONLY)
        if (pointsEarned > 0) {
          const userRef = doc(db, 'patients', user.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              fullName: userData?.fullName || apptForPayment.patientName || 'Patient',
              phone: userData?.phone || apptForPayment.phone || '',
              email: user.email || '',
              rewardPoints: pointsEarned,
              createdAt: new Date().toISOString()
            });
          } else {
            await updateDoc(userRef, {
              rewardPoints: increment(pointsEarned)
            });
          }

          await addDoc(collection(db, 'reward_points_transactions'), {
            userId: user.uid,
            patientName: userData?.fullName || apptForPayment.patientName || 'Patient',
            type: 'earn',
            points: pointsEarned,
            description: `Earned ${pointsEarned} points for paying consultation fee for Dr. ${apptForPayment.doctorName}`,
            createdAt: serverTimestamp()
          });

          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + 3);
          const expiryDateStr = expiryDate.toISOString().split('T')[0];

          await addDoc(collection(db, 'coupons'), {
            code: generatedCouponCode,
            userId: user.uid,
            patientName: userData?.fullName || apptForPayment.patientName || 'Patient',
            patientPhone: userData?.phone || apptForPayment.phone || '',
            pointsValue: pointsEarned,
            discountAmount: pointsEarned,
            status: 'active',
            createdAt: serverTimestamp(),
            expiryDate: expiryDate,
            expiryDateStr: expiryDateStr
          });
        }

        // Update local appointments list immediately
        setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, paymentStatus: 'paid', paymentRequested: false, status: 'completed' } : a));

        // Show success screen in modal
        setPaymentSuccessData({
          couponCode: generatedCouponCode,
          points: pointsEarned,
          amount: totalPaidAmount
        });
        setProcessingPayment(false);
      }).catch((error) => {
        setProcessingPayment(false);
        console.error('Razorpay error:', error);
        if (error.code !== 'payment_cancelled') {
          Alert.alert('Payment Failed', error.description || 'Payment could not be processed. Please try again.');
        }
      });
    } catch (e) {
      console.error('Error initiating payment:', e);
      Alert.alert('Payment Setup Error', 'Failed to initiate payment. Please try again.');
      setProcessingPayment(false);
    }
  };


  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAppointments();
    setRefreshing(false);
  };

  // Details Modal States
  const [selectedAppo, setSelectedAppo] = useState(null);
  const [prescriptionDetails, setPrescriptionDetails] = useState(null);
  const [prescLoading, setPrescLoading] = useState(false);
  const [viewerUrl, setViewerUrl] = useState(null);

  // Read initial tab parameter from route
  useEffect(() => {
    if (route.params?.initialTab) {
      setActiveTab(route.params.initialTab);
    }
  }, [route.params?.initialTab]);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchAppointments();
      }
    }, [user, userData])
  );

  const mapDocToAppointment = (id, item) => {
    // Parse DD/MM/YYYY date
    let dateObj = new Date();
    if (typeof item.appointmentDate === 'string') {
      if (item.appointmentDate.includes('/')) {
        const parts = item.appointmentDate.split('/');
        if (parts.length === 3) {
          dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
        }
      } else if (item.appointmentDate.includes('-')) {
        const parts = item.appointmentDate.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
          } else {
            dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
          }
        }
      }
    } else if (item.appointmentDate && typeof item.appointmentDate.toDate === 'function') {
      dateObj = item.appointmentDate.toDate();
    } else if (item.date) {
      dateObj = new Date(item.date);
    }

    // Map clinic status to user-friendly patient-app status
    let resolvedStatus = 'pending';
    if (item.status === 'completed' || item.status === 'done') {
      resolvedStatus = 'completed';
    } else if (item.status === 'cancelled') {
      resolvedStatus = 'cancelled';
    } else if (item.status === 'waiting' || item.status === 'pending') {
      resolvedStatus = 'confirmed';
    }

    const isOnline = item.source === 'UserApp' || item.source === 'appointments' || item.source === 'Patient App' || item.source === 'Online' || item._type === 'online';

    return {
      id: id,
      sourceType: isOnline ? 'online' : 'clinic',
      doctorName: (item.doctor && typeof item.doctor === 'string') ? (item.doctor.startsWith('Dr.') ? item.doctor : `Dr. ${item.doctor}`) : (item.doctorName || 'General Doctor'),
      specialty: item.complaint || item.specialty || 'Homeopathy Specialist',
      branchId: item.branchId || '',
      branchName: item.branchName || 'Clinic Branch',
      timeSlot: item.appointmentTime || item.timeSlot || '09:30 AM',
      status: isOnline ? item.status : resolvedStatus,
      date: dateObj.toISOString(),
      formattedDate: dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      formattedTime: item.appointmentTime || item.timeSlot || '09:30 AM',
      doctorImage: item.doctorImage || '',
      patientPhone: item.phone || item.patientPhone || '',
      phone: item.phone || item.patientPhone || '',
      paymentRequested: item.paymentRequested || false,
      paymentRequestedAt: item.paymentRequestedAt || item.requestedAt || item.paymentUpdatedAt || item.updatedAt || item.createdAt || null,
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
      appointmentDate: item.appointmentDate || null,
      appointmentTime: item.appointmentTime || item.timeSlot || null,
      requestedAmount: Number(item.requestedAmount) || 0,
      paymentStatus: item.paymentStatus || 'pending',
      paymentMethod: item.paymentMethod || 'online',
      splitCounterMethod: item.splitCounterMethod || '',
      splitCounterAmount: Number(item.splitCounterAmount) || 0,
      splitUpiAmount: Number(item.splitUpiAmount) || 0,
      itemsPaid: item.itemsPaid || null,
      patientName: item.patientName || item.fullName || 'Patient',
      fullName: item.fullName || item.patientName || 'Patient'
    };
  };

  const fetchAppointments = async () => {
    if (!user?.uid) return;
    try {
      setLoading(true);

      // 1. Fetch online appointments matching patientId (Auth UID)
      let onlineAppts = [];
      try {
        const qOnline = query(
          collection(db, 'allpatients'),
          where('patientId', '==', user.uid)
        );
        const snapOnline = await getDocs(qOnline);
        onlineAppts = snapOnline.docs
          .filter(doc => !doc.data().isDeleted)
          .map(doc => mapDocToAppointment(doc.id, doc.data()));
      } catch (err) {
        console.error("Error fetching online appointments:", err);
      }

      // 2. Fetch clinic and online appointments matching patient phone from allpatients
      let clinicIntakes = [];
      const userPhone = userData?.phone || user.phoneNumber;
      if (userPhone) {
        const cleanPhone = String(userPhone).replace(/[^0-9]/g, '').slice(-10);
        const qPatients = query(
          collection(db, 'allpatients'),
          where('phone', '==', cleanPhone)
        );
        const snapPatients = await getDocs(qPatients);
        clinicIntakes = snapPatients.docs
          .filter(doc => doc.id !== user.uid && !doc.data().isDeleted)
          .map(doc => mapDocToAppointment(doc.id, doc.data()));
      }

      const appts = [...onlineAppts, ...clinicIntakes];

      // 3. Fetch clinic walk-ins from patient_list (all-time completed/paid visits)
      let historicalClinicVisits = [];
      if (userPhone) {
        const cleanPhone = String(userPhone).replace(/[^0-9]/g, '').slice(-10);
        const qHistory = query(
          collection(db, 'patient_list'),
          where('phone', '==', cleanPhone)
        );
        const snapHistory = await getDocs(qHistory);
        historicalClinicVisits = snapHistory.docs.map(doc => {
          const item = doc.data();

          // Parse DD/MM/YYYY date or timestamp
          let dateObj = new Date();
          if (item.timestamp && typeof item.timestamp.toDate === 'function') {
            dateObj = item.timestamp.toDate();
          } else if (item.paymentCollectedAt && typeof item.paymentCollectedAt.toDate === 'function') {
            dateObj = item.paymentCollectedAt.toDate();
          } else if (item.appointmentDate && typeof item.appointmentDate === 'string') {
            if (item.appointmentDate.includes('/')) {
              const parts = item.appointmentDate.split('/');
              if (parts.length === 3) {
                dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
              }
            } else if (item.appointmentDate.includes('-')) {
              const parts = item.appointmentDate.split('-');
              if (parts.length === 3) {
                if (parts[0].length === 4) {
                  dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                } else {
                  dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
                }
              }
            }
          }

          return {
            id: doc.id,
            patientId: item.patientId || '', // doc.id in patients collection
            sourceType: 'clinic_history',
            doctorName: (item.doctor && typeof item.doctor === 'string') ? (item.doctor.startsWith('Dr.') ? item.doctor : `Dr. ${item.doctor}`) : 'General Doctor',
            specialty: item.complaint || item.subject || 'Homeopathy Specialist',
            branchId: item.branchId || '',
            branchName: item.branchName || 'Clinic Branch',
            timeSlot: item.appointmentTime || '09:30 AM',
            status: 'completed',
            date: dateObj.toISOString(),
            formattedDate: dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            formattedTime: item.appointmentTime || '09:30 AM',
            doctorImage: '',
            patientPhone: cleanPhone,
            phone: cleanPhone,
            paymentRequested: false,
            requestedAmount: Number(item.paymentAmount) || 0,
            paymentStatus: item.paymentStatus || 'paid',
            paymentMethod: item.paymentMethod || 'online',
            splitCounterMethod: item.splitCounterMethod || '',
            splitCounterAmount: Number(item.splitCounterAmount) || 0,
            itemsPaid: item.itemsPaid || null,
            prescriptionNotes: item.prescriptionNotes || '',
            medicalHistory: item.medicalHistory || ''
          };
        });
      }

      // De-duplicate walk-ins: if we have a clinic_history record for a patientId,
      // we remove the active 'clinic' record for the same ID to avoid double-rendering,
      // unless it has a pending payment requested.
      const completedPatientIds = new Set(
        historicalClinicVisits.map(h => h.patientId).filter(Boolean)
      );

      const filteredClinicIntakes = clinicIntakes.filter(c => {
        if (completedPatientIds.has(c.id)) {
          return c.paymentRequested && c.paymentStatus === 'pending' && isPaymentRequestWithin24Hours(c);
        }
        return true;
      });

      // 4. Merge collections: Stage 1 - strict merge by document ID
      const idMap = new Map();
      [...appts, ...filteredClinicIntakes, ...historicalClinicVisits].forEach(item => {
        const key = item.id;
        if (!idMap.has(key)) {
          idMap.set(key, item);
        } else {
          const existing = idMap.get(key);
          const existingScore = (existing.status?.toLowerCase() === 'completed' || existing.status?.toLowerCase() === 'done' ? 3 : (existing.status?.toLowerCase() === 'confirmed' ? 2 : 0)) + (existing.paymentRequested ? 1 : 0);
          const currentScore = (item.status?.toLowerCase() === 'completed' || item.status?.toLowerCase() === 'done' ? 3 : (item.status?.toLowerCase() === 'confirmed' ? 2 : 0)) + (item.paymentRequested ? 1 : 0);
          if (currentScore > existingScore) {
            idMap.set(key, item);
          }
        }
      });

      // Stage 2 - fallback merge by doctor name, date, and timeslot (for walk-ins / legacy duplicate records)
      const uniqueMap = new Map();
      Array.from(idMap.values()).forEach(item => {
        const dObj = item.date ? new Date(item.date) : null;
        const dateStr = dObj && !isNaN(dObj.getTime()) ? `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}` : '';
        const timeStr = (item.timeSlot || '').toLowerCase().replace(/\s+/g, '').replace(/^0/, '');
        let cleanDocName = String(item.doctorName || '').trim().toLowerCase();
        while (cleanDocName.startsWith('dr.') || cleanDocName.startsWith('dr ')) {
          if (cleanDocName.startsWith('dr.')) {
            cleanDocName = cleanDocName.substring(3).trim();
          } else {
            cleanDocName = cleanDocName.substring(2).trim();
          }
        }
        const docName = cleanDocName.replace(/[^a-z0-9]/g, '').substring(0, 5);
        const key = `${docName}_${dateStr}_${timeStr}`;

        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        } else {
          const existing = uniqueMap.get(key);
          const existingScore = (existing.status?.toLowerCase() === 'completed' || existing.status?.toLowerCase() === 'done' ? 3 : (existing.status?.toLowerCase() === 'confirmed' ? 2 : 0)) + (existing.paymentRequested ? 1 : 0);
          const currentScore = (item.status?.toLowerCase() === 'completed' || item.status?.toLowerCase() === 'done' ? 3 : (item.status?.toLowerCase() === 'confirmed' ? 2 : 0)) + (item.paymentRequested ? 1 : 0);
          if (currentScore > existingScore) {
            uniqueMap.set(key, item);
          }
        }
      });
      const combined = Array.from(uniqueMap.values());

      // 5. Sort by date (newest first)
      combined.sort((a, b) => new Date(b.date) - new Date(a.date));
      setAppointments(combined);
    } catch (error) {
      console.error("Error fetching appointments:", error);
    } finally {
      setLoading(false);
    }
  };

  const normalizeBranchName = (name) => {
    if (!name) return '';
    const str = name.toLowerCase().replace(/\s*branch\s*/i, '').replace(/[^a-z0-9]/g, '').trim();
    if (str.includes('kphb')) return 'kphb';
    if (str.includes('chnr') || str.includes('chandanagar') || str.includes('chandnagar')) return 'chandanagar';
    if (str.includes('dsnr') || str.includes('dilsukhnagar') || str.includes('dilshuknagar')) return 'dilshuknagar';
    if (str.includes('nallagandla')) return 'nallagandla';
    return str;
  };

  const handleCancelAppointment = async (appt) => {
    if (!appt) {
      Alert.alert("Error", "No appointment selected for cancellation.");
      return;
    }
    try {
      setProcessingPayment(true);

      // 1. Update the appointment status to 'cancelled' in allpatients in Firestore
      const apptRefAll = doc(db, 'allpatients', appt.id);
      await updateDoc(apptRefAll, {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });

      // 2. Notify receptionists of that branch
      try {
        const qRec = query(collection(db, 'users'), where('role', '==', 'receptionist'));
        const snapRec = await getDocs(qRec);
        const targetBranchNorm = normalizeBranchName(appt.branchName);
        const patientName = appt.patientName || appt.fullName || userData?.fullName || 'Patient';

        // Parse date for formatted notification display
        const dateObj = new Date(appt.date);
        const formattedDateStr = isNaN(dateObj.getTime())
          ? appt.date || ''
          : dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        snapRec.forEach(async (docSnap) => {
          const receptionist = docSnap.data();
          const repBranchIdNorm = normalizeBranchName(receptionist.branchId);
          const repBranchNameNorm = normalizeBranchName(receptionist.branchName);

          if (repBranchIdNorm === targetBranchNorm || repBranchNameNorm === targetBranchNorm) {
            await addDoc(collection(db, 'notifications'), {
              userId: receptionist.uid || docSnap.id,
              title: '❌ Appointment Cancelled',
              body: `${patientName} cancelled their appointment for ${formattedDateStr} at ${appt.timeSlot}.`,
              type: 'booking_cancelled_alert',
              isRead: false,
              createdAt: serverTimestamp(),
              metadata: {
                appointmentId: appt.id,
                patientName,
                date: formattedDateStr,
                timeSlot: appt.timeSlot,
                branchName: appt.branchName
              }
            });
          }
        });
      } catch (notifRecErr) {
        console.warn("Error notifying receptionists of booking cancellation:", notifRecErr);
      }

      // 3. Send SMS and WhatsApp cancellation to patient
      try {
        const patientPhone = (appt.phone || userData?.phone || user?.phoneNumber || '').replace(/\D/g, '').slice(-10);
        const pName = appt.patientName || appt.fullName || userData?.fullName || 'Patient';
        const docName = appt.doctorName || 'Doctor';
        const dateObj = new Date(appt.date);
        const formattedDateStr = isNaN(dateObj.getTime())
          ? (appt.appointmentDate || appt.date || '')
          : dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeSlotStr = appt.timeSlot || appt.time || '';
        const branchStr = appt.branchName || 'KPHB';

        if (patientPhone) {
          sendCancellationSMS(
            patientPhone,
            pName,
            docName,
            formattedDateStr,
            timeSlotStr,
            branchStr
          );
          sendCancellationWhatsAppNotification({
            patientName: pName,
            phone: patientPhone,
            date: formattedDateStr,
            time: timeSlotStr,
            doctorName: docName,
            branch: branchStr
          });
        }
      } catch (smsCancelErr) {
        console.warn("Error sending cancellation SMS/WhatsApp:", smsCancelErr);
      }

      Alert.alert("Success", "Appointment cancelled successfully.");
      setApptToCancel(null);
      setSelectedAppo(null);
      fetchAppointments();
    } catch (err) {
      console.error("Error cancelling appointment:", err);
      Alert.alert("Error", "Could not cancel appointment. Please try again.");
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleOpenDetails = async (appo) => {
    setSelectedAppo(appo);
    setPrescLoading(true);
    setPrescriptionDetails(null);
    try {
      const collectionName = 'allpatients';
      const targetId = appo.sourceType === 'clinic_history' ? appo.patientId : appo.id;
      const docRef = doc(db, collectionName, targetId);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        setPrescriptionDetails(snap.data());
      } else {
        // If somehow document is not found, fallback to the item data itself
        setPrescriptionDetails(appo);
      }
    } catch (error) {
      console.error("Error loading prescription details:", error);
    } finally {
      setPrescLoading(false);
    }
  };

  // Auto-open appointment details if redirected with appointmentId
  useEffect(() => {
    if (route.params?.appointmentId && appointments.length > 0) {
      const appt = appointments.find(a => a.id === route.params.appointmentId);
      if (appt) {
        handleOpenDetails(appt);
        // Clear navigation parameter so it doesn't trigger again on subsequent focuses
        navigation.setParams({ appointmentId: undefined });
      }
    }
  }, [route.params?.appointmentId, appointments]);

  // Send medicine form request from patient to reception
  const handleRequestMedicineForm = async (appt) => {
    const apptId = appt.id;
    if (medRequestSent[apptId]) {
      Alert.alert('Already Requested', 'You have already requested a medicine form for this appointment.');
      return;
    }
    setMedRequestLoading(prev => ({ ...prev, [apptId]: true }));
    try {
      const cleanPhone = String(userData?.phone || user?.phoneNumber || '').replace(/\D/g, '').slice(-10);
      await addDoc(collection(db, 'medicine_requests'), {
        patientId: user?.uid || '',
        patientName: userData?.fullName || appt.patientName || 'Patient',
        phone: cleanPhone,
        age: userData?.age || '',
        gender: userData?.gender || 'Mr.',
        appointmentId: apptId,
        doctorName: appt.doctorName || '',
        subject: appt.specialty || appt.subject || '',
        branchId: appt.branchId || '',
        branchName: appt.branchName || '',
        status: 'pending',
        requestedAt: serverTimestamp(),
      });
      setMedRequestSent(prev => ({ ...prev, [apptId]: true }));
      Alert.alert(
        '✅ Request Sent',
        'Your medicine form request has been sent to the reception team. You will be notified once it is ready.'
      );
    } catch (err) {
      console.error('Medicine request error:', err);
      Alert.alert('Error', 'Failed to send request. Please try again.');
    } finally {
      setMedRequestLoading(prev => ({ ...prev, [apptId]: false }));
    }
  };

  const getStatusStyle = (status) => {
    switch (status?.toLowerCase()) {
      case 'confirmed': return { bg: '#ecfdf5', dot: '#10b981', text: '#10b981' };
      case 'completed': return { bg: '#eff6ff', dot: '#3b82f6', text: '#3b82f6' };
      case 'pending': return { bg: '#fffbeb', dot: '#f59e0b', text: '#f59e0b' };
      case 'cancelled': return { bg: '#fef2f2', dot: '#ef4444', text: '#ef4444' };
      default: return { bg: '#f8fafc', dot: '#94a3b8', text: '#94a3b8' };
    }
  };

  const renderItem = ({ item }) => {
    const statusStyle = getStatusStyle(item.status);
    const patientName = item.patientName || item.fullName || userData?.fullName || 'Patient';
    const patientPhone = item.patientPhone || item.phone || userData?.phone || '';
    const formattedPhone = patientPhone ? `+91 ${patientPhone.replace(/^\+91/, '').replace(/\D/g, '').slice(-10)}` : 'N/A';

    return (
      <Surface style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.doctorInfo}>
            <View style={styles.patientAvatarBg}>
              <User size={18} color={COLORS.white} />
            </View>
            <View style={styles.docDetails}>
              <Text style={styles.docName}>{patientName}</Text>
              <Text style={styles.patientPhoneText}>{formattedPhone}</Text>
              <View style={styles.locRow}>
                <MapPin size={10} color="#64748b" />
                <Text style={styles.locText} numberOfLines={1}>{item.branchName}</Text>
              </View>
            </View>
          </View>

          <View style={styles.dateTimeBox}>
            <View style={styles.dtItem}>
              <CalendarIcon size={12} color={COLORS.primary} />
              <Text style={styles.dtText}>{item.formattedDate}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.dtItem}>
              <Clock size={12} color={COLORS.primary} />
              <Text style={styles.dtText}>{item.timeSlot || '10:00 AM'}</Text>
            </View>
          </View>

          <View style={styles.cardFooter}>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: statusStyle.dot }]} />
              <Text style={[styles.statusText, { color: statusStyle.text }]}>
                {item.status?.charAt(0).toUpperCase() + item.status?.slice(1) || 'Pending'}
              </Text>
            </View>
            <TouchableOpacity style={styles.detailsBtn} onPress={() => handleOpenDetails(item)}>
              <Text style={styles.detailsBtnText}>View Details</Text>
              <ChevronRight size={12} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {/* Reschedule & Cancel buttons — only on pending/confirmed appointments */}
          {(item.status === 'pending' || item.status === 'confirmed') && (
            <View style={{ flexDirection: 'row', marginTop: 12, paddingHorizontal: 4, paddingBottom: 4, gap: 8 }}>
              <Button
                mode="contained"
                buttonColor={COLORS.primary}
                onPress={() => {
                  navigation.navigate('SelectDateTime', {
                    isReschedule: true,
                    appointmentId: item.id,
                    sourceType: item.sourceType,
                    patientName: item.patientName || item.fullName || userData?.fullName || 'Patient',
                    branch: { name: item.branchName, id: item.branchId },
                    doctor: { name: item.doctorName, id: item.doctorId },
                    modeOfConsultation: item.modeOfConsultation || 'In-Clinic'
                  });
                }}
                style={{ flex: 1, borderRadius: 10 }}
                contentStyle={{ height: 36 }}
                labelStyle={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}
              >
                Reschedule
              </Button>
              <Button
                mode="contained"
                buttonColor="#ef4444"
                onPress={() => {
                  setSelectedAppo(item);
                  setApptToCancel(item);
                  setShowCancelModal(true);
                }}
                style={{ flex: 1, borderRadius: 10 }}
                contentStyle={{ height: 36 }}
                labelStyle={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}
              >
                Cancel
              </Button>
            </View>
          )}

          {/* Medicine Form request / view buttons — only on completed appointments */}
          {(item.status === 'completed' || item.status === 'done') && (
            <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
              {/* View Medicine Form button — shown once form is prepared */}
              <TouchableOpacity
                style={[styles.viewMedFormBtn, { flex: 1 }]}
                onPress={() => navigation.navigate('MedicineFormView', {
                  appointmentId: item.id,
                  patientPhone: userData?.phone || ''
                })}
              >
                <FileText size={12} color={COLORS.primary} />
                <Text style={styles.viewMedFormText} numberOfLines={1}>View Form</Text>
                <ChevronRight size={11} color={COLORS.primary} />
              </TouchableOpacity>

              {/* Request Medicine Form button */}
              <TouchableOpacity
                style={[
                  styles.requestMedFormBtn,
                  { flex: 1 },
                  medRequestSent[item.id] && styles.requestMedFormBtnSent
                ]}
                onPress={() => handleRequestMedicineForm(item)}
                disabled={!!medRequestLoading[item.id] || !!medRequestSent[item.id]}
              >
                {medRequestLoading[item.id] ? (
                  <ActivityIndicator size={12} color="#fff" />
                ) : medRequestSent[item.id] ? (
                  <CheckCircle2 size={12} color="#fff" />
                ) : (
                  <Pill size={12} color="#fff" />
                )}
                <Text style={styles.requestMedFormText} numberOfLines={1}>
                  {medRequestSent[item.id]
                    ? 'Requested'
                    : 'Request Form'
                  }
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Follow-up Info — show on completed/done appointments that have a follow-up set */}
          {(item.status === 'completed' || item.status === 'done') && item.followUpDate && item.followUpInterval && item.followUpInterval !== 'No Follow-up' && (
            <View style={{ marginTop: 8, backgroundColor: '#fffbeb', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#fde68a', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CalendarIcon size={16} color="#d97706" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400e' }}>Follow-up Scheduled</Text>
                <Text style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                  Date: {item.followUpDate}  •  Interval: {item.followUpInterval}
                </Text>
              </View>
            </View>
          )}
          {item.paymentRequested && item.paymentStatus === 'pending' && isPaymentRequestWithin24Hours(item) && (
            <View style={{ marginTop: 8, backgroundColor: '#f0fdfa', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: '#ccfbf1', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#115e59' }}>
                  {item.paymentMethod === 'split' ? (
                    `Split Fee Requested: ₹${item.requestedAmount}`
                  ) : (
                    `Fee Requested: ₹${item.requestedAmount}`
                  )}
                </Text>
                <Text style={{ fontSize: 9, color: '#0d9488', marginTop: 1, fontWeight: '500' }}>
                  {item.paymentMethod === 'split' ? (
                    `Remaining UPI balance (₹${item.splitCounterAmount} paid at counter)`
                  ) : (
                    `Post-booking consultation charge`
                  )}
                </Text>
              </View>
              <Button
                mode="contained"
                onPress={() => handleOpenAppPaySheet(item)}
                buttonColor={COLORS.primary}
                contentStyle={{ paddingVertical: 0, height: 26 }}
                style={{ borderRadius: 6, height: 26, justifyContent: 'center' }}
                labelStyle={{ fontSize: 9, fontWeight: '800', marginVertical: 0, marginHorizontal: 8 }}
              >
                Pay Now
              </Button>
            </View>
          )}
        </View>
      </Surface>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={24} color="#1e293b" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Appointments</Text>
          <TouchableOpacity style={styles.filterBtn}>
            <Filter size={20} color="#1e293b" />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          {['Upcoming', 'History', 'Cancelled'].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
              {activeTab === tab && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
          <Text style={styles.loaderText}>Fetching your appointments...</Text>
        </View>
      ) : (
        <FlatList
          data={appointments.filter(a => {
            const isPendingPaymentActive = a.paymentRequested && a.paymentStatus === 'pending' && isPaymentRequestWithin24Hours(a);
            if (activeTab === 'Upcoming') return a.status === 'pending' || a.status === 'confirmed' || a.status === 'waiting' || a.status === 'in-consultation' || isPendingPaymentActive;
            if (activeTab === 'History') return (a.status === 'completed' || a.status === 'done') && !isPendingPaymentActive;
            if (activeTab === 'Cancelled') return a.status === 'cancelled';
            return true;
          })}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Surface style={styles.emptyIconBg}>
                <CalendarDays size={40} color="#94a3b8" />
              </Surface>
              <Text style={styles.emptyTitle}>No {activeTab} Appointments</Text>
              <Text style={styles.emptySub}>You haven't booked any appointments yet.</Text>
              <TouchableOpacity
                style={styles.bookNowBtn}
                onPress={() => navigation.navigate('BookAppointment')}
              >
                <Text style={styles.bookNowText} adjustsFontSizeToFit numberOfLines={1}>Book Appointment Now</Text>
              </TouchableOpacity>
            </View>
          }
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      )}

      {/* Appointment Detail Popup Modal */}
      <Modal
        visible={selectedAppo !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedAppo(null)}
      >
        <View style={styles.modalBackdrop}>
          <Surface style={styles.modalContent}>
            {selectedAppo && (
              <View style={{ flex: 1 }}>
                {/* Header */}
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>Consultation details</Text>
                    <Text style={styles.modalSubTitle}>SPH Digital Health Suite</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedAppo(null)} style={styles.closeBtn}>
                    <X size={20} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
                  {/* Doctor Info */}
                  <View style={styles.modalCardRow}>
                    <Avatar.Image
                      size={54}
                      source={{ uri: selectedAppo.doctorImage || 'https://images.unsplash.com/photo-1559839734-2b71f153678e?auto=format&fit=crop&q=80&w=150' }}
                    />
                    <View style={styles.modalDocDetails}>
                      <Text style={styles.modalDocName}>
                        {selectedAppo.doctorName ? (selectedAppo.doctorName.startsWith('Dr.') || selectedAppo.doctorName.startsWith('Dr ') ? selectedAppo.doctorName : `Dr. ${selectedAppo.doctorName}`) : ''}
                      </Text>
                      <Text style={styles.modalDocSpec}>{selectedAppo.specialty || 'Homeopathy Specialist'}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusStyle(selectedAppo.status).bg, marginTop: 6, alignSelf: 'flex-start' }]}>
                        <View style={[styles.statusDot, { backgroundColor: getStatusStyle(selectedAppo.status).dot }]} />
                        <Text style={[styles.statusText, { color: getStatusStyle(selectedAppo.status).text }]}>
                          {selectedAppo.status?.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Patient Details */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Patient Details</Text>
                    <View style={{ backgroundColor: '#f8fafc', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <User size={16} color={COLORS.secondary} style={{ marginRight: 8 }} />
                        <Text style={{ fontSize: 14, color: '#1e293b', fontWeight: '700' }}>
                          {selectedAppo.patientName || selectedAppo.fullName || userData?.fullName || 'Patient'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Phone size={14} color="#64748b" style={{ marginRight: 8 }} />
                        <Text style={{ fontSize: 13, color: '#475569', fontWeight: '500' }}>
                          +91 {selectedAppo.patientPhone || selectedAppo.phone || userData?.phone?.replace('+91', '') || 'N/A'}
                        </Text>
                      </View>
                      {(selectedAppo.age || selectedAppo.gender) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                          <View style={{ backgroundColor: '#e2e8f0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: '#475569', fontWeight: '600', textTransform: 'capitalize' }}>
                              {selectedAppo.age ? `${selectedAppo.age} yrs ` : ''}
                              {selectedAppo.gender ? `• ${selectedAppo.gender}` : ''}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Visit Details */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Appointment Schedule</Text>
                    <View style={styles.detailItemRow}>
                      <CalendarIcon size={16} color={COLORS.secondary} />
                      <Text style={styles.detailItemText}>{selectedAppo.formattedDate} ({selectedAppo.timeSlot})</Text>
                    </View>
                    <View style={styles.detailItemRow}>
                      <MapPin size={16} color={COLORS.secondary} />
                      <Text style={styles.detailItemText}>{selectedAppo.branchName}</Text>
                    </View>
                  </View>

                  {/* Symptoms */}
                  {selectedAppo.symptoms ? (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Provided Symptoms</Text>
                      <Text style={styles.modalBioText}>"{selectedAppo.symptoms}"</Text>
                    </View>
                  ) : null}

                  {/* Payment Details */}
                  {selectedAppo.paymentId ? (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Payment & Fees</Text>
                      <View style={styles.paymentReceipt}>
                        <View style={styles.receiptRow}>
                          <Text style={styles.receiptLabel}>Consultation Fee</Text>
                          <Text style={styles.receiptVal}>₹{selectedAppo.amountPaid || 500}</Text>
                        </View>
                        <View style={styles.receiptRow}>
                          <Text style={styles.receiptLabel}>Transaction Status</Text>
                          <Text style={[styles.receiptVal, { color: '#10b981', fontWeight: '800' }]}>SUCCESS</Text>
                        </View>
                        <View style={styles.receiptRow}>
                          <Text style={styles.receiptLabel}>Razorpay Payment ID</Text>
                          <Text style={styles.receiptVal} numberOfLines={1}>{selectedAppo.paymentId}</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: COLORS.secondary,
                          paddingVertical: 10,
                          borderRadius: 8,
                          marginTop: 10,
                          gap: 6
                        }}
                        onPress={() => handleShareInvoicePDF(selectedAppo, { paymentId: selectedAppo.paymentId, amount: selectedAppo.amountPaid })}
                      >
                        <FileText size={16} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Share Receipt (PDF)</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {/* Reception Prescription Section */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Reception Uploaded Prescription</Text>
                    {prescLoading ? (
                      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                        <ActivityIndicator size="small" color={COLORS.secondary} />
                        <Text style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Loading prescription files...</Text>
                      </View>
                    ) : prescriptionDetails?.prescriptionUrls && prescriptionDetails.prescriptionUrls.length > 0 ? (
                      prescriptionDetails.prescriptionUrls.map((url, idx) => (
                        <Surface key={idx} style={[styles.prescriptionCard, { marginBottom: 12 }]}>
                          <Image source={{ uri: url }} style={styles.prescThumb} />
                          <View style={styles.prescInfo}>
                            <Text style={styles.prescTitle}>Handwritten Prescription {idx + 1}</Text>
                            <Text style={styles.prescSub}>Uploaded by branch receptionist</Text>
                            <TouchableOpacity
                              style={styles.prescViewBtn}
                              onPress={() => setViewerUrl(url)}
                            >
                              <Eye size={14} color="#fff" />
                              <Text style={styles.prescViewText}>View Prescription</Text>
                            </TouchableOpacity>
                          </View>
                        </Surface>
                      ))
                    ) : prescriptionDetails?.handwrittenPrescriptionUrl ? (
                      <Surface style={styles.prescriptionCard}>
                        <Image source={{ uri: prescriptionDetails.handwrittenPrescriptionUrl }} style={styles.prescThumb} />
                        <View style={styles.prescInfo}>
                          <Text style={styles.prescTitle}>Digital Handwritten Pad</Text>
                          <Text style={styles.prescSub}>Saved during consultation</Text>
                          <TouchableOpacity
                            style={styles.prescViewBtn}
                            onPress={() => setViewerUrl(prescriptionDetails.handwrittenPrescriptionUrl)}
                          >
                            <Eye size={14} color="#fff" />
                            <Text style={styles.prescViewText}>View Prescription</Text>
                          </TouchableOpacity>
                        </View>
                      </Surface>
                    ) : (
                      <View style={styles.noPrescBox}>
                        <AlertCircle size={18} color="#94a3b8" />
                        <Text style={styles.noPrescText}>No uploaded prescriptions found for this consultation yet.</Text>
                      </View>
                    )}
                  </View>
                </ScrollView>

                {/* Modal Footer */}
                <View style={styles.modalActionBar}>
                  {selectedAppo && (selectedAppo.status === 'pending' || selectedAppo.status === 'confirmed') ? (
                    <View style={{ flexDirection: 'row', gap: 8, flex: 1, marginRight: 8 }}>
                      <Button
                        mode="outlined"
                        onPress={() => {
                          const apptToReschedule = selectedAppo;
                          setSelectedAppo(null);
                          navigation.navigate('SelectDateTime', {
                            isReschedule: true,
                            appointmentId: apptToReschedule.id,
                            sourceType: apptToReschedule.sourceType,
                            patientName: apptToReschedule.patientName || apptToReschedule.fullName || userData?.fullName || 'Patient',
                            branch: { name: apptToReschedule.branchName, id: apptToReschedule.branchId },
                            doctor: { name: apptToReschedule.doctorName, id: apptToReschedule.doctorId },
                            modeOfConsultation: apptToReschedule.modeOfConsultation || 'In-Clinic'
                          });
                        }}
                        style={{ flex: 1, borderRadius: 12, borderColor: COLORS.primary }}
                        labelStyle={{ color: COLORS.primary }}
                      >
                        Reschedule
                      </Button>
                      <Button
                        mode="outlined"
                        onPress={() => {
                          setApptToCancel(selectedAppo);
                          setShowCancelModal(true);
                        }}
                        style={{ flex: 1, borderRadius: 12, borderColor: '#ef4444' }}
                        labelStyle={{ color: '#ef4444' }}
                      >
                        Cancel
                      </Button>
                    </View>
                  ) : null}
                  <Button
                    mode="contained"
                    onPress={() => setSelectedAppo(null)}
                    buttonColor={COLORS.secondary}
                    style={{ borderRadius: 12, minWidth: 80 }}
                  >
                    Done
                  </Button>
                </View>
              </View>
            )}
          </Surface>
        </View>
      </Modal>

      {/* Cancellation Confirmation Modal */}
      <Modal
        visible={showCancelModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setShowCancelModal(false);
          setCancelConfirmed(false);
          setApptToCancel(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <Surface style={styles.confirmModalContent}>
            <View style={styles.confirmHeader}>
              <AlertCircle size={22} color='#ef4444' style={{ marginRight: 8 }} />
              <Text style={styles.confirmTitle}>Cancel Appointment</Text>
            </View>
            <Text style={styles.confirmBody}>
              Are you sure you want to cancel your appointment with Dr. {apptToCancel?.doctorName} on {apptToCancel?.formattedDate} at {apptToCancel?.timeSlot}? This action cannot be undone.
            </Text>

            <TouchableOpacity
              style={styles.confirmCheckboxRow}
              onPress={() => setCancelConfirmed(!cancelConfirmed)}
              activeOpacity={0.8}
            >
              <View style={[styles.confirmCheckbox, cancelConfirmed && styles.confirmCheckboxChecked]}>
                {cancelConfirmed && <CheckCircle2 size={12} color="#fff" />}
              </View>
              <Text style={styles.confirmCheckboxLabel}>
                I confirm that I want to cancel this appointment.
              </Text>
            </TouchableOpacity>

            <View style={styles.confirmActions}>
              <Button
                mode="outlined"
                onPress={() => {
                  setShowCancelModal(false);
                  setCancelConfirmed(false);
                  setApptToCancel(null);
                }}
                style={styles.confirmCancelBtn}
                labelStyle={{ color: '#64748b' }}
              >
                No, Keep
              </Button>
              <Button
                mode="contained"
                disabled={!cancelConfirmed}
                onPress={() => {
                  setShowCancelModal(false);
                  setCancelConfirmed(false);
                  handleCancelAppointment(apptToCancel);
                }}
                style={[styles.confirmSubmitBtn, { backgroundColor: '#ef4444' }]}
                labelStyle={{ color: '#fff' }}
              >
                Yes, Cancel
              </Button>
            </View>
          </Surface>
        </View>
      </Modal>

      {/* Expanded Prescription Viewer Modal */}
      {viewerUrl ? (
        <Modal
          visible={!!viewerUrl}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setViewerUrl(null)}
        >
          <View style={styles.viewerBackdrop}>
            <View style={styles.viewerHeader}>
              <Text style={styles.viewerTitle}>SPH Prescription Records</Text>
              <TouchableOpacity onPress={() => setViewerUrl(null)} style={styles.viewerCloseBtn}>
                <X size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.viewerBody}>
              <Image
                source={{ uri: viewerUrl }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            </View>
            <View style={styles.viewerFooter}>
              <ShieldCheck size={16} color="#10b981" />
              <Text style={styles.viewerSecureText}>Verified Digital Health Record</Text>
            </View>
          </View>
        </Modal>
      ) : null}

      {/* Consultation Fee Payment Modal */}
      <Modal
        visible={payModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => { if (!processingPayment) setPayModalVisible(false); }}
      >
        <View style={styles.payModalOverlay}>
          <View style={styles.payModalContent}>
            {paymentSuccessData ? (
              <View style={styles.paySuccessContainer}>
                <View style={styles.paySuccessIconBg}>
                  <CheckCircle2 size={36} color="#10b981" />
                </View>
                <Text style={styles.paySuccessTitle}>Payment Verified!</Text>
                <Text style={styles.paySuccessSub}>
                  Your consultation fee payment of ₹{paymentSuccessData.amount} for {apptForPayment?.doctorName ? (apptForPayment.doctorName.startsWith('Dr.') || apptForPayment.doctorName.startsWith('Dr ') ? apptForPayment.doctorName : `Dr. ${apptForPayment.doctorName}`) : ''} was successful.
                </Text>

                {paymentSuccessData.points > 0 && (
                  <View style={styles.payRewardTicket}>
                    <View style={styles.payRewardPointsCol}>
                      <Text style={styles.payRewardPointsLabel}>Points Credited</Text>
                      <Text style={styles.payRewardPointsVal}>+{paymentSuccessData.points} PTS</Text>
                    </View>
                    <View style={styles.payRewardCouponCol}>
                      <Text style={styles.payRewardCouponLabel}>LOYALTY COUPON CODE</Text>
                      <Text style={styles.payRewardCouponCode}>{paymentSuccessData.couponCode}</Text>
                      <TouchableOpacity
                        style={styles.payCopyBtn}
                        onPress={() => {
                          Clipboard.setString(paymentSuccessData.couponCode);
                          Alert.alert("Copied", "Coupon code copied to clipboard!");
                        }}
                      >
                        <Text style={styles.payCopyBtnText}>COPY CODE</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.paySuccessDoneBtn, { backgroundColor: COLORS.secondary, marginBottom: 8 }]}
                  onPress={() => handleShareInvoicePDF(apptForPayment, paymentSuccessData)}
                >
                  <Text style={styles.paySuccessDoneText}>Share Receipt (PDF)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.paySuccessDoneBtn}
                  onPress={() => setPayModalVisible(false)}
                >
                  <Text style={styles.paySuccessDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <View style={styles.payModalHeader}>
                  <Text style={styles.payModalTitle}>Consultation Fee Payment</Text>
                  <TouchableOpacity
                    disabled={processingPayment}
                    onPress={() => setPayModalVisible(false)}
                    style={styles.payCloseBtn}
                  >
                    <X size={20} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <View style={styles.paySummaryCard}>
                  <View style={styles.paySummaryRow}>
                    <Text style={styles.paySummaryLabel}>Doctor</Text>
                    <Text style={styles.paySummaryValue}>
                      {apptForPayment?.doctorName ? (apptForPayment.doctorName.startsWith('Dr.') || apptForPayment.doctorName.startsWith('Dr ') ? apptForPayment.doctorName : `Dr. ${apptForPayment.doctorName}`) : ''}
                    </Text>
                  </View>
                  <View style={styles.paySummaryRow}>
                    <Text style={styles.paySummaryLabel}>Date & Time</Text>
                    <Text style={styles.paySummaryValue}>
                      {apptForPayment?.formattedDate} ({apptForPayment?.timeSlot})
                    </Text>
                  </View>
                  <View style={styles.paySummaryRow}>
                    <Text style={styles.paySummaryLabel}>Branch</Text>
                    <Text style={styles.paySummaryValue}>{apptForPayment?.branchName}</Text>
                  </View>

                  <View style={styles.payDivider} />

                  {apptForPayment?.paymentMethod === 'split' ? (
                    <>
                      <View style={styles.paySummaryRow}>
                        <Text style={styles.paySummaryLabel}>Total Fee</Text>
                        <Text style={styles.paySummaryValue}>₹{(Number(apptForPayment.requestedAmount) || 0) + (Number(apptForPayment.splitCounterAmount) || 0)}</Text>
                      </View>
                      <View style={styles.paySummaryRow}>
                        <Text style={styles.paySummaryLabel}>Paid at Counter ({apptForPayment.splitCounterMethod?.toUpperCase()})</Text>
                        <Text style={styles.paySummaryValue}>- ₹{apptForPayment.splitCounterAmount}</Text>
                      </View>
                      <View style={styles.payDivider} />
                      <View style={styles.paySummaryRow}>
                        <Text style={styles.paySummaryTotalLabel}>Payable via UPI</Text>
                        <Text style={styles.paySummaryTotalValue}>₹{apptForPayment?.requestedAmount}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.paySummaryRow}>
                      <Text style={styles.paySummaryTotalLabel}>Consultation Fee</Text>
                      <Text style={styles.paySummaryTotalValue}>₹{apptForPayment?.requestedAmount}</Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.paySubmitBtn}
                  disabled={processingPayment}
                  onPress={handleCompleteAppPayment}
                >
                  {processingPayment ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.paySubmitBtnText}>Pay ₹{apptForPayment?.requestedAmount} Now</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfdfe' },
  header: { backgroundColor: COLORS.white, paddingBottom: 0, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  filterBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' },
  tabContainer: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 8 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', position: 'relative' },
  activeTab: {},
  tabText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  activeTabText: { color: COLORS.primary, fontWeight: '700' },
  tabIndicator: { position: 'absolute', bottom: 0, width: '40%', height: 3, backgroundColor: COLORS.primary, borderRadius: 3 },
  listContent: { padding: 12, paddingBottom: 40 },
  card: {
    borderRadius: 14,
    backgroundColor: COLORS.white,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    overflow: 'hidden'
  },
  cardContent: { padding: 10 },
  doctorInfo: { flexDirection: 'row', alignItems: 'center' },
  docDetails: { marginLeft: 12, flex: 1 },
  docName: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  docSpec: { fontSize: 11, color: COLORS.primary, fontWeight: '600', marginTop: 1 },
  locRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  locText: { fontSize: 10, color: '#64748b', marginLeft: 4, fontWeight: '500' },
  dateTimeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 6,
    marginTop: 8,
    justifyContent: 'space-around'
  },
  dtItem: { flexDirection: 'row', alignItems: 'center' },
  dtText: { fontSize: 11, fontWeight: '700', color: '#1e293b', marginLeft: 4 },
  divider: { width: 1, height: 12, backgroundColor: '#e2e8f0' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 4 },
  statusText: { fontSize: 9, fontWeight: '800' },
  detailsBtn: { flexDirection: 'row', alignItems: 'center' },
  detailsBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.primary, marginRight: 4 },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loaderText: { marginTop: 12, fontSize: 14, color: '#64748b', fontWeight: '500' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 },
  emptyIconBg: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  emptySub: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 8, paddingHorizontal: 40 },
  bookNowBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 24, elevation: 4, shadowColor: COLORS.primary },
  bookNowText: { color: COLORS.white, fontWeight: '800', fontSize: 14 },

  // Modal styling
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', height: '85%', padding: 20, borderRadius: 24, backgroundColor: '#fff', elevation: 10, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  modalSubTitle: { fontSize: 12, color: COLORS.primary, fontWeight: '600', marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' },
  modalScroll: { paddingTop: 16, paddingBottom: 24 },
  modalCardRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 20, padding: 16, marginBottom: 20 },
  modalDocDetails: { marginLeft: 16, flex: 1 },
  modalDocName: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  modalDocSpec: { fontSize: 12, color: '#64748b', fontWeight: '500', marginTop: 2 },
  modalSection: { marginBottom: 20 },
  modalSectionTitle: { fontSize: 12, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  detailItemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  detailItemText: { fontSize: 14, color: '#334155', fontWeight: '600' },
  modalBioText: { fontSize: 14, color: '#475569', lineHeight: 20, fontStyle: 'italic', backgroundColor: '#f0f9ff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e0f2fe' },
  paymentReceipt: { backgroundColor: '#f0fdf4', borderStyle: 'dashed', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 16, padding: 16 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  receiptLabel: { fontSize: 12, color: '#166534', fontWeight: '600' },
  receiptVal: { fontSize: 12, color: '#14532d', fontWeight: '700' },
  noPrescBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f8fafc', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  noPrescText: { fontSize: 12, color: '#64748b', fontWeight: '500', flex: 1, lineHeight: 18 },
  prescriptionCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', padding: 12, borderWidth: 1, borderColor: '#f1f5f9', elevation: 1 },
  prescThumb: { width: 70, height: 70, borderRadius: 12, backgroundColor: '#f8fafc' },
  prescInfo: { flex: 1, marginLeft: 14, justifyContent: 'center' },
  prescTitle: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  prescSub: { fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: '500' },
  prescViewBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginTop: 8, gap: 6, alignSelf: 'flex-start' },
  prescViewText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  modalActionBar: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 16 },

  // Expanded Image Viewer Styling
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  viewerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16 },
  viewerTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  viewerCloseBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  viewerBody: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  viewerImage: { width: '90%', height: '80%' },
  viewerFooter: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingBottom: 40 },
  viewerSecureText: { fontSize: 12, color: '#10b981', fontWeight: '700' },
  // Modal Styles
  payModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  payModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  payModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  payModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
  },
  payCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paySummaryCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
  },
  paySummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  paySummaryLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  paySummaryValue: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '700',
  },
  payDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 8,
  },
  paySummaryTotalLabel: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '800',
  },
  paySummaryTotalValue: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '800',
  },
  paySubmitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  paySubmitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  paySuccessContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  paySuccessIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  paySuccessTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#10b981',
    marginBottom: 6,
  },
  paySuccessSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  payRewardTicket: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#334155',
  },
  payRewardPointsCol: {
    flex: 1,
  },
  payRewardPointsLabel: {
    fontSize: 10,
    color: '#38bdf8',
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  payRewardPointsVal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 2,
  },
  payRewardCouponCol: {
    flex: 1.2,
    alignItems: 'flex-end',
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
    paddingLeft: 16,
  },
  payRewardCouponLabel: {
    fontSize: 9,
    color: '#94a3b8',
    fontWeight: '700',
  },
  payRewardCouponCode: {
    fontSize: 14,
    fontWeight: '800',
    color: '#a8ce3a',
    marginTop: 4,
  },
  payCopyBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
  },
  payCopyBtnText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  paySuccessDoneBtn: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  paySuccessDoneText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  viewMedFormBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#e0f2fe',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  viewMedFormText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  requestMedFormBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    borderRadius: 8,
  },
  requestMedFormBtnSent: {
    backgroundColor: '#059669',
  },
  requestMedFormText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  patientPhoneText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 1,
  },
  patientAvatarBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 340,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    alignSelf: 'center',
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  confirmBody: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 20,
  },
  confirmCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  confirmCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  confirmCheckboxChecked: {
    backgroundColor: '#ef4444',
  },
  confirmCheckboxLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    flex: 1,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  confirmCancelBtn: {
    borderRadius: 10,
  },
  confirmSubmitBtn: {
    borderRadius: 10,
  },
});

export default MyAppointments;
