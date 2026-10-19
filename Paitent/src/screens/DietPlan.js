import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Modal, RefreshControl, Share, Alert } from 'react-native';
import { Text, Surface, ActivityIndicator, Chip, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { COLORS, SIZES } from '../constants/theme';
import { ChevronRight, Calendar, Info, ShieldAlert, Award, Coffee, Utensils, Apple, Moon, ChevronLeft, Lock, Share2, FileText } from 'lucide-react-native';
import { scheduleDietNotifications } from '../utils/notificationHelper';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const DietPlan = ({ navigation }) => {
  const { user, userData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allNutritionPlans, setAllNutritionPlans] = useState([]);
  const [nutritionPlan, setNutritionPlan] = useState(null);
  const [showFullGridModal, setShowFullGridModal] = useState(false);
  const [selectedDayTab, setSelectedDayTab] = useState(1);

  const cleanPhone = (userData?.phone || user?.phoneNumber || '').replace(/\D/g, '').slice(-10);

  const fetchNutritionPlan = () => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    // Subscribe to nutrition_plans collection
    const qNutri = query(
      collection(db, 'nutrition_plans'),
      where('patientId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(qNutri, async (snap) => {
      let allFound = [];
      if (!snap.empty) {
        snap.forEach(ds => allFound.push({ id: ds.id, ...ds.data() }));
      }

      if (cleanPhone) {
        // Fallback search by phone number variations
        const possiblePhones = [
          cleanPhone,
          `+91${cleanPhone}`,
          `+91 ${cleanPhone}`
        ];
        const qNutriPhone = query(
          collection(db, 'nutrition_plans'),
          where('patientPhone', 'in', possiblePhones)
        );
        try {
          const snapPhone = await getDocs(qNutriPhone);
          if (!snapPhone.empty) {
            snapPhone.forEach(ds => {
              if (!allFound.some(p => p.id === ds.id)) {
                allFound.push({ id: ds.id, ...ds.data() });
              }
            });
          }
        } catch (err) {
          console.error("Phone query failed for nutrition plan: ", err);
        }
      }

      let foundPlan = null;
      if (allFound.length > 0) {
        allFound.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setAllNutritionPlans(allFound);

        // Try to keep the currently selected plan active, otherwise default to the newest one
        setNutritionPlan(prev => {
          if (prev && allFound.some(p => p.id === prev.id)) {
            const stillActive = allFound.find(p => p.id === prev.id);
            foundPlan = stillActive;
            return stillActive;
          }
          foundPlan = allFound[0];
          return allFound[0];
        });

        // Set fallback for foundPlan if prev wasn't ready
        if (!foundPlan) foundPlan = allFound[0];
      } else {
        setAllNutritionPlans([]);
        setNutritionPlan(null);
      }

      // Calculate current day offset and default target tabs
      if (foundPlan && foundPlan.paymentStatus === 'paid') {
        const currentDay = getDayNumber(foundPlan);
        setSelectedDayTab(currentDay);
        // Reschedule/schedule daily morning & evening notifications for diet plan
        scheduleDietNotifications(foundPlan);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error listening to nutrition plans:", error);
      setLoading(false);
    });

    return unsubscribe;
  };

  useEffect(() => {
    const unsub = fetchNutritionPlan();
    return () => {
      if (unsub) unsub();
    };
  }, [user?.uid, cleanPhone]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNutritionPlan();
    setRefreshing(false);
  };

  const getDayNumber = (plan) => {
    if (!plan || !plan.startDate) return 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(plan.startDate);
    start.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays < 1) return 1;
    if (diffDays > 30) return 30; // Cycle maxes at 30
    return diffDays;
  };

  const generateNutritionReceiptHtml = (plan) => {
    let paymentBreakdownRows = '';
    let totalAmount = Number(plan.amount || 500);

    if (plan.paymentMethod === 'split' && plan.paymentSplitDetails) {
      paymentBreakdownRows = Object.entries(plan.paymentSplitDetails).map(([method, val]) => `
        <tr>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#475569; font-weight:bold; text-transform:capitalize;">Split Collection (${method.toUpperCase()})</td>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#1e293b; text-align:right; font-weight:700;">₹${Number(val).toFixed(2)}</td>
        </tr>
      `).join('');
    } else {
      const methodStr = (plan.paymentMethod || 'cash').toUpperCase();
      paymentBreakdownRows = `
        <tr>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#475569; font-weight:bold;">Payment Mode (${methodStr})</td>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#1e293b; text-align:right; font-weight:700;">₹${totalAmount.toFixed(2)}</td>
        </tr>
      `;
    }

    const patientName = plan.patientName || 'Patient';
    const cleanPhone = (plan.patientPhone || '').replace(/\D/g, '').slice(-10);
    const transactionId = plan.paymentId || 'TXN_NUT_' + Math.random().toString(36).substring(2, 10).toUpperCase();

    let paidAtStr = 'N/A';
    if (plan.paymentCollectedAt) {
      try {
        paidAtStr = plan.paymentCollectedAt.seconds
          ? new Date(plan.paymentCollectedAt.seconds * 1000).toLocaleString('en-GB')
          : new Date(plan.paymentCollectedAt).toLocaleString('en-GB');
      } catch (e) {
        paidAtStr = new Date().toLocaleString('en-GB');
      }
    } else {
      paidAtStr = new Date().toLocaleString('en-GB');
    }

    const doctorName = plan.doctorName || 'Consultant';
    const branchName = plan.branchName || 'Clinic Branch';
    const startDate = plan.startDate || 'N/A';
    const expiryDate = plan.expiryDate || 'N/A';

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
        <div>
          <div class="clinic-logo-text">SPIRITUAL</div>
          <div class="clinic-tagline">WWW.SPIRITUALHOMEO.COM</div>
        </div>
      </div>
      <div class="receipt-title">Nutrition Service Receipt</div>
      
      <div class="meta-section">
        <div class="meta-col">
          <div class="meta-label">Patient Name</div>
          <div class="meta-value">${patientName}</div>
          <div style="font-size: 11px; color:#475569; margin-top: 2px;">+91 ${cleanPhone || 'N/A'}</div>
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
            <th>Nutrition Plan Service</th>
            <th style="text-align: right;">Details</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="font-weight: 700; color: #1e293b;">Prescribed By</td>
            <td style="text-align: right; color: #475569;">Dr. ${doctorName}</td>
          </tr>
          <tr>
            <td style="font-weight: 700; color: #1e293b;">Validity Period</td>
            <td style="text-align: right; color: #475569;">${startDate} to ${expiryDate}</td>
          </tr>
          <tr>
            <td style="font-weight: 700; color: #1e293b;">Branch Location</td>
            <td style="text-align: right; color: #475569;">${branchName}</td>
          </tr>
          <tr>
            <td style="font-weight: 700; color: #1e293b;">Payment Timestamp</td>
            <td style="text-align: right; color: #475569;">${paidAtStr}</td>
          </tr>
          ${paymentBreakdownRows}
        </tbody>
      </table>

      <div class="amount-box">
        <div>
          <div class="amount-title">Total Paid</div>
          <div class="amount-val">₹${totalAmount.toFixed(2)}</div>
        </div>
        <div class="paid-stamp">PAID ✓</div>
      </div>

      <div class="footer">
        <div class="footer-left">
          <div>☎ 9030 176 176</div>
          <div>✉ support@spiritualhomeo.com</div>
        </div>
        <div class="footer-right">
          <div>Branch: <span class="branch-highlight">${branchName}</span></div>
          <div>www.spiritualhomeo.com</div>
        </div>
      </div>
    </div>
  </body>
  </html>
      `;
  };

  const handleShareNutritionReceiptPDF = async () => {
    if (!nutritionPlan) return;
    try {
      const html = generateNutritionReceiptHtml(nutritionPlan);
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const cleanPatientName = (nutritionPlan.patientName || 'Patient').replace(/[^a-zA-Z0-9]/g, '_');
      const shareableUri = FileSystem.cacheDirectory + `Receipt_Diet_${cleanPatientName}.pdf`;
      await FileSystem.copyAsync({
        from: uri,
        to: shareableUri
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(shareableUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Receipt_Diet_${cleanPatientName}.pdf`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Saved', `Receipt PDF saved to: ${shareableUri}`);
      }
    } catch (err) {
      console.warn('Silent sharing cancellation or error:', err);
    }
  };

  const handleShareNutritionDietText = async () => {
    if (!nutritionPlan) return;
    try {
      const deficiencies = nutritionPlan.deficiencies?.join(', ') || 'None';
      const avoid = nutritionPlan.foodsToAvoid || 'None specified.';
      const eat = nutritionPlan.foodsToEat || 'None specified.';

      let scheduleSummary = '';
      if (nutritionPlan.meals && nutritionPlan.meals.length > 0) {
        nutritionPlan.meals.slice(0, 3).forEach(m => {
          scheduleSummary += `Day ${m.dayNumber}:\n- Breakfast: ${m.breakfast}\n- Lunch: ${m.lunch}\n- Snacks: ${m.snacks}\n- Dinner: ${m.dinner}\n\n`;
        });
      }

      const message = `*SPIRITUAL HOMEOPATHY - MY DIET PLAN*

Prescribed by Dr. ${nutritionPlan.doctorName || 'General Doctor'}
Validity: ${nutritionPlan.startDate} to ${nutritionPlan.expiryDate}

*Vitals & Physical Stats:*
- Age: ${nutritionPlan.age} yrs
- Height: ${nutritionPlan.height} cm
- Weight: ${nutritionPlan.weight} kg
- BMI: ${nutritionPlan.bmi}
- Deficiencies: ${deficiencies}

*Dietary Guidelines:*
❌ Foods to Avoid:
${avoid}

✔️ Foods to Eat:
${eat}

*Diet Schedule (First 3 Days preview):*
${scheduleSummary}
...
View the full 30-Day schedule directly inside your Spiritual Homeopathy Mobile App!`;

      await Share.share({
        message,
        title: 'My Diet Plan'
      });
    } catch (err) {
      console.log('Error sharing diet plan:', err);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loaderText}>Preparing your diet plan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Case 1: No Plan prescribed at all
  if (!nutritionPlan) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.header, { flexDirection: 'row', alignItems: 'center' }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>My Diet Plan</Text>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={styles.centerScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Surface style={styles.glassCard}>
            <ShieldAlert size={64} color={COLORS.primary} style={styles.centerIcon} />
            <Text style={styles.emptyTitle}>No Diet Plan Prescribed</Text>
            <Text style={styles.emptyDesc}>
              A personalized 30-day nutrition and diet plan can help accelerate your recovery by targeting deficiencies.
            </Text>
            <View style={styles.bulletList}>
              <View style={styles.bulletItem}>
                <Info size={16} color={COLORS.primary} />
                <Text style={styles.bulletText}>Targets Vit A, B, C, D, E, K deficiencies</Text>
              </View>
              <View style={styles.bulletItem}>
                <Info size={16} color={COLORS.primary} />
                <Text style={styles.bulletText}>Disorder adjustments (Diabetes/BP/Thyroid)</Text>
              </View>
              <View style={styles.bulletItem}>
                <Info size={16} color={COLORS.primary} />
                <Text style={styles.bulletText}>Includes 30 distinct daily prefilled menus</Text>
              </View>
            </View>
            <Button
              mode="contained"
              buttonColor={COLORS.primary}
              textColor="white"
              style={styles.actionBtn}
              onPress={() => navigation.navigate('BookAppointment')}
            >
              Consult a Doctor
            </Button>
          </Surface>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Case 2: Plan is prescribed but pending payment
  if (nutritionPlan.paymentStatus === 'pending') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.header, { flexDirection: 'row', alignItems: 'center' }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>My Diet Plan</Text>
            <Text style={styles.headerSubtitle}>Prescribed by {nutritionPlan.doctorName ? (nutritionPlan.doctorName.startsWith('Dr.') || nutritionPlan.doctorName.startsWith('Dr ') ? nutritionPlan.doctorName : `Dr. ${nutritionPlan.doctorName}`) : ''}</Text>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={styles.centerScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {allNutritionPlans.length > 1 && (
            <View style={styles.planSelectorContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.planSelectorScroll}>
                {allNutritionPlans.map((plan, index) => (
                  <TouchableOpacity
                    key={plan.id}
                    style={[styles.planSelectorTab, nutritionPlan?.id === plan.id && styles.planSelectorTabActive]}
                    onPress={() => setNutritionPlan(plan)}
                  >
                    <Text style={[styles.planSelectorText, nutritionPlan?.id === plan.id && styles.planSelectorTextActive]}>
                      {plan.patientName} • {plan.createdAt?.seconds ? new Date(plan.createdAt.seconds * 1000).toLocaleDateString('en-GB') : `Plan ${index + 1}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          <Surface style={styles.glassCard}>
            <Lock size={64} color="#f59e0b" style={styles.centerIcon} />
            <Text style={styles.emptyTitle}>Plan Pending Payment</Text>
            <Text style={styles.emptyDesc}>
              {nutritionPlan.doctorName ? (nutritionPlan.doctorName.startsWith('Dr.') || nutritionPlan.doctorName.startsWith('Dr ') ? nutritionPlan.doctorName : `Dr. ${nutritionPlan.doctorName}`) : 'Dr. Physician'} has prescribed your custom 30-Day Diet Plan.
            </Text>

            <Surface style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Service Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Amount Due:</Text>
                <Text style={styles.summaryValue}>₹{nutritionPlan.amount}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Intake BMI:</Text>
                <Text style={styles.summaryValue}>{nutritionPlan.bmi || 'N/A'}</Text>
              </View>
              {nutritionPlan.deficiencies && nutritionPlan.deficiencies.length > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Target Deficiencies:</Text>
                  <Text style={styles.summaryValue}>{nutritionPlan.deficiencies.join(', ')}</Text>
                </View>
              )}
            </Surface>

            <Text style={styles.paymentNotice}>
              ✓ Complete the payment at the clinic reception counter to instantly unlock the plan in your mobile app.
            </Text>
          </Surface>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Case 3: Plan is unlocked and paid
  const todayDayNum = getDayNumber(nutritionPlan);
  const currentMeals = nutritionPlan.meals?.find(m => m.dayNumber === selectedDayTab) || {
    breakfast: 'Healthy Breakfast',
    lunch: 'Balanced Lunch',
    snacks: 'Evening Snack',
    dinner: 'Light Dinner'
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: 'row', alignItems: 'center' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>My 30-Day Diet Plan</Text>
          <Text style={styles.headerSubtitle}>Prescribed by {nutritionPlan.doctorName ? (nutritionPlan.doctorName.startsWith('Dr.') || nutritionPlan.doctorName.startsWith('Dr ') ? nutritionPlan.doctorName : `Dr. ${nutritionPlan.doctorName}`) : ''}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={handleShareNutritionReceiptPDF}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Download Invoice"
          >
            <FileText size={16} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShareNutritionDietText}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Share Diet"
          >
            <Share2 size={16} color="#16a34a" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {allNutritionPlans.length > 1 && (
          <View style={styles.planSelectorContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.planSelectorScroll}>
              {allNutritionPlans.map((plan, index) => (
                <TouchableOpacity
                  key={plan.id}
                  style={[styles.planSelectorTab, nutritionPlan?.id === plan.id && styles.planSelectorTabActive]}
                  onPress={() => setNutritionPlan(plan)}
                >
                  <Text style={[styles.planSelectorText, nutritionPlan?.id === plan.id && styles.planSelectorTextActive]}>
                    {plan.patientName} • {plan.createdAt?.seconds ? new Date(plan.createdAt.seconds * 1000).toLocaleDateString('en-GB') : `Plan ${index + 1}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Status Tracker */}
        <Surface style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.statusCol}>
              <Text style={styles.statusLabel}>Current Cycle</Text>
              <Text style={styles.statusVal}>Day {todayDayNum} / 30</Text>
            </View>
            <View style={[styles.statusCol, { alignItems: 'flex-end' }]}>
              <Text style={styles.statusLabel}>Plan Status</Text>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>ACTIVE ✓</Text>
              </View>
            </View>
          </View>
          <View style={styles.statusProgressContainer}>
            <View style={[styles.statusProgressBar, { width: `${(todayDayNum / 30) * 100}%` }]} />
          </View>
        </Surface>

        {/* Day selection slider */}
        <View style={styles.sliderContainer}>
          <Text style={styles.sectionTitle}>Select Day View</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sliderContent}>
            {Array.from({ length: 30 }, (_, i) => i + 1).map((day) => {
              const isSelected = selectedDayTab === day;
              const isToday = todayDayNum === day;
              return (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.daySliderBtn,
                    isSelected && styles.daySliderBtnActive,
                    isToday && styles.daySliderBtnToday
                  ]}
                  onPress={() => setSelectedDayTab(day)}
                >
                  <Text style={[styles.daySliderText, isSelected && styles.daySliderTextActive]}>Day {day}</Text>
                  {isToday && <Text style={styles.todayLabelMini}>Today</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Meal cards */}
        <View style={styles.mealsHeader}>
          <Text style={styles.sectionTitle}>Diet Menu - Day {selectedDayTab}</Text>
          <TouchableOpacity style={styles.gridLink} onPress={() => setShowFullGridModal(true)}>
            <Text style={styles.gridLinkText}>View Full 30 Days</Text>
            <ChevronRight size={14} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        <Surface style={styles.mealCard}>
          <View style={styles.mealHeader}>
            <View style={[styles.mealIconBox, { backgroundColor: '#fef3c7' }]}>
              <Coffee size={20} color="#d97706" />
            </View>
            <Text style={styles.mealTitle}>Breakfast</Text>
          </View>
          <Text style={styles.mealDescription}>{currentMeals.breakfast || 'Healthy Breakfast Portion'}</Text>
        </Surface>

        <Surface style={styles.mealCard}>
          <View style={styles.mealHeader}>
            <View style={[styles.mealIconBox, { backgroundColor: '#dcfce7' }]}>
              <Utensils size={20} color="#16a34a" />
            </View>
            <Text style={styles.mealTitle}>Lunch</Text>
          </View>
          <Text style={styles.mealDescription}>{currentMeals.lunch || 'Nutrient-rich lunch meals'}</Text>
        </Surface>

        <Surface style={styles.mealCard}>
          <View style={styles.mealHeader}>
            <View style={[styles.mealIconBox, { backgroundColor: '#e0f2fe' }]}>
              <Apple size={20} color="#0284c7" />
            </View>
            <Text style={styles.mealTitle}>Evening Snacks</Text>
          </View>
          <Text style={styles.mealDescription}>{currentMeals.snacks || 'Roasted makhanas, nuts, or fresh juices'}</Text>
        </Surface>

        <Surface style={styles.mealCard}>
          <View style={styles.mealHeader}>
            <View style={[styles.mealIconBox, { backgroundColor: '#f3e8ff' }]}>
              <Moon size={20} color="#7c3aed" />
            </View>
            <Text style={styles.mealTitle}>Dinner</Text>
          </View>
          <Text style={styles.mealDescription}>{currentMeals.dinner || 'Light dinner portion'}</Text>
        </Surface>

        {/* Eat & Avoid Guideline Cards */}
        <Surface style={[styles.guidelineCard, { borderLeftColor: COLORS.success, borderLeftWidth: 4 }]}>
          <Text style={[styles.guidelineTitle, { color: COLORS.success }]}>🟢 Foods to Eat</Text>
          <Text style={styles.guidelineBody}>{nutritionPlan.foodsToEat || 'No specific recommendations provided.'}</Text>
        </Surface>

        <Surface style={[styles.guidelineCard, { borderLeftColor: COLORS.danger, borderLeftWidth: 4 }]}>
          <Text style={[styles.guidelineTitle, { color: COLORS.danger }]}>🔴 Foods to Avoid</Text>
          <Text style={styles.guidelineBody}>{nutritionPlan.foodsToAvoid || 'No specific restrictions provided.'}</Text>
        </Surface>

        {/* Vitals summary */}
        <Surface style={styles.vitalsSummaryCard}>
          <Text style={styles.vitalsTitle}>Vitals & Intake Vitals</Text>
          <View style={styles.vitalsGrid}>
            <View style={styles.vitalItem}>
              <Text style={styles.vitalLabel}>Height</Text>
              <Text style={styles.vitalValue}>{nutritionPlan.height} cm</Text>
            </View>
            <View style={styles.vitalItem}>
              <Text style={styles.vitalLabel}>Weight</Text>
              <Text style={styles.vitalValue}>{nutritionPlan.weight} kg</Text>
            </View>
            <View style={styles.vitalItem}>
              <Text style={styles.vitalLabel}>BMI</Text>
              <Text style={styles.vitalValue}>{nutritionPlan.bmi}</Text>
            </View>
            <View style={styles.vitalItem}>
              <Text style={styles.vitalLabel}>Age</Text>
              <Text style={styles.vitalValue}>{nutritionPlan.age} yrs</Text>
            </View>
          </View>
        </Surface>
      </ScrollView>

      {/* Full Grid Modal */}
      <Modal visible={showFullGridModal} animationType="slide" onRequestClose={() => setShowFullGridModal(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowFullGridModal(false)} style={styles.closeBtn}>
              <ChevronLeft size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>30-Day Grid Schedule</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScrollContent}>
            {nutritionPlan.meals?.map((meal) => (
              <Surface key={meal.dayNumber} style={styles.modalGridItem}>
                <View style={styles.modalGridItemHeader}>
                  <Text style={styles.modalDayText}>Day {meal.dayNumber}</Text>
                  {todayDayNum === meal.dayNumber && (
                    <Chip style={{ backgroundColor: COLORS.success + '15' }} textStyle={{ color: COLORS.success, fontSize: 10, fontWeight: '700' }}>
                      Today
                    </Chip>
                  )}
                </View>
                <View style={styles.modalMealsGrid}>
                  <Text style={styles.modalMealSubText}><Text style={{ fontWeight: '700' }}>Breakfast: </Text>{meal.breakfast}</Text>
                  <Text style={styles.modalMealSubText}><Text style={{ fontWeight: '700' }}>Lunch: </Text>{meal.lunch}</Text>
                  <Text style={styles.modalMealSubText}><Text style={{ fontWeight: '700' }}>Snacks: </Text>{meal.snacks}</Text>
                  <Text style={styles.modalMealSubText}><Text style={{ fontWeight: '700' }}>Dinner: </Text>{meal.dinner}</Text>
                </View>
              </Surface>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.muted,
  },
  planSelectorContainer: {
    width: '100%',
    marginBottom: 20,
  },
  planSelectorScroll: {
    paddingHorizontal: 4,
    gap: 12,
  },
  planSelectorTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  planSelectorTabActive: {
    backgroundColor: COLORS.primary + '15',
    borderColor: COLORS.primary,
  },
  planSelectorText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  planSelectorTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  centerScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  glassCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
    alignItems: 'center',
  },
  centerIcon: {
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyDesc: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  bulletList: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bulletText: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
  },
  actionBtn: {
    width: '100%',
    borderRadius: 8,
    paddingVertical: 4,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '700',
  },
  summaryValue: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '800',
  },
  paymentNotice: {
    fontSize: 12,
    color: '#b45309',
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '600',
    backgroundColor: '#fffbeb',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  statusCard: {
    backgroundColor: '#ffffff',
    borderRadius: SIZES.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusCol: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusVal: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.text,
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 2,
  },
  statusBadgeText: {
    color: '#16a34a',
    fontSize: 11,
    fontWeight: '900',
  },
  statusProgressContainer: {
    height: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  statusProgressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  sliderContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
  },
  sliderContent: {
    gap: 8,
    paddingBottom: 4,
  },
  daySliderBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySliderBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  daySliderBtnToday: {
    borderColor: COLORS.secondary,
    borderWidth: 1.5,
  },
  daySliderText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  daySliderTextActive: {
    color: '#ffffff',
  },
  todayLabelMini: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.secondary,
    marginTop: 2,
  },
  mealsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gridLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gridLinkText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  mealCard: {
    backgroundColor: '#ffffff',
    borderRadius: SIZES.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  mealIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
  },
  mealDescription: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
    fontWeight: '600',
    paddingLeft: 48,
  },
  guidelineCard: {
    backgroundColor: '#ffffff',
    borderRadius: SIZES.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  guidelineTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  guidelineBody: {
    fontSize: 12,
    color: COLORS.text,
    lineHeight: 18,
    fontWeight: '600',
  },
  vitalsSummaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: SIZES.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 10,
  },
  vitalsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
  },
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  vitalItem: {
    width: (SCREEN_W - 72) / 2,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  vitalLabel: {
    fontSize: 9,
    color: COLORS.muted,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  vitalValue: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '800',
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  closeBtn: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  modalScrollContent: {
    padding: 16,
    gap: 12,
  },
  modalGridItem: {
    backgroundColor: '#ffffff',
    borderRadius: SIZES.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalGridItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
    marginBottom: 8,
  },
  modalDayText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  modalMealsGrid: {
    gap: 6,
  },
  modalMealSubText: {
    fontSize: 12,
    color: COLORS.text,
    lineHeight: 16,
  },
});

export default DietPlan;
