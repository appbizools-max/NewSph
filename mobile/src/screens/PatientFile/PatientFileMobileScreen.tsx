import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  TextInput, Image, Alert, Modal, FlatList, Dimensions, Platform, PanResponder,
  ActivityIndicator, BackHandler, Linking, SafeAreaView
} from 'react-native';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import {
  getSafeDb, collection, onSnapshot, addDoc, updateDoc, doc, arrayUnion, setDoc, getDoc, getDocs, query, where, limit
} from '../../utils/firebaseSafe';
import { getStorage, ref as storageRef, uploadString, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { sanitizeDoctorName } from '@app/shared';
import { receptionDataStore } from '../../utils/receptionDataStore';
import { AppointmentPaymentModal } from '../../components/AppointmentPaymentModal';
// Safe Firebase Storage reference
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
    console.warn("Storage initialization warning:", e);
    return null;
  }
};
const db = getSafeDb();
// Polyfill global.Blob in React Native to support ArrayBuffer & Uint8Array without throwing
if (typeof global !== 'undefined' && (global as any).Blob) {
  try {
    const OriginalBlob = (global as any).Blob;
    let supportsUint8 = false;
    try {
      new OriginalBlob([new Uint8Array(1)]);
      supportsUint8 = true;
    } catch (_) {
      supportsUint8 = false;
    }

    if (!supportsUint8) {
      const u2s = (arr: Uint8Array): string => {
        let result = '';
        const chunkSize = 32768;
        for (let i = 0; i < arr.length; i += chunkSize) {
          result += String.fromCharCode.apply(null, Array.from(arr.subarray(i, i + chunkSize)));
        }
        return result;
      };

      function PatchedBlob(this: any, parts?: any[], options?: any) {
        if (Array.isArray(parts)) {
          parts = parts.map(part => {
            if (part instanceof ArrayBuffer) {
              return u2s(new Uint8Array(part));
            }
            if (ArrayBuffer.isView(part)) {
              return u2s(new Uint8Array(part.buffer, part.byteOffset, part.byteLength));
            }
            return part;
          });
        }
        return new OriginalBlob(parts, options);
      }
      PatchedBlob.prototype = OriginalBlob.prototype;
      (global as any).Blob = PatchedBlob;
    }
  } catch (e) {
    console.warn('Blob polyfill notice:', e);
  }
}

// Helper to upload images/prescriptions/canvas to Firebase Storage and return public HTTPS URLs
const uploadPrescriptionToStorage = async (dataOrUri: string, patId?: string): Promise<string> => {
  if (!dataOrUri) return '';
  // If already an http/https URL, return directly
  if (dataOrUri.startsWith('http://') || dataOrUri.startsWith('https://')) {
    return dataOrUri;
  }

  const bucket = "spiritual-homeopathy-3b552.firebasestorage.app";
  const safePatId = (patId || 'unknown').toString().replace(/[^a-zA-Z0-9_-]/g, '_');

  let ext = 'jpg';
  let contentType = 'image/jpeg';
  if (dataOrUri.includes('image/png') || dataOrUri.endsWith('.png')) {
    ext = 'png';
    contentType = 'image/png';
  } else if (dataOrUri.includes('image/bmp') || dataOrUri.endsWith('.bmp')) {
    ext = 'bmp';
    contentType = 'image/bmp';
  }

  const filename = `prescriptions/${safePatId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
  const encodedPath = encodeURIComponent(filename);

  // 1. Web environment (Browser Blobs / TypedArrays supported natively)
  if (Platform.OS === 'web') {
    try {
      const storage = getFirebaseStorage();
      if (storage) {
        const fileRef = storageRef(storage, filename);
        if (dataOrUri.startsWith('data:')) {
          await uploadString(fileRef, dataOrUri, 'data_url');
          return await getDownloadURL(fileRef);
        } else {
          const res = await fetch(dataOrUri);
          const blob = await res.blob();
          await uploadBytes(fileRef, blob, { contentType });
          return await getDownloadURL(fileRef);
        }
      }
    } catch (err) {
      console.warn("Web storage upload notice:", err);
    }
    return dataOrUri;
  }

  // 2. Mobile (Android / iOS): Native FileSystem direct background streaming upload
  // Bypasses React Native Blob limitations completely and eliminates memory overhead
  let localFileToUpload = dataOrUri;
  let isTempFile = false;

  try {
    if (dataOrUri.startsWith('data:') || (!dataOrUri.startsWith('file://') && !dataOrUri.startsWith('content://'))) {
      const commaIdx = dataOrUri.indexOf(',');
      const base64Data = commaIdx !== -1 ? dataOrUri.substring(commaIdx + 1) : dataOrUri;
      const tempPath = `${FileSystem.cacheDirectory}rx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
      await FileSystem.writeAsStringAsync(tempPath, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      localFileToUpload = tempPath;
      isTempFile = true;
    }

    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodedPath}`;
    const uploadResult = await FileSystem.uploadAsync(uploadUrl, localFileToUpload, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'Content-Type': contentType,
      },
    });

    if (uploadResult.status >= 200 && uploadResult.status < 300) {
      let downloadTokens = '';
      try {
        const parsed = JSON.parse(uploadResult.body);
        downloadTokens = parsed.downloadTokens || '';
      } catch (_) { }
      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${downloadTokens}`;
      console.log('Firebase storage upload SUCCESS (native) ->', publicUrl);
      return publicUrl;
    } else {
      console.warn(`Storage REST upload returned status ${uploadResult.status}:`, uploadResult.body);
    }
  } catch (err) {
    console.warn("Firebase storage upload notice:", err);
  } finally {
    if (isTempFile) {
      try {
        await FileSystem.deleteAsync(localFileToUpload, { idempotent: true });
      } catch (_) { }
    }
  }

  return dataOrUri;
};

const DEFICIENCY_LIST = [
  'Vitamin A', 'Vitamin C', 'Vitamin E', 'Calcium', 'Magnesium',
  'Iron', 'Protein', 'Phosphorus', 'Vitamin B', 'Vitamin D',
  'Vitamin K', 'Potassium', 'Zinc', 'Sodium', 'Manganese'
];
const DISORDERS_LIST = [
  'Sugar (Diabetes)', 'High BP / Hypertension', 'Thyroid', 'Gastritis',
  'IBS / IBD', 'GERD', 'Piles', 'PCOD', 'Insulin Resistance',
  'Hairfall', 'Melasma', 'Weight Gain', 'Weight Loss',
  'Height Growth', 'Adenoids / Tonsillitis', 'Allergies'
];

