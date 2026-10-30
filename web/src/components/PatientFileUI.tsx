import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FileText, Clock, MapPin, Phone, Megaphone, AlertCircle, Plus,
  Upload, Trash2, ArrowLeft, Calendar, Check, ExternalLink, RefreshCcw,
  Sparkles, Stethoscope, Apple, Share2, Award, FolderPlus, X, CheckCircle2,
  Printer, Eye, CreditCard, ChevronRight, Maximize2
} from 'lucide-react';
import { db, sanitizeDoctorName } from '@app/shared';
import { collection, onSnapshot, addDoc, updateDoc, doc, arrayUnion, setDoc, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { receptionDataStore } from '../utils/receptionDataStore';

const getFirebaseStorage = () => {
  try {
    const app = getApps().length ? getApp() : initializeApp({
      apiKey: "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
      authDomain: "spiritual-homeopathy-3b552.firebaseapp.com",
      projectId: "spiritual-homeopathy-3b552",
      storageBucket: "spiritual-homeopathy-3b552.firebasestorage.app",
      messagingSenderId: "81822616559",
      appId: "1:81822616559:web:98a0b9cd974938cc87841a"
    });
    return getStorage(app);
  } catch (e) {
    console.warn("Firebase storage init warning:", e);
    return null;
  }
};

const uploadPrescriptionToStorage = async (dataOrUri: string, patId?: string): Promise<string> => {
  if (!dataOrUri) return '';
  if (dataOrUri.startsWith('http://') || dataOrUri.startsWith('https://')) {
    return dataOrUri;
  }

  try {
    const storage = getFirebaseStorage();
    if (!storage) throw new Error("Firebase storage not available");

    const safePatId = (patId || 'unknown').toString().replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `prescriptions/${safePatId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
    const fileRef = storageRef(storage, filename);

    if (dataOrUri.startsWith('data:')) {
      await uploadString(fileRef, dataOrUri, 'data_url');
      const downloadUrl = await getDownloadURL(fileRef);
      return downloadUrl;
    }
  } catch (err) {
    console.warn("Storage upload notice:", err);
  }
  return dataOrUri;
};

export const formatDDMMYYYY = (dateStr?: any): string => {
  if (!dateStr) return '';
  const clean = String(dateStr).trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(clean)) return clean;
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split('-');
    return `${d}-${m}-${y}`;
  }
  if (clean.includes('T')) {
    const isoDate = clean.split('T')[0];
    const [y, m, d] = isoDate.split('-');
    if (y && m && d) return `${d}-${m}-${y}`;
  }
  if (clean.includes('/') || clean.includes('-')) {
    const parts = clean.split(/[\/\-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
      } else {
        return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
      }
    }
  }
  return clean;
};

export const toYYYYMMDD = (dateStr?: any): string => {
  if (!dateStr) return '';
  const clean = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  if (/^\d{2}-\d{2}-\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split('-');
    return `${y}-${m}-${d}`;
  }
  return clean;
};

export const DEFICIENCY_LIST = [
  'Vitamin A', 'Vitamin C', 'Vitamin E', 'Calcium', 'Magnesium',
  'Iron', 'Protein', 'Phosphorus', 'Vitamin B', 'Vitamin D',
  'Vitamin K', 'Potassium', 'Zinc', 'Sodium', 'Manganese'
];

export const DISORDERS_LIST = [
  'Sugar (Diabetes)', 'High BP / Hypertension', 'Thyroid', 'Gastritis',
  'IBS / IBD', 'GERD', 'Piles', 'PCOD', 'Insulin Resistance',
  'Hairfall', 'Melasma', 'Weight Gain', 'Weight Loss',
  'Height Growth', 'Adenoids / Tonsillitis', 'Allergies'
];

export const DEFICIENCY_NUTRITION_MAP: Record<string, { eat: string[]; avoid: string[] }> = {
  'Vitamin A': {
    eat: ['Carrots, Sweet Potatoes, Spinach, Papaya, Pumpkin', 'Desi Ghee (in moderation), Cow Milk, Cantaloupe'],
    avoid: ['Deep fried foods, Excess alcohol']
  },
  'Vitamin C': {
    eat: ['Amla (Indian Gooseberry), Oranges, Lemons, Guava', 'Kiwi, Bell Peppers, Tomatoes, Strawberries'],
    avoid: ['Overcooking vegetables (destroys Vit C), Carbonated soft drinks']
  },
  'Vitamin E': {
    eat: ['Almonds, Sunflower seeds, Spinach, Avocado', 'Olive oil, Hazelnuts, Peanuts'],
    avoid: ['Rancid re-used oils, Highly processed fried snacks']
  },
  'Calcium': {
    eat: ['Cow Milk, Ragi (Finger Millet), Paneer, Sesame Seeds', 'Tofu, Broccoli, Almonds, Fresh Curd'],
    avoid: ['Excess caffeine/tea, High sodium foods (leaches calcium), Carbonated sodas']
  },
  'Magnesium': {
    eat: ['Pumpkin seeds, Almonds, Dark leafy greens (Spinach/Methi)', 'Bananas, Dark Chocolate (70%+), Beans & Lentils'],
    avoid: ['Refined sugar, Excess alcohol, White maida products']
  },
  'Iron': {
    eat: ['Beetroot, Pomegranate, Dates, Jaggery (Gud)', 'Spinach, Rajma, Chana, Sesame seeds, Garden cress seeds'],
    avoid: ['Tea/Coffee immediately after meals (inhibits iron absorption), Taking calcium with iron']
  },
  'Protein': {
    eat: ['Moong Sprouts, Paneer, Boiled Egg Whites, Soya Chunks', 'Yellow/Green Moong Dal, Greek Yogurt, Chana, Almonds'],
    avoid: ['Junk food, Ultra-processed meats, Empty-calorie sweets']
  },
  'Phosphorus': {
    eat: ['Nuts & Seeds, Whole Grains (Brown Rice, Oats)', 'Cow Milk, Paneer, Lentils, Pumpkin seeds'],
    avoid: ['Phosphoric acid in colas/sodas, Processed cheese slices']
  },
  'Vitamin B': {
    eat: ['Whole Grains, Moong Sprouts, Bananas, Cow Milk', 'Curd, Green Peas, Peanuts, Leafy greens'],
    avoid: ['Refined flour (Maida), Excessive alcohol, High sugar intake']
  },
  'Vitamin D': {
    eat: ['Sunlight exposure (15-20 min early morning)', 'Egg Yolks, Fortified Milk, Mushrooms, Paneer'],
    avoid: ['Sedentary indoor lifestyle, High sugar & trans-fats']
  },
  'Vitamin K': {
    eat: ['Green Leafy Vegetables (Kale, Spinach, Methi)', 'Cabbage, Broccoli, Green Peas, Mustard greens'],
    avoid: ['Ultra-processed junk food']
  },
  'Potassium': {
    eat: ['Tender Coconut Water, Bananas, Sweet Potatoes', 'Spinach, Oranges, Pomegranate, Muskmelon'],
    avoid: ['High-sodium canned foods, Salty packaged chips']
  },
  'Zinc': {
    eat: ['Pumpkin seeds, Sesame seeds, Chickpeas (Kabuli Chana)', 'Cashews, Watermelon seeds, Whole grains'],
    avoid: ['Alcohol, Excessive refined carbohydrates']
  },
  'Sodium': {
    eat: ['Pink Himalayan Salt (in moderation), Tender Coconut Water', 'Celery, Natural soups, Spinach'],
    avoid: ['Excess table salt, Salted chips, Commercial pickles, Canned soups']
  },
  'Manganese': {
    eat: ['Whole Grains (Oats, Barley), Pineapples, Nuts', 'Leafy greens, Black tea, Legumes'],
    avoid: ['Refined processed foods']
  }
};

export const formatDoctorName = (name: string | null | undefined, branchContext?: string | null): string => {
  return sanitizeDoctorName(name, branchContext);
};

export const parseToYMD = (raw: any): string => {
  if (!raw) return '';
  let str = String(raw).trim();
  if (!str) return '';
  if (str.toLowerCase() === 'today') {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (str.includes('T')) {
    str = str.split('T')[0];
  }
  const slashParts = str.split(/[/-]/);
  if (slashParts.length === 3) {
    if (slashParts[2].length === 4) {
      return `${slashParts[2]}-${slashParts[1].padStart(2, '0')}-${slashParts[0].padStart(2, '0')}`;
    }
    if (slashParts[0].length === 4) {
      return `${slashParts[0]}-${slashParts[1].padStart(2, '0')}-${slashParts[2].padStart(2, '0')}`;
    }
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  return str;
};

export const formatDisplayDate = (rawDate: any): string => {
  const ymd = parseToYMD(rawDate);
  if (!ymd) return 'Today';
  const todayYMD = parseToYMD('today');
  if (ymd === todayYMD) return 'Today';
  const parts = ymd.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return rawDate || 'Today';
};

export const DISORDER_NUTRITION_MAP: Record<string, { eat: string[]; avoid: string[] }> = {
  'Sugar (Diabetes)': {
    eat: ['Jamun, Methi (Fenugreek) seeds water, Cinnamon water', 'Whole oats, Ragi, Barley, Bitter Gourd (Karela) juice', 'High-fiber salads, Sprouts'],
    avoid: ['White Sugar, Maida, Sweets, Bakery items', 'Carbonated drinks, White Rice, Fruit juices with added sugar', 'High GI fruits (Mangoes/Chiku in excess)']
  },
  'High BP / Hypertension': {
    eat: ['Tender Coconut Water, Garlic (1 clove on empty stomach)', 'Flaxseeds, Bananas, Beetroot juice, Cucumber', 'Watermelon, Oats'],
    avoid: ['Extra raw table salt, Commercial Pickles, Papad', 'Salted chips, Processed meats, Canned foods, Soy sauce']
  },
  'Thyroid': {
    eat: ['Brazil Nuts (Selenium), Sunflower seeds, Whole Grains', 'Iodized salt (moderate), Mushrooms, Eggs, Pumpkins'],
    avoid: ['Raw cruciferous veggies (Raw Cabbage/Cauliflower in large excess)', 'Excessive Soy products, Refined sugar, Fried foods']
  },
  'Gastritis': {
    eat: ['Warm Buttermilk with Roasted Cumin & Curry leaves', 'Soft Moong Dal Khichdi, Oats porridge, Aloe Vera juice', 'Boiled Lauki (Bottle Gourd), Steamed Apple'],
    avoid: ['Extremely spicy red/green chillies, Deep-fried snacks', 'Coffee, Tea, Alcohol, Carbonated drinks, Citrus fruits on empty stomach']
  },
  'IBS / IBD': {
    eat: ['Low-FODMAP foods, Soft Boiled Rice with Curd', 'Steamed Carrots, Pumpkin, Peppermint tea, Oats'],
    avoid: ['Spicy food, Raw salads (hard to digest), Fried foods', 'Artificial sweeteners, Milk (if lactose sensitive), Alcohol']
  },
  'GERD': {
    eat: ['Cold Milk (2 tbsp), Fennel seed (Saunf) water', 'Bananas, Oatmeal, Ginger tea (mild), Alkaline green veggies'],
    avoid: ['Late night heavy meals, Mint/Peppermint (relaxes sphincter)', 'Chocolate, Citrus fruits, Tomatoes, Spicy & oily foods']
  },
  'Piles': {
    eat: ['High-Fiber foods: Fig (Anjeer soaked), Prunes, Isabgol (Psyllium husk)', 'Tender Coconut water, Curd rice, Oats, Plenty of warm water (3L/day)'],
    avoid: ['Spicy chilies, Maida, Fast food, Red meat', 'Astringent green unripened bananas, Bakery products']
  },
  'PCOD': {
    eat: ['Cinnamon infusion, Spearmint tea (reduces androgens)', 'Flaxseeds, Sprouts, Quinoa, Oats, Green leafy veggies'],
    avoid: ['Refined sugar, Maida, Trans-fats, Dairy excess', 'Sugary beverages, Processed fast food']
  },
  'Insulin Resistance': {
    eat: ['Apple Cider Vinegar (1 tsp in warm water before meals)', 'Methi water, Chia seeds, Sprouts, High-protein meals'],
    avoid: ['Refined carbs, Maida, Fruit juices, Sweets', 'Frequent snacking without protein/fiber balance']
  },
  'Hairfall': {
    eat: ['Fresh Curry Leaves, Amla, Almonds, Walnuts', 'Flaxseeds, Spinach, Eggs, Black Sesame seeds, Coconut water'],
    avoid: ['Junk food, Excess sugar, Alcohol, Excessive caffeine', 'Refined oils']
  },
  'Melasma': {
    eat: ['Antioxidant-rich Berries, Tomatoes (Lycopene), Carrots', 'Green Tea, Citrus fruits, Spinach, Vitamin E nuts'],
    avoid: ['Processed fried food, Excessive sugar, Inflammatory seed oils']
  },
  'Weight Gain': {
    eat: ['Banana-Date Shake with Almonds, Paneer, Peanut butter', 'Soaked Almonds & Raisins, Ragi malt, Whole Milk, Avocado'],
    avoid: ['Junk calories, Empty sugary drinks, Skipping meals']
  },
  'Weight Loss': {
    eat: ['Warm Lemon-Honey Water (morning), High-fiber salads', 'Sprouts, Green Tea, Moong Dal Soup, Cucumbers, Bottle Gourd juice'],
    avoid: ['Deep fried foods, Maida, Sweets, Sugar sodas', 'Late night heavy dinners, Bakery items, Trans-fats']
  },
  'Height Growth': {
    eat: ['Cow Milk, Paneer, Eggs, Ragi, Moong Sprouts', 'Soybeans, Sesame seeds, Fresh fruits, Pumpkin seeds'],
    avoid: ['Carbonated colas (depletes calcium), Junk fast food', 'Irregular sleep schedule']
  },
  'Adenoids / Tonsillitis': {
    eat: ['Warm Golden Turmeric Milk, Ginger-Honey Tea', 'Warm Vegetable Soups, Tulsi infusion, Soft lukewarm porridge'],
    avoid: ['Ice creams, Cold refrigerated drinks, Deep fried crispy food', 'Excess sour curd at night, Carbonated beverages']
  },
  'Allergies': {
    eat: ['Warm Water throughout the day, Turmeric, Ginger, Tulsi', 'Amla, Citrus fruits (Vit C), Local Raw Honey, Garlic'],
    avoid: ['Cold refrigerated items, Preservatives & Artificial colors', 'Junk food, Excess dairy if mucous-producing']
  }
};

export const calculateBmi = (hCm: string, wKg: string): string => {
  const h = parseFloat(hCm);
  const w = parseFloat(wKg);
  if (!h || !w || h <= 0 || w <= 0) return '';
  const hM = h / 100;
  const val = w / (hM * hM);
  let category = '';
  if (val < 18.5) category = 'Underweight';
  else if (val <= 24.9) category = 'Normal';
  else if (val <= 29.9) category = 'Overweight';
  else category = 'Obese';
  return `${val.toFixed(1)} (${category})`;
};

export const generateNutritionSuggestions = (
  selectedDefs: Record<string, boolean>,
  selectedDis: Record<string, boolean>
) => {
  const eatSet = new Set<string>();
  const avoidSet = new Set<string>();

  Object.keys(selectedDefs).forEach(key => {
    if (selectedDefs[key] && DEFICIENCY_NUTRITION_MAP[key]) {
      DEFICIENCY_NUTRITION_MAP[key].eat.forEach(item => eatSet.add(item));
      DEFICIENCY_NUTRITION_MAP[key].avoid.forEach(item => avoidSet.add(item));
    }
  });

  Object.keys(selectedDis).forEach(key => {
    if (selectedDis[key] && DISORDER_NUTRITION_MAP[key]) {
      DISORDER_NUTRITION_MAP[key].eat.forEach(item => eatSet.add(item));
      DISORDER_NUTRITION_MAP[key].avoid.forEach(item => avoidSet.add(item));
    }
  });

  if (eatSet.size === 0) {
    eatSet.add('Fresh green leafy vegetables, Moong Sprouts, Fresh fruits (Amla, Papaya, Oranges)');
    eatSet.add('Whole grains (Ragi, Oats, Brown rice), Tender coconut water, Soaked almonds & seeds');
  }
  if (avoidSet.size === 0) {
    avoidSet.add('White Sugar, Maida, Deep-fried & oily snacks, Carbonated drinks, Excessive tea/coffee');
  }

  return {
    eat: Array.from(eatSet).map(s => `• ${s}`).join('\n'),
    avoid: Array.from(avoidSet).map(s => `• ${s}`).join('\n')
  };
};

export interface DayDietItem {
  day: number;
  phase: number;
  phaseTitle: string;
  breakfast: string;
  lunch: string;
  snacks: string;
  dinner: string;
}

export const generate30DayDietPlanMenu = (
  selectedDefs: Record<string, boolean> = {},
  selectedDis: Record<string, boolean> = {}
): DayDietItem[] => {
  const activeDefs = Object.keys(selectedDefs).filter(k => selectedDefs[k]);
  const activeDis = Object.keys(selectedDis).filter(k => selectedDis[k]);

  // Extract condition flags
  const hasDiabetes = Boolean(selectedDis['Sugar (Diabetes)'] || selectedDis['Insulin Resistance']);
  const hasBP = Boolean(selectedDis['High BP / Hypertension']);
  const hasThyroid = Boolean(selectedDis['Thyroid']);
  const hasGastritis = Boolean(selectedDis['Gastritis'] || selectedDis['GERD'] || selectedDis['IBS / IBD']);
  const hasPiles = Boolean(selectedDis['Piles']);
  const hasPCOD = Boolean(selectedDis['PCOD']);
  const hasHairfall = Boolean(selectedDis['Hairfall'] || selectedDis['Melasma']);
  const hasWeightLoss = Boolean(selectedDis['Weight Loss']);
  const hasWeightGain = Boolean(selectedDis['Weight Gain']);
  const hasHeightGrowth = Boolean(selectedDis['Height Growth']);
  const hasTonsillitis = Boolean(selectedDis['Adenoids / Tonsillitis'] || selectedDis['Allergies']);

  const hasVitA = Boolean(selectedDefs['Vitamin A']);
  const hasVitC = Boolean(selectedDefs['Vitamin C']);
  const hasVitE = Boolean(selectedDefs['Vitamin E']);
  const hasCalcium = Boolean(selectedDefs['Calcium'] || selectedDefs['Vitamin D']);
  const hasIron = Boolean(selectedDefs['Iron']);
  const hasProtein = Boolean(selectedDefs['Protein']);
  const hasMagnesium = Boolean(selectedDefs['Magnesium'] || selectedDefs['Potassium'] || selectedDefs['Zinc']);

  // Morning drink boosters based on active conditions
  const morningDrinks: string[] = [];
  if (hasGastritis) morningDrinks.push('Saunf Water');
  if (hasDiabetes) morningDrinks.push('Methi Water');
  if (hasBP) morningDrinks.push('Coconut Water');
  if (hasIron || hasVitC) morningDrinks.push('Amla Shot');
  if (hasPCOD) morningDrinks.push('Cinnamon Tea');
  if (hasHairfall) morningDrinks.push('Curry Leaves Juice');
  if (hasWeightLoss) morningDrinks.push('Warm Lemon Honey Water');
  if (hasWeightGain) morningDrinks.push('Warm Milk with Soaked Almonds');
  if (hasTonsillitis) morningDrinks.push('Golden Turmeric Water');
  if (morningDrinks.length === 0) morningDrinks.push('Warm Saunf Water');

  return Array.from({ length: 30 }, (_, index) => {
    const day = index + 1;
    let phase = 1;
    let phaseTitle = 'Phase 1: Detox & Gut Reset';
    if (day > 10 && day <= 20) {
      phase = 2;
      phaseTitle = 'Phase 2: Metabolic Correction';
    } else if (day > 20) {
      phase = 3;
      phaseTitle = 'Phase 3: Sustained Vitality';
    }

    const drink = morningDrinks[(day - 1) % morningDrinks.length];

    // Base meals
    let breakfast = '';
    let lunch = '';
    let snacks = '';
    let dinner = '';

    // Day-based variations
    if (day % 3 === 1) {
      breakfast = `${drink} + Steamed Oats Idli with Mint Chutney`;
      lunch = `2 Jowar Rotis + Yellow Moong Dal + Sautéed Lauki`;
      snacks = `Roasted Makhana + Green Tea`;
      dinner = `Light Moong Dal Khichdi + Cucumber Raita`;
    } else if (day % 3 === 2) {
      breakfast = `${drink} + Moong Sprouts Salad with Pomegranate`;
      lunch = `1 Cup Brown Rice / Ragi Roti + Palak Dal + Sautéed Bhindi`;
      snacks = `Soaked Almonds (5) & Walnuts (2) + Coconut Water`;
      dinner = `Mixed Vegetable Soup + Oats Upma`;
    } else {
      breakfast = `${drink} + Ragi Dosa with Vegetable Sambhar`;
      lunch = `2 Bajra Rotis + Methi Dal + Turmeric Sautéed Pumpkin`;
      snacks = `Roasted Chana + Cinnamon Lemon Tea`;
      dinner = `Dalia Khichdi with Carrots & Peas`;
    }

    // Apply Deficiencies & Disorders Boosters dynamically to Meals
    if (hasDiabetes) {
      breakfast = breakfast.replace('Idli', 'Oats Methi Idli').replace('Dosa', 'Besan Oats Chilla');
      lunch = lunch.replace('Brown Rice', 'Brown Rice / Barley').concat(' + Jamun / Karela Juice');
      dinner += ' + Cinnamon Infusion';
    }

    if (hasBP) {
      lunch += ' + Garlic Cucumbers (Low Salt)';
      snacks = snacks.replace('Green Tea', 'Coconut Water & Flaxseeds');
    }

    if (hasGastritis) {
      breakfast = breakfast.replace('Mint Chutney', 'Mild Saunf Dip');
      lunch += ' + Fresh Cumin Buttermilk';
      dinner = 'Soft Moong Dal Khichdi + Lauki Raita (Gentle on stomach)';
    }

    if (hasPiles) {
      breakfast += ' + 2 Soaked Figs (Anjeer)';
      snacks += ' + Isabgol Warm Water';
    }

    if (hasIron) {
      breakfast += ' + Soaked Dates & Jaggery';
      lunch += ' + Beetroot & Pomegranate Salad';
    }

    if (hasVitA) {
      breakfast += ' + Steamed Papaya / Carrots';
      dinner += ' + Pumpkin Soup';
    }

    if (hasCalcium) {
      breakfast += ' + Cow Milk / Ragi Malt';
      dinner += ' + Golden Turmeric Milk before bed';
    }

    if (hasProtein) {
      breakfast = breakfast.replace('Salad', 'Salad + Paneer / Boiled Egg Whites');
      lunch += ' + Soya Chunks / Sprouts';
    }

    if (hasHairfall) {
      snacks += ' + Black Sesame & Flaxseeds';
    }

    if (hasWeightLoss) {
      lunch = lunch.replace('2 ', '1.5 ');
      snacks = 'High-Fiber Salad / Roasted Makhana + Green Tea';
    }

    if (hasWeightGain) {
      snacks = 'Banana Date Shake with Peanut Butter & Almonds';
    }

    if (hasTonsillitis) {
      breakfast = breakfast.replace('Salad', 'Warm Porridge');
      dinner += ' + Warm Tulsi Ginger Tea';
    }

    return {
      day,
      phase,
      phaseTitle,
      breakfast,
      lunch,
      snacks,
      dinner
    };
  });
};

export interface PatientFileUIProps {
  patient: any;
  doctorName?: string;
  onClose?: () => void;
  onSubmitConsultation?: (data: any) => Promise<void> | void;
  onRegisterPackage?: (packageInfo: any) => void;
  isStandalonePage?: boolean;
  userRoleTitle?: string;
  isDoctor?: boolean;
}

export const PatientFileUI: React.FC<PatientFileUIProps> = ({
  patient,
  doctorName = '',
  onClose,
  onSubmitConsultation,
  onRegisterPackage,
  isStandalonePage = false,
  userRoleTitle = '',
  isDoctor = false,
}) => {
  const [activeTab, setActiveTab] = useState<'clinical' | 'diet' | 'media' | 'package'>('clinical');

  // Patient Info Values (Clean real data extraction, NO mock fallbacks)
  const patientName = patient?.patientName || patient?.fullName || patient?.name || patient?.patient_name || patient?.patient || '';
  const regId = patient?.registrationId || patient?.regId || patient?.regNo || patient?.patientId || patient?.registrationNo || patient?.uhid || patient?.patient_id || '';
  const phone = String(patient?.phone || patient?.phoneNumber || patient?.mobile || patient?.mobileNumber || patient?.contact || patient?.contactNumber || patient?.phoneNo || '').trim();
  const branchName = patient?.branch || patient?.branchName || patient?.targetBranch || '';
  const source = patient?.source || patient?.leadSource || patient?.marketingSource || '';
  const subject = patient?.diseases || patient?.subject || patient?.complaint || patient?.chiefComplaints || '';

  // --- TAB 1: CLINICAL FORM STATE ---
  const [diagnosisNotes, setDiagnosisNotes] = useState('');
  const [drawPrescription, setDrawPrescription] = useState<'on' | 'off'>('off');
  const [physicalFile, setPhysicalFile] = useState<File | null>(null);
  const [followUpInterval, setFollowUpInterval] = useState('No Follow-up');
  const [preferredFollowUpDate, setPreferredFollowUpDate] = useState(patient?.preferredFollowUpDate || patient?.followUpDate || '');
  const [pharmacyFee, setPharmacyFee] = useState('');

  // Canvas State & Enlarged Canvas State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasHasContent, setCanvasHasContent] = useState(false);
  const [isEnlargeCanvasOpen, setIsEnlargeCanvasOpen] = useState(false);
  const enlargedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingEnlarged, setIsDrawingEnlarged] = useState(false);
  const [penColor, setPenColor] = useState('#0284c7');
  const [penWidth, setPenWidth] = useState(3.5);
  const [isSavingEnlarged, setIsSavingEnlarged] = useState(false);
  const [enlargeToast, setEnlargeToast] = useState('');

  // --- TAB 2: DIET PLAN STATE ---
  const [selectedDietPlan, setSelectedDietPlan] = useState('+ Create New Diet Plan');
  const [age, setAge] = useState(patient?.age || patient?.patientAge || '');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [bmi, setBmi] = useState('');
  const [deficiencies, setDeficiencies] = useState<Record<string, boolean>>({});
  const [disorders, setDisorders] = useState<Record<string, boolean>>({});
  const [otherDisorders, setOtherDisorders] = useState('');
  const [symptomsSigns, setSymptomsSigns] = useState('');
  const [foodsToEat, setFoodsToEat] = useState('');
  const [foodsToAvoid, setFoodsToAvoid] = useState('');
  const [dietFeeAmount, setDietFeeAmount] = useState<string>(
    patient?.dietFeeAmount ? String(patient.dietFeeAmount) : (patient?.dietFee ? String(patient.dietFee) : (patient?.dietPlan?.dietFeeAmount ? String(patient.dietPlan.dietFeeAmount) : ''))
  );

  const [isDietSaved, setIsDietSaved] = useState(false);
  const hasCustomLoadedMenuRef = useRef(false);

  // 30-Day Diet Plan State
  const [dietMenuDays, setDietMenuDays] = useState<DayDietItem[]>([]);
  const [showFull30DayModal, setShowFull30DayModal] = useState(false);
  const [selectedPhaseFilter, setSelectedPhaseFilter] = useState<number | 'all'>('all');

  const handleHeightChange = (val: string) => {
    setHeight(val);
    setBmi(calculateBmi(val, weight));
  };

  const handleWeightChange = (val: string) => {
    setWeight(val);
    setBmi(calculateBmi(height, val));
  };

  const toggleDeficiency = (item: string) => {
    hasCustomLoadedMenuRef.current = false;
    const updated = { ...deficiencies, [item]: !deficiencies[item] };
    setDeficiencies(updated);
    const nut = generateNutritionSuggestions(updated, disorders);
    setFoodsToEat(nut.eat);
    setFoodsToAvoid(nut.avoid);
  };

  const toggleDisorder = (item: string) => {
    hasCustomLoadedMenuRef.current = false;
    const updated = { ...disorders, [item]: !disorders[item] };
    setDisorders(updated);
    const nut = generateNutritionSuggestions(deficiencies, updated);
    setFoodsToEat(nut.eat);
    setFoodsToAvoid(nut.avoid);
  };

  const applyDietPlanData = (diet: any) => {
    if (!diet) return;
    if (diet.selectedDietPlan) setSelectedDietPlan(diet.selectedDietPlan);
    if (diet.age) setAge(diet.age);
    if (diet.height) {
      setHeight(diet.height);
      if (diet.weight) setBmi(calculateBmi(diet.height, diet.weight));
    }
    if (diet.weight) {
      setWeight(diet.weight);
      if (diet.height) setBmi(calculateBmi(diet.height, diet.weight));
    }
    if (diet.bmi) setBmi(diet.bmi);
    if (diet.otherDisorders !== undefined) setOtherDisorders(diet.otherDisorders);
    if (diet.symptomsSigns !== undefined) setSymptomsSigns(diet.symptomsSigns);
    if (diet.foodsToEat !== undefined) setFoodsToEat(diet.foodsToEat);
    if (diet.foodsToAvoid !== undefined) setFoodsToAvoid(diet.foodsToAvoid);
    if (diet.dietFeeAmount !== undefined) setDietFeeAmount(diet.dietFeeAmount);

    if (Array.isArray(diet.deficiencies)) {
      const dMap: Record<string, boolean> = {};
      diet.deficiencies.forEach((k: string) => { dMap[k] = true; });
      setDeficiencies(dMap);
    } else if (diet.deficiencies && typeof diet.deficiencies === 'object') {
      setDeficiencies(diet.deficiencies);
    }

    if (Array.isArray(diet.disorders)) {
      const disMap: Record<string, boolean> = {};
      diet.disorders.forEach((k: string) => { disMap[k] = true; });
      setDisorders(disMap);
    } else if (diet.disorders && typeof diet.disorders === 'object') {
      setDisorders(diet.disorders);
    }

    if (diet.dietMenuDays && Array.isArray(diet.dietMenuDays) && diet.dietMenuDays.length > 0) {
      hasCustomLoadedMenuRef.current = true;
      setDietMenuDays(diet.dietMenuDays);
    }
  };

  useEffect(() => {
    if (hasCustomLoadedMenuRef.current) return;
    setDietMenuDays(generate30DayDietPlanMenu(deficiencies, disorders));
  }, [deficiencies, disorders]);

  // Real-time Firestore Sync for Diet Plan (Web <-> Mobile)
  useEffect(() => {
    if (patient?.dietPlan) {
      applyDietPlanData(patient.dietPlan);
    }

    if (!db) return;
    const cleanRegId = (regId || phone || patient?.id || '').replace(/[\/\s#]/g, '_');
    const unsubList: (() => void)[] = [];

    if (cleanRegId) {
      const unsubDiet = onSnapshot(doc(db, 'diet_plans', cleanRegId), (snap) => {
        if (snap.exists()) {
          applyDietPlanData(snap.data());
        }
      }, (err) => console.log('Diet plan doc sync err:', err));
      unsubList.push(unsubDiet);
    }

    if (patient?.id) {
      const unsubApp = onSnapshot(doc(db, 'appointments', patient.id), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data?.dietPlan) {
            applyDietPlanData(data.dietPlan);
          }
          if (Array.isArray(data?.uploadedPrescriptions)) {
            setUploadedImages(prev => Array.from(new Set([...prev, ...data.uploadedPrescriptions])));
          }
        }
      }, (err) => console.log('Appt live sync err:', err));
      unsubList.push(unsubApp);
    }

    const loadFromQuery = async () => {
      try {
        if (regId) {
          const q = query(collection(db, 'diet_plans'), where('regId', '==', regId), limit(1));
          const querySnap = await getDocs(q);
          if (!querySnap.empty) {
            applyDietPlanData(querySnap.docs[0].data());
          }
        }
      } catch (e) { }
    };
    loadFromQuery();

    return () => {
      unsubList.forEach(u => u());
    };
  }, [patient?.id, regId, phone]);

  // --- TAB 3: SHARE MEDIA STATE (LIVE FROM CLINIC MEDIA MANAGER) ---
  const isPatientAppBooking = Boolean(
    patient?.source === 'UserApp' ||
    patient?.source === 'Patient App' ||
    patient?.bookingSource === 'Patient App' ||
    patient?.isAppBooking === true ||
    patient?.bookedFrom === 'patient_app' ||
    patient?.isPatientApp === true
  );

  const [clinicMediaItems, setClinicMediaItems] = useState<any[]>([]);
  const [sharedPatientMedia, setSharedPatientMedia] = useState<any[]>(() => {
    if (Array.isArray(patient?.sharedMedia)) return patient.sharedMedia;
    return [];
  });
  const [mediaSearchQuery, setMediaSearchQuery] = useState('');
  const [selectedMediaCategory, setSelectedMediaCategory] = useState<string>('all');
  const [sharingMediaId, setSharingMediaId] = useState<string | null>(null);

  // Subscribe to live Reception clinic_media_items
  useEffect(() => {
    if (!db) return;
    try {
      const q = collection(db, 'clinic_media_items');
      const unsub = onSnapshot(q, (snap) => {
        const list: any[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setClinicMediaItems(list);
      }, (err) => console.log('Media items load notice:', err));
      return () => unsub();
    } catch (e) { }
  }, []);

  // Subscribe to patient's shared media
  useEffect(() => {
    if (!db) return;
    const patId = patient?.id;
    if (!patId) return;
    try {
      const unsub = onSnapshot(doc(db, 'appointments', patId), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.sharedMedia)) {
            setSharedPatientMedia(data.sharedMedia);
          }
        }
      });
      return () => unsub();
    } catch (e) { }
  }, [patient?.id]);

  const handleShareMediaItem = async (mediaItem: any) => {
    if (!isPatientAppBooking) {
      alert('Media sharing is disabled because this appointment was not booked via the Patient App.');
      return;
    }
    const cleanPhone = String(patient?.phone || phone || '').replace(/\D/g, '').slice(-10);
    const targetDocId = patient?.id;
    const mediaObj = {
      id: mediaItem.id || Date.now().toString(),
      title: mediaItem.title || 'Educational Media',
      url: mediaItem.url || '',
      category: mediaItem.category || 'General',
      notes: mediaItem.notes || '',
      folderName: mediaItem.folderName || '',
      doctorName: doctorName || 'Doctor',
      sharedAt: new Date().toISOString()
    };

    setSharingMediaId(mediaItem.id || 'new');
    try {
      setSharedPatientMedia(prev => {
        if (prev.some(m => m.url === mediaObj.url || (m.id && m.id === mediaObj.id))) return prev;
        return [...prev, mediaObj];
      });

      if (db && targetDocId) {
        await updateDoc(doc(db, 'appointments', targetDocId), {
          sharedMedia: arrayUnion(mediaObj),
          lastUpdated: new Date().toISOString()
        }).catch(() => { });
        await updateDoc(doc(db, 'allpatients', targetDocId), {
          sharedMedia: arrayUnion(mediaObj)
        }).catch(() => { });
      }

      if (db) {
        await addDoc(collection(db, 'shared_patient_media'), {
          ...mediaObj,
          patientPhone: cleanPhone,
          patientName: patientName || 'Patient',
          regId: regId || '',
          appointmentId: targetDocId || ''
        }).catch(() => { });
      }

      alert(`"${mediaObj.title}" shared successfully to patient's My Media!`);
    } catch (err: any) {
      console.warn('Share media error:', err);
      alert('Failed to share media: ' + (err.message || 'Error'));
    } finally {
      setSharingMediaId(null);
    }
  };

  const handleRevokeSharedMedia = async (urlToRevoke: string) => {
    const targetDocId = patient?.id;
    const updated = sharedPatientMedia.filter(m => m.url !== urlToRevoke);
    setSharedPatientMedia(updated);

    if (db && targetDocId) {
      try {
        await updateDoc(doc(db, 'appointments', targetDocId), {
          sharedMedia: updated,
          lastUpdated: new Date().toISOString()
        });
        await updateDoc(doc(db, 'allpatients', targetDocId), {
          sharedMedia: updated
        });
      } catch (e) { }
    }
  };

  // --- TAB 4: REGISTER PACKAGE STATE ---
  const [totalPackageAmount, setTotalPackageAmount] = useState('');
  const [initialAdvancePaid, setInitialAdvancePaid] = useState('0');
  const [packagePurpose, setPackagePurpose] = useState('');
  const [packageDuration, setPackageDuration] = useState('3 Months');
  const [packageStartDate, setPackageStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [packageEndDate, setPackageEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Uploaded Prescriptions State
  const [uploadedImages, setUploadedImages] = useState<string[]>(() => {
    const list: string[] = [];
    const add = (v: any) => {
      if (!v) return;
      if (Array.isArray(v)) {
        v.forEach(x => {
          if (typeof x === 'string') list.push(x);
          else if (x && typeof x === 'object') {
            const u = x.url || x.imageUrl || x.prescriptionUrl || x.fileUrl || x.uri;
            if (u && typeof u === 'string') list.push(u);
          }
        });
      } else if (typeof v === 'string' && v.trim()) {
        list.push(v.trim());
      } else if (v && typeof v === 'object') {
        const u = v.url || v.imageUrl || v.prescriptionUrl || v.fileUrl || v.uri;
        if (u && typeof u === 'string') list.push(u);
      }
    };
    add(patient?.uploadedPrescriptions);
    add(patient?.prescriptionUrls);
    add(patient?.prescriptionUrl);
    add(patient?.prescriptionImage);
    add(patient?.prescriptionImages);
    add(patient?.canvasPrescriptionUrl);
    add(patient?.canvasUrl);
    add(patient?.imageUrl);
    add(patient?.fileUrl);
    return Array.from(new Set(list.filter(Boolean)));
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          const base64Url = event.target.result as string;
          let cloudUrl = base64Url;
          try {
            cloudUrl = await uploadPrescriptionToStorage(base64Url, patient?.id || patient?.patientId || regId);
          } catch (e) {
            console.warn("Storage upload err:", e);
          }

          if (cloudUrl.startsWith('data:') && cloudUrl.length > 400000) {
            alert("Image exceeds database limit. Please upload a smaller image file.");
            return;
          }

          setUploadedImages((prev) => {
            if (prev.includes(cloudUrl)) return prev;
            return [...prev, cloudUrl];
          });

          // Save directly to Firebase Firestore if patient appointment document exists
          if (patient?.id && db) {
            try {
              const appRef = doc(db, 'appointments', patient.id);
              await updateDoc(appRef, {
                uploadedPrescriptions: arrayUnion(cloudUrl),
                updatedAt: new Date().toISOString()
              }).catch(() => { });

              await updateDoc(doc(db, 'allpatients', patient.id), {
                uploadedPrescriptions: arrayUnion(cloudUrl)
              }).catch(() => { });

              await updateDoc(doc(db, 'patients', patient.id), {
                uploadedPrescriptions: arrayUnion(cloudUrl)
              }).catch(() => { });
            } catch (err) {
              console.log('Firebase upload note:', err);
            }
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveWebImage = async (idx: number) => {
    const updated = uploadedImages.filter((_, i) => i !== idx);
    setUploadedImages(updated);

    if (patient?.id && db) {
      try {
        const appRef = doc(db, 'appointments', patient.id);
        await updateDoc(appRef, {
          uploadedPrescriptions: updated,
          updatedAt: new Date().toISOString()
        }).catch(() => { });

        await updateDoc(doc(db, 'allpatients', patient.id), {
          uploadedPrescriptions: updated
        }).catch(() => { });

        await updateDoc(doc(db, 'patients', patient.id), {
          uploadedPrescriptions: updated
        }).catch(() => { });
      } catch (err) {
        console.log('Firebase remove image error:', err);
      }
    }
  };

  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // --- MEDICAL HISTORY & PAST VISITS FETCHING ---
  const [patientVisits, setPatientVisits] = useState<any[]>([]);
  const [selectedVisitModal, setSelectedVisitModal] = useState<any | null>(null);
  const [showAllVisitsModal, setShowAllVisitsModal] = useState(false);
  const [fullPrescriptionPreview, setFullPrescriptionPreview] = useState<string | null>(null);
  const [historyFilterTab, setHistoryFilterTab] = useState<'all' | 'prescriptions' | 'billing'>('all');

  const allVisitedPrescriptionImages = useMemo(() => {
    const list: Array<{ uri: string; visitDate: string; visitNumber: number; doctorName?: string }> = [];
    patientVisits.forEach((v, vIdx) => {
      const vNum = patientVisits.length - vIdx;
      const vDate = v.visitDate || '';
      const imgs = Array.from(new Set([
        ...(v.canvasPrescriptionUrl ? [v.canvasPrescriptionUrl] : []),
        ...(v.uploadedPrescriptions || [])
      ].filter(Boolean)));
      imgs.forEach((uri) => {
        list.push({ uri, visitDate: vDate, visitNumber: vNum, doctorName: v.doctorName });
      });
    });
    return list;
  }, [patientVisits]);

  const totalPaidSum = useMemo(() => {
    return patientVisits.reduce((acc, v) => acc + (Number(v.paidAmount) || 0), 0);
  }, [patientVisits]);

  useEffect(() => {
    let isMounted = true;
    const phoneCandidates = [
      patient?.phone, patient?.phoneNumber, patient?.mobile, patient?.mobileNumber,
      patient?.contact, patient?.contactNumber, phone
    ].map(p => String(p || '').replace(/\D/g, '').slice(-10)).filter(p => p.length === 10);

    const regCandidates = [
      patient?.registrationId, patient?.regId, patient?.patientId, patient?.regNo,
      patient?.registrationNo, patient?.uhid, patient?.id, regId
    ].map(r => String(r || '').trim().toLowerCase()).filter(Boolean);

    const nameCandidates = [
      patient?.patientName, patient?.name, patient?.fullName, patientName
    ].map(n => String(n || '').trim().toLowerCase()).filter(Boolean);
    const firstName = nameCandidates[0]?.split(' ')[0] || '';

    const formatFirebaseStorageUrl = (url: string | null | undefined): string => {
      if (!url || typeof url !== 'string') return '';
      const trimmed = url.trim();
      if (!trimmed) return '';
      if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('data:') ||
        trimmed.startsWith('blob:')
      ) {
        return trimmed;
      }
      if (trimmed.startsWith('gs://')) {
        const parts = trimmed.replace('gs://', '').split('/');
        const bucket = parts.shift();
        const filePath = parts.join('/');
        return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(filePath)}?alt=media`;
      }
      const bucketName = 'spiritual-homeopathy-3b552.firebasestorage.app';
      const cleanPath = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
      return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(cleanPath)}?alt=media`;
    };

    const fetchLiveVisits = async () => {
      if (!db) return;
      const unsubs: Array<() => void> = [];
      const storeMap = new Map<string, any>();
      const todayYMD = parseToYMD('today');

      const getTimestamp = (item: any): number => {
        try {
          const val = item?.createdAt || item?.savedAt || item?.updatedAt || item?.date;
          if (!val) return 0;
          if (typeof val === 'number') return isNaN(val) ? 0 : val;
          if (typeof val === 'string') {
            const t = new Date(val).getTime();
            return isNaN(t) ? 0 : t;
          }
          if (typeof val === 'object') {
            if (typeof val.seconds === 'number') return val.seconds * 1000;
            if (typeof val.toDate === 'function') {
              const t = val.toDate().getTime();
              return isNaN(t) ? 0 : t;
            }
          }
        } catch (_) { }
        return 0;
      };

      const getSortWeight = (item: any): number => {
        if (item.normalizedDate === todayYMD || item.visitDate === 'Today') {
          return 9999999999999; // Always at the very top (Present / Today first!)
        }
        if (item.normalizedDate) {
          const t = new Date(item.normalizedDate).getTime();
          if (!isNaN(t) && t > 0) return t;
        }
        return getTimestamp(item);
      };

      const updateVisitsState = () => {
        if (!isMounted) return;
        const allList = Array.from(storeMap.values()).filter(v => {
          // 1. Exclude future dates (e.g. 30/10/2026 or any date after today)
          if (v.normalizedDate && v.normalizedDate > todayYMD) return false;

          // 2. Exclude the current ongoing consultation session that is being edited right now
          if (patient?.id && (v.id === patient.id || v.appointmentId === patient.id)) {
            const isCompletedCurrent = String(v.status).toLowerCase() === 'completed';
            const hasCurrentMeds = Array.isArray(v.medicines) && v.medicines.length > 0;
            const hasCurrentPaid = Number(v.paidAmount) > 0 || String(v.paymentStatus).toLowerCase() === 'paid';
            if (!isCompletedCurrent && !hasCurrentMeds && !hasCurrentPaid) {
              return false;
            }
          }

          // 3. Strictly require genuine clinical consultation records or paid billing:
          const hasMeds = Array.isArray(v.medicines) && v.medicines.length > 0;
          const hasImages = (Array.isArray(v.uploadedPrescriptions) && v.uploadedPrescriptions.length > 0) || Boolean(v.canvasPrescriptionUrl);
          const hasDiagnosis = Boolean(v.diagnosisNotes && String(v.diagnosisNotes).trim().length > 0 && v.diagnosisNotes !== 'Clinical consultation & prescription recorded.');
          const hasPayment = Number(v.paidAmount) > 0 || String(v.paymentStatus).toLowerCase() === 'paid';
          const isCompleted = String(v.status || '').toLowerCase() === 'completed';

          return hasMeds || hasImages || hasDiagnosis || hasPayment || isCompleted;
        });
        allList.sort((a, b) => getSortWeight(b) - getSortWeight(a));
        setPatientVisits(allList);
      };

      const processDoc = (data: any, docId: string) => {
        if (!data) return;

        const docPhone = String(data.phone || data.phoneNumber || data.mobile || data.mobileNumber || data.contact || data.contactNumber || data.phoneNo || '').replace(/\D/g, '').slice(-10);

        const docRegs = [
          data.registrationId, data.regId, data.patientId, data.regNo,
          data.registrationNo, data.uhid, data.patient_id
        ].map(r => String(r || '').trim().toLowerCase()).filter(Boolean);

        const docName = String(data.patientName || data.name || data.fullName || data.patient_name || data.patient || '').trim().toLowerCase();
        const incomingApptId = String(data.appointmentId || data.apptId || data.id || '').trim();

        // Explicit ID / document linking
        const isLinkedDoc = Boolean(
          (patient?.id && (docId === patient.id || incomingApptId === patient.id)) ||
          (patient?.patientDocId && (docId === patient.patientDocId || incomingApptId === patient.patientDocId)) ||
          regCandidates.includes(docId.toLowerCase()) ||
          (incomingApptId && regCandidates.includes(incomingApptId.toLowerCase()))
        );

        // Strict Phone and Reg matching
        const isPhoneMatch = Boolean(docPhone && docPhone.length === 10 && phoneCandidates.includes(docPhone));
        const isRegMatch = docRegs.some(r => regCandidates.includes(r));

        let isMatch = false;
        if (isPhoneMatch || isRegMatch || isLinkedDoc) {
          isMatch = true;
        } else if (phoneCandidates.length === 0 && regCandidates.length === 0 && nameCandidates.length > 0) {
          isMatch = Boolean(docName && nameCandidates.includes(docName));
        }

        if (isMatch) {
          let rawDate = data.appointmentDate || data.date || data.scheduledDate || data.visitDate || data.prescriptionDate || data.createdAt;
          let normDate = parseToYMD(rawDate);
          if (!normDate || normDate.toLowerCase() === 'today') {
            normDate = todayYMD;
          }

          // Skip future appointments (e.g. tomorrow 30/10/2026) - they have not visited yet!
          if (normDate && normDate > todayYMD) {
            return;
          }

          const normBranch = String(data.branch || data.branchName || branchName || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();

          // Find existing visit in storeMap representing the same day/visit (merge duplicates!)
          let matchedKey: string | null = null;
          for (const [key, ex] of storeMap.entries()) {
            const isApptMatch = incomingApptId && (ex.id === incomingApptId || ex.appointmentId === incomingApptId);
            const isDocIdMatch = ex.id === docId || ex.appointmentId === docId;
            const isSameDate = normDate && ex.normalizedDate === normDate;
            if (isApptMatch || isDocIdMatch || isSameDate) {
              matchedKey = key;
              break;
            }
          }

          const visitKey = matchedKey || (normDate ? `visit_${normDate}` : (incomingApptId || docId));
          const existing = storeMap.get(visitKey);

          // Extract ALL images/prescriptions from all possible fields and formats
          const rawImages: string[] = [];
          const extractImages = (val: any) => {
            if (!val) return;
            if (Array.isArray(val)) {
              val.forEach(item => {
                if (!item) return;
                if (typeof item === 'string') rawImages.push(item);
                else if (typeof item === 'object') {
                  const u = item.url || item.imageUrl || item.prescriptionUrl || item.fileUrl || item.downloadURL || item.uri;
                  if (u && typeof u === 'string') rawImages.push(u);
                }
              });
            } else if (typeof val === 'string' && val.trim()) {
              rawImages.push(val.trim());
            } else if (typeof val === 'object') {
              const u = val.url || val.imageUrl || val.prescriptionUrl || val.fileUrl || val.downloadURL || val.uri;
              if (u && typeof u === 'string') rawImages.push(u);
            }
          };

          extractImages(data.uploadedPrescriptions);
          extractImages(data.prescriptionUrls);
          extractImages(data.prescriptionUrl);
          extractImages(data.prescriptionImage);
          extractImages(data.prescriptionImages);
          extractImages(data.prescriptions);
          extractImages(data.reports);
          extractImages(data.media);
          extractImages(data.images);
          extractImages(data.documents);
          extractImages(data.attachments);
          extractImages(data.rxUrl);
          extractImages(data.rxUrls);
          extractImages(data.fileUrl);
          extractImages(data.documentUrl);
          extractImages(data.attachmentUrls);

          const canvasUrl = formatFirebaseStorageUrl(data.canvasPrescriptionUrl || data.canvasUrl || existing?.canvasPrescriptionUrl || null);

          const docMedicines = data.items || data.medicines || data.remedies || data.prescribedMedicines || data.prescriptionItems || data.medications || data.rx || data.typedPrescriptions || [];

          const combinedMedicines = [
            ...(existing?.medicines || []),
            ...(Array.isArray(docMedicines) ? docMedicines : [])
          ];
          const medicineMap = new Map();
          combinedMedicines.forEach((m) => {
            if (m) {
              const mName = m.name || m.medicineName || m.remedyName || (typeof m === 'string' ? m : null);
              if (mName && mName !== '[object Object]') {
                medicineMap.set(mName, typeof m === 'object' ? m : { name: mName, dosage: '', frequency: '', duration: '', instructions: '' });
              }
            }
          });
          const mergedMedicines = Array.from(medicineMap.values());

          const formattedRawImages = rawImages.filter(Boolean).map(formatFirebaseStorageUrl).filter(Boolean);

          const combinedPrescriptions = Array.from(new Set([
            ...(existing?.uploadedPrescriptions || []),
            ...formattedRawImages
          ]));

          const rawDoc = data.doctorName || data.doctor || existing?.doctorName || patient?.doctorName || patient?.doctor || doctorName;
          const targetBranch = data.branch || data.branchName || existing?.branch || branchName;
          const docNameFormatted = formatDoctorName(rawDoc, targetBranch);
          const displayDate = normDate === todayYMD ? 'Today' : formatDisplayDate(normDate);

          // REAL Amount Paid calculation (NO '500' mock fallback!)
          const rawPaid = data.totalPaid ?? data.paidAmount ?? data.amountPaid ?? data.targetAmount ?? data.amount;
          const consultFee = Number(data.consultationFee) || 0;
          const medFee = Number(data.medicineFee || data.totalMedicineFee) || 0;
          const dietFee = Number(data.dietFee || data.dietFeeAmount) || 0;
          const otherFee = Number(data.otherCharges) || 0;
          const discount = Number(data.discount) || 0;
          const computedTotal = Math.max(0, consultFee + medFee + dietFee + otherFee - discount);

          let finalPaidAmount = 0;
          let paymentStatus = 'pending';

          if (rawPaid !== undefined && rawPaid !== null && rawPaid !== '' && !isNaN(Number(rawPaid))) {
            finalPaidAmount = Number(rawPaid);
            paymentStatus = finalPaidAmount > 0 ? 'paid' : (data.paymentStatus || 'pending');
          } else if (String(data.paymentStatus).toLowerCase() === 'paid') {
            finalPaidAmount = computedTotal > 0 ? computedTotal : (existing?.paidAmount || 0);
            paymentStatus = 'paid';
          } else if (existing?.paidAmount !== undefined) {
            finalPaidAmount = Number(existing.paidAmount);
            paymentStatus = existing.paymentStatus || 'pending';
          } else {
            finalPaidAmount = 0;
            paymentStatus = data.paymentStatus || 'pending';
          }

          const realDiagnosis = data.diagnosisNotes && data.diagnosisNotes !== 'Clinical consultation & prescription recorded.'
            ? data.diagnosisNotes
            : (existing?.diagnosisNotes || data.prescriptionNotes || '');

          storeMap.set(visitKey, {
            id: existing?.id || incomingApptId || docId || visitKey,
            appointmentId: existing?.appointmentId || incomingApptId || docId,
            status: data.status || existing?.status || '',
            patientName: data.patientName || data.fullName || data.name || patientName,
            regId: data.registrationId || data.regId || data.regNo || regId,
            normalizedDate: normDate,
            normalizedBranch: normBranch || existing?.normalizedBranch,
            visitDate: displayDate,
            visitTime: data.appointmentTime || data.time || existing?.visitTime || '',
            doctorName: docNameFormatted,
            branch: targetBranch || branchName || '',
            consultationMode: data.consultationMode || existing?.consultationMode || 'In-Clinic',
            paidAmount: finalPaidAmount,
            totalAmount: computedTotal > 0 ? computedTotal : finalPaidAmount,
            paymentStatus: paymentStatus,
            paymentMode: data.paymentMode || existing?.paymentMode || '',
            subject: data.diseases || data.subject || existing?.subject || '',
            diseases: data.diseases || data.subject || existing?.diseases || '',
            diagnosisNotes: realDiagnosis,
            medicines: mergedMedicines,
            canvasPrescriptionUrl: canvasUrl,
            uploadedPrescriptions: combinedPrescriptions,
            createdAt: data.createdAt || existing?.createdAt || new Date().toISOString()
          });
        }
      };

      // 1. Process current patient appointment data only if it already has completed consultation/prescription data
      if (patient) {
        const hasPastData = (Array.isArray(patient.items) && patient.items.length > 0) ||
          (Array.isArray(patient.medicines) && patient.medicines.length > 0) ||
          (Array.isArray(patient.uploadedPrescriptions) && patient.uploadedPrescriptions.length > 0) ||
          Boolean(patient.canvasPrescriptionUrl) ||
          (patient.diagnosisNotes && patient.diagnosisNotes !== 'Clinical consultation & prescription recorded.') ||
          patient.status === 'completed' ||
          String(patient.paymentStatus).toLowerCase() === 'paid' ||
          Number(patient.paidAmount) > 0;
        if (hasPastData) {
          processDoc(patient, patient.id || 'current_patient');
        }
      }

      // 2. Process records from memory receptionDataStore pool immediately (0ms instant display)
      try {
        const memoryPool = receptionDataStore.getAllCollectionsPool();
        if (Array.isArray(memoryPool) && memoryPool.length > 0) {
          memoryPool.forEach((item: any) => {
            if (item) processDoc(item, item.id || item.docId || '');
          });
          updateVisitsState();
        }
      } catch (e) {
        console.warn('Memory pool visit processing notice:', e);
      }

      // 3. Fast targeted queries for ONLY this patient in Firestore
      try {
        const safeGet = (q: any) => Promise.race([
          getDocs(q).catch(() => ({ docs: [] })),
          new Promise((res) => setTimeout(() => res({ docs: [] }), 2500))
        ]);

        const queriesToRun: any[] = [];
        const primaryPhone = phoneCandidates[0];
        const primaryReg = regCandidates[0];

        if (primaryPhone) {
          ['appointments', 'allpatients', 'patients', 'medicine_requests', 'prescriptions'].forEach((col) => {
            queriesToRun.push(safeGet(query(collection(db, col), where('phone', '==', primaryPhone), limit(25))));
            queriesToRun.push(safeGet(query(collection(db, col), where('phoneNumber', '==', primaryPhone), limit(25))));
            queriesToRun.push(safeGet(query(collection(db, col), where('phone', '==', `+91${primaryPhone}`), limit(25))));
            queriesToRun.push(safeGet(query(collection(db, col), where('phoneNumber', '==', `+91${primaryPhone}`), limit(25))));
          });
        }

        if (primaryReg) {
          ['appointments', 'allpatients', 'patients', 'prescriptions'].forEach((col) => {
            queriesToRun.push(safeGet(query(collection(db, col), where('registrationId', '==', primaryReg), limit(25))));
            queriesToRun.push(safeGet(query(collection(db, col), where('regId', '==', primaryReg), limit(25))));
            queriesToRun.push(safeGet(query(collection(db, col), where('patientId', '==', primaryReg), limit(25))));
          });
        }

        if (patient?.id) {
          ['appointments', 'allpatients', 'patients', 'prescriptions'].forEach((col) => {
            queriesToRun.push(
              getDoc(doc(db, col, patient.id))
                .then((snap) => (snap.exists() ? { docs: [snap] } : { docs: [] }))
                .catch(() => ({ docs: [] }))
            );
          });
        }

        const results: any = await Promise.all(queriesToRun);
        if (!isMounted) return;

        results.forEach((snap: any) => {
          if (!snap || !snap.docs) return;
          snap.docs.forEach((d: any) => {
            processDoc(d.data(), d.id);
          });
        });

        updateVisitsState();
      } catch (queryErr) {
        console.warn('Error in targeted live visits query:', queryErr);
      }

      // 4. Targeted real-time listener on the current appointment document
      if (patient?.id) {
        try {
          const unsubCurrent = onSnapshot(doc(db, 'appointments', patient.id), (docSnap) => {
            if (docSnap.exists() && isMounted) {
              processDoc(docSnap.data(), docSnap.id);
              updateVisitsState();
            }
          }, () => { });
          unsubs.push(unsubCurrent);
        } catch (_) { }
      }

      return () => {
        unsubs.forEach((unsub) => unsub());
      };
    };

    fetchLiveVisits();

    return () => {
      isMounted = false;
    };
  }, [patientName, phone, regId, doctorName, branchName, subject]);

  // Deficiency items checklist
  const deficiencyList = [
    'Vitamin A', 'Vitamin C', 'Vitamin E', 'Calcium', 'Magnesium', 'Iron', 'Protein', 'Phosphorus',
    'Vitamin B', 'Vitamin D', 'Vitamin K', 'Potassium', 'Zinc', 'Sodium', 'Manganese'
  ];

  // Common Health Disorders pills
  const disordersList = [
    'Sugar (Diabetes)', 'High BP / Hypertension', 'Thyroid', 'Gastritis', 'IBS / IBD', 'GERD',
    'Piles', 'PCOD', 'Insulin Resistance', 'Hairfall', 'Melasma', 'Weight Gain', 'Weight Loss',
    'Height Growth', 'Adenoids / Tonsillitis', 'Allergies'
  ];

  // Canvas Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo((clientX - rect.left) * (canvas.width / rect.width), (clientY - rect.top) * (canvas.height / rect.height));
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.lineTo((clientX - rect.left) * (canvas.width / rect.width), (clientY - rect.top) * (canvas.height / rect.height));
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    setCanvasHasContent(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setCanvasHasContent(false);
  };

  // Enlarged Canvas Handlers
  const handleOpenEnlargeCanvas = () => {
    setDrawPrescription('on');
    setIsEnlargeCanvasOpen(true);
    setEnlargeToast('');
    setTimeout(() => {
      const eCanvas = enlargedCanvasRef.current;
      if (!eCanvas) return;
      const ctx = eCanvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, eCanvas.width, eCanvas.height);
      if (canvasRef.current && canvasHasContent) {
        ctx.drawImage(canvasRef.current, 0, 0, eCanvas.width, eCanvas.height);
      }
    }, 150);
  };

  const startDrawingEnlarged = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = enlargedCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawingEnlarged(true);
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo((clientX - rect.left) * (canvas.width / rect.width), (clientY - rect.top) * (canvas.height / rect.height));
  };

  const drawEnlarged = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingEnlarged) return;
    const canvas = enlargedCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.lineTo((clientX - rect.left) * (canvas.width / rect.width), (clientY - rect.top) * (canvas.height / rect.height));
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawingEnlarged = () => {
    setIsDrawingEnlarged(false);
  };

  const clearEnlargedCanvas = () => {
    const canvas = enlargedCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const handleSaveAndUpdateEnlargedPrescription = async () => {
    const eCanvas = enlargedCanvasRef.current;
    if (!eCanvas) return;

    setIsSavingEnlarged(true);
    try {
      const dataUrl = eCanvas.toDataURL('image/png');

      // 1. Synchronize to mini canvas preview
      const miniCanvas = canvasRef.current;
      if (miniCanvas) {
        const mCtx = miniCanvas.getContext('2d');
        if (mCtx) {
          mCtx.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
          mCtx.drawImage(eCanvas, 0, 0, miniCanvas.width, miniCanvas.height);
        }
      }
      setCanvasHasContent(true);
      setDrawPrescription('on');

      // 2. Upload to Firebase Storage or use dataUrl
      const targetDocId = patient?.id || patient?.appointmentId || patient?.patientId || regId;
      let finalUrl = dataUrl;
      try {
        finalUrl = await uploadPrescriptionToStorage(dataUrl, targetDocId);
      } catch (e) {
        console.warn("Storage upload notice:", e);
      }

      // 3. Update the prescription portion (uploadedImages)
      setUploadedImages((prev) => {
        const filtered = prev.filter(item => !item.startsWith('data:image/png'));
        return [finalUrl, ...filtered];
      });

      // 4. Update Firestore directly if targetDocId exists so it's immediately persisted
      if (db && targetDocId) {
        const targetCol = patient?.collectionName || 'appointments';
        const cols = Array.from(new Set([targetCol, 'appointments', 'allpatients', 'patients']));
        for (const col of cols) {
          try {
            await updateDoc(doc(db, col, targetDocId), {
              canvasPrescriptionUrl: finalUrl,
              uploadedPrescriptions: arrayUnion(finalUrl),
              updatedAt: new Date().toISOString()
            });
          } catch (e) { }
        }
      }

      setEnlargeToast('Prescription drawing saved & updated in prescription portion! ✓');
      setTimeout(() => {
        setEnlargeToast('');
        setIsEnlargeCanvasOpen(false);
      }, 1000);
    } catch (err) {
      console.error('Error saving enlarged prescription:', err);
    } finally {
      setIsSavingEnlarged(false);
    }
  };

  const handleSaveConsultation = async () => {
    if (saving) return;
    setSaving(true);

    // Save canvas drawing if present
    let canvasDataUrl: string | null = null;
    if (canvasRef.current && canvasHasContent) {
      try {
        canvasDataUrl = canvasRef.current.toDataURL('image/png');
      } catch (err) {
        console.error("Canvas export error:", err);
      }
    }

    const targetDocId = patient?.id || patient?.appointmentId || patient?.patientId || regId;

    const initialUploadedList: string[] = [...uploadedImages];
    if (canvasDataUrl && !initialUploadedList.includes(canvasDataUrl)) {
      initialUploadedList.unshift(canvasDataUrl);
    }
    setUploadedImages(initialUploadedList);

    const numDietFee = Number(dietFeeAmount) || 0;
    const numPharmacyFee = Number(pharmacyFee) || 0;
    const numConsultationFee = Number(patient?.consultationFee || patient?.fee || patient?.consultationFeeAmount) || 0;
    const totalCalculated = numPharmacyFee + numDietFee + numConsultationFee;
    const computedTarget = numPharmacyFee > 0 ? numPharmacyFee : (totalCalculated > 0 ? totalCalculated : 0);
    const docNameToSave = formatDoctorName(doctorName || patient?.doctorName || patient?.doctor);

    const basePayload = {
      patientId: targetDocId,
      patientName,
      regId,
      phone,
      diagnosisNotes,
      followUpInterval,
      preferredFollowUpDate: formatDDMMYYYY(preferredFollowUpDate),
      pharmacyFee,
      drawPrescription,
      uploadedPrescriptions: initialUploadedList,
      canvasPrescriptionUrl: canvasDataUrl,
    };

    const updatePayload = {
      uploadedPrescriptions: initialUploadedList,
      diagnosisNotes,
      consultationFee: numConsultationFee > 0 ? numConsultationFee : (patient?.consultationFee || 0),
      medicineFee: numPharmacyFee,
      pharmacyFee: numPharmacyFee,
      totalMedicineFee: numPharmacyFee,
      medicineFeeRequested: numPharmacyFee,
      targetAmount: computedTarget,
      target_amount: computedTarget,
      dietFee: numDietFee,
      dietFeeAmount: dietFeeAmount,
      totalAmount: totalCalculated > 0 ? totalCalculated : Number(patient?.totalAmount || 0),
      followUpInterval,
      preferredFollowUpDate: formatDDMMYYYY(preferredFollowUpDate),
      doctorName: docNameToSave,
      doctor: docNameToSave,
      ...(canvasDataUrl ? { canvasPrescriptionUrl: canvasDataUrl } : {}),
      status: 'collect_fee',
      paymentStatus: 'pending',
      paymentPending: true,
      feeCollectionNeeded: true,
      updatedAt: new Date().toISOString()
    };

    // 1. INSTANT LOCAL STORE UPDATE (0ms delay)
    if (targetDocId) {
      receptionDataStore.updateLocalAppointment(targetDocId, updatePayload);
    }

    const fullPayload = {
      ...basePayload,
      ...updatePayload,
      targetAmount: computedTarget,
      target_amount: computedTarget,
    };

    // 2. INSTANT UI HAND-OFF: Transition without waiting for cloud network delays
    if (onSubmitConsultation) {
      onSubmitConsultation(fullPayload);
    }
    if (onClose) {
      onClose();
    }
    setSaving(false);

    // 3. ASYNCHRONOUS BACKGROUND CLOUD PERSISTENCE (Runs in parallel)
    (async () => {
      try {
        let finalCanvasUrl = canvasDataUrl;

        // Run storage uploads in parallel
        const uploadJobs: Promise<string | null>[] = [];
        if (canvasDataUrl && canvasDataUrl.startsWith('data:')) {
          uploadJobs.push(uploadPrescriptionToStorage(canvasDataUrl, targetDocId).catch(() => canvasDataUrl));
        } else {
          uploadJobs.push(Promise.resolve(canvasDataUrl));
        }

        const imageJobs = uploadedImages.map(async (item) => {
          if (!item) return null;
          if (typeof item === 'string' && item.startsWith('data:')) {
            try {
              const cloudUrl = await uploadPrescriptionToStorage(item, targetDocId);
              if (cloudUrl.startsWith('data:') && cloudUrl.length > 400000) return null;
              return cloudUrl;
            } catch {
              return item.length <= 400000 ? item : null;
            }
          }
          return item;
        });

        const [resolvedCanvas, ...resolvedImages] = await Promise.all([
          uploadJobs[0],
          ...imageJobs
        ]);

        finalCanvasUrl = resolvedCanvas;
        const finalUploadedList: string[] = resolvedImages.filter((img): img is string => Boolean(img));
        if (finalCanvasUrl && !finalUploadedList.includes(finalCanvasUrl)) {
          finalUploadedList.unshift(finalCanvasUrl);
        }

        const finalCloudPayload = {
          ...basePayload,
          uploadedPrescriptions: finalUploadedList,
          canvasPrescriptionUrl: finalCanvasUrl,
          appointmentId: targetDocId,
          appointmentDate: patient?.appointmentDate || patient?.date || new Date().toISOString().split('T')[0],
          doctorName: docNameToSave,
          doctor: docNameToSave,
          branch: branchName,
          consultationFee: numConsultationFee > 0 ? numConsultationFee : (patient?.consultationFee || 0),
          medicineFee: numPharmacyFee,
          pharmacyFee: numPharmacyFee,
          totalMedicineFee: numPharmacyFee,
          dietFee: numDietFee,
          totalAmount: totalCalculated > 0 ? totalCalculated : Number(patient?.totalAmount || 0),
          createdAt: new Date().toISOString()
        };

        const finalUpdatePayload = {
          ...updatePayload,
          uploadedPrescriptions: finalUploadedList,
          ...(finalCanvasUrl ? { canvasPrescriptionUrl: finalCanvasUrl } : {}),
        };

        if (targetDocId) {
          receptionDataStore.updateLocalAppointment(targetDocId, finalUpdatePayload);
        }

        if (db) {
          const targetCol = patient?.collectionName || 'appointments';
          const colsToUpdate = Array.from(new Set([targetCol, 'appointments', 'allpatients', 'patients']));

          // Fire all Firestore writes concurrently
          await Promise.allSettled([
            addDoc(collection(db, 'prescriptions'), finalCloudPayload),
            ...(targetDocId ? colsToUpdate.map(col => updateDoc(doc(db, col, targetDocId), finalUpdatePayload)) : [])
          ]);
        }
      } catch (bgErr) {
        console.error("Background consultation sync error:", bgErr);
      }
    })();
  };

  const handleSaveDietPlan = async () => {
    setSaving(true);
    setIsDietSaved(false);
    const activeDefs = Object.keys(deficiencies).filter(k => deficiencies[k]);
    const activeDis = Object.keys(disorders).filter(k => disorders[k]);

    const dietPayload = {
      patientId: patient?.id || patient?.patientId || regId,
      patientName,
      regId,
      phone,
      doctorName,
      branchName,
      age,
      height,
      weight,
      bmi,
      selectedDietPlan,
      deficiencies: activeDefs,
      disorders: activeDis,
      otherDisorders,
      symptomsSigns,
      foodsToEat,
      foodsToAvoid,
      dietFeeAmount,
      dietMenuDays,
      savedAt: new Date().toISOString()
    };

    const numDietFee = Number(dietFeeAmount) || 0;
    const appUpdate = {
      dietPlan: dietPayload,
      dietFee: numDietFee,
      dietFeeAmount: dietFeeAmount,
      updatedAt: new Date().toISOString()
    };

    if (patient?.id) {
      receptionDataStore.updateLocalAppointment(patient.id, appUpdate);
    }

    // Parallel fire
    try {
      if (db) {
        const cleanRegId = (regId || phone || patient?.id || 'unknown').replace(/[\/\s#]/g, '_');
        await Promise.allSettled([
          setDoc(doc(db, 'diet_plans', cleanRegId), { ...dietPayload, updatedAt: new Date().toISOString() }, { merge: true }),
          addDoc(collection(db, 'diet_plans'), { ...dietPayload, createdAt: new Date().toISOString() }),
          ...(patient?.id ? [
            updateDoc(doc(db, 'appointments', patient.id), appUpdate),
            updateDoc(doc(db, 'allpatients', patient.id), appUpdate),
            updateDoc(doc(db, 'patients', patient.id), appUpdate)
          ] : [])
        ]);
      }
    } catch (err) {
      console.error("Firestore diet plan save error:", err);
    }

    setSaving(false);
    setIsDietSaved(true);
    setToastMessage('✅ Diet Plan & 30-Day Menu saved! Redirecting to Clinical Form...');

    setTimeout(() => {
      setActiveTab('clinical');
    }, 400);

    setTimeout(() => {
      setIsDietSaved(false);
      setToastMessage('');
    }, 2000);
  };

  const handleCreatePackage = async () => {
    try {
      const numTotal = Number(totalPackageAmount) || 0;
      const numAdvance = Number(initialAdvancePaid) || 0;
      const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
      const targetDocId = String(patient?.patientDocId || patient?.id || patient?.patientId || regId);
      const cleanReg = regId || patient?.regId || `SPH-${Date.now().toString().slice(-4)}`;
      const pkgDocId = `PKG_${targetDocId.replace(/\W/g, '_')}`;

      let months = 3;
      if (packageDuration.includes('1 Month')) months = 1;
      else if (packageDuration.includes('2 Month')) months = 2;
      else if (packageDuration.includes('3 Month')) months = 3;
      else if (packageDuration.includes('6 Month')) months = 6;
      else if (packageDuration.includes('1 Year')) months = 12;

      const startDateObj = packageStartDate ? new Date(packageStartDate) : new Date();
      const expiryDateObj = packageEndDate ? new Date(packageEndDate) : new Date(startDateObj.getTime() + months * 30 * 24 * 60 * 60 * 1000);

      const pkgData = {
        id: pkgDocId,
        patientDocId: targetDocId,
        patientId: cleanReg,
        patientName: patientName,
        phone: cleanPhone,
        branch: branchName,
        branchName: branchName,
        doctorName: doctorName,
        packageName: 'Package',
        purpose: packagePurpose || 'Package',
        duration: packageDuration,
        durationMonths: months,
        startDate: startDateObj.toISOString(),
        paymentDate: startDateObj.toISOString(),
        expiryDate: expiryDateObj.toISOString(),
        totalAmount: numTotal,
        paidAmount: numAdvance,
        remainingAmount: Math.max(0, numTotal - numAdvance),
        status: 'Active',
        paymentHistory: numAdvance > 0 ? [
          {
            date: startDateObj.toISOString(),
            amount: numAdvance,
            paymentMode: 'Advance',
            note: 'Package Advance Registered'
          }
        ] : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (db) {
        await setDoc(doc(db, 'package_members', pkgDocId), pkgData);
        if (targetDocId) {
          const updateObj = {
            hasActivePackage: true,
            isPackageMember: true,
            packageTotalAmount: numTotal,
            packageAdvancePaid: numAdvance,
            packageRemainingAmount: Math.max(0, numTotal - numAdvance),
            packageDuration,
            packageExpiryDate: expiryDateObj.toISOString(),
            updatedAt: new Date().toISOString()
          };
          await updateDoc(doc(db, 'appointments', targetDocId), updateObj).catch(() => { });
          await updateDoc(doc(db, 'allpatients', targetDocId), updateObj).catch(() => { });
        }
      }

      if (onRegisterPackage) onRegisterPackage(pkgData);
      setToastMessage('Package Membership Created & Saved Successfully!');
    } catch (e) {
      console.error("Error creating package membership:", e);
      setToastMessage('Error saving package membership');
    }
    setTimeout(() => setToastMessage(''), 2500);
  };

  return (
    <div style={{
      backgroundColor: '#f8fafc',
      minHeight: isStandalonePage ? '100vh' : 'auto',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      color: '#0f172a',
      fontSize: '12px'
    }}>

      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#0284c7',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '10px',
          fontWeight: 700,
          boxShadow: '0 10px 25px rgba(2, 132, 199, 0.3)',
          zIndex: 100000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={18} /> {toastMessage}
        </div>
      )}

      {/* 1. TOP HEADER BAR */}
      <div style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '12px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                padding: '6px 14px',
                borderRadius: '8px',
                color: '#334155',
                fontWeight: 700,
                fontSize: '11.5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              ‹ Back to Dashboard
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
              Patient File: {patientName} ({regId})
            </h1>
            <span style={{
              backgroundColor: '#fef08a',
              color: '#854d0e',
              border: '1px solid #fde047',
              fontSize: '9.5px',
              padding: '2px 8px',
              borderRadius: '10px',
              fontWeight: 800,
              letterSpacing: '0.4px'
            }}>
              IN DURATION
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>{userRoleTitle}</div>
          </div>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: '#e0f2fe',
            color: '#0284c7',
            border: '1px solid #bae6fd',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '13px'
          }}>
            D
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER: 2 COLUMN GRID */}
      <div style={{
        padding: '20px 24px',
        display: 'grid',
        gridTemplateColumns: '320px 1fr',
        gap: '20px',
        maxWidth: '1440px',
        margin: '0 auto'
      }}>

        {/* LEFT COLUMN: PATIENT INFO & STACK CARDS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* CARD 1: PATIENT INFORMATION CARD */}
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '20px',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                {patientName}
              </h2>
              <span style={{
                backgroundColor: '#fef08a',
                color: '#854d0e',
                fontSize: '9px',
                padding: '2px 6px',
                borderRadius: '6px',
                fontWeight: 800
              }}>
                IN DURATION
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#475569', fontSize: '11.5px' }}>
              <div style={{ color: '#0284c7', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                📋 Reg ID: {regId}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                📞 {phone}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                📍 {branchName}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                📢 Source: {source}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#0f172a' }}>
                📋 Subject: {subject}
              </div>
            </div>

            {/* Sub-Card: Register Patient in Package Box */}
            <div style={{
              marginTop: '16px',
              backgroundColor: '#f8fafc',
              border: '1px dashed #cbd5e1',
              borderRadius: '10px',
              padding: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px'
            }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>No active package.</span>
              <button
                onClick={() => setActiveTab('package')}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #0284c7',
                  color: '#0284c7',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                + Register Patient in Package
              </button>
            </div>
          </div>

          {/* CARD 2: PATIENT HISTORY & RECORDS (ALL HISTORY, PRESCRIPTIONS & PAYMENT HISTORY) */}
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #bae6fd',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.05)'
          }}>
            {/* Header with Title & Total Paid */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: '#0284c7', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📋 Patient History & Records
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Total Collected: <strong style={{ color: '#16a34a' }}>₹{totalPaidSum.toLocaleString('en-IN')}</strong> ({patientVisits.length} Visits)
                </span>
              </div>
            </div>

            {/* 3-Tab Segmented Bar: All History | Prescriptions | Payment History */}
            <div style={{
              display: 'flex',
              background: '#f1f5f9',
              borderRadius: '10px',
              padding: '3px',
              gap: '4px'
            }}>
              {[
                { key: 'all', label: `All History (${patientVisits.length})` },
                { key: 'prescriptions', label: allVisitedPrescriptionImages.length > 0 ? `Prescriptions (${allVisitedPrescriptionImages.length})` : 'Prescriptions' },
                { key: 'billing', label: totalPaidSum > 0 ? `Payment History (₹${totalPaidSum.toLocaleString('en-IN')})` : 'Payment History' },
              ].map((tab) => {
                const isActive = historyFilterTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setHistoryFilterTab(tab.key as any)}
                    style={{
                      flex: 1,
                      padding: '7px 8px',
                      borderRadius: '8px',
                      border: 'none',
                      background: isActive ? '#ffffff' : 'transparent',
                      color: isActive ? '#0284c7' : '#64748b',
                      fontSize: '11px',
                      fontWeight: isActive ? 800 : 600,
                      cursor: 'pointer',
                      boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                      textAlign: 'center'
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* TAB CONTENT */}
            {patientVisits.length === 0 ? (
              <div style={{
                backgroundColor: '#f8fafc',
                borderRadius: '10px',
                padding: '24px 16px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                minHeight: '100px'
              }}>
                <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                  No previous visits recorded for this patient.
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto', paddingRight: '2px' }}>
                
                {/* 1. PRESCRIPTIONS TAB VIEW */}
                {historyFilterTab === 'prescriptions' && (
                  allVisitedPrescriptionImages.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                      No prescription images found for this patient.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                      {allVisitedPrescriptionImages.map((img: any, idx: number) => (
                        <div
                          key={idx}
                          onClick={() => setFullPrescriptionPreview(img.uri)}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column'
                          }}
                        >
                          <div style={{ padding: '4px 8px', background: '#e0f2fe', display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 700, color: '#0369a1' }}>
                            <span>Visit #{img.visitNumber}</span>
                            <span>{img.visitDate}</span>
                          </div>
                          <div style={{ height: '110px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
                            <img src={img.uri} alt={`Rx ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          </div>
                          <div style={{ padding: '4px', textAlign: 'center', fontSize: '10px', color: '#0284c7', fontWeight: 700, background: '#ffffff' }}>
                            Click to View 🔍
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* 2. ALL HISTORY & PAYMENT HISTORY (BILLING) TAB VIEWS */}
                {historyFilterTab !== 'prescriptions' && patientVisits.map((visit, vIdx) => {
                  const visitNum = patientVisits.length - vIdx;
                  const isPaid = visit.paymentStatus === 'paid' || Number(visit.paidAmount) > 0;
                  const showPayment = historyFilterTab === 'all' || historyFilterTab === 'billing';
                  const showPrescription = historyFilterTab === 'all';
                  const visitImgs = Array.from(new Set([
                    ...(visit.canvasPrescriptionUrl ? [visit.canvasPrescriptionUrl] : []),
                    ...(visit.uploadedPrescriptions || [])
                  ].filter(Boolean)));

                  return (
                    <div
                      key={visit.id || vIdx}
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '12px',
                        border: '1px solid #cbd5e1',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                      }}
                    >
                      {/* Top Header: Visit #, Date, Doctor, Branch, Status */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#0284c7', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>
                            VISIT #{visitNum}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>
                            📅 {visit.visitDate}
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            • {visit.visitTime}
                          </span>
                        </div>
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: isPaid ? '#dcfce7' : '#fef3c7',
                          color: isPaid ? '#15803d' : '#b45309',
                          border: isPaid ? '1px solid #bbf7d0' : '1px solid #fde68a'
                        }}>
                          {isPaid ? `₹${visit.paidAmount} Paid ✓` : 'Fee Pending'}
                        </span>
                      </div>

                      {/* Doctor & Branch */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b' }}>
                        <span>🩺 {visit.doctorName}</span>
                        <span>📍 {visit.branch}</span>
                      </div>

                      {/* Payment Section (Shown in All History and Payment History) */}
                      {showPayment && (
                        <div style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div>
                            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                              Amount Paid
                            </span>
                            <div style={{ fontSize: '14px', fontWeight: 900, color: isPaid ? '#15803d' : '#b45309' }}>
                              ₹{visit.paidAmount || 0}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                              Payment Mode
                            </span>
                            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f172a' }}>
                              💳 {visit.paymentMode || 'Cash'}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Prescriptions & Remedies Section with Edit Rx (Shown in All History tab) */}
                      {showPrescription && (
                        <div style={{
                          background: '#f0f9ff',
                          border: '1px solid #bae6fd',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              💊 Prescriptions & Remedies ({visit.medicines?.length || 0})
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedVisitModal(visit)}
                              style={{
                                background: '#ffffff',
                                border: '1px solid #0284c7',
                                color: '#0284c7',
                                borderRadius: '6px',
                                padding: '2px 8px',
                                fontSize: '10.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              ✏️ Edit Rx
                            </button>
                          </div>

                          {/* Complaints / Diagnosis Notes */}
                          {(visit.subject || visit.diagnosisNotes) && (
                            <div style={{ fontSize: '11px', color: '#334155', background: '#ffffff', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              {visit.subject ? <div><strong>Complaints:</strong> {visit.subject}</div> : null}
                              {visit.diagnosisNotes ? <div><strong>Diagnosis:</strong> {visit.diagnosisNotes}</div> : null}
                            </div>
                          )}

                          {/* Medicines List */}
                          {visit.medicines && visit.medicines.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {visit.medicines.map((med: any, mIdx: number) => {
                                const details = [med.dosage, med.frequency, med.duration].filter(Boolean).join(' • ');
                                return (
                                  <div key={mIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '4px 8px', borderRadius: '6px', fontSize: '11px' }}>
                                    <span style={{ fontWeight: 800, color: '#0f172a' }}>{mIdx + 1}. {med.name}</span>
                                    {details ? (
                                      <span style={{ color: '#0284c7', fontWeight: 700 }}>{details}</span>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}

                          {/* Attached Prescription Scans Thumbnails */}
                          {visitImgs.length > 0 && (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Scans:</span>
                              {visitImgs.map((imgUri: string, iIdx: number) => (
                                <div
                                  key={iIdx}
                                  onClick={() => setFullPrescriptionPreview(imgUri)}
                                  style={{ width: '32px', height: '32px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                                >
                                  <img src={imgUri} alt={`Scan ${iIdx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* CARD 3: UPLOADED PRESCRIPTIONS & CANVAS */}
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '18px',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📤 Uploaded Prescriptions & Canvas
            </h3>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {uploadedImages.map((img, idx) => (
                <div key={idx} style={{ position: 'relative', width: '68px', height: '68px', borderRadius: '8px', overflow: 'hidden', border: '1.5px solid #cbd5e1', cursor: 'pointer' }}>
                  <img
                    src={img}
                    alt="Prescription Scan"
                    onClick={() => setFullPrescriptionPreview(img)}
                    title="Click to view full preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveWebImage(idx);
                    }}
                    title="Delete Prescription"
                    style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      backgroundColor: '#ef4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleImageFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                backgroundColor: '#0284c7',
                border: 'none',
                color: '#ffffff',
                padding: '7px 14px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                width: 'fit-content',
                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)'
              }}
            >
              + Upload Image
            </button>
          </div>

        </div>

        {/* RIGHT COLUMN: TABS & MAIN CONTENT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* TOP TABS NAVIGATION BAR */}
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '6px 12px',
            display: 'flex',
            gap: '12px',
            alignItems: 'center'
          }}>
            {[
              { id: 'clinical', label: 'Clinical Form' },
              { id: 'diet', label: 'Diet Plan' },
              { id: 'media', label: 'Share Media' },
              { id: 'package', label: 'Register Package' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: isActive ? '3px solid #0284c7' : '3px solid transparent',
                    color: isActive ? '#0284c7' : '#64748b',
                    fontWeight: isActive ? 800 : 600,
                    fontSize: '12.5px',
                    padding: '8px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* TAB 1: CLINICAL FORM CONTENT */}
          {activeTab === 'clinical' && (
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                Digital Prescription
              </h2>

              {/* Diagnosis Notes */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Diagnosis Notes
                </label>
                <textarea
                  rows={5}
                  value={diagnosisNotes}
                  onChange={(e) => setDiagnosisNotes(e.target.value)}
                  placeholder="Enter detailed clinical notes and diagnosis..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    outline: 'none',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Draw Prescription (Optional) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>
                  Draw Prescription (Optional)
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px' }}>
                  <input
                    type="radio"
                    name="drawPrescription"
                    checked={drawPrescription === 'on'}
                    onChange={() => setDrawPrescription('on')}
                  /> On
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px' }}>
                  <input
                    type="radio"
                    name="drawPrescription"
                    checked={drawPrescription === 'off'}
                    onChange={() => setDrawPrescription('off')}
                  /> Off
                </label>
                <button
                  type="button"
                  onClick={handleOpenEnlargeCanvas}
                  style={{
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 1px 3px rgba(2, 132, 199, 0.2)'
                  }}
                >
                  <Maximize2 size={12} /> ⛶ Enlarge Canvas
                </button>
              </div>

              {/* Canvas Pad (Visible if Draw Prescription is On) */}
              {drawPrescription === 'on' && (
                <div style={{ border: '2px dashed #0284c7', borderRadius: '10px', padding: '10px', backgroundColor: '#f0f9ff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7' }}>✍️ Freehand Canvas Prescription Drawing Pad</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={handleOpenEnlargeCanvas}
                        style={{
                          backgroundColor: '#0284c7',
                          color: '#ffffff',
                          border: 'none',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <Maximize2 size={11} /> ⛶ Enlarge
                      </button>
                      <button
                        type="button"
                        onClick={clearCanvas}
                        style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <canvas
                    ref={canvasRef}
                    width={750}
                    height={160}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{ backgroundColor: '#ffffff', width: '100%', borderRadius: '6px', cursor: 'crosshair', touchAction: 'none' }}
                  />
                </div>
              )}

              {/* Physical Prescription File Upload Input */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: '6px' }}>
                  Physical Prescription (Optional if Canvas Drawing is used)
                </label>
                <div style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  backgroundColor: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageFileUpload}
                    style={{ fontSize: '11.5px' }}
                  />
                </div>
                <span style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                  Upload one or multiple photos of the handwritten prescription.
                </span>
              </div>

              {/* Follow-up Recommendation */}
              <div>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                  Follow-up Recommendation
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                      Follow-up Interval
                    </label>
                    <select
                      value={followUpInterval}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFollowUpInterval(val);
                        const now = new Date();
                        if (val === '15 Days') now.setDate(now.getDate() + 15);
                        else if (val === '1 Month') now.setMonth(now.getMonth() + 1);
                        else if (val === '2 Months') now.setMonth(now.getMonth() + 2);
                        else if (val === '3 Months') now.setMonth(now.getMonth() + 3);
                        else if (val === '4 Months') now.setMonth(now.getMonth() + 4);
                        else if (val === '5 Months') now.setMonth(now.getMonth() + 5);
                        else if (val === '6 Months') now.setMonth(now.getMonth() + 6);

                        if (val === 'No Follow-up') {
                          setPreferredFollowUpDate('');
                        } else {
                          const yyyy = now.getFullYear();
                          const mm = String(now.getMonth() + 1).padStart(2, '0');
                          const dd = String(now.getDate()).padStart(2, '0');
                          setPreferredFollowUpDate(`${dd}-${mm}-${yyyy}`);
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12px',
                        backgroundColor: '#ffffff',
                        outline: 'none'
                      }}
                    >
                      <option value="No Follow-up">No Follow-up</option>
                      <option value="15 Days">15 Days</option>
                      <option value="1 Month">1 Month</option>
                      <option value="2 Months">2 Months</option>
                      <option value="3 Months">3 Months</option>
                      <option value="4 Months">4 Months</option>
                      <option value="5 Months">5 Months</option>
                      <option value="6 Months">6 Months</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span>Preferred Follow-up Date (DD-MM-YYYY)</span>
                      {preferredFollowUpDate ? (
                        <span style={{ color: '#0284c7', fontWeight: 800, fontSize: '11px' }}>
                          📅 {formatDDMMYYYY(preferredFollowUpDate)}
                        </span>
                      ) : null}
                    </label>
                    <div style={{ position: 'relative', width: '100%' }}>
                      <Calendar
                        size={15}
                        color="#0284c7"
                        style={{
                          position: 'absolute',
                          left: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          pointerEvents: 'none'
                        }}
                      />
                      <input
                        type="date"
                        value={toYYYYMMDD(preferredFollowUpDate)}
                        onChange={(e) => setPreferredFollowUpDate(e.target.value ? formatDDMMYYYY(e.target.value) : '')}
                        style={{
                          width: '100%',
                          padding: '8px 12px 8px 34px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '12px',
                          outline: 'none',
                          color: preferredFollowUpDate ? '#0f172a' : '#64748b',
                          backgroundColor: '#ffffff',
                          cursor: 'pointer'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Consultation & Medicine Fee */}
              <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                  Consultation & Medicine Fee
                </h3>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Enter Amount (₹)
                  </label>
                  <input
                    type="text"
                    placeholder="Enter amount..."
                    value={pharmacyFee}
                    onChange={(e) => setPharmacyFee(e.target.value)}
                    style={{
                      width: '260px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Save Consultation Action Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  onClick={handleSaveConsultation}
                  disabled={saving}
                  style={{
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 24px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {isDoctor
                    ? (saving ? 'Submitting Prescription...' : 'Submit Prescription & Send to Reception ✓')
                    : (saving ? 'Sending to Reception...' : 'Send to Reception & Collect Fee')}
                </button>
              </div>

            </div>
          )}

          {/* TAB 2: DIET PLAN CONTENT */}
          {activeTab === 'diet' && (
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px'
            }}>
              {/* Select Plan Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>Select Plan:</span>
                <select
                  value={selectedDietPlan}
                  onChange={(e) => setSelectedDietPlan(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    fontWeight: 700,
                    backgroundColor: '#ffffff',
                    minWidth: '220px'
                  }}
                >
                  <option value="+ Create New Diet Plan">+ Create New Diet Plan</option>
                  <option value="General Homeopathy Plan">General Homeopathy Plan</option>
                  <option value="Gastric & Weight Loss">Gastric & Weight Loss</option>
                </select>
              </div>

              {/* Vitals / Metrics Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Age</label>
                  <input type="text" value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 32" style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Height (cm)</label>
                  <input type="text" value={height} onChange={(e) => handleHeightChange(e.target.value)} placeholder="e.g. 165" style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Weight (kg)</label>
                  <input type="text" value={weight} onChange={(e) => handleWeightChange(e.target.value)} placeholder="e.g. 68" style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>BMI (Auto)</label>
                  <input type="text" value={bmi} onChange={(e) => setBmi(e.target.value)} placeholder="Auto calculated" style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #0284c7', fontSize: '12px', fontWeight: 800, backgroundColor: '#f0f9ff', color: '#0284c7' }} />
                </div>
              </div>

              {/* Grid: Deficiencies checklist & Common Health Disorders */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                {/* Deficiencies Checklist */}
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: '#0284c7' }}>
                      Deficiencies checklist ({DEFICIENCY_LIST.filter(i => deficiencies[i]).length} Selected)
                    </h4>
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>15 Essential Nutrients</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11.5px' }}>
                    {DEFICIENCY_LIST.map((item) => {
                      const isChecked = Boolean(deficiencies[item]);
                      return (
                        <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: isChecked ? '#0284c7' : '#475569', fontWeight: isChecked ? 700 : 500 }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleDeficiency(item)}
                            style={{ cursor: 'pointer', accentColor: '#0284c7' }}
                          />
                          {item}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Common Health Disorders */}
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: '#0284c7' }}>
                      Common Health Disorders ({DISORDERS_LIST.filter(i => disorders[i]).length} Active)
                    </h4>
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>16 Clinical Conditions</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {DISORDERS_LIST.map((item) => {
                      const isSel = Boolean(disorders[item]);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => toggleDisorder(item)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '16px',
                            border: isSel ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                            backgroundColor: isSel ? '#e0f2fe' : '#ffffff',
                            color: isSel ? '#0284c7' : '#475569',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            boxShadow: isSel ? '0 1px 4px rgba(2, 132, 199, 0.2)' : 'none'
                          }}
                        >
                          {isSel ? '✓ ' : '+ '}{item}
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Other Diseases / Disorders & Symptoms/Signs Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Other Diseases/Disorders</label>
                  <input type="text" placeholder="e.g. Asthma, Sinusitis..." value={otherDisorders} onChange={(e) => setOtherDisorders(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Symptoms/Signs</label>
                  <input type="text" placeholder="e.g. Fatigue, Bloating..." value={symptomsSigns} onChange={(e) => setSymptomsSigns(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                </div>
              </div>

              {/* Foods to Eat & Foods to Avoid Textareas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#166534', display: 'block', marginBottom: '4px' }}>🟢 Foods to Eat (Auto-Generated Nutrients)</label>
                  <textarea rows={4} value={foodsToEat} onChange={(e) => setFoodsToEat(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #86efac', backgroundColor: '#f0fdf4', fontSize: '11.5px', color: '#14532d', lineHeight: 1.4 }} />
                </div>
                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#991b1b', display: 'block', marginBottom: '4px' }}>🔴 Foods to Avoid (Clinical Restrictions)</label>
                  <textarea rows={4} value={foodsToAvoid} onChange={(e) => setFoodsToAvoid(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #fca5a5', backgroundColor: '#fef2f2', fontSize: '11.5px', color: '#7f1d1d', lineHeight: 1.4 }} />
                </div>
              </div>

              {/* Fee Amount (₹) */}
              <div>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Diet Consultation Fee (₹)</label>
                <input type="text" placeholder="Enter fee..." value={dietFeeAmount} onChange={(e) => setDietFeeAmount(e.target.value)} style={{ width: '200px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>

              {/* 30-Day Diet Plan Menu */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🗓 30-Day Diet Plan Menu
                    </h3>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Customized into 3 Phases (Detox, Metabolic Correction, Sustained Vitality)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFull30DayModal(true)}
                    style={{
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(2, 132, 199, 0.2)'
                    }}
                  >
                    ↗ Expand / Full 30-Day Diet Plan Modal
                  </button>
                </div>

                {/* Preview Table Showing Days 1 to 5 */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', textAlign: 'left', color: '#475569', fontWeight: 800 }}>
                      <th style={{ padding: '8px 10px', width: '50px' }}>DAY</th>
                      <th style={{ padding: '8px 10px' }}>BREAKFAST (8:00 AM)</th>
                      <th style={{ padding: '8px 10px' }}>LUNCH (1:00 PM)</th>
                      <th style={{ padding: '8px 10px' }}>SNACKS (4:30 PM)</th>
                      <th style={{ padding: '8px 10px' }}>DINNER (8:00 PM)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dietMenuDays.slice(0, 5).map((item) => (
                      <tr key={item.day} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 800, color: '#0284c7' }}>Day {item.day}</td>
                        <td style={{ padding: '8px 10px', color: '#1e293b' }}>{item.breakfast}</td>
                        <td style={{ padding: '8px 10px', color: '#1e293b' }}>{item.lunch}</td>
                        <td style={{ padding: '8px 10px', color: '#1e293b' }}>{item.snacks}</td>
                        <td style={{ padding: '8px 10px', color: '#1e293b' }}>{item.dinner}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ textAlign: 'center', marginTop: '8px' }}>
                  <span
                    onClick={() => setShowFull30DayModal(true)}
                    style={{ fontSize: '11.5px', color: '#0284c7', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    + View remaining 25 days in Full 30-Day Modal...
                  </span>
                </div>
              </div>

              {/* Save & Print Diet Plan Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '14px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#475569',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Printer size={16} /> Print Diet Chart
                </button>
                <button
                  type="button"
                  onClick={handleSaveDietPlan}
                  disabled={saving}
                  style={{
                    backgroundColor: isDietSaved ? '#16a34a' : saving ? '#64748b' : '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 24px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    boxShadow: isDietSaved ? '0 2px 10px rgba(22, 163, 74, 0.4)' : '0 2px 8px rgba(2, 132, 199, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.25s ease'
                  }}
                >
                  {saving ? '⏳ Saving Diet Plan...' : isDietSaved ? '✅ Diet Plan Saved!' : '💾 Save Diet Plan & 30-Day Menu'}
                </button>
              </div>

            </div>
          )}

          {/* TAB 3: SHARE MEDIA CONTENT */}
          {activeTab === 'media' && (
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              {/* Header & Source Status Banner */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      📁 Shared Media & Educational Links
                    </h2>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      Links shared here appear instantly in the patient's mobile app under <strong>Profile → My Media</strong>.
                    </span>
                  </div>
                  <span style={{
                    fontSize: '11.5px',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    backgroundColor: isPatientAppBooking ? '#dcfce7' : '#fef3c7',
                    color: isPatientAppBooking ? '#166534' : '#b45309',
                    border: isPatientAppBooking ? '1px solid #bbf7d0' : '1px solid #fde68a'
                  }}>
                    {isPatientAppBooking ? '📱 Booked via Patient App' : `🏢 Booked via ${patient?.source || 'Reception'}`}
                  </span>
                </div>

                {/* Conditional Lock Banner */}
                {!isPatientAppBooking ? (
                  <div style={{
                    background: '#fffbeb',
                    border: '1.5px solid #fde68a',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <span style={{ fontSize: '22px' }}>🔒</span>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#92400e' }}>
                        Media Sharing to Patient App is Disabled
                      </h4>
                      <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#b45309', lineHeight: '17px' }}>
                        This appointment was booked via <strong>{patient?.source || 'Reception / Web'}</strong>.
                        Direct media sharing to the patient profile is only permitted for appointments booked through the <strong>Patient App</strong>.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    background: '#f0fdf4',
                    border: '1.5px solid #bbf7d0',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <span style={{ fontSize: '20px' }}>✅</span>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#166534' }}>
                        Patient App Connected
                      </h4>
                      <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#15803d' }}>
                        Select any media link from the Reception repository below to share directly with this patient.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 1: CURRENTLY SHARED MEDIA */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '13.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📤 Currently Shared with Patient ({sharedPatientMedia.length})
                </h3>

                {sharedPatientMedia.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', background: '#ffffff', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                    No media links have been shared with this patient yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {sharedPatientMedia.map((m: any, idx: number) => (
                      <div key={idx} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '10px 14px'
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{m.title || 'Educational Link'}</span>
                            {m.category && (
                              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', background: '#e0f2fe', color: '#0284c7', borderRadius: '4px' }}>
                                {m.category}
                              </span>
                            )}
                          </div>
                          <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#0284c7', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            🔗 {m.url}
                          </a>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => window.open(m.url, '_blank')}
                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                          >
                            Open Link
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRevokeSharedMedia(m.url)}
                            style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, color: '#dc2626', cursor: 'pointer' }}
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 2: AVAILABLE CLINIC MEDIA LINKS (FROM RECEPTION MEDIA MANAGER) */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                    📚 Clinic Media Links from Reception ({clinicMediaItems.length})
                  </h3>
                  <input
                    type="text"
                    placeholder="Search media by title or keyword..."
                    value={mediaSearchQuery}
                    onChange={(e) => setMediaSearchQuery(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      width: '260px'
                    }}
                  />
                </div>

                {clinicMediaItems.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                    No media links saved by Reception in Media Manager yet.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                    {clinicMediaItems
                      .filter((item: any) => {
                        const q = mediaSearchQuery.toLowerCase().trim();
                        if (!q) return true;
                        return (
                          item.title?.toLowerCase().includes(q) ||
                          item.url?.toLowerCase().includes(q) ||
                          item.folderName?.toLowerCase().includes(q) ||
                          item.notes?.toLowerCase().includes(q)
                        );
                      })
                      .map((item: any) => {
                        const isAlreadyShared = sharedPatientMedia.some(m => m.url === item.url);
                        const isSharingThis = sharingMediaId === item.id;

                        return (
                          <div
                            key={item.id}
                            style={{
                              background: '#ffffff',
                              border: isAlreadyShared ? '1.5px solid #86efac' : '1px solid #cbd5e1',
                              borderRadius: '10px',
                              padding: '12px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: '8px',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                                  {item.title}
                                </span>
                                {item.folderName && (
                                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', background: '#f1f5f9', color: '#475569', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                                    📁 {item.folderName}
                                  </span>
                                )}
                              </div>
                              {item.notes ? (
                                <p style={{ fontSize: '11.5px', color: '#64748b', margin: '4px 0 0 0' }}>
                                  {item.notes}
                                </p>
                              ) : null}
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: '11px', color: '#0284c7', textDecoration: 'none', display: 'block', marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              >
                                🔗 {item.url}
                              </a>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                              {isAlreadyShared ? (
                                <span style={{ fontSize: '11px', fontWeight: 800, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  ✓ Shared with Patient
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!isPatientAppBooking || isSharingThis}
                                  onClick={() => handleShareMediaItem(item)}
                                  style={{
                                    backgroundColor: !isPatientAppBooking ? '#e2e8f0' : '#0284c7',
                                    color: !isPatientAppBooking ? '#94a3b8' : '#ffffff',
                                    border: 'none',
                                    padding: '6px 14px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    fontWeight: 800,
                                    cursor: !isPatientAppBooking ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  title={!isPatientAppBooking ? 'Media sharing is disabled for offline / reception bookings.' : 'Share directly to patient app'}
                                >
                                  {isSharingThis ? 'Sharing...' : !isPatientAppBooking ? '🔒 Disabled' : '+ Share to Patient App'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: REGISTER PACKAGE CONTENT */}
          {activeTab === 'package' && (
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px'
            }}>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                Register Patient in Package
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Total Package Amount (₹) *
                  </label>
                  <input
                    type="text"
                    placeholder="Enter total package cost"
                    value={totalPackageAmount}
                    onChange={(e) => setTotalPackageAmount(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Initial Advance Paid (₹)
                  </label>
                  <input
                    type="text"
                    value={initialAdvancePaid}
                    onChange={(e) => setInitialAdvancePaid(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  Package Purpose / Disease
                </label>
                <input
                  type="text"
                  placeholder="e.g. Chronic Asthma, Sinusitis"
                  value={packagePurpose}
                  onChange={(e) => setPackagePurpose(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Package Duration
                  </label>
                  <select
                    value={packageDuration}
                    onChange={(e) => setPackageDuration(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', backgroundColor: '#ffffff' }}
                  >
                    <option value="3 Months">3 Months</option>
                    <option value="6 Months">6 Months</option>
                    <option value="1 Year">1 Year</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={packageStartDate}
                    onChange={(e) => setPackageStartDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={packageEndDate}
                    onChange={(e) => setPackageEndDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', backgroundColor: '#f8fafc' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  onClick={handleCreatePackage}
                  style={{
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 24px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)'
                  }}
                >
                  Create Package Membership
                </button>
              </div>

            </div>
          )}

        </div>

      </div>



      {/* ALL PAST VISITS FULL POPUP MODAL */}
      {showAllVisitsModal && (
        <div
          onClick={() => setShowAllVisitsModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999998,
            padding: '20px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              padding: '24px',
              maxWidth: '650px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid #e2e8f0', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ⏱ Complete Medical History ({patientVisits.length} Visits)
                </h2>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Patient: {patientName} • {regId}
                </span>
              </div>
              <button
                onClick={() => setShowAllVisitsModal(false)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#475569'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Visits List */}
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
              {patientVisits.map((visit, index) => (
                <div
                  key={visit.id || index}
                  onClick={() => {
                    setSelectedVisitModal(visit);
                  }}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#0284c7')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#cbd5e1')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a', background: '#f1f5f9', padding: '3px 10px', borderRadius: '6px' }}>
                      📅 {visit.visitDate}
                    </span>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0369a1' }}>
                      📍 {visit.branch}
                    </span>
                  </div>
                  {visit.doctorName && (
                    <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>
                      👨‍⚕️ {formatDoctorName(visit.doctorName)}
                    </span>
                  )}
                  {visit.diagnosisNotes && (
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      🩺 Notes: {visit.diagnosisNotes.slice(0, 80)}{visit.diagnosisNotes.length > 80 ? '...' : ''}
                    </span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0' }}>
                    <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 700 }}>
                      View Full Prescription & Details ➔
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ paddingTop: '16px', borderTop: '1px solid #e2e8f0', marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAllVisitsModal(false)}
                style={{
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  padding: '9px 20px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VISIT DETAILS & PRESCRIPTION POPUP MODAL */}
      {selectedVisitModal && (
        <div
          onClick={() => setSelectedVisitModal(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            padding: '20px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              padding: '28px',
              width: '100%',
              maxWidth: '560px',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
              border: '1px solid #e2e8f0',
              maxHeight: '90vh',
              overflowY: 'auto',
              position: 'relative'
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => setSelectedVisitModal(null)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748b'
              }}
            >
              <X size={18} />
            </button>

            {/* Modal Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={22} />
              </div>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Visit Details & Prescription
                </h2>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>
                  Visited on {selectedVisitModal.visitDate} @ {selectedVisitModal.visitTime}
                </p>
              </div>
            </div>

            {/* Visit Info Details Card */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '16px',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Patient Name</span>
                <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 800 }}>
                  {selectedVisitModal.patientName || patientName} {selectedVisitModal.regId || regId ? `(${selectedVisitModal.regId || regId})` : ''}
                </span>
              </div>
              <div style={{ height: '1px', background: '#f1f5f9' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Attending Doctor</span>
                <span style={{ fontSize: '13px', color: '#0284c7', fontWeight: 800 }}>{formatDoctorName(selectedVisitModal.doctorName, selectedVisitModal.branch)}</span>
              </div>
              <div style={{ height: '1px', background: '#f1f5f9' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Branch & Mode</span>
                <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 800 }}>
                  {selectedVisitModal.branch} • {selectedVisitModal.consultationMode}
                </span>
              </div>
              <div style={{ height: '1px', background: '#f1f5f9' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Amount Paid</span>
                {selectedVisitModal.paymentStatus === 'paid' || Number(selectedVisitModal.paidAmount) > 0 ? (
                  <span style={{ fontSize: '14px', color: '#16a34a', fontWeight: 900, background: '#dcfce7', padding: '2px 8px', borderRadius: '6px' }}>
                    ₹{selectedVisitModal.paidAmount} Paid ✓
                  </span>
                ) : (
                  <span style={{ fontSize: '13px', color: '#b45309', fontWeight: 800, background: '#fef3c7', padding: '2px 8px', borderRadius: '6px' }}>
                    Payment Pending (₹{selectedVisitModal.totalAmount || 0})
                  </span>
                )}
              </div>
            </div>

            {/* Diagnosis / Notes Box */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '6px' }}>
                📋 Diagnosis & Clinical Notes
              </label>
              <div style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '12px',
                padding: '12px 14px',
                fontSize: '12.5px',
                color: '#1e293b',
                lineHeight: '1.5'
              }}>
                {selectedVisitModal.diagnosisNotes || selectedVisitModal.subject || 'No diagnosis notes entered for this visit.'}
              </div>
            </div>

            {/* DIGITAL PRESCRIPTION MEDICINES SECTION */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: 800, color: '#0284c7', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                💊 Prescribed Medicines ({selectedVisitModal.medicines?.length || 0})
              </label>

              {selectedVisitModal.medicines && selectedVisitModal.medicines.length > 0 ? (
                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#e0f2fe', color: '#0369a1', textAlign: 'left', fontWeight: 800, fontSize: '11px' }}>
                        <th style={{ padding: '8px 12px' }}>REMEDY / MEDICINE</th>
                        <th style={{ padding: '8px 12px' }}>DOSAGE & FREQUENCY</th>
                        <th style={{ padding: '8px 12px' }}>DURATION & TIMING</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVisitModal.medicines.map((med: any, idx: number) => {
                        const doseFreq = [med.dosage, med.frequency].filter(Boolean).join(' • ');
                        const durInstr = [med.duration, med.instructions ? `(${med.instructions})` : ''].filter(Boolean).join(' ');
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 800, color: '#0f172a' }}>
                              {med.name || med.medicineName || 'Homeopathic Remedy'}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#0284c7', fontWeight: 700 }}>
                              {doseFreq || '—'}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#475569', fontWeight: 600 }}>
                              {durInstr || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', fontSize: '11.5px', color: '#64748b' }}>
                  No digital medicine items added. View handwritten prescription scan below.
                </div>
              )}
            </div>

            {/* UPLOADED PRESCRIPTION SCANS & CANVAS */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '12px', fontWeight: 800, color: '#0284c7', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                📄 Uploaded Prescription Scans & Canvas Document
              </label>

              {(() => {
                const images = Array.from(new Set([
                  ...(selectedVisitModal.canvasPrescriptionUrl ? [selectedVisitModal.canvasPrescriptionUrl] : []),
                  ...(selectedVisitModal.uploadedPrescriptions || [])
                ].filter(Boolean)));

                if (images.length === 0) {
                  return (
                    <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '16px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
                      No digital prescription scans uploaded for this visit.
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {images.map((url: string, idx: number) => (
                      <div
                        key={idx}
                        onClick={() => setFullPrescriptionPreview(url)}
                        style={{
                          position: 'relative',
                          width: '130px',
                          height: '150px',
                          borderRadius: '14px',
                          overflow: 'hidden',
                          border: '2px solid #0284c7',
                          cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(2, 132, 199, 0.18)'
                        }}
                      >
                        <img src={url} alt="Prescription Document" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: 'rgba(15, 23, 42, 0.82)',
                          color: '#ffffff',
                          fontSize: '10.5px',
                          fontWeight: 800,
                          padding: '4px',
                          textAlign: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}>
                          <Eye size={12} /> View Full
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  flex: 1,
                  background: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Printer size={16} /> Print Record
              </button>
              <button
                type="button"
                onClick={() => setSelectedVisitModal(null)}
                style={{
                  flex: 1.5,
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '12px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL-SCREEN INTERACTIVE 30-DAY DIET PLAN MODAL */}
      {showFull30DayModal && (
        <div
          onClick={() => setShowFull30DayModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            padding: '24px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '1200px',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🗓 30-Day Customized Clinical Diet Plan Menu
                </h2>
                <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '4px', display: 'flex', gap: '12px' }}>
                  <span>Patient: <strong>{patientName}</strong> ({regId})</span>
                  <span>Age: <strong>{age || 'N/A'}</strong></span>
                  <span>BMI: <strong>{bmi || 'N/A'}</strong></span>
                  <span>Deficiencies: <strong>{Object.keys(deficiencies).filter(k => deficiencies[k]).length}</strong></span>
                  <span>Disorders: <strong>{Object.keys(disorders).filter(k => disorders[k]).length}</strong></span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.4)',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Printer size={14} /> Print Plan
                </button>
                <button
                  type="button"
                  onClick={() => setShowFull30DayModal(false)}
                  style={{
                    backgroundColor: '#ffffff',
                    color: '#0284c7',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    cursor: 'pointer'
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Phase Filters Row */}
            <div style={{ padding: '12px 24px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginRight: '8px' }}>Phase Filter:</span>
              {[
                { label: 'All 30 Days', val: 'all' },
                { label: 'Phase 1: Detox (Days 1-10)', val: 1 },
                { label: 'Phase 2: Metabolic (Days 11-20)', val: 2 },
                { label: 'Phase 3: Vitality (Days 21-30)', val: 3 }
              ].map((p) => {
                const isActive = selectedPhaseFilter === p.val;
                return (
                  <button
                    key={String(p.val)}
                    type="button"
                    onClick={() => setSelectedPhaseFilter(p.val as any)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '20px',
                      border: isActive ? '1px solid #0284c7' : '1px solid #cbd5e1',
                      backgroundColor: isActive ? '#0284c7' : '#ffffff',
                      color: isActive ? '#ffffff' : '#475569',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Modal Body Table */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left', color: '#334155', fontWeight: 800 }}>
                    <th style={{ padding: '10px 12px', width: '65px' }}>DAY</th>
                    <th style={{ padding: '10px 12px', width: '140px' }}>PHASE</th>
                    <th style={{ padding: '10px 12px' }}>BREAKFAST (8:00 AM)</th>
                    <th style={{ padding: '10px 12px' }}>LUNCH (1:00 PM)</th>
                    <th style={{ padding: '10px 12px' }}>EVENING SNACKS (4:30 PM)</th>
                    <th style={{ padding: '10px 12px' }}>DINNER (8:00 PM)</th>
                  </tr>
                </thead>
                <tbody>
                  {dietMenuDays
                    .filter((item) => selectedPhaseFilter === 'all' || item.phase === selectedPhaseFilter)
                    .map((item, idx) => (
                      <tr key={item.day} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 900, color: '#0284c7' }}>Day {item.day}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            fontSize: '9.5px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            backgroundColor: item.phase === 1 ? '#dbeafe' : item.phase === 2 ? '#fef3c7' : '#dcfce7',
                            color: item.phase === 1 ? '#1e40af' : item.phase === 2 ? '#92400e' : '#166534'
                          }}>
                            {item.phaseTitle}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <input
                            type="text"
                            value={item.breakfast}
                            onChange={(e) => {
                              const updated = [...dietMenuDays];
                              const targetIdx = updated.findIndex(d => d.day === item.day);
                              if (targetIdx !== -1) {
                                updated[targetIdx].breakfast = e.target.value;
                                setDietMenuDays(updated);
                              }
                            }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11.5px' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <input
                            type="text"
                            value={item.lunch}
                            onChange={(e) => {
                              const updated = [...dietMenuDays];
                              const targetIdx = updated.findIndex(d => d.day === item.day);
                              if (targetIdx !== -1) {
                                updated[targetIdx].lunch = e.target.value;
                                setDietMenuDays(updated);
                              }
                            }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11.5px' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <input
                            type="text"
                            value={item.snacks}
                            onChange={(e) => {
                              const updated = [...dietMenuDays];
                              const targetIdx = updated.findIndex(d => d.day === item.day);
                              if (targetIdx !== -1) {
                                updated[targetIdx].snacks = e.target.value;
                                setDietMenuDays(updated);
                              }
                            }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11.5px' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <input
                            type="text"
                            value={item.dinner}
                            onChange={(e) => {
                              const updated = [...dietMenuDays];
                              const targetIdx = updated.findIndex(d => d.day === item.day);
                              if (targetIdx !== -1) {
                                updated[targetIdx].dinner = e.target.value;
                                setDietMenuDays(updated);
                              }
                            }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11.5px' }}
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11.5px', color: '#64748b' }}>💡 Tip: You can directly edit any meal box above before saving or printing.</span>
              <button
                type="button"
                onClick={() => setShowFull30DayModal(false)}
                style={{
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  padding: '9px 24px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Save & Close 30-Day Plan
              </button>
            </div>

          </div>
        </div>
      )}

      {/* PRINT-ONLY CLINICAL DIET CHART & 30-DAY MENU */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-diet-chart, #printable-diet-chart * {
            visibility: visible !important;
          }
          #printable-diet-chart {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 8mm !important;
            background: #ffffff !important;
            color: #0f172a !important;
            font-family: Arial, sans-serif !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          .print-table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto !important;
          }
          .print-table tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          .print-table thead {
            display: table-header-group !important;
          }
          .print-table th, .print-table td {
            border: 1px solid #94a3b8 !important;
            padding: 5px 7px !important;
            font-size: 9.5px !important;
            text-align: left !important;
          }
        }
      `}</style>

      <div id="printable-diet-chart" style={{ display: 'none' }}>
        {/* Clinic Print Header */}
        <div style={{ borderBottom: '2px solid #0284c7', paddingBottom: '10px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', color: '#0284c7', fontWeight: 900 }}>SPIRITUAL HOMEOPATHY</h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#475569', fontWeight: 700 }}>Customized Clinical Nutrition & 30-Day Diet Plan</p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '10px', color: '#334155' }}>
            <div><strong>Branch:</strong> {branchName}</div>
            <div><strong>Doctor:</strong> {doctorName}</div>
            <div><strong>Date:</strong> {new Date().toLocaleDateString('en-GB')}</div>
          </div>
        </div>

        {/* Patient Vitals Summary */}
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '10.5px' }}>
          <span><strong>Patient:</strong> {patientName} ({regId})</span>
          <span><strong>Phone:</strong> {phone}</span>
          <span><strong>Age:</strong> {age || 'N/A'}</span>
          <span><strong>Height:</strong> {height ? `${height} cm` : 'N/A'}</span>
          <span><strong>Weight:</strong> {weight ? `${weight} kg` : 'N/A'}</span>
          <span><strong>BMI:</strong> {bmi || 'N/A'}</span>
        </div>

        {/* Foods to Eat & Foods to Avoid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div style={{ border: '1px solid #86efac', backgroundColor: '#f0fdf4', borderRadius: '6px', padding: '8px' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '10.5px', color: '#166534', fontWeight: 800 }}>🟢 Foods to Eat (Prescribed Nutrients)</h4>
            <div style={{ fontSize: '9.5px', color: '#14532d', whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>{foodsToEat}</div>
          </div>

          <div style={{ border: '1px solid #fca5a5', backgroundColor: '#fef2f2', borderRadius: '6px', padding: '8px' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '10.5px', color: '#991b1b', fontWeight: 800 }}>🔴 Foods to Avoid (Clinical Restrictions)</h4>
            <div style={{ fontSize: '9.5px', color: '#7f1d1d', whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>{foodsToAvoid}</div>
          </div>
        </div>

        {/* 30-Day Diet Plan Menu Table */}
        <h3 style={{ fontSize: '11.5px', margin: '0 0 6px 0', color: '#0f172a', fontWeight: 800 }}>🗓 30-Day Customized Meal Menu Schedule</h3>
        <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#e2e8f0', color: '#0f172a', fontWeight: 800 }}>
              <th style={{ width: '45px' }}>DAY</th>
              <th style={{ width: '120px' }}>PHASE</th>
              <th>BREAKFAST (8:00 AM)</th>
              <th>LUNCH (1:00 PM)</th>
              <th>SNACKS (4:30 PM)</th>
              <th>DINNER (8:00 PM)</th>
            </tr>
          </thead>
          <tbody>
            {dietMenuDays.map((item) => (
              <tr key={item.day}>
                <td style={{ fontWeight: 800, color: '#0284c7' }}>Day {item.day}</td>
                <td style={{ fontWeight: 700 }}>{item.phaseTitle}</td>
                <td>{item.breakfast}</td>
                <td>{item.lunch}</td>
                <td>{item.snacks}</td>
                <td>{item.dinner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ENLARGED DRAWING CANVAS MODAL */}
      {isEnlargeCanvasOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '960px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid #cbd5e1'
          }}>
            {/* Header */}
            <div style={{
              padding: '14px 20px',
              backgroundColor: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Maximize2 size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                    ✍️ Draw Prescription (Enlarged Canvas Pad)
                  </h3>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                    Patient: <strong>{patientName}</strong> • Reg ID: <strong style={{ color: '#0284c7' }}>{regId}</strong>
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEnlargeCanvasOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                  color: '#64748b'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawing Toolbar */}
            <div style={{
              padding: '10px 20px',
              backgroundColor: '#ffffff',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              {/* Colors */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Ink Color:</span>
                {[
                  { name: 'Blue', hex: '#0284c7' },
                  { name: 'Black', hex: '#0f172a' },
                  { name: 'Red', hex: '#dc2626' },
                  { name: 'Green', hex: '#16a34a' }
                ].map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setPenColor(c.hex)}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: c.hex,
                      border: penColor === c.hex ? '2.5px solid #0284c7' : '2px solid transparent',
                      outline: penColor === c.hex ? '2px solid #bae6fd' : 'none',
                      cursor: 'pointer'
                    }}
                    title={c.name}
                  />
                ))}
              </div>

              {/* Thickness */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Pen Size:</span>
                {[
                  { label: 'Fine', width: 2 },
                  { label: 'Normal', width: 3.5 },
                  { label: 'Bold', width: 5.5 }
                ].map((size) => (
                  <button
                    key={size.width}
                    type="button"
                    onClick={() => setPenWidth(size.width)}
                    style={{
                      padding: '3px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      border: penWidth === size.width ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
                      backgroundColor: penWidth === size.width ? '#f0f9ff' : '#ffffff',
                      color: penWidth === size.width ? '#0284c7' : '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    {size.label}
                  </button>
                ))}
              </div>

              {/* Clear */}
              <button
                type="button"
                onClick={clearEnlargedCanvas}
                style={{
                  backgroundColor: '#fff1f2',
                  border: '1px solid #fecdd3',
                  color: '#e11d48',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Trash2 size={13} /> Clear Canvas
              </button>
            </div>

            {/* Canvas Area */}
            <div style={{ padding: '16px 20px', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'center' }}>
              <canvas
                ref={enlargedCanvasRef}
                width={920}
                height={480}
                onMouseDown={startDrawingEnlarged}
                onMouseMove={drawEnlarged}
                onMouseUp={stopDrawingEnlarged}
                onMouseLeave={stopDrawingEnlarged}
                onTouchStart={startDrawingEnlarged}
                onTouchMove={drawEnlarged}
                onTouchEnd={stopDrawingEnlarged}
                style={{
                  width: '100%',
                  height: '480px',
                  backgroundColor: '#ffffff',
                  borderRadius: '10px',
                  border: '2px solid #cbd5e1',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.03)',
                  cursor: 'crosshair',
                  touchAction: 'none'
                }}
              />
            </div>

            {/* Footer / Action Bar */}
            <div style={{
              padding: '12px 20px',
              backgroundColor: '#ffffff',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                {enlargeToast ? (
                  <span style={{ color: '#16a34a', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={16} /> {enlargeToast}
                  </span>
                ) : (
                  <span>💡 Draw medicines & instructions, then click <strong>Save & Update Prescription</strong>.</span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsEnlargeCanvasOpen(false)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSaveAndUpdateEnlargedPrescription}
                  disabled={isSavingEnlarged}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    backgroundColor: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    cursor: isSavingEnlarged ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(22, 163, 74, 0.3)'
                  }}
                >
                  {isSavingEnlarged ? (
                    <>Saving & Updating...</>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Save & Update Prescription
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
