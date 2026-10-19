import React, { useEffect } from 'react';
import { LogBox, TouchableOpacity, Platform, View, TouchableWithoutFeedback, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';



LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  'expo-notifications',
  'expo-av',
  'InteractionManager has been deprecated',
  '@firebase/firestore',
  'WebChannelConnection RPC',
]);

const originalConsoleError = console.error;
console.error = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('expo-notifications:')) {
    return;
  }
  originalConsoleError(...args);
};

const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  if (args[0] && typeof args[0] === 'string' && (
    args[0].includes('expo-notifications') ||
    args[0].includes('expo-av') ||
    args[0].includes('InteractionManager has been deprecated') ||
    args[0].includes('@firebase/firestore') ||
    args[0].includes('WebChannelConnection')
  )) {
    return;
  }
  originalConsoleWarn(...args);
};

const originalConsoleLog = console.log;
console.log = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('Failed to initialize reCAPTCHA Enterprise config')) {
    return;
  }
  originalConsoleLog(...args);
};

import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { COLORS } from './src/constants/theme';
import { Home, Stethoscope, Calendar, HeartPulse, User as UserIcon } from 'lucide-react-native';

// Screens
import { registerForPushNotificationsAsync } from './src/utils/notificationHelper';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import BookAppointment from './src/screens/BookAppointment';
import MyAppointments from './src/screens/MyAppointments';
import DoctorsList from './src/screens/DoctorsList';
import Reports from './src/screens/Reports';
import HospitalInfo from './src/screens/HospitalInfo';
import ProfileScreen from './src/screens/ProfileScreen';
import HelpSupport from './src/screens/HelpSupport';
import TermsConditions from './src/screens/TermsConditions';
import BranchesList from './src/screens/BranchesList';
import SelectBranch from './src/screens/SelectBranch';
import SelectDoctor from './src/screens/SelectDoctor';
import SelectDateTime from './src/screens/SelectDateTime';
import BookingSummary from './src/screens/BookingSummary';
import AuthChoice from './src/screens/AuthChoice';
import PaymentHistory from './src/screens/PaymentHistory';
import WalletDetails from './src/screens/WalletDetails';
import MedicineFormView from './src/screens/MedicineFormView';
import Notifications from './src/screens/Notifications';
import DietPlan from './src/screens/DietPlan';
import FollowUpScreen from './src/screens/FollowUps/FollowUpScreen';
const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();


const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.primary,
    secondary: COLORS.secondary,
  },
};

const MainTabs = () => {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 60 + (insets.bottom > 0 ? insets.bottom : 10),
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
          paddingTop: 10,
          backgroundColor: COLORS.white,
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        tabBarActiveTintColor: COLORS.secondary,
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 4 },
        tabBarActiveBackgroundColor: 'transparent',
        tabBarInactiveBackgroundColor: 'transparent',
        tabBarItemStyle: {
          backgroundColor: 'transparent',
        },
        tabBarActiveIndicatorStyle: {
          backgroundColor: 'transparent',
          display: 'none',
        },
        tabBarButton: (props) => (
          <TouchableWithoutFeedback
            onPress={props.onPress}
            onLongPress={props.onLongPress}
          >
            <View style={props.style}>
              {props.children}
            </View>
          </TouchableWithoutFeedback>
        ),
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Home size={24} color={color} />
        }}
      />
      <Tab.Screen
        name="DoctorsTab"
        component={DoctorsList}
        options={{
          tabBarLabel: 'Doctors',
          tabBarIcon: ({ color }) => <Stethoscope size={24} color={color} />
        }}
      />
      <Tab.Screen
        name="AppointmentsTab"
        component={BookAppointment}
        options={{
          tabBarLabel: 'Appointments',
          tabBarIcon: ({ color }) => <Calendar size={24} color={color} />
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => <UserIcon size={24} color={color} />
        }}
      />
    </Tab.Navigator>
  );
};

const Navigation = () => {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: COLORS.white },
        gestureEnabled: true,
        gestureDirection: 'horizontal',
        cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
        transitionSpec: {
          open: { animation: 'timing', config: { duration: 450 } },
          close: { animation: 'timing', config: { duration: 450 } },
        },
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      {!user ? (
        <>
          <Stack.Screen name="AuthChoice" component={AuthChoice} />
          <Stack.Screen name="Login" component={LoginScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Home" component={MainTabs} />
          <Stack.Screen name="BookAppointment" component={BookAppointment} />
          <Stack.Screen name="MyAppointments" component={MyAppointments} />
          <Stack.Screen name="Reports" component={Reports} />
          <Stack.Screen name="HospitalInfo" component={HospitalInfo} />
          <Stack.Screen name="HelpSupport" component={HelpSupport} />
          <Stack.Screen name="TermsConditions" component={TermsConditions} />
          <Stack.Screen name="BranchesList" component={BranchesList} />
          <Stack.Screen name="SelectBranch" component={SelectBranch} />
          <Stack.Screen name="SelectDoctor" component={SelectDoctor} />
          <Stack.Screen name="SelectDateTime" component={SelectDateTime} />
          <Stack.Screen name="BookingSummary" component={BookingSummary} />
          <Stack.Screen name="PaymentHistory" component={PaymentHistory} />
          <Stack.Screen name="WalletDetails" component={WalletDetails} />
          <Stack.Screen name="MedicineFormView" component={MedicineFormView} />
          <Stack.Screen name="Notifications" component={Notifications} />
          <Stack.Screen name="DietPlan" component={DietPlan} />
          <Stack.Screen name="FollowUpScreen" component={FollowUpScreen} />
        </>
      )}
    </Stack.Navigator>
  );
};

export default function App() {
  useEffect(() => {
    registerForPushNotificationsAsync();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        registerForPushNotificationsAsync();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor="transparent" translucent />
      <PaperProvider theme={theme}>
        <AuthProvider>
          <NavigationContainer>
            <Navigation />
          </NavigationContainer>
        </AuthProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