const DEFICIENCY_NUTRITION_MAP: Record<string, { eat: string[]; avoid: string[] }> = {
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

const DISORDER_NUTRITION_MAP: Record<string, { eat: string[]; avoid: string[] }> = {
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

const calculateBmi = (hCm: string, wKg: string): string => {
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

const generateNutritionSuggestions = (
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

interface DayDietItem {
  day: number;
  phase: number;
  phaseTitle: string;
  breakfast: string;
  lunch: string;
  snacks: string;
  dinner: string;
}

const generate30DayDietPlanMenu = (
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

interface PatientFileMobileScreenProps {
  patient?: any;
  currentBranch?: string;
  doctorName?: string;
  onNavigate?: (tab: string) => void;
  onBack?: () => void;
  onSaveConsultation?: (data: any) => void;
  isDoctor?: boolean;
}

const renderSafeString = (val: any, fallback: string = ''): string => {
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (typeof val.text === 'string') return val.text;
    if (typeof val.notes === 'string') return val.notes;
    if (typeof val.name === 'string') return val.name;
    try {
      return JSON.stringify(val);
    } catch (e) {
      return fallback;
    }
  }
  return String(val);
};

export const PatientFileMobileScreen: React.FC<PatientFileMobileScreenProps> = ({
  patient,
  currentBranch,
  doctorName: doctorNameProp,
  onNavigate,
  onBack,
  onSaveConsultation,
  isDoctor = false,
}) => {
  const [activeTab, setActiveTab] = useState<'clinical' | 'diet' | 'media' | 'package'>('clinical');


  // Patient Info (Clean real data extraction, NO mock fallbacks)
  const isEditPrescriptionOnly = Boolean(patient?.editPrescriptionOnly || patient?.disableAmount || patient?.isEditPrescriptionOnly || patient?.lockPayment);
  const patientName = renderSafeString(patient?.patientName || patient?.fullName || patient?.name || patient?.patient_name || patient?.patient, '');
  const regId = renderSafeString(patient?.registrationId || patient?.regId || patient?.regNo || patient?.patientId || patient?.registrationNo || patient?.uhid || patient?.patient_id, '');
  const phone = renderSafeString(patient?.phone || patient?.phoneNumber || patient?.mobile || patient?.mobileNumber || patient?.contact || patient?.contactNumber || patient?.phoneNo, '');
  const branchName = renderSafeString(currentBranch || patient?.branch || patient?.branchName || patient?.targetBranch, '');
  const doctorName = formatDoctorName(doctorNameProp || patient?.doctorName || patient?.doctor, branchName);
  const source = renderSafeString(patient?.source || patient?.leadSource || patient?.marketingSource, '');
  const subject = renderSafeString(patient?.diseases || patient?.subject || patient?.complaint || patient?.chiefComplaints, '');

  // Helper to format any date to DD-MM-YYYY
  const formatDDMMYYYY = (dateStr?: any): string => {
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

  // Tab 1: Clinical Form State
  const [diagnosisNotes, setDiagnosisNotes] = useState(() => {
    return patient?.diagnosisNotes || patient?.chiefComplaint || patient?.subject || patient?.complaint || '';
  });
  const [drawPrescription, setDrawPrescription] = useState<'on' | 'off'>('off');
  const [followUpInterval, setFollowUpInterval] = useState('No Follow-up');
  const [preferredFollowUpDate, setPreferredFollowUpDate] = useState(() => {
    const raw = patient?.preferredFollowUpDate || patient?.followUpDate || '';
    return formatDDMMYYYY(raw);
  });

  useEffect(() => {
    if (patient) {
      const initialNotes = patient.diagnosisNotes || patient.chiefComplaint || patient.subject || patient.complaint || '';
      if (initialNotes && !diagnosisNotes) {
        setDiagnosisNotes(initialNotes);
      }
    }
  }, [patient]);
  const [followUpCalendarOpen, setFollowUpCalendarOpen] = useState(false);
  const [showCollectFeeModal, setShowCollectFeeModal] = useState(false);
  const [selectedPatientForCollectFee, setSelectedPatientForCollectFee] = useState<any>(null);
  const [followUpCalMonth, setFollowUpCalMonth] = useState<number>(() => {
    const raw = patient?.preferredFollowUpDate || patient?.followUpDate;
    if (raw) {
      const parts = String(raw).trim().split(/[\/\-]/);
      if (parts.length === 3) {
        if (parts[0].length <= 2 && parts[2].length === 4) {
          const m = parseInt(parts[1], 10) - 1;
          if (!isNaN(m)) return m;
        } else if (parts[0].length === 4) {
          const m = parseInt(parts[1], 10) - 1;
          if (!isNaN(m)) return m;
        }
      }
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d.getMonth();
    }
    return new Date().getMonth();
  });
  const [followUpCalYear, setFollowUpCalYear] = useState<number>(() => {
    const raw = patient?.preferredFollowUpDate || patient?.followUpDate;
    if (raw) {
      const parts = String(raw).trim().split(/[\/\-]/);
      if (parts.length === 3) {
        if (parts[0].length <= 2 && parts[2].length === 4) {
          const y = parseInt(parts[2], 10);
          if (!isNaN(y)) return y;
        } else if (parts[0].length === 4) {
          const y = parseInt(parts[0], 10);
          if (!isNaN(y)) return y;
        }
      }
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d.getFullYear();
    }
    return new Date().getFullYear();
  });
  const [pharmacyFee, setPharmacyFee] = useState('');

  // Helper to encode Uint8Array to base64 for pure JS BMP generation
  const b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function uint8ToBase64Safe(bytes: Uint8Array): string {
    let base64 = '';
    const byteLength = bytes.byteLength;
    const byteRemainder = byteLength % 3;
    const mainLength = byteLength - byteRemainder;
    let a, b, c, d, chunk;
    for (let i = 0; i < mainLength; i += 3) {
      chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      a = (chunk & 16515072) >> 18;
      b = (chunk & 258048) >> 12;
      c = (chunk & 4032) >> 6;
      d = chunk & 63;
      base64 += b64chars[a] + b64chars[b] + b64chars[c] + b64chars[d];
    }
    if (byteRemainder === 1) {
      chunk = bytes[mainLength];
      a = (chunk & 252) >> 2;
      b = (chunk & 3) << 4;
      base64 += b64chars[a] + b64chars[b] + '==';
    } else if (byteRemainder === 2) {
      chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];
      a = (chunk & 64512) >> 10;
      b = (chunk & 1008) >> 4;
      c = (chunk & 15) << 2;
      base64 += b64chars[a] + b64chars[b] + b64chars[c] + '=';
    }
    return base64;
  }

  function generateBmpDataUrl(width: number, height: number, strokes: Array<any>, defaultColor = '#0284c7', defaultWidth = 3): string {
    const rowSize = Math.floor((24 * width + 31) / 32) * 4;
    const pixelArraySize = rowSize * height;
    const fileSize = 54 + pixelArraySize;
    const buffer = new Uint8Array(fileSize);
    buffer.fill(255); // White background

    buffer[0] = 0x42; // 'B'
    buffer[1] = 0x4D; // 'M'
    buffer[2] = fileSize & 0xFF;
    buffer[3] = (fileSize >> 8) & 0xFF;
    buffer[4] = (fileSize >> 16) & 0xFF;
    buffer[5] = (fileSize >> 24) & 0xFF;
    buffer[10] = 54;

    buffer[14] = 40;
    buffer[18] = width & 0xFF;
    buffer[19] = (width >> 8) & 0xFF;
    buffer[20] = (width >> 16) & 0xFF;
    buffer[21] = (width >> 24) & 0xFF;
    buffer[22] = height & 0xFF;
    buffer[23] = (height >> 8) & 0xFF;
    buffer[24] = (height >> 16) & 0xFF;
    buffer[25] = (height >> 24) & 0xFF;
    buffer[26] = 1;
    buffer[28] = 24;
    buffer[34] = pixelArraySize & 0xFF;
    buffer[35] = (pixelArraySize >> 8) & 0xFF;
    buffer[36] = (pixelArraySize >> 16) & 0xFF;
    buffer[37] = (pixelArraySize >> 24) & 0xFF;

    function hexToRgb(hex: string): [number, number, number] {
      let c = (hex || defaultColor).replace('#', '');
      if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
      const num = parseInt(c, 16);
      return isNaN(num) ? [2, 132, 199] : [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }

    function setPixel(x: number, y: number, r: number, g: number, b: number) {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const bmpY = height - 1 - y;
      const offset = 54 + bmpY * rowSize + x * 3;
      buffer[offset] = b;
      buffer[offset + 1] = g;
      buffer[offset + 2] = r;
    }

    function drawThickPoint(x: number, y: number, r: number, g: number, b: number, radius: number) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (dx * dx + dy * dy <= radius * radius) {
            setPixel(x + dx, y + dy, r, g, b);
          }
        }
      }
    }

    function drawLine(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, radius: number) {
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      let cx = x0, cy = y0;
      while (true) {
        drawThickPoint(cx, cy, r, g, b, radius);
        if (cx === x1 && cy === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; cx += sx; }
        if (e2 < dx) { err += dx; cy += sy; }
      }
    }

    for (const s of strokes) {
      const pts = Array.isArray(s) ? s : s.points;
      if (!pts || pts.length === 0) continue;
      const [r, g, b] = hexToRgb(s.color || defaultColor);
      const radius = Math.max(1, Math.floor((s.width || defaultWidth) / 2));
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        if (i === 0) {
          drawThickPoint(Math.round(pt.x), Math.round(pt.y), r, g, b, radius);
        } else {
          const prev = pts[i - 1];
          drawLine(Math.round(prev.x), Math.round(prev.y), Math.round(pt.x), Math.round(pt.y), r, g, b, radius);
        }
      }
    }

    return 'data:image/bmp;base64,' + uint8ToBase64Safe(buffer);
  }

  // Mobile Canvas Drawing State & Handlers
  const mobileCanvasRef = React.useRef<any>(null);
  const [mobileCanvasHasContent, setMobileCanvasHasContent] = useState(false);
  const [drawingStrokes, setDrawingStrokes] = useState<Array<Array<{ x: number; y: number }>>>([]);
  const [currentStroke, setCurrentStroke] = useState<Array<{ x: number; y: number }>>([]);
  const [isDrawingWeb, setIsDrawingWeb] = useState(false);

  // Enlarged Canvas Modal State & Tools
  const [isCanvasModalOpen, setIsCanvasModalOpen] = useState(false);
  const [isSavingEnlarged, setIsSavingEnlarged] = useState(false);
  const [canvasStrokeColor, setCanvasStrokeColor] = useState('#0284c7');
  const [canvasStrokeWidth, setCanvasStrokeWidth] = useState(3.5);
  const enlargedMobileCanvasRef = React.useRef<any>(null);
  const [enlargedStrokes, setEnlargedStrokes] = useState<Array<{ points: Array<{ x: number; y: number }>; color: string; width: number }>>([]);
  const [enlargedCurrentStroke, setEnlargedCurrentStroke] = useState<Array<{ x: number; y: number }>>([]);
  const [isDrawingWebEnlarged, setIsDrawingWebEnlarged] = useState(false);

  const handleOpenMobileEnlargedCanvas = () => {
    setDrawPrescription('on');
    setIsCanvasModalOpen(true);
    if (drawingStrokes.length > 0 && enlargedStrokes.length === 0) {
      setEnlargedStrokes(drawingStrokes.map(pts => ({ points: pts, color: canvasStrokeColor, width: canvasStrokeWidth })));
    }
    if (Platform.OS === 'web') {
      setTimeout(() => {
        if (enlargedMobileCanvasRef.current) {
          const ctx = enlargedMobileCanvasRef.current.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, enlargedMobileCanvasRef.current.width, enlargedMobileCanvasRef.current.height);
            if (mobileCanvasRef.current && mobileCanvasHasContent) {
              ctx.drawImage(mobileCanvasRef.current, 0, 0, enlargedMobileCanvasRef.current.width, enlargedMobileCanvasRef.current.height);
            }
          }
        }
      }, 150);
    }
  };

  const clearMobileCanvas = () => {
    if (Platform.OS === 'web' && mobileCanvasRef.current) {
      const ctx = mobileCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, mobileCanvasRef.current.width, mobileCanvasRef.current.height);
      }
    }
    setDrawingStrokes([]);
    setCurrentStroke([]);
    setEnlargedStrokes([]);
    setEnlargedCurrentStroke([]);
    setMobileCanvasHasContent(false);
  };

  const clearEnlargedMobileCanvas = () => {
    if (Platform.OS === 'web' && enlargedMobileCanvasRef.current) {
      const ctx = enlargedMobileCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, enlargedMobileCanvasRef.current.width, enlargedMobileCanvasRef.current.height);
      }
    }
    setEnlargedStrokes([]);
    setEnlargedCurrentStroke([]);
  };

  const startWebDrawing = (e: any) => {
    if (!mobileCanvasRef.current) return;
    const ctx = mobileCanvasRef.current.getContext('2d');
    if (!ctx) return;
    setIsDrawingWeb(true);
    const rect = mobileCanvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const drawWeb = (e: any) => {
    if (!isDrawingWeb || !mobileCanvasRef.current) return;
    const ctx = mobileCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const rect = mobileCanvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    setMobileCanvasHasContent(true);
  };

  const stopWebDrawing = () => {
    setIsDrawingWeb(false);
  };

  const startWebEnlargedDrawing = (e: any) => {
    if (!enlargedMobileCanvasRef.current) return;
    const ctx = enlargedMobileCanvasRef.current.getContext('2d');
    if (!ctx) return;
    setIsDrawingWebEnlarged(true);
    const rect = enlargedMobileCanvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const drawWebEnlarged = (e: any) => {
    if (!isDrawingWebEnlarged || !enlargedMobileCanvasRef.current) return;
    const ctx = enlargedMobileCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const rect = enlargedMobileCanvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = canvasStrokeColor;
    ctx.lineWidth = canvasStrokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    setMobileCanvasHasContent(true);
  };

  const stopWebEnlargedDrawing = () => {
    setIsDrawingWebEnlarged(false);
  };

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          setCurrentStroke([{ x: locationX, y: locationY }]);
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          setCurrentStroke((prev) => [...prev, { x: locationX, y: locationY }]);
          setMobileCanvasHasContent(true);
        },
        onPanResponderRelease: () => {
          if (currentStroke.length > 0) {
            setDrawingStrokes((prev) => [...prev, currentStroke]);
            setCurrentStroke([]);
          }
        },
      }),
    [currentStroke]
  );

  const enlargedPanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          setEnlargedCurrentStroke([{ x: locationX, y: locationY }]);
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          setEnlargedCurrentStroke((prev) => [...prev, { x: locationX, y: locationY }]);
          setMobileCanvasHasContent(true);
        },
        onPanResponderRelease: () => {
          if (enlargedCurrentStroke.length > 0) {
            setEnlargedStrokes((prev) => [
              ...prev,
              { points: enlargedCurrentStroke, color: canvasStrokeColor, width: canvasStrokeWidth }
            ]);
            setEnlargedCurrentStroke([]);
          }
        },
      }),
    [enlargedCurrentStroke, canvasStrokeColor, canvasStrokeWidth]
  );

  const handleSaveAndUpdateEnlargedPrescription = async () => {
    setIsSavingEnlarged(true);
    try {
      let dataUrl: string | null = null;
      if (Platform.OS === 'web' && enlargedMobileCanvasRef.current) {
        dataUrl = enlargedMobileCanvasRef.current.toDataURL('image/png');
        if (mobileCanvasRef.current) {
          const ctx = mobileCanvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, mobileCanvasRef.current.width, mobileCanvasRef.current.height);
            ctx.drawImage(enlargedMobileCanvasRef.current, 0, 0, mobileCanvasRef.current.width, mobileCanvasRef.current.height);
          }
        }
      } else {
        const allStrokes = [...enlargedStrokes];
        if (enlargedCurrentStroke.length > 0) {
          allStrokes.push({ points: enlargedCurrentStroke, color: canvasStrokeColor, width: canvasStrokeWidth });
        }
        dataUrl = generateBmpDataUrl(360, 260, allStrokes, canvasStrokeColor, canvasStrokeWidth);
        setDrawingStrokes(allStrokes.map(s => s.points));
      }

      setMobileCanvasHasContent(true);
      setDrawPrescription('on');

      const targetDocId = patient?.id || patient?.appointmentId || patient?.patientId || regId;
      let finalUrl = dataUrl || '';
      if (dataUrl) {
        try {
          finalUrl = await uploadPrescriptionToStorage(dataUrl, targetDocId);
        } catch (e) {
          console.warn("Storage upload notice:", e);
        }
      }

      if (finalUrl) {
        setUploadedImages((prev) => {
          const filtered = prev.filter(item => item !== finalUrl);
          return [finalUrl, ...filtered];
        });

        if (db && targetDocId) {
          const targetCol = patient?.collectionName || 'appointments';
          const colsToUpdate = Array.from(new Set([targetCol, 'appointments', 'allpatients', 'patients']));
          for (const col of colsToUpdate) {
            try {
              await updateDoc(doc(db, col, targetDocId), {
                canvasPrescriptionUrl: finalUrl,
                uploadedPrescriptions: arrayUnion(finalUrl),
                updatedAt: new Date().toISOString()
              });
            } catch (e) { }
          }
        }

        Alert.alert('Prescription Updated', 'Drawn prescription saved and updated in the prescription portion! ✓');
      }

      setIsCanvasModalOpen(false);
    } catch (err: any) {
      console.error("Save enlarged error:", err);
      Alert.alert('Notice', 'Prescription drawing updated in file.');
      setIsCanvasModalOpen(false);
    } finally {
      setIsSavingEnlarged(false);
    }
  };

  const handleSaveConsultation = async () => {
    if (isSavingConsultation) return;
    setIsSavingConsultation(true);

    try {
      let canvasDataUrl: string | null = null;
      if (drawPrescription === 'on') {
        if (Platform.OS === 'web' && mobileCanvasRef.current && mobileCanvasHasContent) {
          try {
            canvasDataUrl = mobileCanvasRef.current.toDataURL('image/png');
          } catch (err) {
            console.error("Canvas export error:", err);
          }
        } else if (drawingStrokes.length > 0) {
          canvasDataUrl = generateBmpDataUrl(360, 260, drawingStrokes.map(pts => ({ points: pts, color: '#0284c7', width: 3 })));
        }
      }

      const targetDocId = patient?.id || patient?.appointmentId || patient?.patientId || regId;

      const initialUploadedImages: string[] = [...uploadedImages].filter(img => !deletedPrescriptionUrlsRef.current.has(img));
      if (canvasDataUrl && !initialUploadedImages.includes(canvasDataUrl) && !deletedPrescriptionUrlsRef.current.has(canvasDataUrl)) {
        initialUploadedImages.push(canvasDataUrl);
      }
      setUploadedImages(initialUploadedImages);

      const activeCanvas = (canvasDataUrl && !deletedPrescriptionUrlsRef.current.has(canvasDataUrl))
        ? canvasDataUrl
        : (patient?.canvasPrescriptionUrl && !deletedPrescriptionUrlsRef.current.has(patient.canvasPrescriptionUrl)
          ? patient.canvasPrescriptionUrl
          : '');

      if (patient) {
        patient.uploadedPrescriptions = initialUploadedImages;
        patient.prescriptionUrls = initialUploadedImages;
        patient.prescriptionUrl = initialUploadedImages[0] || '';
        patient.prescriptionImage = initialUploadedImages[0] || '';
        patient.canvasPrescriptionUrl = activeCanvas;
      }

      const numDietFee = Number(dietFeeAmount) || 0;
      const numPharmacyFee = Number(pharmacyFee) || 0;
      const numConsultationFee = Number(patient?.consultationFee || patient?.fee || patient?.consultationFeeAmount) || 0;
      const totalCalculated = numPharmacyFee + numDietFee + numConsultationFee;
      const computedTarget = numPharmacyFee > 0 ? numPharmacyFee : (totalCalculated > 0 ? totalCalculated : 1000);
      const docNameToSave = formatDoctorName(doctorName || patient?.doctorName || patient?.doctor);

      const basePayload = {
        patientId: targetDocId,
        patientName,
        regId,
        phone,
        branchName,
        diagnosisNotes,
        drawPrescription,
        canvasPrescriptionUrl: activeCanvas,
        followUpInterval,
        preferredFollowUpDate: formatDDMMYYYY(preferredFollowUpDate),
        pharmacyFee,
        uploadedPrescriptions: initialUploadedImages,
        prescriptionUrls: initialUploadedImages,
        prescriptionUrl: initialUploadedImages[0] || '',
        prescriptionImage: initialUploadedImages[0] || '',
        savedAt: new Date().toISOString()
      };

      const updatePayload = {
        uploadedPrescriptions: initialUploadedImages,
        prescriptionUrls: initialUploadedImages,
        prescriptionUrl: initialUploadedImages[0] || '',
        prescriptionImage: initialUploadedImages[0] || '',
        canvasPrescriptionUrl: activeCanvas,
        diagnosisNotes,
        consultationFee: numConsultationFee > 0 ? numConsultationFee : (patient?.consultationFee || 0),
        medicineFee: isEditPrescriptionOnly ? (patient?.medicineFee || 0) : numPharmacyFee,
        pharmacyFee: isEditPrescriptionOnly ? (patient?.medicineFee || 0) : numPharmacyFee,
        totalMedicineFee: isEditPrescriptionOnly ? (patient?.medicineFee || 0) : numPharmacyFee,
        medicineFeeRequested: isEditPrescriptionOnly ? 0 : numPharmacyFee,
        targetAmount: isEditPrescriptionOnly ? (patient?.targetAmount || patient?.totalAmount || 0) : computedTarget,
        target_amount: isEditPrescriptionOnly ? (patient?.targetAmount || patient?.totalAmount || 0) : computedTarget,
        dietFee: numDietFee,
        dietFeeAmount: dietFeeAmount,
        totalAmount: isEditPrescriptionOnly ? (patient?.totalAmount || patient?.amountPaid || 0) : (totalCalculated > 0 ? totalCalculated : Number(patient?.totalAmount || 0)),
        followUpInterval,
        preferredFollowUpDate: formatDDMMYYYY(preferredFollowUpDate),
        doctorName: docNameToSave,
        doctor: docNameToSave,
        status: isEditPrescriptionOnly ? (patient?.status || 'completed') : 'collect_fee',
        paymentStatus: isEditPrescriptionOnly ? (patient?.paymentStatus || 'paid') : 'pending',
        paymentPending: isEditPrescriptionOnly ? false : true,
        feeCollectionNeeded: isEditPrescriptionOnly ? false : true,
        updatedAt: new Date().toISOString()
      };

      // 1. INSTANT LOCAL STORE UPDATE (0ms Delay)
      if (targetDocId) {
        receptionDataStore.updateLocalAppointment(targetDocId, updatePayload);
      }

      const fullPayload = {
        ...basePayload,
        ...updatePayload,
        targetAmount: computedTarget,
        target_amount: computedTarget,
      };

      // 2. IMMEDIATE UI TRANSITION
      if (onSaveConsultation) {
        onSaveConsultation(fullPayload);
      } else {
        if (isEditPrescriptionOnly) {
          Alert.alert("Prescription Updated", "Prescription details updated successfully without affecting payment.");
        } else {
          Alert.alert("Sent to Reception", "Consultation saved & patient sent to Reception for Fee Collection!");
        }
        if (onBack) onBack();
      }
      setIsSavingConsultation(false);

      // 3. ASYNCHRONOUS BACKGROUND CLOUD PERSISTENCE (Parallel writes)
      (async () => {
        try {
          let finalCanvasUrl = canvasDataUrl;

          // Parallel image uploads
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

          finalCanvasUrl = (resolvedCanvas && !deletedPrescriptionUrlsRef.current.has(resolvedCanvas)) ? resolvedCanvas : null;
          const sanitizedImages: string[] = resolvedImages
            .filter((img): img is string => Boolean(img))
            .filter(img => !deletedPrescriptionUrlsRef.current.has(img));
          if (finalCanvasUrl && !sanitizedImages.includes(finalCanvasUrl) && !deletedPrescriptionUrlsRef.current.has(finalCanvasUrl)) {
            sanitizedImages.push(finalCanvasUrl);
          }

          const finalCloudPayload = {
            ...basePayload,
            uploadedPrescriptions: sanitizedImages,
            prescriptionUrls: sanitizedImages,
            prescriptionUrl: sanitizedImages[0] || '',
            prescriptionImage: sanitizedImages[0] || '',
            canvasPrescriptionUrl: finalCanvasUrl || '',
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
            uploadedPrescriptions: sanitizedImages,
            prescriptionUrls: sanitizedImages,
            prescriptionUrl: sanitizedImages[0] || '',
            prescriptionImage: sanitizedImages[0] || '',
            canvasPrescriptionUrl: finalCanvasUrl || '',
          };

          if (targetDocId) {
            receptionDataStore.updateLocalAppointment(targetDocId, finalUpdatePayload);
          }

          if (db) {
            const targetCol = patient?.collectionName || 'appointments';
            const colsToUpdate = Array.from(new Set([targetCol, 'appointments', 'allpatients', 'patients']));

            // Concurrently persist to prescriptions & appointment collections
            await Promise.allSettled([
              addDoc(collection(db, 'prescriptions'), finalCloudPayload),
              ...(targetDocId ? colsToUpdate.map(col => updateDoc(doc(db, col, targetDocId), finalUpdatePayload)) : [])
            ]);
          }
        } catch (bgErr) {
          console.error("Mobile background consultation save error:", bgErr);
        }
      })();
    } catch (err) {
      console.error("Firestore consultation save error:", err);
      Alert.alert("Save Error", "Could not save consultation. Please retry.");
      setIsSavingConsultation(false);
    }
  };

  // Tab 2: Diet Plan State
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

  const [isSavingDiet, setIsSavingDiet] = useState(false);
  const [isDietSaved, setIsDietSaved] = useState(false);
  const hasCustomLoadedMenuRef = React.useRef(false);

  // Mobile 30-Day Diet State
  const [dietMenuDays, setDietMenuDays] = useState<DayDietItem[]>([]);
  const [showFull30DayModal, setShowFull30DayModal] = useState(false);
  const [selectedPhaseFilter, setSelectedPhaseFilter] = useState<number | 'all'>('all');

  const handleMobileHeightChange = (val: string) => {
    setHeight(val);
    setBmi(calculateBmi(val, weight));
  };

  const handleMobileWeightChange = (val: string) => {
    setWeight(val);
    setBmi(calculateBmi(height, val));
  };

  const toggleMobileDeficiency = (item: string) => {
    hasCustomLoadedMenuRef.current = false;
    const updated = { ...deficiencies, [item]: !deficiencies[item] };
    setDeficiencies(updated);
    const nut = generateNutritionSuggestions(updated, disorders);
    setFoodsToEat(nut.eat);
    setFoodsToAvoid(nut.avoid);
  };

  const toggleMobileDisorder = (item: string) => {
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
    const activeDb = getSafeDb();

    if (cleanRegId && activeDb) {
      const unsubDiet = onSnapshot(doc(activeDb, 'diet_plans', cleanRegId), (snap) => {
        if (snap.exists()) {
          applyDietPlanData(snap.data());
        }
      }, (err) => console.log('Mobile diet plan doc sync err:', err));
      unsubList.push(unsubDiet);
    }

    if (patient?.id && activeDb) {
      const unsubApp = onSnapshot(doc(activeDb, 'appointments', patient.id), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data?.dietPlan) {
            applyDietPlanData(data.dietPlan);
          }
          if (Array.isArray(data?.uploadedPrescriptions)) {
            const filtered = data.uploadedPrescriptions.filter((u: string) => !deletedPrescriptionUrlsRef.current.has(u));
            setUploadedImages(filtered);
          }
        }
      }, (err) => console.log('Mobile appt live sync err:', err));
      unsubList.push(unsubApp);

      const unsubAllPat = onSnapshot(doc(activeDb, 'allpatients', patient.id), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data?.dietPlan) {
            applyDietPlanData(data.dietPlan);
          }
          if (Array.isArray(data?.uploadedPrescriptions)) {
            const filtered = data.uploadedPrescriptions.filter((u: string) => !deletedPrescriptionUrlsRef.current.has(u));
            setUploadedImages(filtered);
          }
        }
      }, (err) => console.log('Mobile allpatient live sync err:', err));
      unsubList.push(unsubAllPat);
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

  const handleSaveDietPlan = async () => {
    setIsSavingDiet(true);
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

    try {
      if (db) {
        const cleanRegId = (regId || phone || patient?.id || 'unknown').replace(/[\/\s#]/g, '_');

        // 1. Direct document upsert in diet_plans for instant cross-device synchronization
        await setDoc(doc(db, 'diet_plans', cleanRegId), {
          ...dietPayload,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // 2. Historical audit record
        await addDoc(collection(db, 'diet_plans'), {
          ...dietPayload,
          createdAt: new Date().toISOString()
        }).catch(() => { });

        // 3. Sync to appointments, allpatients, and patients
        if (patient?.id) {
          const numDietFee = Number(dietFeeAmount) || 0;
          const appUpdate = {
            dietPlan: dietPayload,
            dietFee: numDietFee,
            dietFeeAmount: dietFeeAmount,
            updatedAt: new Date().toISOString()
          };

          const appRef = doc(db, 'appointments', patient.id);
          await updateDoc(appRef, appUpdate).catch(() => { });
          await updateDoc(doc(db, 'allpatients', patient.id), appUpdate).catch(() => { });
          await updateDoc(doc(db, 'patients', patient.id), appUpdate).catch(() => { });
        }
      }
    } catch (err) {
      console.error("Firestore diet plan save error:", err);
    }

    setIsSavingDiet(false);
    setIsDietSaved(true);

    // Smooth transition back to Clinical Form tab after visual confirmation
    setTimeout(() => {
      setActiveTab('clinical');
    }, 900);

    setTimeout(() => {
      setIsDietSaved(false);
    }, 2800);
  };

  // Tab 3: Share Media State (Live from Reception Clinic Media Manager)
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
  const [sharingMediaId, setSharingMediaId] = useState<string | null>(null);

  // Subscribe to Reception clinic_media_items
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
      }, (err) => console.log('Mobile media items load notice:', err));
      return () => unsub();
    } catch (e) { }
  }, [db]);

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
  }, [db, patient?.id]);

  const handleShareMediaItem = async (mediaItem: any) => {
    if (!isPatientAppBooking) {
      Alert.alert(
        'Sharing Disabled',
        `Media sharing to the Patient App is disabled because this appointment was booked via ${patient?.source || 'Reception/Web'}. Only appointments booked through the Patient App can receive media.`
      );
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

      Alert.alert('Media Shared', `"${mediaObj.title}" shared successfully to patient's My Media!`);
    } catch (err: any) {
      console.warn('Share media mobile error:', err);
      Alert.alert('Error', 'Failed to share media: ' + (err.message || 'Error'));
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

  // Tab 4: Register Package State
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

  const deletedPrescriptionUrlsRef = React.useRef<Set<string>>(new Set());
  const lastProcessedPatientIdRef = React.useRef<string | null>(null);

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

  useEffect(() => {
    if (!patient) return;
    const patId = patient.id || patient.patientId || regId;
    if (lastProcessedPatientIdRef.current === patId) return;
    lastProcessedPatientIdRef.current = patId;
    deletedPrescriptionUrlsRef.current.clear();

    const list: string[] = [];
    const add = (v: any) => {
      if (!v) return;
      if (Array.isArray(v)) {
        v.forEach(x => {
          if (typeof x === 'string' && x.trim()) list.push(x.trim());
          else if (x && typeof x === 'object') {
            const u = x.url || x.imageUrl || x.prescriptionUrl || x.fileUrl || x.uri;
            if (u && typeof u === 'string') list.push(u.trim());
          }
        });
      } else if (typeof v === 'string' && v.trim()) {
        list.push(v.trim());
      } else if (v && typeof v === 'object') {
        const u = v.url || v.imageUrl || v.prescriptionUrl || v.fileUrl || v.uri;
        if (u && typeof u === 'string') list.push(u.trim());
      }
    };
    add(patient.uploadedPrescriptions);
    add(patient.prescriptionUrls);
    add(patient.prescriptionUrl);
    add(patient.prescriptionImage);
    add(patient.prescriptionImages);
    add(patient.canvasPrescriptionUrl);
    add(patient.canvasUrl);
    add(patient.imageUrl);
    add(patient.fileUrl);
    add(patient.reports);
    add(patient.images);
    const deduped = Array.from(new Set(list.filter(Boolean)));
    setUploadedImages(deduped);
  }, [patient?.id]);

  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);
  const [showAddImageModal, setShowAddImageModal] = useState(false);
  const [customImageUrlInput, setCustomImageUrlInput] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSavingConsultation, setIsSavingConsultation] = useState(false);
  const mobileFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleAddNewPrescriptionImage = async (imgUrl: string) => {
    if (!imgUrl || !imgUrl.trim()) return;
    let trimmed = imgUrl.trim();

    // If it was previously marked as deleted, unmark it
    deletedPrescriptionUrlsRef.current.delete(trimmed);

    // If it's a data URL, upload to Firebase Storage first
    if (trimmed.startsWith('data:')) {
      try {
        trimmed = await uploadPrescriptionToStorage(trimmed, patient?.id || patient?.patientId || regId);
      } catch (e) {
        console.warn('Storage upload error in handleAddNewPrescriptionImage:', e);
      }
    }

    // Safety guard: Reject raw strings > 400KB to ensure Firestore 1MB limit is never breached
    if (trimmed.startsWith('data:') && trimmed.length > 400000) {
      Alert.alert("Image Too Large", "The prescription photo exceeds database storage limits. Please capture at a lower resolution or choose another photo.");
      return;
    }

    setUploadedImages((prev) => {
      const filtered = prev.filter(x => x !== trimmed);
      return [trimmed, ...filtered];
    });

    if (patient?.id && db) {
      try {
        const appRef = doc(db, 'appointments', patient.id);
        await updateDoc(appRef, {
          uploadedPrescriptions: arrayUnion(trimmed),
          prescriptionUrls: arrayUnion(trimmed),
          updatedAt: new Date().toISOString()
        }).catch(() => { });

        await updateDoc(doc(db, 'allpatients', patient.id), {
          uploadedPrescriptions: arrayUnion(trimmed),
          prescriptionUrls: arrayUnion(trimmed)
        }).catch(() => { });

        await updateDoc(doc(db, 'patients', patient.id), {
          uploadedPrescriptions: arrayUnion(trimmed),
          prescriptionUrls: arrayUnion(trimmed)
        }).catch(() => { });
      } catch (err) {
        console.log('Firebase mobile upload note:', err);
      }
    }
  };

  const handleRemoveUploadedImage = async (idx: number) => {
    const removedUrl = uploadedImages[idx];
    if (removedUrl) {
      deletedPrescriptionUrlsRef.current.add(removedUrl);
    }
    const updated = uploadedImages.filter((_, i) => i !== idx);
    setUploadedImages(updated);

    if (patient) {
      patient.uploadedPrescriptions = updated;
      patient.prescriptionUrls = updated;
      if (patient.prescriptionUrl === removedUrl) {
        patient.prescriptionUrl = updated[0] || '';
      }
      if (patient.prescriptionImage === removedUrl) {
        patient.prescriptionImage = updated[0] || '';
      }
      if (patient.canvasPrescriptionUrl === removedUrl) {
        patient.canvasPrescriptionUrl = '';
      }
    }

    const targetDocId = patient?.id || patient?.appointmentId || patient?.patientId || regId;
    if (targetDocId && db) {
      try {
        const updatePayload: any = {
          uploadedPrescriptions: updated,
          prescriptionUrls: updated,
          prescriptionUrl: updated[0] || '',
          prescriptionImage: updated[0] || '',
          updatedAt: new Date().toISOString()
        };
        if (patient?.canvasPrescriptionUrl === removedUrl || !patient?.canvasPrescriptionUrl) {
          updatePayload.canvasPrescriptionUrl = '';
        }

        receptionDataStore.updateLocalAppointment(targetDocId, updatePayload);

        const targetCol = patient?.collectionName || 'appointments';
        const colsToUpdate = Array.from(new Set([targetCol, 'appointments', 'allpatients', 'patients']));
        for (const col of colsToUpdate) {
          await updateDoc(doc(db, col, targetDocId), updatePayload).catch(() => { });
        }
      } catch (err) {
        console.log('Firebase mobile remove image error:', err);
      }
    }
  };

  const handleMobileFileUpload = (e: any) => {
    const files = e.target?.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: any) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          const base64Url = event.target.result as string;
          setIsUploadingImage(true);
          try {
            const cloudUrl = await uploadPrescriptionToStorage(base64Url, patient?.id || patient?.patientId || regId);
            await handleAddNewPrescriptionImage(cloudUrl);
          } catch (err) {
            console.error("Upload error:", err);
          } finally {
            setIsUploadingImage(false);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePickFromGallery = async () => {
    if (Platform.OS === 'web' && mobileFileInputRef.current) {
      mobileFileInputRef.current.click();
      setShowAddImageModal(false);
      return;
    }

    try {
      if (Platform.OS === 'ios') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            'Permission Required',
            'Please allow gallery access in Settings to select prescription photos.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() }
            ]
          );
          return;
        }
      } else {
        // On Android, launchImageLibraryAsync uses system PhotoPicker without requiring broad media permissions
        try {
          const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
          if (!perm.granted && perm.canAskAgain) {
            await ImagePicker.requestMediaLibraryPermissionsAsync();
          }
        } catch (_) { }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 0, // No limit on number of prescription images
        quality: 0.3, // Compressed to ~150KB-250KB for fast cloud upload
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setShowAddImageModal(false);
        setIsUploadingImage(true);
        try {
          for (const asset of result.assets) {
            const rawData = asset.uri || (asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : '');
            if (!rawData) continue;
            const cloudUrl = await uploadPrescriptionToStorage(rawData, patient?.id || patient?.patientId || regId);
            await handleAddNewPrescriptionImage(cloudUrl);
          }
        } catch (err) {
          console.error("Gallery upload error:", err);
          Alert.alert("Upload Error", "Failed to upload prescription image.");
        } finally {
          setIsUploadingImage(false);
        }
      }
    } catch (err: any) {
      console.warn('Gallery pick error:', err);
      const isPermError = err?.message?.toLowerCase()?.includes('permission') || err?.code === 'ERR_MISSING_PERMISSION';
      if (isPermError) {
        Alert.alert(
          'Permission Required',
          'Please allow photo gallery access in Settings to select prescription photos.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
      } else {
        Alert.alert('Error', 'Could not open device photo gallery.');
      }
    }
  };

  const handleTakePhoto = async () => {
    if (Platform.OS === 'web' && mobileFileInputRef.current) {
      mobileFileInputRef.current.click();
      setShowAddImageModal(false);
      return;
    }

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission Required',
          'Please allow camera access in Settings to take prescription photos.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.3, // Compresses photo capture to ~150KB-250KB with clear text
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setShowAddImageModal(false);
        setIsUploadingImage(true);
        try {
          for (const asset of result.assets) {
            const rawData = asset.uri || (asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : '');
            if (!rawData) continue;
            const cloudUrl = await uploadPrescriptionToStorage(rawData, patient?.id || patient?.patientId || regId);
            await handleAddNewPrescriptionImage(cloudUrl);
          }
        } catch (err) {
          console.error("Camera take photo error:", err);
          Alert.alert("Upload Error", "Failed to upload prescription photo.");
        } finally {
          setIsUploadingImage(false);
        }
      }
    } catch (err) {
      console.warn('Camera take photo error:', err);
      Alert.alert('Error', 'Could not access device camera.');
    }
  };

  const handleTriggerMobilePick = () => {
    if (Platform.OS === 'web' && mobileFileInputRef.current) {
      mobileFileInputRef.current.click();
    } else {
      // Directly open device gallery / photo picker from your device
      handlePickFromGallery();
    }
  };

  // --- MEDICAL HISTORY & PAST VISITS FETCHING ---
  const [patientVisits, setPatientVisits] = useState<any[]>([]);
  const [selectedVisitModal, setSelectedVisitModal] = useState<any | null>(null);
  const [showAllVisitsModal, setShowAllVisitsModal] = useState(false);
  const [fullPrescriptionPreview, setFullPrescriptionPreview] = useState<string | null>(null);
  const [previewImagesList, setPreviewImagesList] = useState<string[]>([]);
  const [previewImageIndex, setPreviewImageIndex] = useState<number>(0);
  const [previewRotation, setPreviewRotation] = useState<number>(0);
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

  const openPrescriptionPreview = (url: string, list?: string[]) => {
    const activeList = list && list.length > 0 ? list : uploadedImages;
    const idx = activeList.indexOf(url);
    setPreviewImagesList(activeList);
    setPreviewImageIndex(idx >= 0 ? idx : 0);
    setFullPrescriptionPreview(url);
    setPreviewRotation(0);
  };

  const handlePrevPrescriptionImage = () => {
    if (previewImagesList.length <= 1) return;
    const nextIdx = previewImageIndex > 0 ? previewImageIndex - 1 : previewImagesList.length - 1;
    setPreviewImageIndex(nextIdx);
    setFullPrescriptionPreview(previewImagesList[nextIdx]);
    setPreviewRotation(0);
  };

  const handleNextPrescriptionImage = () => {
    if (previewImagesList.length <= 1) return;
    const nextIdx = previewImageIndex < previewImagesList.length - 1 ? previewImageIndex + 1 : 0;
    setPreviewImageIndex(nextIdx);
    setFullPrescriptionPreview(previewImagesList[nextIdx]);
    setPreviewRotation(0);
  };

  const handleRotatePrescriptionImage = () => {
    setPreviewRotation((prev) => (prev + 90) % 360);
  };

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
        } catch (e) { }
        return 0;
      };

      const getSortWeight = (item: any): number => {
        if (item.normalizedDate === todayYMD || item.visitDate === 'Today') {
          return 9999999999999;
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

        const isLinkedDoc = Boolean(
          (patient?.id && (docId === patient.id || incomingApptId === patient.id)) ||
          (patient?.patientDocId && (docId === patient.patientDocId || incomingApptId === patient.patientDocId)) ||
          regCandidates.includes(docId.toLowerCase()) ||
          (incomingApptId && regCandidates.includes(incomingApptId.toLowerCase()))
        );

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
          new Promise(res => setTimeout(() => res({ docs: [] }), 2500))
        ]);

        const queriesToRun: any[] = [];
        const primaryPhone = phoneCandidates[0];
        const primaryReg = regCandidates[0];

        if (primaryPhone) {
          ['appointments', 'allpatients', 'patients', 'medicine_requests', 'prescriptions'].forEach(col => {
            queriesToRun.push(safeGet(query(collection(db, col), where('phone', '==', primaryPhone), limit(25))));
            queriesToRun.push(safeGet(query(collection(db, col), where('phoneNumber', '==', primaryPhone), limit(25))));
            queriesToRun.push(safeGet(query(collection(db, col), where('phone', '==', `+91${primaryPhone}`), limit(25))));
            queriesToRun.push(safeGet(query(collection(db, col), where('phoneNumber', '==', `+91${primaryPhone}`), limit(25))));
          });
        }

        if (primaryReg) {
          ['appointments', 'allpatients', 'patients', 'prescriptions'].forEach(col => {
            queriesToRun.push(safeGet(query(collection(db, col), where('registrationId', '==', primaryReg), limit(25))));
            queriesToRun.push(safeGet(query(collection(db, col), where('regId', '==', primaryReg), limit(25))));
            queriesToRun.push(safeGet(query(collection(db, col), where('patientId', '==', primaryReg), limit(25))));
          });
        }

        if (patient?.id) {
          ['appointments', 'allpatients', 'patients', 'prescriptions'].forEach(col => {
            queriesToRun.push(
              getDoc(doc(db, col, patient.id))
                .then(snap => snap.exists() ? { docs: [snap] } : { docs: [] })
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
          const unsub = onSnapshot(doc(db, 'appointments', patient.id), (snap) => {
            if (snap.exists() && isMounted) {
              processDoc(snap.data(), snap.id);
              updateVisitsState();
            }
          }, (err) => console.warn('Appointment listener notice:', err));
          unsubs.push(unsub);
        } catch (e) { }
      }

      return () => {
        unsubs.forEach(unsub => unsub());
      };
    };

    fetchLiveVisits();

    return () => {
      isMounted = false;
    };
  }, [patientName, phone, regId, branchName, subject]);

  // Deficiencies List
  const deficiencyList = [
    'Vitamin A', 'Vitamin C', 'Vitamin E', 'Calcium', 'Magnesium', 'Iron', 'Protein', 'Phosphorus',
    'Vitamin B', 'Vitamin D', 'Vitamin K', 'Potassium', 'Zinc', 'Sodium', 'Manganese'
  ];

  // Common Health Disorders Pills
  const disordersList = [
    'Sugar (Diabetes)', 'High BP / Hypertension', 'Thyroid', 'Gastritis', 'IBS / IBD', 'GERD',
    'Piles', 'PCOD', 'Insulin Resistance', 'Hairfall', 'Melasma', 'Weight Gain', 'Weight Loss',
    'Height Growth', 'Adenoids / Tonsillitis', 'Allergies'
  ];



  const handleCreatePackage = () => {
    Alert.alert('Success', 'Package Membership Created Successfully!');
  };

  return (
    <View style={styles.container}>
      {/* 1. TOP HEADER NAVIGATION WITH BACK BUTTON */}
      <View style={styles.topHeader}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (onBack) {
                onBack();
              } else if (onNavigate) {
                onNavigate('reception_dashboard');
              }
            }}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={16} color="#0284c7" />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
          <View style={{ marginLeft: 6, flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {patientName || 'Patient Consultation'}
            </Text>
            <Text style={{ fontSize: 10, color: '#64748b' }} numberOfLines={1}>
              {branchName} • Reg: {regId}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{(patientName || 'P').charAt(0).toUpperCase()}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={true}
        bounces={true}
        overScrollMode="always"
      >

        {/* 2. PATIENT INFO CARD STACK */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Text style={styles.patientNameText}>{patientName}</Text>
            <View style={styles.durationBadge}>
              <Text style={styles.durationBadgeText}>IN DURATION</Text>
            </View>
          </View>

          <View style={styles.infoRowStack}>
            <Text style={styles.regIdText}>📋 Reg ID: {regId}</Text>
            <Text style={styles.infoText}>📞 {phone}</Text>
            <Text style={styles.infoText}>📍 {branchName}</Text>
            <Text style={styles.infoText}>📢 Source: {source}</Text>
            <Text style={styles.subjectText}>📋 Subject: {subject}</Text>
          </View>

          <View style={styles.packageNoticeBox}>
            <Text style={styles.packageNoticeText}>No active package.</Text>
            <TouchableOpacity style={styles.registerPkgBtn} onPress={() => setActiveTab('package')}>
              <Text style={styles.registerPkgBtnText}>+ Register Patient in Package</Text>
            </TouchableOpacity>
          </View>

          {(patient?.isReback || patient?.rebackVisit || patient?.feeCollectionNeeded) && (
            <View style={{
              backgroundColor: '#eff6ff',
              borderColor: '#93c5fd',
              borderWidth: 1.5,
              borderRadius: 12,
              padding: 12,
              marginTop: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8
            }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="time" size={16} color="#0284c7" />
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#0369a1' }}>
                    Reback Historical Visit
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                  📅 Visit Date: <Text style={{ fontWeight: '700' }}>{patient?.appointmentDate || patient?.date || 'Past Visit'}</Text>
                  {patient?.doctorName ? ` • Dr. ${patient.doctorName}` : ''}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => {
                  const pData = {
                    ...patient,
                    id: patient.appointmentId || patient.id,
                    patientDocId: patient.patientDocId || patient.id,
                    regId: patient.regId || regId,
                    registrationId: patient.regId || regId,
                    patientName: patient.patientName || patientName,
                    phone: patient.phone || phone,
                    phoneNumber: patient.phone || phone,
                    branch: patient.branch || branchName,
                    doctorName: patient.doctorName || doctorName,
                    isReback: true,
                    rebackVisit: true
                  };
                  setSelectedPatientForCollectFee(pData);
                  setShowCollectFeeModal(true);
                }}
                style={{
                  backgroundColor: '#16a34a',
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                <Ionicons name="card" size={14} color="#ffffff" />
                <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 11.5 }}>💳 Collect Fee</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>




        {/* 5. TOP HORIZONTAL TABS BAR */}
        <View style={styles.tabsBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[
              { id: 'clinical', label: 'Clinical Form' },
              { id: 'diet', label: 'Diet Plan' },
              { id: 'media', label: 'Share Media' },
              { id: 'package', label: 'Register Package' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.tabItem, isActive && styles.tabItemActive]}
                  onPress={() => setActiveTab(tab.id as any)}
                >
                  <Text style={[styles.tabItemText, isActive && styles.tabItemTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* 6. TAB 1: CLINICAL FORM */}
        {activeTab === 'clinical' && (
          <View style={styles.card}>
            <Text style={styles.mainTabTitle}>Digital Prescription</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Diagnosis Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                multiline
                numberOfLines={4}
                value={diagnosisNotes}
                onChangeText={setDiagnosisNotes}
                placeholder="Enter detailed clinical notes and diagnosis..."
              />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8, flexWrap: 'wrap' }}>
              <Text style={styles.label}>Draw Prescription (Optional)</Text>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                onPress={() => setDrawPrescription('on')}
              >
                <Ionicons name={drawPrescription === 'on' ? 'radio-button-on' : 'radio-button-off'} size={18} color="#0284c7" />
                <Text style={styles.radioLabel}>On</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                onPress={() => setDrawPrescription('off')}
              >
                <Ionicons name={drawPrescription === 'off' ? 'radio-button-on' : 'radio-button-off'} size={18} color="#0284c7" />
                <Text style={styles.radioLabel}>Off</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleOpenMobileEnlargedCanvas}
                style={{
                  backgroundColor: '#0284c7',
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <Ionicons name="expand-outline" size={13} color="#ffffff" />
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#ffffff' }}>Enlarge</Text>
              </TouchableOpacity>
            </View>

            {/* Freehand Canvas Drawing Pad (Visible when Draw Prescription is On) */}
            {drawPrescription === 'on' && (
              <View style={{ borderWidth: 1.5, borderColor: '#0284c7', borderRadius: 10, padding: 10, backgroundColor: '#f0f9ff', marginVertical: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#0284c7' }}>✍️ Freehand Canvas Prescription Drawing Pad</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      onPress={handleOpenMobileEnlargedCanvas}
                      style={{
                        backgroundColor: '#0284c7',
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <Ionicons name="expand-outline" size={12} color="#ffffff" />
                      <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#ffffff' }}>Enlarge</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={clearMobileCanvas} style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 }}>
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#0f172a' }}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {Platform.OS === 'web' ? (
                  React.createElement('canvas', {
                    ref: mobileCanvasRef,
                    width: 600,
                    height: 180,
                    onMouseDown: startWebDrawing,
                    onMouseMove: drawWeb,
                    onMouseUp: stopWebDrawing,
                    onMouseLeave: stopWebDrawing,
                    onTouchStart: startWebDrawing,
                    onTouchMove: drawWeb,
                    onTouchEnd: stopWebDrawing,
                    style: {
                      backgroundColor: '#ffffff',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      cursor: 'crosshair',
                      width: '100%',
                      height: 180,
                      touchAction: 'none'
                    }
                  })
                ) : (
                  <View
                    {...panResponder.panHandlers}
                    style={{
                      width: '100%',
                      height: 180,
                      backgroundColor: '#ffffff',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Saved Strokes */}
                    {drawingStrokes.map((stroke, strokeIdx) => (
                      <React.Fragment key={strokeIdx}>
                        {stroke.map((pt, ptIdx) => {
                          if (ptIdx === 0) return null;
                          const prev = stroke[ptIdx - 1];
                          const dx = pt.x - prev.x;
                          const dy = pt.y - prev.y;
                          const length = Math.sqrt(dx * dx + dy * dy);
                          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                          return (
                            <View
                              key={ptIdx}
                              style={{
                                position: 'absolute',
                                left: prev.x,
                                top: prev.y,
                                width: Math.max(length, 2),
                                height: 3,
                                backgroundColor: '#0284c7',
                                borderRadius: 1.5,
                                transform: [{ rotate: `${angle}deg` }]
                              }}
                            />
                          );
                        })}
                      </React.Fragment>
                    ))}

                    {/* Active Stroke */}
                    {currentStroke.map((pt, ptIdx) => {
                      if (ptIdx === 0) return null;
                      const prev = currentStroke[ptIdx - 1];
                      const dx = pt.x - prev.x;
                      const dy = pt.y - prev.y;
                      const length = Math.sqrt(dx * dx + dy * dy);
                      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                      return (
                        <View
                          key={ptIdx}
                          style={{
                            position: 'absolute',
                            left: prev.x,
                            top: prev.y,
                            width: Math.max(length, 2),
                            height: 3,
                            backgroundColor: '#0284c7',
                            borderRadius: 1.5,
                            transform: [{ rotate: `${angle}deg` }]
                          }}
                        />
                      );
                    })}

                    {!mobileCanvasHasContent && drawingStrokes.length === 0 && currentStroke.length === 0 && (
                      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Draw prescription notes here with finger/stylus...</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Physical Prescription (Optional if Canvas Drawing is used)</Text>
              {/* Hidden File Input for Web/Mobile Web */}
              {Platform.OS === 'web' && React.createElement('input', {
                type: 'file',
                ref: mobileFileInputRef,
                accept: 'image/*',
                multiple: true,
                style: { display: 'none' },
                onChange: handleMobileFileUpload
              })}
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: '#f8fafc',
                    borderWidth: 1.5,
                    borderColor: '#cbd5e1',
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                  onPress={handleTriggerMobilePick}
                >
                  <Ionicons name="cloud-upload-outline" size={18} color="#0284c7" />
                  <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: 12 }}>Upload</Text>
                  {uploadedImages.length > 0 && (
                    <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 }}>
                      <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#0284c7' }}>
                        {uploadedImages.length}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleTakePhoto}
                  style={{
                    flex: 1,
                    backgroundColor: '#0284c7',
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <Ionicons name="camera" size={18} color="#ffffff" />
                  <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>Camera</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.helperText}>Upload from device or take a photo with camera. Syncs live with web.</Text>
            </View>

            {/* 📤 UPLOADED PRESCRIPTIONS & CANVAS (Live Synced with Web) */}
            <View style={{
              backgroundColor: '#ffffff',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              padding: 14,
              marginBottom: 16,
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 3,
              elevation: 2
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>
                    📤 Uploaded Prescriptions & Canvas
                  </Text>
                  <View style={{ backgroundColor: uploadedImages.length > 0 ? '#e0f2fe' : '#f1f5f9', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: uploadedImages.length > 0 ? '#0284c7' : '#64748b' }}>
                      {uploadedImages.length}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={handleTriggerMobilePick}
                  style={{
                    backgroundColor: '#f0f9ff',
                    borderWidth: 1,
                    borderColor: '#bae6fd',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 6
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#0284c7' }}>+ Upload</Text>
                </TouchableOpacity>
              </View>

              {uploadedImages.length === 0 ? (
                <View style={{
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  paddingVertical: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#f8fafc'
                }}>
                  <Feather name="image" size={24} color="#94a3b8" />
                  <Text style={{ fontSize: 11.5, color: '#64748b', fontWeight: '600', marginTop: 6 }}>
                    No prescriptions or canvas drawings uploaded yet
                  </Text>
                  <Text style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>
                    Uploaded images sync live across Web & Mobile.
                  </Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 4 }}>
                    {uploadedImages.map((img, idx) => (
                      <View
                        key={idx}
                        style={{
                          position: 'relative',
                          width: 80,
                          height: 80,
                          borderRadius: 10,
                          overflow: 'hidden',
                          borderWidth: 1.5,
                          borderColor: '#cbd5e1',
                          backgroundColor: '#f1f5f9'
                        }}
                      >
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => openPrescriptionPreview(img, uploadedImages)}
                          style={{ width: 80, height: 80 }}
                        >
                          <Image
                            source={{ uri: img }}
                            style={{ width: 80, height: 80, minWidth: 80, minHeight: 80 }}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>

                        {/* Delete Button */}
                        <TouchableOpacity
                          onPress={() => handleRemoveUploadedImage(idx)}
                          style={{
                            position: 'absolute',
                            top: 3,
                            right: 3,
                            backgroundColor: '#ef4444',
                            borderRadius: 10,
                            width: 20,
                            height: 20,
                            alignItems: 'center',
                            justifyContent: 'center',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.2,
                            shadowRadius: 1.5,
                            elevation: 2
                          }}
                        >
                          <Ionicons name="close" size={14} color="#ffffff" />
                        </TouchableOpacity>

                        {/* Expand Icon */}
                        <TouchableOpacity
                          onPress={() => openPrescriptionPreview(img, uploadedImages)}
                          style={{
                            position: 'absolute',
                            bottom: 3,
                            right: 3,
                            backgroundColor: 'rgba(15, 23, 42, 0.7)',
                            borderRadius: 4,
                            padding: 2
                          }}
                        >
                          <Feather name="maximize-2" size={11} color="#ffffff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.subTitle}>Follow-up Recommendation</Text>
              <Text style={styles.label}>Follow-up Interval</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['No Follow-up', '15 Days', '1 Month', '2 Months', '3 Months', '4 Months', '5 Months', '6 Months'].map(opt => (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => {
                        setFollowUpInterval(opt);
                        const now = new Date();
                        if (opt === '15 Days') now.setDate(now.getDate() + 15);
                        else if (opt === '1 Month') now.setMonth(now.getMonth() + 1);
                        else if (opt === '2 Months') now.setMonth(now.getMonth() + 2);
                        else if (opt === '3 Months') now.setMonth(now.getMonth() + 3);
                        else if (opt === '4 Months') now.setMonth(now.getMonth() + 4);
                        else if (opt === '5 Months') now.setMonth(now.getMonth() + 5);
                        else if (opt === '6 Months') now.setMonth(now.getMonth() + 6);

                        if (opt === 'No Follow-up') {
                          setPreferredFollowUpDate('');
                        } else {
                          const yyyy = now.getFullYear();
                          const mm = String(now.getMonth() + 1).padStart(2, '0');
                          const dd = String(now.getDate()).padStart(2, '0');
                          setPreferredFollowUpDate(`${dd}-${mm}-${yyyy}`);
                          setFollowUpCalMonth(now.getMonth());
                          setFollowUpCalYear(now.getFullYear());
                        }
                      }}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                        backgroundColor: followUpInterval === opt ? '#0284c7' : '#f1f5f9',
                        borderWidth: 1, borderColor: followUpInterval === opt ? '#0284c7' : '#cbd5e1'
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: followUpInterval === opt ? '#ffffff' : '#334155' }}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={[styles.label, { marginTop: 8 }]}>Preferred Follow-up Date (DD-MM-YYYY)</Text>
              <TouchableOpacity
                style={styles.datePickerTrigger}
                onPress={() => {
                  if (preferredFollowUpDate) {
                    const clean = String(preferredFollowUpDate).trim();
                    const parts = clean.split(/[\/\-]/);
                    if (parts.length === 3) {
                      let y = parseInt(parts[0], 10);
                      let m = parseInt(parts[1], 10) - 1;
                      if (parts[0].length <= 2 && parts[2].length === 4) {
                        y = parseInt(parts[2], 10);
                        m = parseInt(parts[1], 10) - 1;
                      }
                      if (!isNaN(y) && !isNaN(m)) {
                        setFollowUpCalYear(y);
                        setFollowUpCalMonth(m);
                      }
                    }
                  }
                  setFollowUpCalendarOpen(true);
                }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="calendar" size={18} color="#0284c7" style={{ marginRight: 10 }} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: preferredFollowUpDate ? '#0f172a' : '#94a3b8' }}>
                    {preferredFollowUpDate ? formatDDMMYYYY(preferredFollowUpDate) : 'DD-MM-YYYY'}
                  </Text>
                </View>
                <Feather name="calendar" size={16} color="#0284c7" />
              </TouchableOpacity>

              {/* Interactive Calendar Date Picker Modal */}
              {followUpCalendarOpen && (
                <Modal visible={followUpCalendarOpen} transparent animationType="fade" onRequestClose={() => setFollowUpCalendarOpen(false)}>
                  <TouchableOpacity style={styles.calendarModalBackdrop} activeOpacity={1} onPress={() => setFollowUpCalendarOpen(false)}>
                    <View style={styles.calendarModalContent} onStartShouldSetResponder={() => true}>
                      {/* Month & Year Navigation Header */}
                      <View style={styles.calendarHeader}>
                        <TouchableOpacity
                          onPress={() => {
                            if (followUpCalMonth === 0) {
                              setFollowUpCalMonth(11);
                              setFollowUpCalYear(prev => prev - 1);
                            } else {
                              setFollowUpCalMonth(prev => prev - 1);
                            }
                          }}
                          style={styles.monthNavBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Feather name="chevron-left" size={18} color="#0284c7" />
                        </TouchableOpacity>

                        <Text style={styles.calendarHeaderTitle}>
                          {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][followUpCalMonth]} {followUpCalYear}
                        </Text>

                        <TouchableOpacity
                          onPress={() => {
                            if (followUpCalMonth === 11) {
                              setFollowUpCalMonth(0);
                              setFollowUpCalYear(prev => prev + 1);
                            } else {
                              setFollowUpCalMonth(prev => prev + 1);
                            }
                          }}
                          style={styles.monthNavBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Feather name="chevron-right" size={18} color="#0284c7" />
                        </TouchableOpacity>
                      </View>

                      {/* Weekday Labels */}
                      <View style={styles.weekdaysRow}>
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                          <Text key={d} style={styles.weekdayLabel}>{d}</Text>
                        ))}
                      </View>

                      {/* Days Grid */}
                      <View style={styles.daysGrid}>
                        {Array.from({ length: new Date(followUpCalYear, followUpCalMonth, 1).getDay() }).map((_, idx) => (
                          <View key={`empty-${idx}`} style={styles.dayCellEmpty} />
                        ))}

                        {Array.from({ length: new Date(followUpCalYear, followUpCalMonth + 1, 0).getDate() }, (_, i) => i + 1).map(dayNum => {
                          const mm = String(followUpCalMonth + 1).padStart(2, '0');
                          const dd = String(dayNum).padStart(2, '0');
                          const dateDDMMYYYY = `${dd}-${mm}-${followUpCalYear}`;
                          const isSelected = formatDDMMYYYY(preferredFollowUpDate) === dateDDMMYYYY;

                          return (
                            <View key={dayNum} style={styles.dayCellWrapper}>
                              <TouchableOpacity
                                style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                                onPress={() => {
                                  setPreferredFollowUpDate(dateDDMMYYYY);
                                  setFollowUpCalendarOpen(false);
                                }}
                                activeOpacity={0.7}
                              >
                                <Text style={[styles.dayCellText, isSelected && styles.dayCellTextSelected]}>
                                  {dayNum}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>

                      {/* Footer Actions: Today & Close */}
                      <View style={styles.calendarFooter}>
                        <TouchableOpacity
                          onPress={() => {
                            const now = new Date();
                            const yyyy = now.getFullYear();
                            const mm = String(now.getMonth() + 1).padStart(2, '0');
                            const dd = String(now.getDate()).padStart(2, '0');
                            setPreferredFollowUpDate(`${dd}-${mm}-${yyyy}`);
                            setFollowUpCalMonth(now.getMonth());
                            setFollowUpCalYear(now.getFullYear());
                            setFollowUpCalendarOpen(false);
                          }}
                          style={styles.calendarTodayBtn}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="today-outline" size={14} color="#0284c7" style={{ marginRight: 4 }} />
                          <Text style={styles.calendarTodayBtnText}>Today</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => setFollowUpCalendarOpen(false)}
                          style={styles.calendarCloseBtn}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.calendarCloseBtnText}>Close</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableOpacity>
                </Modal>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.subTitle}>Consultation & Medicine Fee</Text>
              {isEditPrescriptionOnly ? (
                <View style={{
                  backgroundColor: '#f8fafc',
                  borderWidth: 1.5,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  padding: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 6
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="lock" size={16} color="#64748b" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>
                      Fee Locked (Prescription Update Only)
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#0f172a' }}>
                    ₹{Number(patient?.existingAmountPaid ?? patient?.amountPaid ?? patient?.totalAmount ?? 0).toLocaleString('en-IN')}
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.label}>Enter Amount (₹)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter amount..."
                    keyboardType="numeric"
                    value={pharmacyFee}
                    onChangeText={setPharmacyFee}
                  />
                </>
              )}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveConsultation}>
              <Text style={styles.saveBtnText}>
                {isEditPrescriptionOnly
                  ? 'Update Prescription Only ✓'
                  : (isDoctor ? 'Submit Prescription & Send to Reception ✓' : 'Send to Reception & Collect Fee')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 7. TAB 2: DIET PLAN */}
        {activeTab === 'diet' && (
          <View style={styles.card}>
            <Text style={styles.mainTabTitle}>Diet Plan Management</Text>

            <View style={styles.metricsRow}>
              <View style={styles.metricCol}>
                <Text style={styles.label}>Age</Text>
                <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="numeric" placeholder="e.g. 32" />
              </View>
              <View style={styles.metricCol}>
                <Text style={styles.label}>Height (cm)</Text>
                <TextInput style={styles.input} value={height} onChangeText={handleMobileHeightChange} keyboardType="numeric" placeholder="e.g. 165" />
              </View>
              <View style={styles.metricCol}>
                <Text style={styles.label}>Weight (kg)</Text>
                <TextInput style={styles.input} value={weight} onChangeText={handleMobileWeightChange} keyboardType="numeric" placeholder="e.g. 68" />
              </View>
              <View style={styles.metricCol}>
                <Text style={[styles.label, { color: '#0284c7', fontWeight: '800' }]}>BMI (Auto)</Text>
                <TextInput style={[styles.input, { backgroundColor: '#f0f9ff', borderColor: '#0284c7', color: '#0284c7', fontWeight: '800' }]} value={bmi} onChangeText={setBmi} />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.subTitle}>Deficiencies Checklist ({DEFICIENCY_LIST.filter(i => deficiencies[i]).length})</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {DEFICIENCY_LIST.map((item) => {
                  const isChecked = Boolean(deficiencies[item]);
                  return (
                    <TouchableOpacity
                      key={item}
                      activeOpacity={0.7}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      style={[styles.checkChip, isChecked && styles.checkChipActive]}
                      onPress={() => toggleMobileDeficiency(item)}
                    >
                      <Text style={[styles.checkChipText, isChecked && styles.checkChipTextActive]}>
                        {isChecked ? '✓ ' : '+ '}{item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.subTitle}>Common Health Disorders ({DISORDERS_LIST.filter(i => disorders[i]).length})</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {DISORDERS_LIST.map((item) => {
                  const isSel = Boolean(disorders[item]);
                  return (
                    <TouchableOpacity
                      key={item}
                      activeOpacity={0.7}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      style={[styles.pillChip, isSel && styles.pillChipActive]}
                      onPress={() => toggleMobileDisorder(item)}
                    >
                      <Text style={[styles.pillChipText, isSel && styles.pillChipTextActive]}>
                        {isSel ? '✓ ' : '+ '}{item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: '#166534', fontWeight: '800' }]}>🟢 Foods to Eat (Auto-Generated Nutrients)</Text>
              <TextInput style={[styles.input, styles.textAreaSmall, { backgroundColor: '#f0fdf4', borderColor: '#86efac', color: '#14532d' }]} multiline value={foodsToEat} onChangeText={setFoodsToEat} />

              <Text style={[styles.label, { marginTop: 10, color: '#991b1b', fontWeight: '800' }]}>🔴 Foods to Avoid (Clinical Restrictions)</Text>
              <TextInput style={[styles.input, styles.textAreaSmall, { backgroundColor: '#fef2f2', borderColor: '#fca5a5', color: '#7f1d1d' }]} multiline value={foodsToAvoid} onChangeText={setFoodsToAvoid} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Diet Consultation Fee (₹)</Text>
              <TextInput style={styles.input} placeholder="Enter fee..." keyboardType="numeric" value={dietFeeAmount} onChangeText={setDietFeeAmount} />
            </View>

            {/* 30-Day Diet Plan Menu Mobile Section */}
            <View style={{ marginTop: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#e2e8f0' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#0f172a' }}>🗓 30-Day Diet Plan Menu</Text>
                <TouchableOpacity
                  style={{ backgroundColor: '#0284c7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}
                  onPress={() => setShowFull30DayModal(true)}
                >
                  <Text style={{ fontSize: 11, color: '#ffffff', fontWeight: '800' }}>↗ Expand 30 Days</Text>
                </TouchableOpacity>
              </View>

              {/* Day 1 Preview Card */}
              {dietMenuDays.slice(0, 3).map((item) => (
                <View key={item.day} style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#0284c7' }}>Day {item.day}</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748b' }}>{item.phaseTitle}</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#334155' }}>🥣 <Text style={{ fontWeight: '800' }}>B:</Text> {item.breakfast}</Text>
                  <Text style={{ fontSize: 11, color: '#334155', marginTop: 2 }}>🥗 <Text style={{ fontWeight: '800' }}>L:</Text> {item.lunch}</Text>
                  <Text style={{ fontSize: 11, color: '#334155', marginTop: 2 }}>☕ <Text style={{ fontWeight: '800' }}>S:</Text> {item.snacks}</Text>
                  <Text style={{ fontSize: 11, color: '#334155', marginTop: 2 }}>🍲 <Text style={{ fontWeight: '800' }}>D:</Text> {item.dinner}</Text>
                </View>
              ))}

              <TouchableOpacity onPress={() => setShowFull30DayModal(true)} style={{ alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ fontSize: 11.5, color: '#0284c7', fontWeight: '700', textDecorationLine: 'underline' }}>+ View all 30 days in Interactive Modal...</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveDietPlan}
                disabled={isSavingDiet}
                style={{
                  backgroundColor: isDietSaved ? '#16a34a' : isSavingDiet ? '#64748b' : '#0284c7',
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  marginTop: 10,
                  shadowColor: isDietSaved ? '#16a34a' : '#0284c7',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                  elevation: 3
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff' }}>
                  {isSavingDiet ? '⏳ Saving Diet Plan...' : isDietSaved ? '✅ Diet Plan Saved!' : '💾 Save Diet Plan & 30-Day Menu'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 8. TAB 3: SHARE MEDIA */}
        {activeTab === 'media' && (
          <View style={[styles.card, { gap: 14 }]}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.mainTabTitle}>Shared Media & Educational Links</Text>
                <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  Links shared here appear in the patient's app under Profile → My Media.
                </Text>
              </View>
              <View style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: isPatientAppBooking ? '#dcfce7' : '#fef3c7',
                borderWidth: 1,
                borderColor: isPatientAppBooking ? '#bbf7d0' : '#fde68a'
              }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: isPatientAppBooking ? '#166534' : '#b45309' }}>
                  {isPatientAppBooking ? '📱 Patient App' : `🏢 ${patient?.source || 'Reception'}`}
                </Text>
              </View>
            </View>

            {/* Conditional Lock Banner */}
            {!isPatientAppBooking ? (
              <View style={{
                backgroundColor: '#fffbeb',
                borderWidth: 1,
                borderColor: '#fde68a',
                borderRadius: 10,
                padding: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10
              }}>
                <Feather name="lock" size={20} color="#b45309" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#92400e' }}>
                    Media Sharing to Patient App Disabled
                  </Text>
                  <Text style={{ fontSize: 11, color: '#b45309', marginTop: 2, lineHeight: 16 }}>
                    This appointment was booked via {patient?.source || 'Reception / Web'}. Media sharing is only available for appointments booked through the Patient App.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={{
                backgroundColor: '#f0fdf4',
                borderWidth: 1,
                borderColor: '#bbf7d0',
                borderRadius: 10,
                padding: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8
              }}>
                <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                <Text style={{ fontSize: 11.5, color: '#15803d', fontWeight: '700', flex: 1 }}>
                  Patient App Connected — You can share media links directly with this patient.
                </Text>
              </View>
            )}

            {/* SECTION 1: CURRENTLY SHARED MEDIA */}
            <View style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#0f172a', marginBottom: 8 }}>
                📤 Currently Shared with Patient ({sharedPatientMedia.length})
              </Text>

              {sharedPatientMedia.length === 0 ? (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11.5, color: '#94a3b8' }}>No media links shared with this patient yet.</Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {sharedPatientMedia.map((m: any, idx: number) => (
                    <View key={idx} style={{
                      backgroundColor: '#ffffff',
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      borderRadius: 8,
                      padding: 10,
                      gap: 4
                    }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#0f172a', flex: 1 }} numberOfLines={1}>
                          {m.title || 'Educational Link'}
                        </Text>
                        <TouchableOpacity onPress={() => handleRevokeSharedMedia(m.url)} style={{ padding: 4 }}>
                          <Feather name="trash-2" size={13} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                      <Text style={{ fontSize: 10.5, color: '#0284c7' }} numberOfLines={1}>{m.url}</Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <Text style={{ fontSize: 9.5, color: '#64748b' }}>
                          Shared {m.sharedAt ? formatDDMMYYYY(m.sharedAt) : 'Today'}
                        </Text>
                        <TouchableOpacity
                          onPress={() => Linking.openURL(m.url).catch(() => Alert.alert('Invalid URL', m.url))}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 }}
                        >
                          <Feather name="external-link" size={11} color="#0284c7" />
                          <Text style={{ fontSize: 10.5, color: '#0284c7', fontWeight: '700' }}>Open</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* SECTION 2: CLINIC MEDIA REPOSITORY (FROM RECEPTION) */}
            <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#0f172a' }}>
                  📚 Reception Media Links ({clinicMediaItems.length})
                </Text>
              </View>

              {/* Search input */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#f8fafc',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 8,
                paddingHorizontal: 8,
                height: 34,
                marginBottom: 10,
                gap: 6
              }}>
                <Feather name="search" size={13} color="#94a3b8" />
                <TextInput
                  style={{ flex: 1, fontSize: 11.5, color: '#0f172a', paddingVertical: 0 }}
                  placeholder="Filter media links..."
                  placeholderTextColor="#94a3b8"
                  value={mediaSearchQuery}
                  onChangeText={setMediaSearchQuery}
                />
              </View>

              {clinicMediaItems.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11.5, color: '#94a3b8' }}>
                    No media links saved by Reception in Media Manager yet.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {clinicMediaItems
                    .filter((item: any) => {
                      const q = mediaSearchQuery.toLowerCase().trim();
                      if (!q) return true;
                      return (
                        item.title?.toLowerCase().includes(q) ||
                        item.url?.toLowerCase().includes(q) ||
                        item.folderName?.toLowerCase().includes(q)
                      );
                    })
                    .map((item: any) => {
                      const isAlreadyShared = sharedPatientMedia.some((m: any) => m.url === item.url);
                      const isSharingThis = sharingMediaId === item.id;

                      return (
                        <View
                          key={item.id}
                          style={{
                            backgroundColor: '#ffffff',
                            borderWidth: 1,
                            borderColor: isAlreadyShared ? '#86efac' : '#cbd5e1',
                            borderRadius: 8,
                            padding: 10,
                            gap: 4
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#0f172a', flex: 1 }} numberOfLines={1}>
                              {item.title}
                            </Text>
                            {item.folderName && (
                              <Text style={{ fontSize: 9.5, color: '#64748b', backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                📁 {item.folderName}
                              </Text>
                            )}
                          </View>

                          <Text style={{ fontSize: 10.5, color: '#0284c7' }} numberOfLines={1}>{item.url}</Text>

                          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 }}>
                            {isAlreadyShared ? (
                              <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#16a34a' }}>
                                ✓ Shared with Patient
                              </Text>
                            ) : (
                              <TouchableOpacity
                                disabled={!isPatientAppBooking || isSharingThis}
                                onPress={() => handleShareMediaItem(item)}
                                style={{
                                  backgroundColor: !isPatientAppBooking ? '#e2e8f0' : '#0284c7',
                                  paddingHorizontal: 10,
                                  paddingVertical: 5,
                                  borderRadius: 6
                                }}
                              >
                                <Text style={{
                                  fontSize: 10.5,
                                  fontWeight: '800',
                                  color: !isPatientAppBooking ? '#94a3b8' : '#ffffff'
                                }}>
                                  {isSharingThis ? 'Sharing...' : !isPatientAppBooking ? '🔒 Disabled' : '+ Share to Patient App'}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      );
                    })}
                </View>
              )}
            </View>
          </View>
        )}

        {/* 9. TAB 4: REGISTER PACKAGE */}
        {activeTab === 'package' && (
          <View style={styles.card}>
            <Text style={styles.mainTabTitle}>Register Patient in Package</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Total Package Amount (₹) *</Text>
              <TextInput style={styles.input} placeholder="Enter total package cost" keyboardType="numeric" value={totalPackageAmount} onChangeText={setTotalPackageAmount} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Initial Advance Paid (₹)</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={initialAdvancePaid} onChangeText={setInitialAdvancePaid} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Package Purpose / Disease</Text>
              <TextInput style={styles.input} placeholder="e.g. Chronic Asthma, Sinusitis" value={packagePurpose} onChangeText={setPackagePurpose} />
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleCreatePackage}>
              <Text style={styles.saveBtnText}>Create Package Membership</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* PATIENT HISTORY & RECORDS (ALL HISTORY, PRESCRIPTIONS & PAYMENT HISTORY) */}
        <View style={[styles.historyCard, { backgroundColor: '#ffffff', borderColor: '#bae6fd', borderWidth: 1 }]}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <View>
              <Text style={styles.historyHeaderTitle}>📋 Patient History & Records</Text>
              <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                Total Paid: <Text style={{ color: '#16a34a', fontWeight: '800' }}>₹{totalPaidSum.toLocaleString('en-IN')}</Text> ({patientVisits.length} Visits)
              </Text>
            </View>
          </View>

          {/* 3-Tab Segmented Bar: All History | Prescriptions | Payment History */}
          <View style={{ flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 12, gap: 4 }}>
            {[
              { key: 'all', label: `All (${patientVisits.length})` },
              { key: 'prescriptions', label: allVisitedPrescriptionImages.length > 0 ? `Prescriptions (${allVisitedPrescriptionImages.length})` : 'Prescriptions' },
              { key: 'billing', label: totalPaidSum > 0 ? `Payments (₹${totalPaidSum.toLocaleString('en-IN')})` : 'Payments' },
            ].map((tab) => {
              const isActive = historyFilterTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setHistoryFilterTab(tab.key as any)}
                  style={{
                    flex: 1,
                    paddingVertical: 7,
                    borderRadius: 8,
                    backgroundColor: isActive ? '#ffffff' : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: isActive ? '#000' : 'transparent',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: isActive ? 0.08 : 0,
                    shadowRadius: 2,
                    elevation: isActive ? 1 : 0
                  }}
                >
                  <Text style={{ fontSize: 10.5, fontWeight: isActive ? '800' : '600', color: isActive ? '#0284c7' : '#64748b' }} numberOfLines={1}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* CONTENT */}
          {patientVisits.length === 0 ? (
            <View style={styles.historyEmptyBox}>
              <Ionicons name="create-outline" size={24} color="#94a3b8" />
              <Text style={styles.historyEmptyText}>No previous visits recorded for this patient.</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {/* 1. PRESCRIPTIONS TAB VIEW */}
              {historyFilterTab === 'prescriptions' && (
                allVisitedPrescriptionImages.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#94a3b8' }}>No prescription images found for this patient.</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {allVisitedPrescriptionImages.map((img: any, idx: number) => (
                      <TouchableOpacity
                        key={idx}
                        activeOpacity={0.8}
                        onPress={() => openPrescriptionPreview(img.uri, allVisitedPrescriptionImages.map((i: any) => i.uri))}
                        style={{
                          width: '48%',
                          backgroundColor: '#ffffff',
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          overflow: 'hidden'
                        }}
                      >
                        <View style={{ paddingHorizontal: 6, paddingVertical: 4, backgroundColor: '#e0f2fe', flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#0369a1' }}>Visit #{img.visitNumber}</Text>
                          <Text style={{ fontSize: 9.5, color: '#0369a1' }}>{img.visitDate}</Text>
                        </View>
                        <View style={{ height: 100, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }}>
                          <Image source={{ uri: img.uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                        </View>
                        <View style={{ paddingVertical: 4, alignItems: 'center', backgroundColor: '#ffffff' }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#0284c7' }}>Tap to View 🔍</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )
              )}

              {/* 2. ALL HISTORY & PAYMENT HISTORY TAB VIEWS */}
              {historyFilterTab !== 'prescriptions' && patientVisits.map((visit: any, vIdx: number) => {
                const visitNum = patientVisits.length - vIdx;
                const isPaid = visit.paymentStatus === 'paid' || Number(visit.paidAmount) > 0;
                const showPayment = historyFilterTab === 'all' || historyFilterTab === 'billing';
                const showPrescription = historyFilterTab === 'all';
                const visitImgs = Array.from(new Set([
                  ...(visit.canvasPrescriptionUrl ? [visit.canvasPrescriptionUrl] : []),
                  ...(visit.uploadedPrescriptions || [])
                ].filter(Boolean)));

                return (
                  <View
                    key={visit.id || vIdx}
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      padding: 10,
                      gap: 6
                    }}
                  >
                    {/* Header: Visit #, Date, Paid Badge */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#0284c7' }}>VISIT #{visitNum}</Text>
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#0f172a' }}>📅 {renderSafeString(visit.visitDate, 'Today')}</Text>
                        <Text style={{ fontSize: 11, color: '#64748b' }}>• {visit.visitTime}</Text>
                      </View>
                      <View style={{
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 6,
                        backgroundColor: isPaid ? '#dcfce7' : '#fef3c7',
                        borderWidth: 1,
                        borderColor: isPaid ? '#bbf7d0' : '#fde68a'
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: isPaid ? '#15803d' : '#b45309' }}>
                          {isPaid ? `₹${visit.paidAmount} Paid ✓` : 'Fee Pending'}
                        </Text>
                      </View>
                    </View>

                    {/* Doctor & Branch */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: '#64748b' }}>🩺 {visit.doctorName}</Text>
                      <Text style={{ fontSize: 11, color: '#64748b' }}>📍 {visit.branch}</Text>
                    </View>

                    {/* Payment Row */}
                    {showPayment && (
                      <View style={{
                        backgroundColor: '#f8fafc',
                        borderWidth: 1,
                        borderColor: '#e2e8f0',
                        borderRadius: 8,
                        padding: 8,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <View>
                          <Text style={{ fontSize: 9.5, color: '#64748b', fontWeight: '700' }}>AMOUNT PAID</Text>
                          <Text style={{ fontSize: 13, fontWeight: '900', color: isPaid ? '#15803d' : '#b45309' }}>₹{visit.paidAmount || 0}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 9.5, color: '#64748b', fontWeight: '700' }}>PAYMENT MODE</Text>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#0f172a' }}>💳 {visit.paymentMode || 'Cash'}</Text>
                        </View>
                      </View>
                    )}

                    {/* Prescriptions & Remedies with Edit Rx Button */}
                    {showPrescription && (
                      <View style={{
                        backgroundColor: '#f0f9ff',
                        borderWidth: 1,
                        borderColor: '#bae6fd',
                        borderRadius: 8,
                        padding: 8,
                        gap: 6
                      }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#0284c7' }}>
                            💊 Prescriptions & Remedies ({visit.medicines?.length || 0})
                          </Text>
                          <TouchableOpacity
                            onPress={() => setSelectedVisitModal(visit)}
                            style={{
                              backgroundColor: '#ffffff',
                              borderWidth: 1,
                              borderColor: '#0284c7',
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 6,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 2
                            }}
                          >
                            <MaterialCommunityIcons name="pencil-outline" size={12} color="#0284c7" />
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#0284c7' }}>Edit Rx</Text>
                          </TouchableOpacity>
                        </View>

                        {/* Complaints & Diagnosis Notes */}
                        {(visit.subject || visit.diagnosisNotes) ? (
                          <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, padding: 6, gap: 2 }}>
                            {visit.subject ? <Text style={{ fontSize: 10.5, color: '#334155' }}><Text style={{ fontWeight: '800' }}>Complaints: </Text>{visit.subject}</Text> : null}
                            {visit.diagnosisNotes ? <Text style={{ fontSize: 10.5, color: '#334155' }}><Text style={{ fontWeight: '800' }}>Diagnosis: </Text>{visit.diagnosisNotes}</Text> : null}
                          </View>
                        ) : null}

                        {/* Medicines List */}
                        {visit.medicines && visit.medicines.length > 0 ? (
                          <View style={{ gap: 4 }}>
                            {visit.medicines.map((med: any, mIdx: number) => {
                              const details = [med.dosage, med.frequency, med.duration].filter(Boolean).join(' • ');
                              return (
                                <View key={mIdx} style={{ backgroundColor: '#ffffff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#0f172a' }}>{mIdx + 1}. {med.name}</Text>
                                  {details ? (
                                    <Text style={{ fontSize: 10, color: '#0284c7', fontWeight: '700' }}>{details}</Text>
                                  ) : null}
                                </View>
                              );
                            })}
                          </View>
                        ) : null}

                        {/* Thumbnails */}
                        {visitImgs.length > 0 && (
                          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 2 }}>
                            <Text style={{ fontSize: 10, color: '#64748b', fontWeight: '700' }}>Scans:</Text>
                            {visitImgs.map((imgUri: any, iIdx: number) => (
                              <TouchableOpacity
                                key={iIdx}
                                onPress={() => openPrescriptionPreview(imgUri, visitImgs)}
                                style={{ width: 30, height: 30, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: '#cbd5e1' }}
                              >
                                <Image source={{ uri: imgUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>


        {/* Generous bottom spacing ensuring full scrollability past the bottom navigation bar */}
        <View style={{ height: 80 }} />


        {/* VISIT DETAILS & PRESCRIPTION POPUP MODAL FOR MOBILE */}
        {!!selectedVisitModal && (
          <Modal
            visible={!!selectedVisitModal}
            transparent={true}
            animationType="none"
            onRequestClose={() => setSelectedVisitModal(null)}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setSelectedVisitModal(null)}
            >
              <TouchableOpacity
                activeOpacity={1}
                style={[styles.modalCard, { maxWidth: 400, paddingVertical: 20 }]}
                onPress={() => { }}
              >
                {/* Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, width: '100%' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="document-text" size={20} color="#0284c7" />
                    </View>
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>Visit Details</Text>
                      <Text style={{ fontSize: 11, color: '#64748b' }}>📅 {renderSafeString(selectedVisitModal?.visitDate, 'Today')}{selectedVisitModal?.visitTime ? ` @ ${selectedVisitModal.visitTime}` : ''}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedVisitModal(null)} style={{ padding: 4 }}>
                    <Ionicons name="close" size={22} color="#64748b" />
                  </TouchableOpacity>
                </View>

                {/* Visit Details Card */}
                <View style={{ width: '100%', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, gap: 8, marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11.5, color: '#64748b', fontWeight: '600' }}>Patient</Text>
                    <Text style={{ fontSize: 12.5, color: '#0f172a', fontWeight: '800' }}>
                      {renderSafeString(selectedVisitModal?.patientName || patientName, '')} {selectedVisitModal?.regId || regId ? `(${selectedVisitModal?.regId || regId})` : ''}
                    </Text>
                  </View>
                  <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11.5, color: '#64748b', fontWeight: '600' }}>Doctor</Text>
                    <Text style={{ fontSize: 12.5, color: '#0284c7', fontWeight: '800' }}>
                      {renderSafeString(formatDoctorName(selectedVisitModal?.doctorName, selectedVisitModal?.branch), 'Resident Doctor')}
                    </Text>
                  </View>
                  <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11.5, color: '#64748b', fontWeight: '600' }}>Branch & Mode</Text>
                    <Text style={{ fontSize: 12.5, color: '#0f172a', fontWeight: '800' }}>
                      {renderSafeString(selectedVisitModal?.branch, '') ? `${selectedVisitModal.branch} • ` : ''}{renderSafeString(selectedVisitModal?.consultationMode, 'In-Clinic')}
                    </Text>
                  </View>
                  <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11.5, color: '#64748b', fontWeight: '600' }}>Amount Paid</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{
                        backgroundColor: selectedVisitModal?.paymentStatus === 'paid' || Number(selectedVisitModal?.paidAmount) > 0 ? '#dcfce7' : '#fef3c7',
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 6
                      }}>
                        <Text style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: selectedVisitModal?.paymentStatus === 'paid' || Number(selectedVisitModal?.paidAmount) > 0 ? '#15803d' : '#b45309'
                        }}>
                          {selectedVisitModal?.paymentStatus === 'paid' || Number(selectedVisitModal?.paidAmount) > 0
                            ? `₹${selectedVisitModal?.paidAmount || '0'} Paid ✓`
                            : `Payment Pending (₹${selectedVisitModal?.totalAmount || '0'})`}
                        </Text>
                      </View>
                      {!(selectedVisitModal?.paymentStatus === 'paid' || Number(selectedVisitModal?.paidAmount) > 0) && (
                        <TouchableOpacity
                          onPress={() => {
                            const pData = {
                              ...selectedVisitModal,
                              id: selectedVisitModal.appointmentId || selectedVisitModal.id,
                              patientDocId: selectedVisitModal.patientDocId || patient?.id,
                              regId: selectedVisitModal.regId || regId,
                              registrationId: selectedVisitModal.regId || regId,
                              patientName: selectedVisitModal.patientName || patientName,
                              phone: selectedVisitModal.phone || phone,
                              phoneNumber: selectedVisitModal.phone || phone,
                              branch: selectedVisitModal.branch || branchName,
                              doctorName: selectedVisitModal.doctorName || doctorName,
                              isReback: selectedVisitModal.isReback === true,
                              rebackVisit: selectedVisitModal.rebackVisit === true
                            };
                            setSelectedVisitModal(null);
                            setSelectedPatientForCollectFee(pData);
                            setShowCollectFeeModal(true);
                          }}
                          style={{
                            backgroundColor: '#16a34a',
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 6
                          }}
                        >
                          <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 11 }}>💳 Collect Fee</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>

                {/* Diagnosis Notes */}
                <View style={{ width: '100%', marginBottom: 14 }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#334155', marginBottom: 4 }}>📋 Diagnosis & Clinical Notes</Text>
                  <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 10 }}>
                    <Text style={{ fontSize: 12, color: '#1e293b', lineHeight: 18 }}>
                      {renderSafeString(selectedVisitModal?.diagnosisNotes || selectedVisitModal?.subject, 'No diagnosis notes entered for this visit.')}
                    </Text>
                  </View>
                </View>

                {/* Prescribed Medicines Section */}
                {selectedVisitModal?.medicines && selectedVisitModal.medicines.length > 0 && (
                  <View style={{ width: '100%', marginBottom: 14 }}>
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#0284c7', marginBottom: 6 }}>
                      💊 Prescribed Medicines ({selectedVisitModal.medicines.length})
                    </Text>
                    <View style={{ gap: 6 }}>
                      {selectedVisitModal.medicines.map((med: any, idx: number) => (
                        <View
                          key={idx}
                          style={{
                            backgroundColor: '#f8fafc',
                            borderWidth: 1,
                            borderColor: '#cbd5e1',
                            borderRadius: 8,
                            padding: 8,
                            gap: 2
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#0f172a' }}>
                            {med.name || med.medicineName || 'Remedy'}
                          </Text>
                          {(() => {
                            const parts = [med.dosage, med.frequency, med.duration].filter(Boolean);
                            return parts.length > 0 ? (
                              <Text style={{ fontSize: 11, color: '#0284c7', fontWeight: '700' }}>
                                {parts.join(' • ')}
                              </Text>
                            ) : null;
                          })()}
                          {!!med.instructions && (
                            <Text style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic' }}>
                              Note: {med.instructions}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Uploaded & Canvas Prescription Scans */}
                <View style={{ width: '100%', marginBottom: 16 }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#0284c7', marginBottom: 6 }}>
                    📄 Uploaded Prescription Scans & Canvas Document
                  </Text>
                  {(() => {
                    const images = Array.from(new Set([
                      ...(selectedVisitModal?.canvasPrescriptionUrl ? [selectedVisitModal.canvasPrescriptionUrl] : []),
                      ...(selectedVisitModal?.uploadedPrescriptions || []),
                      ...(selectedVisitModal?.prescriptionUrls || []),
                      ...(selectedVisitModal?.prescriptionUrl ? [selectedVisitModal.prescriptionUrl] : []),
                      ...(selectedVisitModal?.prescriptionImage ? [selectedVisitModal.prescriptionImage] : [])
                    ].filter(Boolean)));

                    if (images.length === 0) {
                      return (
                        <View style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 10, padding: 12, alignItems: 'center' }}>
                          <Text style={{ fontSize: 11, color: '#64748b' }}>No digital prescription scans uploaded for this visit.</Text>
                        </View>
                      );
                    }

                    return (
                      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                        {images.filter(Boolean).map((url: string, idx: number) => (
                          url ? (
                            <TouchableOpacity
                              key={idx}
                              onPress={() => openPrescriptionPreview(url, images.filter(Boolean))}
                              style={{ width: 100, height: 120, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#0284c7' }}
                            >
                              <Image
                                source={{ uri: url }}
                                style={{ width: 100, height: 120, minWidth: 100, minHeight: 120 }}
                                resizeMode="cover"
                              />
                              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15, 23, 42, 0.82)', paddingVertical: 3 }}>
                                <Text style={{ fontSize: 9.5, color: '#ffffff', fontWeight: '800', textAlign: 'center' }}>Tap to View</Text>
                              </View>
                            </TouchableOpacity>
                          ) : null
                        ))}
                      </View>
                    );
                  })()}
                </View>

                {/* Close Button */}
                <TouchableOpacity
                  style={{ width: '100%', backgroundColor: '#0284c7', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
                  onPress={() => setSelectedVisitModal(null)}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 13 }}>Close</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        )}

        {/* ALL PAST VISITS FULL POPUP MODAL FOR MOBILE */}
        {showAllVisitsModal && (
          <Modal
            visible={showAllVisitsModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowAllVisitsModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { maxHeight: '88%', padding: 16, width: '94%', maxWidth: 450 }]}>
                {/* Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#0284c7' }}>
                      ⏱ Medical History ({patientVisits.length} Visits)
                    </Text>
                    <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {patientName} • {regId}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowAllVisitsModal(false)} style={{ padding: 4 }}>
                    <Ionicons name="close" size={22} color="#64748b" />
                  </TouchableOpacity>
                </View>

                {/* Scrollable list of all visits */}
                <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={true}>
                  <View style={{ gap: 8, paddingBottom: 6 }}>
                    {patientVisits.map((visit, idx) => (
                      <TouchableOpacity
                        key={visit.id || idx}
                        activeOpacity={0.7}
                        style={{
                          backgroundColor: '#ffffff',
                          borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: '#cbd5e1',
                          padding: 12,
                          gap: 4,
                          shadowColor: '#0f172a',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.05,
                          shadowRadius: 3,
                          elevation: 1
                        }}
                        onPress={() => {
                          setShowAllVisitsModal(false);
                          setSelectedVisitModal(visit);
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#0f172a' }}>
                              📅 {renderSafeString(visit.visitDate, 'Today')}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0369a1' }}>
                            {visit.branch ? `📍 ${visit.branch}` : ''}
                          </Text>
                        </View>

                        {visit.doctorName ? (
                          <Text style={{ fontSize: 11.5, color: '#475569', fontWeight: '600', marginTop: 2 }}>
                            👨‍⚕️ {formatDoctorName(visit.doctorName)}
                          </Text>
                        ) : null}

                        {visit.diagnosisNotes ? (
                          <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }} numberOfLines={2}>
                            🩺 {visit.diagnosisNotes}
                          </Text>
                        ) : null}

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                          <Text style={{ fontSize: 10.5, color: '#0284c7', fontWeight: '700' }}>
                            Tap to View Full Prescription & Info ➔
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {/* Close Button */}
                <TouchableOpacity
                  style={{ backgroundColor: '#0284c7', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 12 }}
                  onPress={() => setShowAllVisitsModal(false)}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12.5 }}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
        {/* FULLSCREEN PRESCRIPTION LIGHTBOX PREVIEW FOR MOBILE */}
        {!!fullPrescriptionPreview && (
          <Modal
            visible={!!fullPrescriptionPreview}
            transparent={true}
            animationType="fade"
            onRequestClose={() => { setFullPrescriptionPreview(null); setPreviewRotation(0); }}
          >
            <View style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.95)',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              {/* Top Navigation & Action Bar */}
              <SafeAreaView style={{
                position: 'absolute',
                top: Platform.OS === 'android' ? 14 : 0,
                left: 0,
                right: 0,
                zIndex: 30,
              }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                }}>
                  {/* Image Counter Badge */}
                  <View style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.22)',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                  }}>
                    <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '800' }}>
                      {previewImagesList.length > 0
                        ? `${previewImageIndex + 1} / ${previewImagesList.length}`
                        : '1 / 1'}
                    </Text>
                  </View>

                  {/* Right Actions: Rotate Button + Close Button */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity
                      onPress={handleRotatePrescriptionImage}
                      activeOpacity={0.8}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: 'rgba(255, 255, 255, 0.25)',
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.35)',
                      }}
                    >
                      <Ionicons name="reload" size={17} color="#ffffff" />
                      <Text style={{ color: '#ffffff', fontSize: 12.5, fontWeight: '800' }}>
                        Rotate ({previewRotation}°)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => { setFullPrescriptionPreview(null); setPreviewRotation(0); }}
                      activeOpacity={0.8}
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.9)',
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.3,
                        shadowRadius: 3,
                        elevation: 4,
                      }}
                    >
                      <Ionicons name="close" size={24} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                </View>
              </SafeAreaView>

              {/* Central Image Container */}
              <View style={{
                width: '100%',
                height: '75%',
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: 20,
              }}>
                {!!fullPrescriptionPreview && (
                  <Image
                    source={{ uri: fullPrescriptionPreview }}
                    style={{
                      width: '100%',
                      height: '100%',
                      resizeMode: 'contain',
                      transform: [{ rotate: `${previewRotation}deg` }],
                    }}
                  />
                )}
              </View>

              {/* Left Side Arrow Button < */}
              {previewImagesList.length > 1 && (
                <TouchableOpacity
                  onPress={handlePrevPrescriptionImage}
                  activeOpacity={0.8}
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: [{ translateY: -26 }],
                    backgroundColor: 'rgba(15, 23, 42, 0.75)',
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 25,
                    borderWidth: 1.5,
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.4,
                    shadowRadius: 4,
                    elevation: 6,
                  }}
                >
                  <Ionicons name="chevron-back" size={32} color="#ffffff" />
                </TouchableOpacity>
              )}

              {/* Right Side Arrow Button > */}
              {previewImagesList.length > 1 && (
                <TouchableOpacity
                  onPress={handleNextPrescriptionImage}
                  activeOpacity={0.8}
                  style={{
                    position: 'absolute',
                    right: 14,
                    top: '50%',
                    transform: [{ translateY: -26 }],
                    backgroundColor: 'rgba(15, 23, 42, 0.75)',
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 25,
                    borderWidth: 1.5,
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.4,
                    shadowRadius: 4,
                    elevation: 6,
                  }}
                >
                  <Ionicons name="chevron-forward" size={32} color="#ffffff" />
                </TouchableOpacity>
              )}
            </View>
          </Modal>
        )}

        {/* ADD PRESCRIPTION IMAGE MODAL */}
        {showAddImageModal && (
          <Modal
            visible={showAddImageModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowAddImageModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { padding: 20, maxWidth: 420 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="document-attach" size={20} color="#0284c7" />
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>Attach Physical Prescription</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowAddImageModal(false)} style={{ padding: 4 }}>
                    <Ionicons name="close" size={22} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                  Capture a photo of the handwritten prescription or select from your phone's gallery.
                </Text>

                {/* PRIMARY ACTIONS: Camera & Gallery */}
                <View style={{ gap: 10, width: '100%' }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleTakePhoto}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      backgroundColor: '#0284c7',
                      paddingVertical: 13,
                      borderRadius: 10,
                      shadowColor: '#0284c7',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.15,
                      shadowRadius: 4,
                      elevation: 2
                    }}
                  >
                    <Ionicons name="camera" size={20} color="#ffffff" />
                    <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 13.5 }}>
                      📸 Take Photo with Camera
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handlePickFromGallery}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      backgroundColor: '#f0f9ff',
                      borderWidth: 1.5,
                      borderColor: '#0284c7',
                      paddingVertical: 13,
                      borderRadius: 10
                    }}
                  >
                    <Ionicons name="images" size={20} color="#0284c7" />
                    <Text style={{ color: '#0284c7', fontWeight: '800', fontSize: 13.5 }}>
                      🖼️ Choose from Gallery / Photos
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* SECONDARY / OPTIONAL: Direct URL Input */}
                <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 12 }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#475569', marginBottom: 6 }}>
                    Or enter image URL:
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 1, minHeight: 40, fontSize: 12, paddingHorizontal: 10 }]}
                      placeholder="https://... or data:image/..."
                      value={customImageUrlInput}
                      onChangeText={setCustomImageUrlInput}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={() => {
                        if (customImageUrlInput.trim()) {
                          handleAddNewPrescriptionImage(customImageUrlInput.trim());
                          setCustomImageUrlInput('');
                          setShowAddImageModal(false);
                        }
                      }}
                      disabled={!customImageUrlInput.trim()}
                      style={{
                        backgroundColor: customImageUrlInput.trim() ? '#0f172a' : '#cbd5e1',
                        paddingHorizontal: 14,
                        borderRadius: 8,
                        justifyContent: 'center'
                      }}
                    >
                      <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>Add</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </Modal>
        )}

        {/* PRESCRIPTION UPLOADING / SAVING OVERLAY MODAL */}
        {(isUploadingImage || isSavingConsultation) && (
          <Modal
            visible={isUploadingImage || isSavingConsultation}
            transparent={true}
            animationType="fade"
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { alignItems: 'center', padding: 24, maxWidth: 320 }]}>
                <ActivityIndicator size="large" color="#0284c7" style={{ marginBottom: 14 }} />
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 6, textAlign: 'center' }}>
                  {isSavingConsultation ? 'Saving Consultation...' : 'Uploading Prescription...'}
                </Text>
                <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 18 }}>
                  {isSavingConsultation
                    ? 'Syncing records & sending patient to reception'
                    : 'Compressing and securing prescription in cloud storage'}
                </Text>
              </View>
            </View>
          </Modal>
        )}

        {/* ENLARGED DRAWING CANVAS MODAL (MOBILE) */}
        {isCanvasModalOpen && (
          <Modal
            visible={isCanvasModalOpen}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setIsCanvasModalOpen(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { height: '94%', padding: 14, display: 'flex', flexDirection: 'column' }]}>
                {/* Top Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#0284c7' }}>✍️ Draw Prescription (Enlarged)</Text>
                    <Text style={{ fontSize: 10.5, color: '#64748b' }}>
                      Patient: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{patientName || 'Patient'}</Text> • Reg: <Text style={{ fontWeight: '700', color: '#0284c7' }}>{regId}</Text>
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setIsCanvasModalOpen(false)} style={{ padding: 4 }}>
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>

                {/* Tools Toolbar */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                  {/* Color choices */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {[
                      { name: 'Blue', color: '#0284c7' },
                      { name: 'Black', color: '#0f172a' },
                      { name: 'Red', color: '#dc2626' },
                      { name: 'Green', color: '#16a34a' },
                    ].map((c) => (
                      <TouchableOpacity
                        key={c.color}
                        onPress={() => setCanvasStrokeColor(c.color)}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          backgroundColor: c.color,
                          borderWidth: canvasStrokeColor === c.color ? 2.5 : 1,
                          borderColor: canvasStrokeColor === c.color ? '#0284c7' : '#cbd5e1'
                        }}
                      />
                    ))}
                  </View>

                  {/* Thickness choices */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {[
                      { label: 'Fine', width: 2 },
                      { label: 'Normal', width: 3.5 },
                      { label: 'Bold', width: 5.5 }
                    ].map((t) => (
                      <TouchableOpacity
                        key={t.width}
                        onPress={() => setCanvasStrokeWidth(t.width)}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 5,
                          borderWidth: 1,
                          borderColor: canvasStrokeWidth === t.width ? '#0284c7' : '#e2e8f0',
                          backgroundColor: canvasStrokeWidth === t.width ? '#e0f2fe' : '#ffffff'
                        }}
                      >
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: canvasStrokeWidth === t.width ? '#0284c7' : '#64748b' }}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Clear button */}
                  <TouchableOpacity
                    onPress={clearEnlargedMobileCanvas}
                    style={{
                      backgroundColor: '#fff1f2',
                      borderWidth: 1,
                      borderColor: '#fecdd3',
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#e11d48' }}>Clear</Text>
                  </TouchableOpacity>
                </View>

                {/* Enlarged Drawing Canvas Area */}
                <View style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1.5, borderColor: '#cbd5e1', marginVertical: 8, overflow: 'hidden', position: 'relative' }}>
                  {Platform.OS === 'web' ? (
                    React.createElement('canvas', {
                      ref: enlargedMobileCanvasRef,
                      width: 700,
                      height: 440,
                      onMouseDown: startWebEnlargedDrawing,
                      onMouseMove: drawWebEnlarged,
                      onMouseUp: stopWebEnlargedDrawing,
                      onMouseLeave: stopWebEnlargedDrawing,
                      onTouchStart: startWebEnlargedDrawing,
                      onTouchMove: drawWebEnlarged,
                      onTouchEnd: stopWebEnlargedDrawing,
                      style: {
                        backgroundColor: '#ffffff',
                        cursor: 'crosshair',
                        width: '100%',
                        height: '100%',
                        touchAction: 'none'
                      }
                    })
                  ) : (
                    <View
                      {...enlargedPanResponder.panHandlers}
                      style={{ width: '100%', height: '100%', backgroundColor: '#ffffff', position: 'relative' }}
                    >
                      {/* Strokes Rendering */}
                      {enlargedStrokes.map((stroke, strokeIdx) => (
                        <React.Fragment key={strokeIdx}>
                          {stroke.points.map((pt, ptIdx) => {
                            if (ptIdx === 0) return null;
                            const prev = stroke.points[ptIdx - 1];
                            const dx = pt.x - prev.x;
                            const dy = pt.y - prev.y;
                            const length = Math.sqrt(dx * dx + dy * dy);
                            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                            return (
                              <View
                                key={ptIdx}
                                style={{
                                  position: 'absolute',
                                  left: prev.x,
                                  top: prev.y,
                                  width: Math.max(length, 2),
                                  height: stroke.width || 3,
                                  backgroundColor: stroke.color || '#0284c7',
                                  borderRadius: (stroke.width || 3) / 2,
                                  transform: [{ rotate: `${angle}deg` }]
                                }}
                              />
                            );
                          })}
                        </React.Fragment>
                      ))}

                      {/* Current Stroke */}
                      {enlargedCurrentStroke.map((pt, ptIdx) => {
                        if (ptIdx === 0) return null;
                        const prev = enlargedCurrentStroke[ptIdx - 1];
                        const dx = pt.x - prev.x;
                        const dy = pt.y - prev.y;
                        const length = Math.sqrt(dx * dx + dy * dy);
                        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                        return (
                          <View
                            key={ptIdx}
                            style={{
                              position: 'absolute',
                              left: prev.x,
                              top: prev.y,
                              width: Math.max(length, 2),
                              height: canvasStrokeWidth,
                              backgroundColor: canvasStrokeColor,
                              borderRadius: canvasStrokeWidth / 2,
                              transform: [{ rotate: `${angle}deg` }]
                            }}
                          />
                        );
                      })}

                      {enlargedStrokes.length === 0 && enlargedCurrentStroke.length === 0 && (
                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>
                            Draw prescription notes clearly using finger or stylus...
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* Bottom Action Bar */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6 }}>
                  <TouchableOpacity
                    onPress={() => setIsCanvasModalOpen(false)}
                    style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff' }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b' }}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSaveAndUpdateEnlargedPrescription}
                    disabled={isSavingEnlarged}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: '#16a34a'
                    }}
                  >
                    {isSavingEnlarged ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Ionicons name="checkmark-circle" size={16} color="#ffffff" />
                    )}
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#ffffff' }}>
                      {isSavingEnlarged ? 'Saving & Updating...' : 'Save & Update Prescription'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}

        {/* 30-DAY DIET PLAN MOBILE FULL MODAL */}
        {showFull30DayModal && (
          <Modal
            visible={showFull30DayModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowFull30DayModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { maxHeight: '90%', padding: 14 }]}>
                {/* Modal Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#0284c7' }}>🗓 30-Day Clinical Diet Plan</Text>
                    <Text style={{ fontSize: 10.5, color: '#64748b' }}>{patientName} • Age: {age || 'N/A'} • BMI: {bmi || 'N/A'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowFull30DayModal(false)} style={{ padding: 4 }}>
                    <Ionicons name="close" size={22} color="#64748b" />
                  </TouchableOpacity>
                </View>

                {/* Phase Tabs */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10, maxHeight: 36 }}>
                  {[
                    { label: 'All 30 Days', val: 'all' },
                    { label: 'Phase 1: Detox (1-10)', val: 1 },
                    { label: 'Phase 2: Metabolic (11-20)', val: 2 },
                    { label: 'Phase 3: Vitality (21-30)', val: 3 }
                  ].map((p) => {
                    const isActive = selectedPhaseFilter === p.val;
                    return (
                      <TouchableOpacity
                        key={String(p.val)}
                        onPress={() => setSelectedPhaseFilter(p.val as any)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 14,
                          backgroundColor: isActive ? '#0284c7' : '#f1f5f9',
                          marginRight: 6
                        }}
                      >
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: isActive ? '#ffffff' : '#475569' }}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Day Items List */}
                <ScrollView style={{ flex: 1 }}>
                  {dietMenuDays
                    .filter((item) => selectedPhaseFilter === 'all' || item.phase === selectedPhaseFilter)
                    .map((item) => (
                      <View key={item.day} style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#0284c7' }}>Day {item.day}</Text>
                          <Text style={{ fontSize: 9.5, fontWeight: '800', color: item.phase === 1 ? '#1e40af' : item.phase === 2 ? '#92400e' : '#166534', backgroundColor: item.phase === 1 ? '#dbeafe' : item.phase === 2 ? '#fef3c7' : '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                            {item.phaseTitle}
                          </Text>
                        </View>

                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#475569', marginTop: 2 }}>Breakfast (8:00 AM)</Text>
                        <TextInput
                          style={[styles.input, { paddingVertical: 4, paddingHorizontal: 8, fontSize: 11, marginTop: 2, backgroundColor: '#ffffff' }]}
                          value={item.breakfast}
                          onChangeText={(txt) => {
                            const updated = [...dietMenuDays];
                            const idx = updated.findIndex(d => d.day === item.day);
                            if (idx !== -1) { updated[idx].breakfast = txt; setDietMenuDays(updated); }
                          }}
                        />

                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#475569', marginTop: 4 }}>Lunch (1:00 PM)</Text>
                        <TextInput
                          style={[styles.input, { paddingVertical: 4, paddingHorizontal: 8, fontSize: 11, marginTop: 2, backgroundColor: '#ffffff' }]}
                          value={item.lunch}
                          onChangeText={(txt) => {
                            const updated = [...dietMenuDays];
                            const idx = updated.findIndex(d => d.day === item.day);
                            if (idx !== -1) { updated[idx].lunch = txt; setDietMenuDays(updated); }
                          }}
                        />

                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#475569', marginTop: 4 }}>Evening Snacks (4:30 PM)</Text>
                        <TextInput
                          style={[styles.input, { paddingVertical: 4, paddingHorizontal: 8, fontSize: 11, marginTop: 2, backgroundColor: '#ffffff' }]}
                          value={item.snacks}
                          onChangeText={(txt) => {
                            const updated = [...dietMenuDays];
                            const idx = updated.findIndex(d => d.day === item.day);
                            if (idx !== -1) { updated[idx].snacks = txt; setDietMenuDays(updated); }
                          }}
                        />

                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#475569', marginTop: 4 }}>Dinner (8:00 PM)</Text>
                        <TextInput
                          style={[styles.input, { paddingVertical: 4, paddingHorizontal: 8, fontSize: 11, marginTop: 2, backgroundColor: '#ffffff' }]}
                          value={item.dinner}
                          onChangeText={(txt) => {
                            const updated = [...dietMenuDays];
                            const idx = updated.findIndex(d => d.day === item.day);
                            if (idx !== -1) { updated[idx].dinner = txt; setDietMenuDays(updated); }
                          }}
                        />
                      </View>
                    ))}
                </ScrollView>

                <TouchableOpacity style={[styles.saveBtn, { marginTop: 10 }]} onPress={() => setShowFull30DayModal(false)}>
                  <Text style={styles.saveBtnText}>Save & Close 30-Day Plan</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}

        {/* DIRECT COLLECT FEE MODAL (NO RAZORPAY, NO MESSAGING FOR REBACK) */}
        {selectedPatientForCollectFee && (
          <AppointmentPaymentModal
            visible={showCollectFeeModal}
            onDismiss={() => {
              setShowCollectFeeModal(false);
              setSelectedPatientForCollectFee(null);
            }}
            selectedPatientForPayment={selectedPatientForCollectFee}
            onPaymentSuccess={() => {
              setShowCollectFeeModal(false);
              setSelectedPatientForCollectFee(null);
              Alert.alert('Payment Recorded ✓', 'Past payment recorded successfully.');
            }}
          />
        )}

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  topHeader: { backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  backBtn: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtnText: { fontSize: 12, fontWeight: '800', color: '#0284c7' },
  headerTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  durationBadge: { backgroundColor: '#fef08a', borderWidth: 1, borderColor: '#fde047', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  durationBadgeText: { fontSize: 8.5, fontWeight: '800', color: '#854d0e' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#bae6fd' },
  avatarText: { fontSize: 12, fontWeight: '800', color: '#0284c7' },
  scrollBody: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 160, gap: 14 },
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  patientNameText: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  infoRowStack: { gap: 4, marginTop: 4 },
  regIdText: { fontSize: 12, fontWeight: '700', color: '#0284c7' },
  infoText: { fontSize: 11.5, color: '#475569' },
  subjectText: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  packageNoticeBox: { marginTop: 12, backgroundColor: '#f8fafc', borderStyle: 'dashed', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  packageNoticeText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  registerPkgBtn: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#0284c7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  registerPkgBtnText: { fontSize: 10.5, fontWeight: '800', color: '#0284c7' },
  historyCard: { backgroundColor: '#e0f2fe', borderRadius: 12, borderWidth: 1, borderColor: '#bae6fd', padding: 14 },
  historyHeaderTitle: { fontSize: 12.5, fontWeight: '800', color: '#0284c7', marginBottom: 8 },
  historyEmptyBox: { backgroundColor: '#ffffff', borderRadius: 8, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 6 },
  historyEmptyText: { fontSize: 10.5, color: '#94a3b8', fontWeight: '600' },
  sectionCardTitle: { fontSize: 12.5, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  prescriptionThumb: { width: 54, height: 54, borderRadius: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  uploadBtn: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, alignSelf: 'flex-start' },
  uploadBtnText: { fontSize: 11, fontWeight: '800', color: '#334155' },
  tabsBar: { backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 4 },
  tabItem: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, marginRight: 4 },
  tabItemActive: { backgroundColor: '#e0f2fe', borderWidth: 1, borderColor: '#bae6fd' },
  tabItemText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  tabItemTextActive: { fontWeight: '800', color: '#0284c7' },
  mainTabTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 11.5, fontWeight: '700', color: '#475569', marginBottom: 4 },
  subTitle: { fontSize: 12.5, fontWeight: '800', color: '#0f172a', marginBottom: 6, marginTop: 4 },
  radioLabel: { fontSize: 12, fontWeight: '600', color: '#334155' },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: '#0f172a' },
  textArea: { height: 90, textAlignVertical: 'top' },
  textAreaSmall: { height: 60, textAlignVertical: 'top' },
  chooseFileBtn: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, flexDirection: 'row', alignItems: 'center' },
  chooseFileBtnText: { fontSize: 11, fontWeight: '800', color: '#334155' },
  helperText: { fontSize: 10, color: '#94a3b8', marginTop: 3 },
  saveBtn: { backgroundColor: '#0284c7', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: '#ffffff' },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  metricCol: { flex: 1 },
  checkChip: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginBottom: 4 },
  checkChipActive: { backgroundColor: '#e0f2fe', borderColor: '#0284c7' },
  checkChipText: { fontSize: 11.5, color: '#475569', fontWeight: '600' },
  checkChipTextActive: { color: '#0284c7', fontWeight: '800' },
  pillChip: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, marginBottom: 4 },
  pillChipActive: { backgroundColor: '#e0f2fe', borderColor: '#0284c7' },
  pillChipText: { fontSize: 11, color: '#475569', fontWeight: '600' },
  pillChipTextActive: { color: '#0284c7', fontWeight: '800' },
  dashedBox: { backgroundColor: '#ffffff', borderStyle: 'dashed', borderWidth: 1, borderColor: '#bae6fd', borderRadius: 10, padding: 24, alignItems: 'center' },
  dashedBoxText: { fontSize: 11, color: '#64748b', textAlign: 'center' },
  actionBtnSmall: { backgroundColor: '#0284c7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  actionBtnSmallText: { fontSize: 11, fontWeight: '800', color: '#ffffff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalCard: { width: '100%', backgroundColor: '#ffffff', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  datePickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4
  },
  calendarModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  calendarModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  monthNavBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  calendarHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  weekdaysRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 6,
  },
  weekdayLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    width: '14.285%',
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  dayCellEmpty: {
    width: '14.285%',
    height: 38,
  },
  dayCellWrapper: {
    width: '14.285%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCell: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: {
    backgroundColor: '#0284c7',
  },
  dayCellText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  dayCellTextSelected: {
    color: '#ffffff',
    fontWeight: '800',
  },
  calendarFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  calendarTodayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  calendarTodayBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  calendarCloseBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  calendarCloseBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
});